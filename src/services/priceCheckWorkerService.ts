import { randomUUID } from "node:crypto";
import {
  claimDuePriceChecks,
  registerPriceWorker,
  finishPriceCheck,
  renewPriceCheckLease,
  getPriceCheckWorkerHealth,
  requeueStalePriceChecks,
  stopPriceWorker,
  touchPriceWorker,
  type PriceJobOutcome,
} from "./priceMonitoringService.js";
import { executeSourceAdapter, type PriceObservation, type SourceAdapterWithParser } from "./sourceAdapterService.js";
import { initDb } from "../core/db.js";

export type SourceAdapterResolver = (source: string) => SourceAdapterWithParser | null;

async function safeTouchPriceWorker(workerId: string, lastBatchAt?: Date, lastError?: string) {
  try {
    await touchPriceWorker(workerId, lastBatchAt, lastError);
  } catch (error) {
    console.error("price worker heartbeat update failed", error);
  }
}

async function persistPriceObservation(
  job: { id: string; user_id: string; watchlist_id: string },
  observation: PriceObservation,
) {
  if (!Number.isFinite(observation.price) || observation.price < 0 || observation.price > 1_000_000_000) {
    throw new Error("invalid parsed price");
  }
  const db = initDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [job.watchlist_id]);
    const existing = await client.query("SELECT id FROM shopping_price_checks WHERE source_job_id=$1", [job.id]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0].id as string;
    }
    const check = await client.query(
      `INSERT INTO shopping_price_checks
        (id,user_id,watchlist_id,price,merchant,url,source_job_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,price`,
      [randomUUID(), job.user_id, job.watchlist_id, observation.price, observation.merchant ?? null, observation.url ?? null, job.id],
    );
    const watchlist = await client.query(
      "SELECT target_price FROM shopping_watchlists WHERE id=$1 AND user_id=$2 AND active=true",
      [job.watchlist_id, job.user_id],
    );
    const target = watchlist.rowCount ? watchlist.rows[0].target_price : null;
    if (target !== null && observation.price <= Number(target)) {
      const recentAlert = await client.query(
        `SELECT 1 FROM shopping_price_alerts
         WHERE user_id=$1 AND watchlist_id=$2
           AND created_at >= now() - interval '24 hours'
         LIMIT 1`,
        [job.user_id, job.watchlist_id],
      );
      if (!recentAlert.rowCount) {
        await client.query(
          `INSERT INTO shopping_price_alerts
            (id,user_id,watchlist_id,price_check_id,target_price,price)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (price_check_id) DO NOTHING`,
          [randomUUID(), job.user_id, job.watchlist_id, check.rows[0].id, target, observation.price],
        );
      }
    }
    await client.query("COMMIT");
    return check.rows[0].id as string;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function classifyAdapterError(error: unknown) {
  const message = error instanceof Error ? error.message : "source execution failed";
  const code = message.split(":", 1)[0].slice(0, 100);
  const retryable =
    code === "SOURCE_TIMEOUT" ||
    code === "SOURCE_REQUEST_FAILED" ||
    code === "SOURCE_RESPONSE_TOO_LARGE" ||
    code.startsWith("SOURCE_HTTP_") ||
    code === "SOURCE_REDIRECT_REJECTED";
  return { errorCode: code || "SOURCE_REQUEST_FAILED", errorMessage: message.slice(0, 200), retryable };
}

export async function runPriceCheckWorkerOnce(workerId: string, resolveAdapter: SourceAdapterResolver, limit = 10) {
  const stale = await requeueStalePriceChecks(10 * 60_000);
  const jobs = await claimDuePriceChecks(workerId, limit);
  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  try {
    for (const job of jobs) {
      const startedAt = Date.now();
      let outcome: PriceJobOutcome;
      const leaseTimer = setInterval(() => {
        void renewPriceCheckLease(job.id, workerId, String(job.claim_token)).catch((error) => {
          console.error("price check lease renewal failed", error);
        });
      }, 60_000);
      try {
        try {
          const adapter = resolveAdapter(job.source);
          if (!adapter) {
            outcome = {
              ok: false,
              latencyMs: Date.now() - startedAt,
              errorCode: "SOURCE_ADAPTER_UNAVAILABLE",
              errorMessage: "no adapter registered for source " + job.source,
              retryable: false,
            };
          } else {
            const execution = await executeSourceAdapter(adapter, job.product_key);
            const observation = adapter.parseResponse(execution);
            await persistPriceObservation(job, observation);
            outcome = { ok: true, latencyMs: Date.now() - startedAt };
          }
        } catch (error) {
          outcome = { ok: false, latencyMs: Date.now() - startedAt, ...classifyAdapterError(error) };
        }
      } finally {
        clearInterval(leaseTimer);
      }

      const result = await finishPriceCheck(job.id, workerId, String(job.claim_token), outcome);
      if (result.status === "succeeded") succeeded += 1;
      else if (result.status === "dead") dead += 1;
      else if (result.status === "failed") failed += 1;
      await safeTouchPriceWorker(workerId, new Date());
    }

    await safeTouchPriceWorker(workerId, new Date());
    }

    await safeTouchPriceWorker(workerId, new Date());
    return { claimed: jobs.length, succeeded, failed, dead, staleRecovered: stale.filter((job) => job.status === "queued" || job.status === "dead").length };
  } catch (error) {
    await safeTouchPriceWorker(workerId, undefined, error instanceof Error ? error.message : "worker execution failed");
    throw error;
  }
}

export function createPriceCheckWorker(
  resolveAdapter: SourceAdapterResolver,
  options: { intervalMs?: number; batchSize?: number; workerId?: string } = {},
) {
  const intervalMs = Math.max(250, Math.trunc(options.intervalMs ?? 1000));
  const batchSize = Math.min(Math.max(1, Math.trunc(options.batchSize ?? 10)), 50);
  const workerId = options.workerId?.trim() || `price-worker-${randomUUID()}`;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let stopping = false;

  const tick = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await runPriceCheckWorkerOnce(workerId, resolveAdapter, batchSize);
    } finally {
      running = false;
    }
  };

  return {
    workerId,
    start() {
      if (timer || stopping) return;
      void registerPriceWorker(workerId).catch(() => {});
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      while (running) await new Promise((resolve) => setTimeout(resolve, 25));
      await stopPriceWorker(workerId).catch(() => {});
    },
    health: getPriceCheckWorkerHealth,
  };
}

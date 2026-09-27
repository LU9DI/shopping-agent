import { randomUUID } from "node:crypto";
import { initDb } from "../core/db.js";
import { assertSourceRegistered } from "./sourceRegistryService.js";

export const MAX_SOURCE_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 30_000;
const JOB_WINDOW_MS = 15 * 60_000;
const MAX_CLAIM_LIMIT = 50;
const MAX_ERROR_LENGTH = 200;
const MAX_WORKER_ERROR_LENGTH = 500;

export type PriceJobInput = {
  userId: string;
  watchlistId: string;
  productKey: string;
  source: string;
  checkedAt?: Date;
};

export type PriceJobOutcome =
  | { ok: true; latencyMs: number }
  | { ok: false; latencyMs: number; errorCode: string; errorMessage?: string; retryable?: boolean };

export function getJobWindow(at = new Date()): Date {
  return new Date(Math.floor(at.getTime() / JOB_WINDOW_MS) * JOB_WINDOW_MS);
}

export function getBackoffMs(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
}

function normalizeWorkerId(workerId: string) {
  const value = workerId.trim();
  if (!value || value.length > 128) throw new Error("workerId is required");
  return value;
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return 10;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CLAIM_LIMIT);
}

function normalizeError(value: string | undefined) {
  return (value || "price_check_failed").slice(0, MAX_ERROR_LENGTH);
}

export async function registerPriceWorker(workerId: string) {
  const id = normalizeWorkerId(workerId);
  const db = initDb();
  await db.query(`INSERT INTO shopping_price_workers(worker_id,status,started_at,last_seen_at,last_batch_at,last_error,updated_at)
    VALUES ($1,'active',now(),now(),NULL,NULL,now())
    ON CONFLICT (worker_id) DO UPDATE SET status='active',started_at=now(),last_seen_at=now(),
      last_batch_at=NULL,last_error=NULL,updated_at=now()`, [id]);
}

export async function touchPriceWorker(workerId: string, lastBatchAt?: Date, lastError?: string) {
  const id = normalizeWorkerId(workerId);
  const db = initDb();
  await db.query(`UPDATE shopping_price_workers SET status='active',last_seen_at=now(),
    last_batch_at=COALESCE($2,last_batch_at),last_error=$3,updated_at=now() WHERE worker_id=$1`,
    [id,lastBatchAt ?? null,lastError ? lastError.slice(0,MAX_WORKER_ERROR_LENGTH) : null]);
}

export async function stopPriceWorker(workerId: string, lastError?: string) {
  const id = normalizeWorkerId(workerId);
  const db = initDb();
  await db.query(`UPDATE shopping_price_workers SET status='stopped',last_seen_at=now(),
    last_error=$2,updated_at=now() WHERE worker_id=$1`,
    [id,lastError ? lastError.slice(0,MAX_WORKER_ERROR_LENGTH) : null]);
}

export async function enqueuePriceCheck(input: PriceJobInput) {
  const source = await assertSourceRegistered(input.source);
  const db = initDb();
  const windowStartedAt = getJobWindow(input.checkedAt);
  const result = await db.query(
    `INSERT INTO shopping_check_jobs
      (id,user_id,watchlist_id,product_key,source,window_started_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id,watchlist_id,product_key,source,window_started_at)
     DO UPDATE SET updated_at=now()
     RETURNING id,status,attempts,attempt_count,next_attempt_at,window_started_at`,
    [randomUUID(), input.userId, input.watchlistId, input.productKey, source, windowStartedAt]
  );
  return result.rows[0];
}

export async function claimDuePriceChecks(workerId: string, limit = 10) {
  const db = initDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH picked AS (
         SELECT id
         FROM shopping_check_jobs
         WHERE status='queued'
           AND next_attempt_at <= now()
           AND attempt_count < $1
         ORDER BY next_attempt_at ASC, created_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       UPDATE shopping_check_jobs j
       SET status='running',
           claimed_at=now(),
           claimed_by=$3,
           locked_at=now(),
           updated_at=now()
       FROM picked
       WHERE j.id=picked.id
       RETURNING j.id,j.user_id,j.watchlist_id,j.product_key,j.source,
                 j.attempts,j.attempt_count,j.next_attempt_at,j.claimed_at,j.claimed_by`,
      [MAX_SOURCE_ATTEMPTS, normalizeLimit(limit), normalizeWorkerId(workerId)]
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function finishPriceCheck(jobId: string, workerId: string, outcome: PriceJobOutcome) {
  const db = initDb();
  const client = await db.connect();
  const normalizedWorkerId = normalizeWorkerId(workerId);
  try {
    await client.query("BEGIN");
    const job = await client.query(
      "SELECT id,user_id,watchlist_id,product_key,source,attempts,attempt_count,status,claimed_by FROM shopping_check_jobs WHERE id=$1 FOR UPDATE",
      [jobId]
    );
    if (!job.rowCount) throw new Error("price check job not found");

    const row = job.rows[0];
    if (row.status !== "running") throw new Error("price check job is not running");
    if (row.claimed_by !== normalizedWorkerId) throw new Error("price check job claim ownership mismatch");
    const attempts = Number(row.attempt_count) + 1;
    const errorCode = outcome.ok ? null : normalizeError(outcome.errorCode);
    const errorMessage = outcome.ok ? null : normalizeError(outcome.errorMessage || outcome.errorCode);

    let status: "succeeded" | "failed" | "queued" | "dead";
    if (outcome.ok) {
      status = "succeeded";
    } else if (outcome.retryable === false) {
      status = "failed";
    } else if (attempts >= MAX_SOURCE_ATTEMPTS) {
      status = "dead";
    } else {
      status = "queued";
    }

    await client.query(
      `UPDATE shopping_check_jobs
       SET status=$2,
           attempts=$3,
           attempt_count=$3,
           next_attempt_at=CASE WHEN $2='queued' THEN now()+($4 * interval '1 millisecond') ELSE next_attempt_at END,
           claimed_at=NULL,
           claimed_by=NULL,
           locked_at=NULL,
           last_error=$5,
           last_error_code=$6,
           last_error_message=$7,
           updated_at=now()
       WHERE id=$1`,
      [jobId, status, attempts, getBackoffMs(attempts), errorCode, errorCode, errorMessage]
    );

    await client.query(
      "INSERT INTO shopping_source_metrics(source,success,latency_ms,attempts,error_code) VALUES ($1,$2,$3,$4,$5)",
      [row.source, outcome.ok, Math.max(0, Math.round(outcome.latencyMs)), attempts, errorCode]
    );

    await client.query("COMMIT");
    return { jobId, attempts, status, terminal: status === "succeeded" || status === "failed" || status === "dead" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function requeueStalePriceChecks(staleAfterMs = 10 * 60_000) {
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 30_000 || staleAfterMs > 60 * 60_000) {
    throw new Error("invalid stale claim threshold");
  }
  const db = initDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Serialize stale-claim recovery across workers/watchdogs. The row locks below
    // still protect the individual jobs, while the advisory lock makes recovery
    // deterministic when multiple watchdogs wake up at the same time.
    await client.query("SELECT pg_advisory_xact_lock($1)", [734921]);
    const result = await client.query(
      `WITH stale AS (
         SELECT id, attempt_count
         FROM shopping_check_jobs
         WHERE status='running'
           AND claimed_at < now() - ($1 * interval '1 millisecond')
         FOR UPDATE SKIP LOCKED
       )
       UPDATE shopping_check_jobs j
       SET status=CASE WHEN j.attempt_count + 1 >= $2 THEN 'dead' ELSE 'queued' END,
           attempts=j.attempt_count + 1,
           attempt_count=j.attempt_count + 1,
           next_attempt_at=CASE WHEN j.attempt_count + 1 >= $2 THEN j.next_attempt_at ELSE now() END,
           claimed_at=NULL,
           claimed_by=NULL,
           locked_at=NULL,
           last_error='worker_claim_expired',
           last_error_code='WORKER_CLAIM_EXPIRED',
           last_error_message='worker claim expired before completion',
           updated_at=now()
       FROM stale
       WHERE j.id=stale.id
       RETURNING j.id,j.status,j.attempt_count`,
      [staleAfterMs, MAX_SOURCE_ATTEMPTS]
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getPriceWorkerWatchdogStatus(staleAfterMs = 2 * 60_000) {
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 30_000 || staleAfterMs > 60 * 60_000) {
    throw new Error("invalid worker watchdog threshold");
  }
  const db = initDb();
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='active' AND last_seen_at >= now() - ($1 * interval '1 millisecond'))::int AS active,
       COUNT(*) FILTER (WHERE status='active' AND last_seen_at < now() - ($1 * interval '1 millisecond'))::int AS stale,
       COUNT(*) FILTER (WHERE status='stopped')::int AS stopped
     FROM shopping_price_workers`,
    [staleAfterMs],
  );
  const row = result.rows[0];
  return {
    active: Number(row.active),
    stale: Number(row.stale),
    stopped: Number(row.stopped),
    healthy: Number(row.stale) === 0,
    staleAfterMs,
  };
}

export async function getPriceMonitoringMetrics() {
  const db = initDb();
  const [checks, alerts, sources, jobs, workers] = await Promise.all([
    db.query(
      "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE success)::int AS success, COUNT(*) FILTER (WHERE NOT success)::int AS failed, COALESCE(ROUND(AVG(latency_ms))::int,0) AS avg_latency_ms FROM shopping_source_metrics"
    ),
    db.query("SELECT COUNT(*)::int AS total FROM shopping_price_alerts"),
    db.query(
      `SELECT r.source,r.display_name,r.enabled,s.state,s.consecutive_failures,s.in_flight,s.retry_at,s.next_allowed_at,COUNT(m.*)::int AS checks,COUNT(m.*) FILTER (WHERE m.success)::int AS success,COUNT(m.*) FILTER (WHERE NOT m.success)::int AS failed,COALESCE(ROUND(AVG(m.latency_ms))::int,0)::int AS avg_latency_ms,COALESCE(MAX(m.attempts),0)::int AS max_attempts FROM shopping_source_registry r LEFT JOIN shopping_source_state s ON s.source=r.source LEFT JOIN shopping_source_metrics m ON m.source=r.source GROUP BY r.source,r.display_name,r.enabled,s.state,s.consecutive_failures,s.in_flight,s.retry_at,s.next_allowed_at ORDER BY checks DESC,r.source`
    ),
    db.query(
      "SELECT COUNT(*) FILTER (WHERE status='queued')::int AS queued, COUNT(*) FILTER (WHERE status='running')::int AS running, COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded, COUNT(*) FILTER (WHERE status='failed')::int AS failed, COUNT(*) FILTER (WHERE status='dead')::int AS dead, COUNT(*) FILTER (WHERE status='running' AND claimed_at < now() - interval '10 minutes')::int AS stale_running FROM shopping_check_jobs"
    ),
    db.query(
      "SELECT COUNT(*) FILTER (WHERE status='active' AND last_seen_at >= now() - interval '2 minutes')::int AS active, COUNT(*) FILTER (WHERE status='active' AND last_seen_at < now() - interval '2 minutes')::int AS stale, COUNT(*) FILTER (WHERE status='stopped')::int AS stopped FROM shopping_price_workers"
    )
  ]);
  return { checks: checks.rows[0], alerts: alerts.rows[0], sources: sources.rows, jobs: jobs.rows[0], workers: workers.rows[0] };
}

export async function getPriceCheckWorkerHealth() {
  const db = initDb();
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='queued')::int AS queued,
       COUNT(*) FILTER (WHERE status='running')::int AS running,
       COUNT(*) FILTER (WHERE status='failed')::int AS failed,
       COUNT(*) FILTER (WHERE status='dead')::int AS dead,
       COUNT(*) FILTER (WHERE status='running' AND claimed_at < now() - interval '10 minutes')::int AS stale_running
     FROM shopping_check_jobs`,
  );
  return result.rows[0];
}

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initDb, closeDb } from "../src/core/db.js";
import { runPriceCheckWorkerOnce } from "../src/services/priceCheckWorkerService.js";

const integrationEnabled = process.env.RUN_DB_INTEGRATION === "1";

test("worker completes mock source -> price check -> target alert idempotently", { skip: !integrationEnabled }, async () => {
  const db = initDb();
  const userId = randomUUID();
  const watchlistId = randomUUID();
  const jobId = randomUUID();
  const workerId = `integration-worker-${randomUUID()}`;

  await db.query(
    `INSERT INTO shopping_source_registry
      (source,display_name,enabled,allowed_hosts,max_concurrency,min_interval_ms,timeout_ms,max_response_bytes,breaker_failure_threshold,breaker_cooldown_ms)
     VALUES ('integration','Integration test source',true,ARRAY['integration.test'],1,0,1000,4096,3,1000)
     ON CONFLICT (source) DO UPDATE SET
       display_name=EXCLUDED.display_name, enabled=true, allowed_hosts=EXCLUDED.allowed_hosts,
       max_concurrency=EXCLUDED.max_concurrency, min_interval_ms=EXCLUDED.min_interval_ms,
       timeout_ms=EXCLUDED.timeout_ms, max_response_bytes=EXCLUDED.max_response_bytes,
       breaker_failure_threshold=EXCLUDED.breaker_failure_threshold, breaker_cooldown_ms=EXCLUDED.breaker_cooldown_ms,
       updated_at=now()`,
  );
  await db.query(
    `INSERT INTO shopping_source_state(source) VALUES ('integration')
     ON CONFLICT (source) DO UPDATE SET consecutive_failures=0,state='closed',opened_at=NULL,
       retry_at=NULL,in_flight=0,next_allowed_at=NULL,last_error_code=NULL,updated_at=now()`,
  );

  await db.query(`INSERT INTO app_users(id,email,password_hash) VALUES ($1,$2,$3)`,
    [userId, `${userId}@integration.test`, "not-used"]);
  await db.query(
    `INSERT INTO shopping_watchlists(id,user_id,name,query,target_price,currency,active)
     VALUES ($1,$2,$3,$4,$5,'BRL',true)`,
    [watchlistId, userId, "Integration watchlist", "mock product", 100],
  );
  await db.query(
    `INSERT INTO shopping_check_jobs
      (id,user_id,watchlist_id,product_key,source,window_started_at,status,next_attempt_at)
     VALUES ($1,$2,$3,$4,'integration',now(),'queued',now())`,
    [jobId, userId, watchlistId, "mock-product"],
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ price: 90, merchant: "Integration Shop" }), {
      status: 200, headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const adapter = {
      source: "integration",
      async buildRequest(productKey: string) {
        assert.equal(productKey, "mock-product");
        return { url: "https://integration.test/product" };
      },
      parseResponse(result: { body: string; status: number }) {
        assert.equal(result.status, 200);
        const parsed = JSON.parse(result.body) as { price: number; merchant: string };
        return { price: parsed.price, merchant: parsed.merchant, url: "https://integration.test/product" };
      },
    };

    const first = await runPriceCheckWorkerOnce(workerId, () => adapter, 10);
    assert.deepEqual(first, { claimed: 1, succeeded: 1, failed: 0, dead: 0, staleRecovered: 0 });

    const job = await db.query(
      "SELECT status,attempt_count,claimed_by FROM shopping_check_jobs WHERE id=$1", [jobId],
    );
    assert.equal(job.rows[0].status, "succeeded");
    assert.equal(job.rows[0].attempt_count, 1);
    assert.equal(job.rows[0].claimed_by, null);

    const checks = await db.query(
      "SELECT id,price,merchant,source_job_id FROM shopping_price_checks WHERE source_job_id=$1", [jobId],
    );
    assert.equal(checks.rowCount, 1);
    assert.equal(Number(checks.rows[0].price), 90);
    assert.equal(checks.rows[0].merchant, "Integration Shop");

    const alerts = await db.query(
      "SELECT price_check_id,target_price,price FROM shopping_price_alerts WHERE watchlist_id=$1", [watchlistId],
    );
    assert.equal(alerts.rowCount, 1);
    assert.equal(alerts.rows[0].price_check_id, checks.rows[0].id);
    assert.equal(Number(alerts.rows[0].target_price), 100);
    assert.equal(Number(alerts.rows[0].price), 90);

    const second = await runPriceCheckWorkerOnce(workerId, () => adapter, 10);
    assert.deepEqual(second, { claimed: 0, succeeded: 0, failed: 0, dead: 0, staleRecovered: 0 });

    const counts = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM shopping_price_checks WHERE source_job_id=$1)::int AS checks,
         (SELECT COUNT(*) FROM shopping_price_alerts WHERE watchlist_id=$2)::int AS alerts`,
      [jobId, watchlistId],
    );
    assert.deepEqual(counts.rows[0], { checks: 1, alerts: 1 });
  } finally {
    globalThis.fetch = originalFetch;
    await db.query("DELETE FROM shopping_source_registry WHERE source='integration'");
    await db.query("DELETE FROM app_users WHERE id=$1", [userId]);
    await closeDb();
  }
});

test("worker recovers stale claims and respects the attempt ceiling", { skip: !integrationEnabled }, async () => {
  const db = initDb();
  const userId = randomUUID();
  const watchlistId = randomUUID();
  const staleJobId = randomUUID();
  const workerId = `stale-worker-${randomUUID()}`;

  await db.query(
    `INSERT INTO app_users(id,email,password_hash) VALUES ($1,$2,$3)`,
    [userId, `${userId}@stale.integration.test`, "not-used"],
  );
  await db.query(
    `INSERT INTO shopping_watchlists(id,user_id,name,query,target_price,currency,active)
     VALUES ($1,$2,$3,$4,$5,'BRL',true)`,
    [watchlistId, userId, "Stale watchlist", "stale product", 100],
  );

  try {
    await db.query(
      `INSERT INTO shopping_check_jobs
        (id,user_id,watchlist_id,product_key,source,window_started_at,status,next_attempt_at,claimed_at,claimed_by,attempt_count,attempts)
       VALUES ($1,$2,$3,$4,'integration',now(),'running',now(),now() - interval '11 minutes',$5,3,3)`,
      [staleJobId, userId, watchlistId, "stale-product", workerId],
    );

    const result = await runPriceCheckWorkerOnce(
      `recovery-worker-${randomUUID()}`,
      () => null,
      10,
    );

    assert.deepEqual(result, {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      staleRecovered: 1,
    });

    const job = await db.query(
      `SELECT status,attempt_count,attempts,claimed_at,claimed_by,last_error_code
       FROM shopping_check_jobs WHERE id=$1`,
      [staleJobId],
    );
    assert.equal(job.rows[0].status, "dead");
    assert.equal(job.rows[0].attempt_count, 4);
    assert.equal(job.rows[0].attempts, 4);
    assert.equal(job.rows[0].claimed_at, null);
    assert.equal(job.rows[0].claimed_by, null);
    assert.equal(job.rows[0].last_error_code, "WORKER_CLAIM_EXPIRED");
  } finally {
    await db.query("DELETE FROM app_users WHERE id=$1", [userId]);
    await closeDb();
  }
});

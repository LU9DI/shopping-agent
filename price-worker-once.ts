import { randomUUID } from "node:crypto";
import { createProductionSourceAdapterResolver } from "./src/services/sourceAdapters.js";
import { registerPriceWorker, stopPriceWorker } from "./src/services/priceMonitoringService.js";
import { runPriceCheckWorkerOnce } from "./src/services/priceCheckWorkerService.js";
import { closeDb } from "./src/core/db.js";

if (process.env.PRICE_WORKER_ENABLED !== "true") {
  throw new Error("PRICE_WORKER_ENABLED=true is required to run the price worker");
}

const batchSize = Number(process.env.PRICE_WORKER_BATCH_SIZE || 10);
const workerId = process.env.PRICE_WORKER_ID?.trim() || `price-cron-${randomUUID()}`;

await registerPriceWorker(workerId);

try {
  const result = await runPriceCheckWorkerOnce(
    workerId,
    createProductionSourceAdapterResolver(),
    Number.isFinite(batchSize) ? batchSize : 10,
  );
  console.log(JSON.stringify({ event: "price_worker_once.completed", workerId, ...result }));
  process.exitCode = 0;
} catch (error) {
  console.error(JSON.stringify({
    event: "price_worker_once.failed",
    workerId,
    error: error instanceof Error ? error.message : "unknown error",
  }));
  process.exitCode = 1;
} finally {
  await stopPriceWorker(workerId).catch((error) => console.error(JSON.stringify({ event: "price_worker_once.worker_stop_failed", workerId, error: error instanceof Error ? error.message : "unknown error" })));
  await closeDb().catch((error) => {
    console.error(JSON.stringify({
      event: "price_worker_once.db_close_failed",
      error: error instanceof Error ? error.message : "unknown error",
    }));
  });
}

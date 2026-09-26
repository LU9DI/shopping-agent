import { createProductionSourceAdapterResolver } from "./src/services/sourceAdapters.js";
import { createPriceCheckWorker } from "./src/services/priceCheckWorkerService.js";

if (process.env.PRICE_WORKER_ENABLED !== "true") {
  throw new Error("PRICE_WORKER_ENABLED=true is required to start the price worker");
}

const worker = createPriceCheckWorker(createProductionSourceAdapterResolver(), {
  intervalMs: Number(process.env.PRICE_WORKER_INTERVAL_MS || 1000),
  batchSize: Number(process.env.PRICE_WORKER_BATCH_SIZE || 10),
  workerId: process.env.PRICE_WORKER_ID,
});

const shutdown = async (signal: string) => {
  await worker.stop();
  process.exit(signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

worker.start();

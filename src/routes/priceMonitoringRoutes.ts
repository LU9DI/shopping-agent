import { Router } from "express";
import { randomUUID } from "node:crypto";
import { workerTriggerAuth } from "../middleware/workerTriggerAuth.js";
import { requireAuth } from "../middleware/auth.js";
import { enqueuePriceCheck } from "../services/priceMonitoringService.js";
import { runPriceCheckWorkerOnce } from "../services/priceCheckWorkerService.js";
import { createProductionSourceAdapterResolver } from "../services/sourceAdapters.js";

const router = Router();

function normalizeWorkerBatchSize(value: string | undefined) {
  const parsed = Number(value ?? 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

router.post("/jobs", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const watchlistId = String(req.body?.watchlistId ?? "");
    const productKey = String(req.body?.productKey ?? "").trim().toLowerCase();
    const source = String(req.body?.source ?? "").trim().toLowerCase();

    if (!UUID.test(watchlistId)) return res.status(400).json({ error: "invalid watchlist id" });
    if (!productKey || productKey.length > 500) return res.status(400).json({ error: "invalid product key" });
    if (!SOURCE.test(source)) return res.status(400).json({ error: "invalid source" });

    const job = await enqueuePriceCheck({ userId, watchlistId, productKey, source });
    res.status(202).json({ job });
  } catch {
    res.status(500).json({ error: "failed to schedule price check" });
  }
});

router.post("/internal/run", workerTriggerAuth, async (_req, res) => {
  const batchSize = normalizeWorkerBatchSize(process.env.PRICE_WORKER_BATCH_SIZE);

  if (process.env.PRICE_WORKER_ENABLED !== "true") {
    return res.status(503).json({ error: "price worker is disabled" });
  }

  const workerId = `trigger-${randomUUID()}`;
  try {
    const result = await runPriceCheckWorkerOnce(
      workerId,
      createProductionSourceAdapterResolver(),
      batchSize,
    );
    return res.status(200).json({ ok: true, workerId, result });
  } catch {
    return res.status(503).json({ ok: false, error: "worker execution failed" });
  }
});

export default router;

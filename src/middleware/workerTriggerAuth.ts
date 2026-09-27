import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";

export function workerTriggerAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.PRICE_WORKER_TRIGGER_SECRET?.trim();
  const provided = String(req.header("x-price-worker-secret") ?? "").trim();

  if (!expected || !provided) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");

  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return res.status(401).json({ error: "unauthorized" });
  }

  return next();
}

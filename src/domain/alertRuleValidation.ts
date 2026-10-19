export type AlertRulePatch = { enabled?: boolean; threshold?: number };
export type AlertRulePatchValidation = { ok: true; patch: AlertRulePatch } | { ok: false; reason: string };

export function validateAlertRulePatch(body: unknown): AlertRulePatchValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "invalid alert rule" };
  const input = body as Record<string, unknown>;
  const patch: AlertRulePatch = {};
  if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
    if (typeof input.enabled !== "boolean") return { ok: false, reason: "invalid enabled value" };
    patch.enabled = input.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(input, "threshold")) {
    if (input.threshold === null || input.threshold === "" || typeof input.threshold === "boolean") return { ok: false, reason: "invalid threshold" };
    const threshold = typeof input.threshold === "number" ? input.threshold : Number(input.threshold);
    if (!Number.isFinite(threshold) || threshold < 0) return { ok: false, reason: "invalid threshold" };
    patch.threshold = threshold;
  }
  if (Object.keys(patch).length === 0) return { ok: false, reason: "no editable fields supplied" };
  return { ok: true, patch };
}

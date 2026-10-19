export type AlertRulePatch = { enabled?: boolean; threshold?: number };
export type AlertRulePatchValidation = { ok: true; patch: AlertRulePatch } | { ok: false; reason: string };
export type AlertThresholdValidation = { ok: true; value: number | null } | { ok: false; reason: string };

export function validateAlertThreshold(value: unknown, allowNull = false): AlertThresholdValidation {
  if ((value === null || value === undefined) && allowNull) return { ok: true, value: null };
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "") || typeof value === "boolean") return { ok: false, reason: "invalid threshold" };
  if (typeof value !== "number" && typeof value !== "string") return { ok: false, reason: "invalid threshold" };
  const threshold = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(threshold) || threshold < 0) return { ok: false, reason: "invalid threshold" };
  return { ok: true, value: threshold };
}

export function validateAlertRulePatch(body: unknown): AlertRulePatchValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "invalid alert rule" };
  const input = body as Record<string, unknown>;
  const patch: AlertRulePatch = {};
  if (Object.prototype.hasOwnProperty.call(input, "enabled")) {
    if (typeof input.enabled !== "boolean") return { ok: false, reason: "invalid enabled value" };
    patch.enabled = input.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(input, "threshold")) {
    const result = validateAlertThreshold(input.threshold);
    if (!result.ok || result.value === null) return { ok: false, reason: "invalid threshold" };
    patch.threshold = result.value;
  }
  if (Object.keys(patch).length === 0) return { ok: false, reason: "no editable fields supplied" };
  return { ok: true, patch };
}

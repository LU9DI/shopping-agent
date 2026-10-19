import test from "node:test";
import assert from "node:assert/strict";
import { validateAlertRulePatch } from "../src/domain/alertRuleValidation.js";

test("accepts boolean enabled updates, including false", () => {
  assert.deepEqual(validateAlertRulePatch({ enabled: false }), { ok: true, patch: { enabled: false } });
});

test("accepts finite non-negative thresholds including zero", () => {
  assert.deepEqual(validateAlertRulePatch({ threshold: 0 }), { ok: true, patch: { threshold: 0 } });
  assert.deepEqual(validateAlertRulePatch({ threshold: "12.5" }), { ok: true, patch: { threshold: 12.5 } });
});

test("rejects invalid thresholds and enabled values", () => {
  for (const threshold of [-1, Infinity, NaN, "nope", null, ""]) assert.equal(validateAlertRulePatch({ threshold }).ok, false);
  assert.equal(validateAlertRulePatch({ enabled: "false" }).ok, false);
});

test("rejects empty or malformed patch payloads", () => {
  assert.equal(validateAlertRulePatch({}).ok, false);
  assert.equal(validateAlertRulePatch(null).ok, false);
  assert.equal(validateAlertRulePatch([]).ok, false);
});

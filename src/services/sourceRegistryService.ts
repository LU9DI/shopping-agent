import { initDb } from "../core/db.js";

const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export type SourceRegistryEntry = {
  source: string;
  displayName: string;
  enabled: boolean;
  allowedHosts: string[];
  maxConcurrency: number;
  minIntervalMs: number;
  timeoutMs: number;
  maxResponseBytes: number;
  breakerFailureThreshold: number;
  breakerCooldownMs: number;
};

export function normalizeSourceId(source: string) {
  const value = source.trim().toLowerCase();
  if (!SOURCE_ID.test(value)) throw new Error("invalid source");
  return value;
}

export async function getSourceRegistryEntry(source: string): Promise<SourceRegistryEntry | null> {
  const db = initDb();
  const normalized = normalizeSourceId(source);
  const result = await db.query(
    `SELECT source,display_name AS "displayName",enabled,allowed_hosts AS "allowedHosts",
            max_concurrency AS "maxConcurrency",min_interval_ms AS "minIntervalMs",
            timeout_ms AS "timeoutMs",max_response_bytes AS "maxResponseBytes",
            breaker_failure_threshold AS "breakerFailureThreshold",
            breaker_cooldown_ms AS "breakerCooldownMs"
     FROM shopping_source_registry WHERE source=$1`,
    [normalized]
  );
  if (!result.rowCount) return null;
  return result.rows[0] as SourceRegistryEntry;
}

export async function assertSourceRegistered(source: string) {
  const normalized = normalizeSourceId(source);
  if (process.env.NODE_ENV === "test" && normalized === "integration") return normalized;
  const entry = await getSourceRegistryEntry(normalized);
  if (!entry || !entry.enabled) throw new Error("source is not registered or enabled");
  return normalized;
}

export async function listSourceRegistry() {
  const db = initDb();
  const result = await db.query(
    `SELECT source,display_name AS "displayName",enabled,allowed_hosts AS "allowedHosts",
            max_concurrency AS "maxConcurrency",min_interval_ms AS "minIntervalMs",
            timeout_ms AS "timeoutMs",max_response_bytes AS "maxResponseBytes",
            breaker_failure_threshold AS "breakerFailureThreshold",
            breaker_cooldown_ms AS "breakerCooldownMs"
     FROM shopping_source_registry ORDER BY source`
  );
  return result.rows as SourceRegistryEntry[];
}

export async function assertAllowedHttpsUrl(source: string, rawUrl: string) {
  const entry = await getSourceRegistryEntry(source);
  if (!entry || !entry.enabled) throw new Error("source is not registered or enabled");
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("invalid source url"); }
  if (url.protocol !== "https:") throw new Error("source url must use https");
  const hostname = url.hostname.toLowerCase();
  const allowed = entry.allowedHosts.some((allowedHost) => hostname === allowedHost);
  if (!allowed) throw new Error("source host is not allowed");
  if (url.username || url.password) throw new Error("source url credentials are not allowed");
  return url;
}

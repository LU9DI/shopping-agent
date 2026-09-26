import { initDb } from "../core/db.js";

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

const SOURCE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export async function getSourceRegistryEntry(source: string): Promise<SourceRegistryEntry | null> {
  const normalized = source.trim().toLowerCase();
  if (!SOURCE_RE.test(normalized)) return null;
  const r = await initDb().query(
    "SELECT source,display_name,enabled,allowed_hosts,max_concurrency,min_interval_ms,timeout_ms,max_response_bytes,breaker_failure_threshold,breaker_cooldown_ms FROM shopping_source_registry WHERE source=$1 LIMIT 1",
    [normalized],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  return {
    source: row.source,
    displayName: row.display_name,
    enabled: Boolean(row.enabled),
    allowedHosts: Array.isArray(row.allowed_hosts) ? row.allowed_hosts.map(String) : [],
    maxConcurrency: Number(row.max_concurrency),
    minIntervalMs: Number(row.min_interval_ms),
    timeoutMs: Number(row.timeout_ms),
    maxResponseBytes: Number(row.max_response_bytes),
    breakerFailureThreshold: Number(row.breaker_failure_threshold),
    breakerCooldownMs: Number(row.breaker_cooldown_ms),
  };
}

export async function assertAllowedHttpsUrl(source: string, value: string): Promise<URL> {
  const entry = await getSourceRegistryEntry(source);
  if (!entry) throw new Error("source is not registered");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("source URL must use HTTPS");
  if (url.username || url.password) throw new Error("source URL credentials are not allowed");
  const host = url.hostname.toLowerCase();
  if (!entry.allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
    throw new Error("source URL host is not allowed");
  }
  return url;
}

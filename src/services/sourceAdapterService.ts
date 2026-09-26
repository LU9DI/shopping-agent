import { initDb } from "../core/db.js";
import {
  assertAllowedHttpsUrl,
  getSourceRegistryEntry,
  type SourceRegistryEntry,
} from "./sourceRegistryService.js";

export const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type SourceAdapterRequest = {
  url: string;
  init?: RequestInit;
};

export interface SourceAdapter {
  source: string;
  buildRequest(productKey: string): Promise<SourceAdapterRequest>;
}

export type SourceExecutionResult = {
  source: string;
  status: number;
  contentType: string;
  body: string;
  redirects: number;
  latencyMs: number;
};

export type PriceObservation = {
  price: number;
  merchant?: string;
  url?: string;
};

export interface SourceAdapterWithParser extends SourceAdapter {
  parseResponse(result: SourceExecutionResult): PriceObservation;
}

type FetchLike = typeof fetch;

function normalizeSourceError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 200);
  return "source request failed";
}

function isRetryableStatus(status: number) {
  return RETRYABLE_HTTP_STATUSES.has(status);
}

export function isRedirectStatus(status: number) {
  return REDIRECT_STATUSES.has(status);
}

export function validateContentType(contentType: string | null) {
  const normalized = (contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (!normalized) throw new Error("source response content type is missing");
  if (!["application/json", "text/plain", "text/html"].includes(normalized)) {
    throw new Error("source response content type is not supported");
  }
  return normalized;
}

export async function readResponseBodyLimited(response: Response, maxBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared && Number.isFinite(Number(declared)) && Number(declared) > maxBytes) {
    throw new Error("source response exceeds configured size limit");
  }

  if (!response.body) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maxBytes) {
      throw new Error("source response exceeds configured size limit");
    }
    return body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response too large").catch(() => undefined);
        throw new Error("source response exceeds configured size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function acquireSourceSlot(entry: SourceRegistryEntry) {
  const db = initDb();
  await db.query(
    `INSERT INTO shopping_source_state(source)
     VALUES ($1)
     ON CONFLICT (source) DO NOTHING`,
    [entry.source],
  );
  const result = await db.query(
    `UPDATE shopping_source_state
       SET
         state = CASE WHEN state = 'open' THEN 'half_open' ELSE state END,
         in_flight = in_flight + 1,
         next_allowed_at = now() + ($2 * interval '1 millisecond'),
         updated_at = now()
       WHERE source = $1
         AND in_flight < $3
         AND (
           (
             state = 'closed'
             AND COALESCE(next_allowed_at, '-infinity'::timestamptz) <= now()
           )
           OR (
             state = 'open'
             AND retry_at <= now()
             AND in_flight = 0
           )
         )
       RETURNING source, state`,
    [entry.source, entry.minIntervalMs, entry.maxConcurrency]
  );
  return result.rowCount === 1;
}

async function releaseSourceSlot(source: string, errorCode?: string) {
  const db = initDb();
  await db.query(
    `UPDATE shopping_source_state
       SET in_flight = GREATEST(in_flight - 1, 0),
           last_error_code = COALESCE($2, last_error_code),
           updated_at = now()
     WHERE source = $1`,
    [source, errorCode ?? null]
  );
}

async function recordSourceSuccess(source: string) {
  const db = initDb();
  await db.query(
    `UPDATE shopping_source_state
       SET in_flight = GREATEST(in_flight - 1, 0),
           consecutive_failures = 0,
           state = 'closed',
           opened_at = NULL,
           retry_at = NULL,
           last_error_code = NULL,
           updated_at = now()
     WHERE source = $1`,
    [source]
  );
}

async function recordSourceRetryableFailure(
  source: string,
  errorCode: string,
  failureThreshold: number,
  cooldownMs: number,
) {
  const db = initDb();
  await db.query(
    `UPDATE shopping_source_state
       SET
         in_flight = GREATEST(in_flight - 1, 0),
         consecutive_failures = consecutive_failures + 1,
         state = CASE
           WHEN state = 'half_open' OR consecutive_failures + 1 >= $2 THEN 'open'
           ELSE state
         END,
         opened_at = CASE
           WHEN state = 'half_open' OR consecutive_failures + 1 >= $2 THEN now()
           ELSE opened_at
         END,
         retry_at = CASE
           WHEN state = 'half_open' OR consecutive_failures + 1 >= $2
             THEN now() + ($3 * interval '1 millisecond')
           ELSE retry_at
         END,
         last_error_code = $4,
         updated_at = now()
     WHERE source = $1`,
    [source, failureThreshold, cooldownMs, errorCode]
  );
}

function errorCodeFor(error: unknown) {
  const message = normalizeSourceError(error).toLowerCase();
  const http = message.match(/^source_http_(\\d{3})/);
  if (http) return `SOURCE_HTTP_${http[1]}`;
  if (message.includes("timeout") || message.includes("aborted")) return "SOURCE_TIMEOUT";
  if (message.includes("response exceeds")) return "SOURCE_RESPONSE_TOO_LARGE";
  if (message.includes("redirect")) return "SOURCE_REDIRECT_REJECTED";
  if (message.includes("content type")) return "SOURCE_CONTENT_TYPE_REJECTED";
  if (message.includes("host")) return "SOURCE_HOST_REJECTED";
  return "SOURCE_REQUEST_FAILED";
}

async function fetchWithSafeRedirects(
  source: string,
  initialUrl: URL,
  init: RequestInit,
  signal: AbortSignal,
  fetchImpl: FetchLike,
) {
  let currentUrl = initialUrl;
  let redirects = 0;

  while (true) {
    const response = await fetchImpl(currentUrl, {
      ...init,
      redirect: "manual",
      signal,
    });

    if (!isRedirectStatus(response.status)) return { response, redirects };

    if (redirects >= MAX_REDIRECTS) {
      throw new Error("source redirect limit exceeded");
    }

    const location = response.headers.get("location");
    if (!location) throw new Error("source redirect is missing location");

    const nextUrl = new URL(location, currentUrl);
    await assertAllowedHttpsUrl(source, nextUrl.toString());
    currentUrl = nextUrl;
    redirects += 1;
  }
}

export async function executeSourceAdapter(
  adapter: SourceAdapter,
  productKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<SourceExecutionResult> {
  const startedAt = Date.now();
  const source = adapter.source.trim().toLowerCase();
  const entry = await getSourceRegistryEntry(source);
  if (!entry || !entry.enabled) {
    throw new Error("source is not registered or enabled");
  }

  const acquired = await acquireSourceSlot(entry);
  if (!acquired) throw new Error("source is rate limited or circuit open");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), entry.timeoutMs);
  try {
    const request = await adapter.buildRequest(productKey);
    const url = await assertAllowedHttpsUrl(source, request.url);
    const { response, redirects } = await fetchWithSafeRedirects(
      source,
      url,
      request.init || {},
      controller.signal,
      fetchImpl,
    );

    const contentType = validateContentType(response.headers.get("content-type"));
    const body = await readResponseBodyLimited(response, entry.maxResponseBytes);

    if (!response.ok) {
      const code = `SOURCE_HTTP_${response.status}`;
      if (isRetryableStatus(response.status)) {
        await recordSourceRetryableFailure(
          source,
          code,
          entry.breakerFailureThreshold,
          entry.breakerCooldownMs,
        );
      } else {
        await releaseSourceSlot(source, code);
      }
      throw new Error(code);
    }

    await recordSourceSuccess(source);
    return {
      source,
      status: response.status,
      contentType,
      body,
      redirects,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const code = errorCodeFor(error);
    if (!code.startsWith("SOURCE_HTTP_")) {
      await releaseSourceSlot(source, code);
    }
    throw new Error(`${code}: ${normalizeSourceError(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export function createAdapterRegistry(adapters: SourceAdapterWithParser[]) {
  const map = new Map(adapters.map((adapter) => [adapter.source.trim().toLowerCase(), adapter]));
  return (source: string) => map.get(source.trim().toLowerCase()) ?? null;
}

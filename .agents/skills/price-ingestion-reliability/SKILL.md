---
name: price-ingestion-reliability
description: Build reliable and safe price collection, normalization, retries, and worker execution.
---
# Price ingestion reliability
- Treat all remote product pages, feeds, and API responses as untrusted input; validate URLs, response sizes, content types, and parsed prices.
- Prevent SSRF: restrict schemes, block loopback/private/link-local destinations, re-check resolved addresses across redirects, and enforce timeouts.
- Do not bypass robots, access controls, paywalls, rate limits, or anti-abuse controls.
- Normalize currency, units, timestamps, seller identity, and provenance; never fabricate unavailable prices.
- Use bounded retries with backoff and jitter, deduplicate idempotently, and make worker leases/recovery explicit.
- Keep raw response data bounded and avoid persisting secrets or unnecessary personal data.
- Test malformed pages, missing prices, currency ambiguity, timeouts, duplicate events, and transient database/provider failures.

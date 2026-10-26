---
name: auth-implementation-patterns
description: Review JWT auth, ownership checks, and secret handling in shopping-agent.
---
# Authentication and authorization
- Verify JWT signature and expiry; validate configured issuer/audience if present.
- Enforce object-level ownership on every price list, preference, watch, and user-specific resource.
- Never trust user IDs from request bodies when an authenticated principal is available.
- Keep secrets in environment/secret storage; never log tokens, passwords, or full auth headers.
- Fail closed on invalid auth configuration; do not disable CORS or checks to make tests pass.
- Add negative tests for missing, malformed, expired, wrong-role, and cross-user credentials.

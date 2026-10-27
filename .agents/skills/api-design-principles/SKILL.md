---
name: api-design-principles
description: Design stable HTTP contracts for the shopping-agent service.
---
# API design principles
- Inspect existing Express routes, schemas, error shapes, and database conventions before changing contracts.
- Validate all untrusted path/query/body input at the boundary; bound payload sizes, pagination, and expensive operations.
- Keep authentication, authorization, validation, domain logic, and persistence distinct.
- Use stable status codes and structured errors without stack traces or sensitive data.
- Make retries safe for mutations and worker jobs; use database transactions and unique constraints where needed.
- Test unauthenticated, forbidden, malformed, duplicate, timeout, and success paths.
- Do not document a contract that differs from runtime behavior.

# Agent guidance — shopping-agent

Independent Node.js/TypeScript/Express service with PostgreSQL, JWT authentication, and background price workers.

## Skill routing
- HTTP routes and response contracts: read .agents/skills/api-design-principles/SKILL.md.
- JWT, user ownership, and secrets: read .agents/skills/auth-implementation-patterns/SKILL.md.
- Price collection, normalization, worker retries, or external URLs: read .agents/skills/price-ingestion-reliability/SKILL.md.

## Validation
Run npm ci, npm run check, and npm test for relevant changes. Never call production services from tests; report skipped checks explicitly.

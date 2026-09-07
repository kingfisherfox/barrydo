# Schema — intent and invariants

Structure (tables, columns, refs, indexes) lives in **[`docs/database/schema.dbml`](database/schema.dbml)** — the canonical, agent-edited schema home. This page records only the why.

## Ownership & tiers
- One D1 SQLite database per deployment, created by `setup.sh` / `wrangler d1 create`.
- `migrations/` is the structural source of truth; the DBML mirrors it; `src/db.ts` is the only code that speaks SQL.

## Invariants (why, not what)
- **No hard task deletes, ever.** Deletion is a status flip (`deleted`) so refs stay stable and history stays complete — the user's contract is "history is forever, restorable."
- **Stable numbering.** Task/project ids are AUTOINCREMENT and never reused; the human-facing ref (`T12` / `P3-T12`) is derived at serialization and may mutate when a task moves between project and inbox — the numeric identity never does.
- **Manual ordering is user truth.** `position` is the default sort; new tasks append. Due-date grouping and priority are presentation, not storage order — deliberately, so drag order survives UI redesigns.
- **Date-only dues** (YYYY-MM-DD) — the product treats tasks as day-granular; no times, no timezone storage, local-device interpretation.
- **Single-user data.** No ownership columns anywhere: the API key IS the tenancy boundary. Any future multi-user work would need a breaking migration — that's a product decision, not a schema patch.

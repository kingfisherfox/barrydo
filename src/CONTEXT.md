# barrydo Worker — the whole product capability

## Purpose
Single-user task/project manager hosted as one Cloudflare Worker: serves the PWA, the REST surface the PWA speaks, and the MCP endpoint agents speak — one D1 database, one API key as the entire auth model (the key is also the web-app login password).

## User Stories
- As the owner, I add/edit/complete/delete tasks (title, description, High/Medium/Low/None priority, date-only due) and see instant UI feedback — never a spinner-driven duplicate.
- As the owner, I group tasks into projects and manage them on one Home page (accordion groups, remembered collapse state); projects are a grouping mechanism, not a destination.
- As the owner, I reorder tasks and projects by drag (touch included), move tasks between groups, and keep a permanent, restorable history of everything completed and deleted.
- As an agent (an MCP client / a chat client / any MCP client), I perform every one of those operations via 14 MCP tools using stable numbered refs.

## Information Flow
- **Inputs:** PWA fetches → `/api/*`; agent JSON-RPC POSTs → `/mcp`; both carry `Authorization: Bearer <API_KEY>` (env secret).
- **Outputs:** JSON over REST; MCP streamable-HTTP (stateless, JSON responses); static PWA assets from Workers Assets.
- **Calls:** `src/index.ts` (auth gate, CORS) → `src/api.ts` + `src/mcp.ts` → `src/db.ts` (all SQL) → D1. The PWA (`public/app.js`) is optimistic-first: DOM mutates on interaction, network settles in background, full re-render only on error.

## Terminology
- **Ref** — derived task identity: `T12` inbox / `P3-T12` in project; bare ids and project names also resolve everywhere.
- **Soft delete** — `status='deleted'`; history = everything not active.
- **Position** — REAL column on tasks AND projects encoding manual drag order; project names are unique case-insensitive (names are refs too).

## Key Files
- `src/index.ts` — the ONLY auth check + routing
- `src/db.ts` — the ONLY SQL, ref parsing, validation
- `src/mcp.ts` — 14 tools, thin wrappers over db.ts
- `public/app.js` — entire PWA (hash-routed SPA, drag system, optimistic layer)

## External Dependencies
- APIs: none outbound — barrydo calls nothing external (see `docs/api-surface.md` for the inbound surface).
- Schema: `docs/database/schema.dbml`.

## Constraints
- Single user; no accounts; key rotation via `wrangler secret put` only (no in-app edit, by design).
- PWA online-only; no frameworks, no build step; vanilla JS/CSS with ADS tokens.
- Tasks never hard-deleted; ids never reused.

## Attention Guidance
- Rules of engagement live in `.pi/AGENTS.md`; decision history in `.pi/DECISIONS.md` (ADR-009 ordering, ADR-011 optimistic UI, ADR-014 public packaging).
- Deployment config is local-only (`wrangler.jsonc`, gitignored); template + `setup.sh` are the public path.

# barrydo — Code Index

## Repository Shape
```
src/              — Cloudflare Worker (single): auth router + REST + MCP
  index.ts        — entry: bearer auth gate, /api + /mcp routing, assets passthrough, CORS
  db.ts           — all D1 queries; ref parsing (T12 / P3-T12 / P3); validation
  api.ts          — REST handlers for the PWA (/api/*)
  mcp.ts          — MCP server factory + 14 tools (streamable HTTP, stateless)
  env.ts          — Worker bindings (DB, ASSETS, API_KEY)
public/           — PWA (served via Workers Assets)
  index.html      — shell: topbar, view, bottom nav, toast
  app.js          — vanilla-JS SPA, hash-routed (#/inbox #/project/:id/edit #/task/:id #/settings #/history)
  styles.css      — Atlassian Design System-flavoured tokens (blue #0C66E4, Inter stack)
  sw.js           — no-op service worker (installability only; online-only by design)
  manifest.webmanifest
  icons/          — icon.svg (source of truth) + generated PNGs
migrations/       — D1 migrations (schema only — no data)
wrangler.template.jsonc — tracked config template (wrangler.jsonc is generated + gitignored)
setup.sh          — one-command bootstrap: D1 + migrations + key secret + deploy
LICENSE           — MIT
docs/             — CODE_INDEX.md (this), schema.md, api-surface.md
.pi/              — AGENTS.md, CONSTRAINTS.md, DECISIONS.md
```

## Entry Points
- Worker: `src/index.ts` (fetch → auth → route)
- PWA: `public/index.html` + `public/app.js`

## Cross-Capability Flows
- PWA → `/api/*` (REST) and agents → `/mcp` (MCP streamable HTTP) both hit `src/db.ts`; one key (`API_KEY` secret) gates both.
- Task refs are computed, not stored: `P<projectId>-T<taskId>` when assigned, else `T<taskId>`; stable because task/project ids are AUTOINCREMENT and never reused (soft delete).

## Deployment
`./setup.sh` (fresh installs: creates D1, migrates, sets the key secret, deploys, prints wiring) or `npx wrangler deploy` — manual steps in `README.md`. Your instance's URL/keys live only in the gitignored `docs/ACCESS.md`.

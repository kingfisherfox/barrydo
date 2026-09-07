# barrydo — Agent Router

Single-user todo system: Cloudflare Worker + D1 + Workers-Assets PWA + MCP endpoint. One capability domain; no cross-capability boundaries.

## Task → Context Map
| Task class | Load |
|---|---|
| Any code change | `docs/CODE_INDEX.md` first, then target file |
| DB/schema change | `docs/schema.md` + new migration in `migrations/` |
| API/MCP behaviour | `docs/api-surface.md` |
| Styling | `public/styles.css` only — all tokens at :root; no per-component colors |
| Deploy/secrets | `wrangler.jsonc`, `.dev.vars` (local only) |

## Hard Rules
- Auth check lives ONLY in `src/index.ts` (`authorized()`); every handler assumes it ran.
- Ref parsing/validation lives ONLY in `src/db.ts` (`parseTaskRef`, `resolveProjectRef`, `assert*`).
- PWA is vanilla JS + CSS — no frameworks, no build step. Keep it that way.
- MCP tools are thin wrappers over `db.ts` — no SQL in `mcp.ts`.
- `.dev.vars` never holds the production key. Production key = `wrangler secret put API_KEY`.
- `wrangler.jsonc` (real ids) is local-only/gitignored — tracked config is `wrangler.template.jsonc`; setup.sh seeds from it.

## Commands
`npm run dev` (local :8787, key from .dev.vars) · `npm run types` (tsc) · `npm run migrate` (remote D1) · `npm run deploy`

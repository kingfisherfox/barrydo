# barrydo — Session Timeline

## 2026-09-07 — barrydo v1→v1.4.4: full build, deploy, and public GitHub release
- Built the whole product in one session: single Cloudflare Worker (PWA via Workers Assets + REST `/api/*` + stateless streamable-HTTP MCP `/mcp`), D1 schema (stable never-reused ids, soft delete, `position` manual order), one `API_KEY` secret as the only auth (also the web login password).
- PWA evolved through four UX generations: flat rows → card-based → merged single-page Home with accordion project groups (state remembered per device) → optimistic UI (same-tick create, instant complete, background settle) + drag-drop (reorder, move between groups, live-expand collapsed targets).
- Verified everything against the running app every step: REST + MCP curl gauntlets, synthetic pointer-event drags, phone-viewport emulation; fixed real bugs found by testing (async error 500s, ref-parser gaps, project-edit flag reset, scroll-under-header).
- Packaged for public release: `setup.sh` one-command installer, public README with full self-host guide + screenshot, MIT license (kingfisherfox), template-pattern config (`wrangler.template.jsonc` tracked; real `wrangler.jsonc` gitignored), history scrubbed to a single clean commit and force-pushed; API key verified absent from every blob and commit.
- Production: barrydo is deployed to the owner's workers.dev instance (v1.4.4; URL/keys in gitignored `docs/ACCESS.md`). Repo: https://github.com/kingfisherfox/barrydo.
Commit: `abb7c6f` (docs sync; app through `b8f5de0`)
Next-Session: run a fresh clone + ./setup.sh end-to-end on a throwaway Cloudflare account to validate the public installer exactly as a stranger would

# barrydo — Session Timeline

## 2026-09-07 — barrydo v1→v1.4.4: full build, deploy, and public GitHub release
- Built the whole product in one session: single Cloudflare Worker (PWA via Workers Assets + REST `/api/*` + stateless streamable-HTTP MCP `/mcp`), D1 schema (stable never-reused ids, soft delete, `position` manual order), one `API_KEY` secret as the only auth (also the web login password).
- PWA evolved through four UX generations: flat rows → card-based → merged single-page Home with accordion project groups (state remembered per device) → optimistic UI (same-tick create, instant complete, background settle) + drag-drop (reorder, move between groups, live-expand collapsed targets).
- Verified everything against the running app every step: REST + MCP curl gauntlets, synthetic pointer-event drags, phone-viewport emulation; fixed real bugs found by testing (async error 500s, ref-parser gaps, project-edit flag reset, scroll-under-header).
- Packaged for public release: `setup.sh` one-command installer, public README with full self-host guide + screenshot, MIT license (kingfisherfox), template-pattern config (`wrangler.template.jsonc` tracked; real `wrangler.jsonc` gitignored), history scrubbed to a single clean commit and force-pushed; API key verified absent from every blob and commit.
- Production: barrydo is deployed to the owner's workers.dev instance (v1.4.4; URL/keys in gitignored `docs/ACCESS.md`). Repo: https://github.com/kingfisherfox/barrydo.
Commit: `abb7c6f` (docs sync; app through `b8f5de0`)
Next-Session: run a fresh clone + ./setup.sh end-to-end on a throwaway Cloudflare account to validate the public installer exactly as a stranger would

## 2026-09-07 — v1.5.0: project drag ordering, unique project names, badge states
- Projects became manually ordered like tasks: migration 0003 (`projects.position`, backfill id order), `POST /api/projects/reorder`, grip handles on Home group cards reusing the task drag system (`.dropgap`/`.dragging`, pointer-events for touch); Inbox pinned first, strip mirrors settled order client-side.
- Duplicate project names rejected (case-insensitive, 409) on create + rename, REST and MCP — names are resolvable refs, duplicates would be ambiguous. Guard lives in `db.ts`, deliberately not a DB unique index so legacy deployments with dupes still migrate.
- Home group headers simplified: no `P#` ref, no "No active tasks" text; count badge now carries state — grey (0 active), orange (any active task overdue), on both group chip and strip badge, computed client-side from due dates. Moving into empty groups works via their headers and strip cards.
- Verified against running app: tsc + JS syntax, REST gauntlet (409 dupes both cases, rename-to-self OK, reorder persists, 400 bad body), MCP list/create/update paths, browser DOM assertions + synthetic pointer-event drags (project reorder persisted across reload; task move-to-inbox regression clean; badge state flips live).
- Known nit observed, pre-existing, not fixed here: percent-encoded spaces in project-name URL refs 404 (`/api/projects/My%20Proj`) — pathname is not decoded; refs `P3`, plain ids, and space-free names work.
Commit: (this session)
Next-Session: fresh clone + ./setup.sh end-to-end on a throwaway Cloudflare account (still pending from last session); consider decoding %-escapes in path segments if name-refs with spaces matter.

## 2026-09-07 — v1.5.1: empty-project cards identical to non-empty
- User feedback: the 18px drop-sliver under open empty groups read as a stray "second section". Removed — every project card is header + count badge only, identical whether it holds 0 or N tasks; the badge (grey/orange/blue) carries the state. Moving into empty groups still works (drop on their header or strip card).

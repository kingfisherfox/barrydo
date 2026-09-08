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

## 2026-09-07 — v1.5.0/v1.5.1 deployed to production; offboarding sync
- Production shipped: migration 0003 applied to remote D1, then deploys `9727abd1` (v1.5.0) and `299fd51c` (v1.5.1) to <your-deployment>.workers.dev; live checks passed (served app.js 1.5.1, /api/projects on migrated schema, dup-name 409 probe — no data written).
- Ops: wrangler OAuth token re-issued via browser consent — old token had lost `d1:write` (migrations 7403); remedy recorded in docs/ACCESS.md.
- Offboarding sync: CONSTRAINTS.md gained the unique-project-names invariant; ACCESS.md deployment history brought current; commit hashes for this session's work: v1.5.0 = `bbea733`, v1.5.1 = `70e6a58`.
Commit: (this entry)
Next-Session: fresh clone + ./setup.sh end-to-end on a throwaway Cloudflare account (pending since v1.4.4); optional: decode %-escapes in path segments so project-name refs containing spaces resolve.

## 2026-09-08 — Home UX overhaul: search replaces strip, header-tap add, freshness-on-return (v1.5.2→v1.6.1)
- Removed project-edit pencil from Home group headers; editing lives in Settings only
- Group-header tap now opens quick-add pre-targeted to that group; fold/unfold moved to the chevron
- Quick-add project select mirrors dragged project order live (task-detail select already inherited it from /api/projects)
- Deleted the sticky project strip (jump/flash, drop-to-move, badge mirrors) and replaced it with fuzzy search: live subsequence filtering over titles + refs + project names, project-name hits show all their tasks, force-open while searching, ✕/Esc clears
- PWA freshness: read-only views re-fetch when the tab becomes visible after >60s hidden — fixes "synced task invisible" false negatives (a synced agent client sync writes arrive via MCP while the app sits open)
- Diagnosed the reported sync failure: the synced task HAD synced + completed; a synced agent client's engine was fine except edits (D2) — reversed D2 in sync-client (update_task push, 23/23 tests green, uncommitted there)
- Deployed v1.6.1 to production (c413f934); installed Cloudflare agent skills + 5 CF MCP servers per developers.cloudflare.com/agent-setup
Commit: `0d92c66`
Next-Session: a synced agent client edit-sync (D2 reversal) needs app rebuild+restart to go live; consider backfilling 13 pre-sync todos lacking remoteRef

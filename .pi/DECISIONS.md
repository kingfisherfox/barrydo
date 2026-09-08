# Decisions (ADR log)

## ADR-001 — Single Worker serves PWA + REST + MCP
Worker with `assets` binding serves `public/` directly; `/api/*` and `/mcp` handled in `fetch`. Alternatives (Pages + separate Functions, separate MCP worker) rejected: more moving parts for a single-user system.

## ADR-002 — MCP via official SDK, WebStandard transport, stateless
`WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` + `enableJsonResponse: true`; fresh `McpServer` per POST. No sessions, no Durable Objects — D1 is the only state. Accepted trade-off: no server-push (GET returns 405); fine for tools-only usage by external agent clients.

## ADR-003 — Composite display refs, stable numeric ids
User wanted `{projectID}{taskid}`. Stored id is the bare number; `P<n>-T<n>` is derived at serialization. Ref mutates on move (display-only); lookups accept both forms + bare digits + project names.

## ADR-004 — Soft delete only; history = status != active
`completed_at`/`deleted_at` set on transitions and cleared on reopen/restore. No purge path exists (v1); if D1 size ever matters, add an explicit purge tool later — never implicit.

## ADR-005 — Vanilla PWA, ADS tokens hand-rolled
Atlaskit/React rejected (weight). Tokens mirror Atlassian Design System: #0C66E4 primary, #172B4D text, N-scale greys, Inter/system stack, 4px radii. System font stack — no webfont download (lighter, offline-install friendly).

## ADR-006 — No-op service worker
Installability requires a SW with a fetch handler; online-only requires no data caching. SW registers and passes through. If offline mode is ever wanted, that is a rewrite decision, not a patch.

## ADR-007 — zod 3 (not 4) pinned
MCP SDK 1.x peer-depends on `zod ^3.25 || ^4`; 3.25 chosen for SDK-tool-schema compatibility.

## ADR-008 — Bearer key = SHA-256 digest compare
Constant-time-ish comparison via `crypto.subtle` digests rather than string equality. Key stored as Wrangler secret, rotatable without redeploy of code.

## ADR-009 — Manual ordering via `position` column (drag & drop)
Drag-and-drop demanded a user-defined order, displacing the old due→priority→id sort. `position REAL` rebalanced to i×100 by `POST /api/tasks/reorder` with the full visible id list; new tasks append (max+1000). Home still groups by due date; order within the view is the manual order. History sorts by `updated_at DESC` (activity), not position. Drag is pointer-events based (not HTML5 DnD) so touch works; the grip has `touch-action: none`. Dropping a task on a project strip card moves it there — same `PATCH {project}` path as the select in task detail.

## ADR-010 — Card-based UI; Projects view groups tasks per project
Tasks render as individual cards (8px radius, ADS shadow) instead of rows inside one container; the Projects tab became a grouped view (later superseded by ADR-011's merged Home). Quick-add gained an always-visible description input (creation with title + description together). Group cards reuse the `.row` class for drag compatibility.

## ADR-011 — One merged Home page; projects are groups; optimistic UI
User feedback: mobile felt slow and the Projects tab duplicated Home. Home is now the single surface — Inbox group + one accordion group per project, collapsible with per-device persistence (localStorage), 2-tab nav (Home/History). All mutating interactions are optimistic: create inserts a same-tick pending card and disables + during flight (prevents double-tap duplicates), complete strikes instantly then removes, moves/reorders mutate DOM first and settle via `PATCH` / `POST /api/tasks/reorder` in background, rolling back to a full render only on error. Dragging over a collapsed group header expands it live; dropping on any group body (empty included) moves the task. The project-edit route bug (route() reset the edit flag before render) was fixed by moving edit to its own hash route `#/project/:id/edit`.

## ADR-012 — Settings page; ADS panel system for detail surfaces
Project creation/management and sign-out moved off Home into a Settings page (gear in the top bar replaces the lock). Settings uses an ADS-style sectioned panel system (`.panel` / `.setrow`): Projects (list + edit + create), Account (masked key, sign-out), About (version/build/service — constants `APP_VERSION`/`APP_BUILD` at the top of `app.js`, mirrored in `package.json` and the manifest). Task detail and project edit were restyled onto the same panel system — Details / Attributes (two-column priority+due grid) / Actions, and a Danger zone for project deletion — keeping one visual language across every non-list surface.

## ADR-013 — MCP wiring surfaced in Settings; scroll polish
Settings gained an MCP panel so connecting agents is self-serve: endpoint URL (derived from `location.origin`, never hard-coded), `Authorization` header name and full Bearer value, and a copy-ready `mcpServers` JSON config — each row with a copy button (clipboard API with a select-text fallback for contexts without permission). Home's "Home" heading was removed (two pages only). Group jumps (strip taps) respect `scroll-margin-top` on `.pgroup` so target headers clear the sticky top bar on mobile.

## ADR-014 — Public packaging
Repo prepared for public release: all personal deployment data (URLs, keys, ops notes) consolidated into gitignored `docs/ACCESS.md` (never committed — verified across full git history); public `README.md` carries the full self-hosting guide; `setup.sh` is the one-command installer (login check → unique worker name → D1 create + id injection → migrations → generated key secret → deploy → printed wiring); MIT `LICENSE` added; Settings' Account panel dropped its redundant masked-key row (the full key already lives behind auth in Settings → MCP) and the About service row became dynamic (`location.host`). Tracked files contain no secrets — the only key occurrences on disk are `.dev.vars` and `docs/ACCESS.md`, both ignored.

## ADR-015 — Project drag ordering, unique names, badge states
Three product gaps closed in one pass. (1) Projects got the same manual `position` ordering as tasks (ADR-009 extended): `projects.position REAL` rebalanced i×100 by `POST /api/projects/reorder`; group cards carry a grip handle and reuse the task drag system (`.dropgap` placeholder, `.dragging` lift, pointer-events so touch works); Inbox is pinned first — projects reorder among themselves; the strip mirrors the settled order client-side. Migration 0003 backfills id order; name uniqueness is enforced in `db.ts` (409), NOT a DB unique index — existing deployments may hold duplicates and migrations must never fail on them. (2) Project names are unique case-insensitive on create + rename (REST and MCP share the guard) — required because `resolveProjectRef` resolves bare names, so a duplicate would make name-refs ambiguous. (3) Home group headers simplified: no `P#` ref and no "No active tasks" text; the count badge carries the state — grey when 0 active, orange when any active task in the group is overdue (computed client-side from due dates, no API change; overdue beats zero because overdue implies ≥1).

## ADR-016 — Search replaces the project strip; header-tap = add
The sticky side-scrolling project strip (jump-to-group, drop-to-move, badge mirror) is removed; its real estate became a fuzzy search bar. Rationale: on a single-page grouped Home the strip's navigation was near-redundant while search scales with task/project count. Search is a client-side subsequence matcher (word-start + consecutive-run bonuses, gap penalty) over task titles + refs + project names; a project-name hit shows ALL that project's tasks; rows/groups hide live per keystroke; collapsed groups force-open while filtering; ✕/Esc clears; session-only state. Group headers gained the strip's lost affordances: tapping a header opens quick-add pre-targeted to that group (project preselected, title focused) — editing left Home entirely for Settings. Fold/unfold moved to the chevron (padded hit area). Task moves lost the strip drop-target; group-to-group drags and the task-detail select remain. After an in-session project drag, the new order is mirrored live into the quick-add select (task-detail select inherits order from every fresh fetch — `/api/projects` ORDER BY position is the single shared truth).

## ADR-017 — PWA freshness-on-return
Cross-plane writes (an external todo-sync client over MCP, other devices) exposed the top false-negative of the sync era: an already-open PWA never re-fetches, so synced tasks look "not created" (live incident 2026-09-08: a synced task existed and was completed server-side while the open app showed nothing). The PWA now re-renders the current read-only view when the tab becomes visible after >60s hidden; edit surfaces (task detail, settings, project edit) are exempt so in-progress form state is never clobbered. Same session, the client's no-edit-sync decision (its "D2") was reversed — edits now push `update_task`; recorded in that client's own sync plan. barrydo needed no change; `update_task` was already in the MCP surface.

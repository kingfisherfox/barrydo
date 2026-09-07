# Decisions (ADR log)

## ADR-001 — Single Worker serves PWA + REST + MCP
Worker with `assets` binding serves `public/` directly; `/api/*` and `/mcp` handled in `fetch`. Alternatives (Pages + separate Functions, separate MCP worker) rejected: more moving parts for a single-user system.

## ADR-002 — MCP via official SDK, WebStandard transport, stateless
`WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` + `enableJsonResponse: true`; fresh `McpServer` per POST. No sessions, no Durable Objects — D1 is the only state. Accepted trade-off: no server-push (GET returns 405); fine for tools-only usage by an MCP client/a chat client.

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

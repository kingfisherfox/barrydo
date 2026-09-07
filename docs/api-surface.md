# API Surface

Single bearer key gates everything: `Authorization: Bearer <API_KEY>` (Cloudflare secret `API_KEY`; local dev via `.dev.vars`).

## MCP — `POST /mcp` (streamable HTTP, stateless, JSON responses)
Clients must send `Accept: application/json, text/event-stream`. Browser-based MCP clients: CORS `*` + preflight enabled.

**14 tools:** `list_tasks` · `get_task` · `create_task` · `update_task` · `move_task` · `complete_task` · `reopen_task` · `delete_task` (soft) · `restore_task` · `list_projects` · `create_project` · `update_project` · `delete_project` · `history`

Ref conventions accepted everywhere a task/project is referenced:
- Task: `12` | `"T12"` | `"P3-T12"` (bare `"P3"` is rejected — project ref)
- Project: `3` | `"P3"` | exact name (case-insensitive)

## REST — `/api/*` (PWA-internal, same key)
| Method | Path | Notes |
|---|---|---|
| GET | /api/verify | key check (login) |
| GET/POST | /api/tasks | `?status=active|completed|deleted|all&project=<ref|none>&limit=` ; body: title, description?, priority?, due_date?, project? |
| POST | /api/tasks/reorder | body `{ ids: [task ids in new order] }` — persists drag-and-drop order |
| GET/PATCH | /api/tasks/:ref | patch fields; `project: null` → inbox; `status` also patchable |
| POST | /api/tasks/:ref/complete\|reopen\|delete\|restore | convenience verbs |
| GET/POST | /api/projects | body: name, description? |
| PATCH/DELETE | /api/projects/:ref | delete moves tasks to inbox |
| GET | /api/history | `?status=completed|deleted|all&limit=` (default all non-active) |

Errors: JSON `{ "error": "..." }` with 400/401/404. Unauthenticated: 401.

## PWA interaction model
- **Home (single page, projects are groups — not a view):** sticky project strip (tap = jump to group; drop = move), quick-add with title + description inline (optimistic — card appears same-tick, + disabled in flight), then accordion groups: Inbox + every project, each collapsible with state remembered per device (localStorage `barrydo_collapsed`). Drag a collapsed group's header while dragging to expand it live; drag into any group body (incl. empty) to move the task.
- **Optimistic everywhere:** create / complete-toggle / move / reorder update the DOM instantly and settle in the background. Double-tap duplicates are impossible (+ locked while a create is in flight).
- **Project edit** lives at `#/project/<id>/edit` (pencil on group header): rename, re-describe, delete (tasks → Inbox).
- **Settings** (`#/settings`, gear in top bar): MCP panel (endpoint URL, Authorization header name + full Bearer value, and a copy-ready `mcpServers` JSON block — all with copy buttons; URL derived from the current origin), Projects panel (list with edit buttons + create form — creation no longer lives on Home), Account panel (masked API key, sign-out), About panel (version, build, service URL). Version/build constants live at the top of `app.js` (`APP_VERSION`, `APP_BUILD`) and mirror `package.json`/`manifest.webmanifest`.
- **History** sorts by most recent activity; restore per row.

## Client wiring
- an MCP client / any MCP client: URL `<your-deployment>/mcp`, header `Authorization: Bearer <API_KEY>` — copy-ready values and JSON config live in the app at Settings → MCP
- PWA: your deployment root in a browser; enter the key once at the unlock screen (stored in localStorage).

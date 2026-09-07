// CAPABILITY: barrydo PWA — vanilla JS SPA, hash-routed, online-only.
// AUTH: single bearer key stored in localStorage.
// UX LAWS:
//   1. Optimistic-first: creates/completes/moves/reorders update the DOM instantly, network settles in background.
//   2. Projects are GROUPS on one Home page (accordion, state remembered), not a separate view.
// VIEWS: Home (all groups) · task detail · project edit · history.

const APP_VERSION = "1.4.3";
const APP_BUILD = "2026-09-07.7";

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");

let KEY = localStorage.getItem("barrydo_key") || "";
let ADD_OPEN = false;      // quick-add options row
let HIST_TAB = "all";      // history filter

// collapse state: { "inbox": true, "p3": false, ... } — persisted
let COLLAPSED = {};
try { COLLAPSED = JSON.parse(localStorage.getItem("barrydo_collapsed") || "{}"); } catch { COLLAPSED = {}; }
const saveCollapsed = () => localStorage.setItem("barrydo_collapsed", JSON.stringify(COLLAPSED));

// ─── api ─────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY, ...(opts.headers || {}) },
  });
  if (res.status === 401) { showLogin("Key rejected — enter it again"); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { toast(data.error || "HTTP " + res.status); throw new Error(data.error || res.status); }
  return data;
}
const post = (p, body) => api(p, { method: "POST", body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: "PATCH", body: JSON.stringify(body) });
const del = (p) => api(p, { method: "DELETE" });

// ─── helpers ─────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dueInfo(due) {
  if (!due) return null;
  const diff = Math.round((Date.parse(due + "T00:00:00") - Date.parse(localToday() + "T00:00:00")) / 86400000);
  const label = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday"
    : new Date(due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const cls = diff < 0 ? "overdue" : diff === 0 ? "today" : "";
  return { diff, label, cls };
}
function dueChip(t) {
  const d = dueInfo(t.due_date);
  return d ? `<span class="chip due ${d.cls}">${d.label}</span>` : "";
}

const GRIP = `<svg viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.6"/><circle cx="7.5" cy="2.5" r="1.6"/><circle cx="2.5" cy="8" r="1.6"/><circle cx="7.5" cy="8" r="1.6"/><circle cx="2.5" cy="13.5" r="1.6"/><circle cx="7.5" cy="13.5" r="1.6"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const INBOXICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
const PENCIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>`;

function taskRow(t, draggable = false, opts = {}) {
  const done = t.status === "completed";
  const check = t.status === "deleted"
    ? `<span class="check dim"></span>`
    : `<button class="check ${done ? "on" : ""}" data-action="toggle" data-id="${t.id}" aria-label="toggle done"></button>`;
  const handle = draggable && t.status === "active" ? `<span class="drag" data-drag title="Drag to reorder · drop on a project to move">${GRIP}</span>` : "";
  const showProj = opts.showProject !== false;
  return `
  <div class="row ${t.status !== "active" ? "is-done" : ""}" data-action="open" data-id="${t.id}">
    ${handle}
    ${check}
    <div class="row-main">
      <div class="row-title">${esc(t.title)}</div>
      ${t.description ? `<div class="row-desc">${esc(t.description.slice(0, 140))}</div>` : ""}
      <div class="row-meta">
        <span class="ref">${t.ref}</span>
        ${t.priority !== "none" ? `<span class="pill ${t.priority}">${t.priority}</span>` : ""}
        ${dueChip(t)}
        ${showProj && t.project ? `<span class="chip proj" data-action="openproj" data-id="${t.project.id}">${esc(t.project.name)}</span>` : ""}
        ${t.status === "deleted" ? `<span class="pill status">${t.status}</span>` : ""}
      </div>
    </div>
  </div>`;
}

/** Quick add: title + description always, priority/date/project in the collapsible row. */
function quickAdd(projects) {
  return `
  <form class="quickadd" data-form="addtask">
    <div class="qa-box">
      <div class="qa-inputs">
        <input name="title" placeholder="Add a task…" autocomplete="off" required>
        <input name="description" placeholder="Description (optional)" autocomplete="off">
      </div>
      <button class="icon-btn" type="button" data-action="addopts" aria-label="options">${CHEV}</button>
      <button class="add-btn" type="submit" aria-label="Add task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
    <div class="qa-opts ${ADD_OPEN ? "open" : ""}">
      <select name="priority" class="input">
        <option value="none">No priority</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <input type="date" name="due_date" class="input">
      <select name="project" class="input">
        <option value="">Inbox</option>
        ${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}
      </select>
    </div>
  </form>`;
}

/** Sticky project strip — tap = jump to group, drop a dragged task = move. */
function projectStrip(projects, tasks) {
  const inboxCount = tasks.filter((t) => !t.project).length;
  return `
  <div class="projstrip">
    <div class="pcard" data-action="scrollgroup" data-g="inbox" data-dropproj="inbox">${INBOXICON}<span>Inbox</span><b data-stripfor="inbox">${inboxCount}</b></div>
    ${projects.map((p) => `
    <div class="pcard" data-action="scrollgroup" data-g="p${p.id}" data-dropproj="${p.id}">${FOLDER}
      <span class="pname">${esc(p.name)}</span><b data-stripfor="p${p.id}">${p.active_tasks}</b>
    </div>`).join("")}
  </div>`;
}

/** One accordion group: Inbox or a project. key: "inbox" | "p<id>". */
function groupCard(opts) {
  const { key, name, ref, pid, tasks } = opts;
  const closed = !!COLLAPSED[key];
  return `
  <div class="pgroup ${closed ? "closed" : ""}" id="g-${key}" data-pid="${pid ?? ""}" data-pgroup="${esc(name.toLowerCase())}">
    <div class="pgroup-head" data-action="collapse" data-key="${key}">
      <span class="pgroup-ic">${pid ? FOLDER : INBOXICON}</span>
      <div class="pgroup-name">${esc(name)} ${ref ? `<span class="ref">${ref}</span>` : ""}</div>
      <span class="count-chip" data-countfor="${key}">${tasks.length}</span>
      ${pid ? `<button class="icon-btn pgroup-edit" data-action="editproject" data-id="${pid}" aria-label="edit project">${PENCIL}</button>` : ""}
      <span class="chev">${CHEV}</span>
    </div>
    <div class="pgroup-body">
      <div class="cardstack">${tasks.map((t) => taskRow(t, true)).join("")}</div>
      ${tasks.length ? "" : `<div class="pgroup-empty">No active tasks</div>`}
    </div>
  </div>`;
}

const emptyState = (msg) => `<div class="empty">${msg}</div>`;

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

// group/count DOM helpers (optimistic updates use these)
const groupEl = (key) => view.querySelector(`#g-${CSS.escape(key)}`);
const bumpCount = (key, delta) => {
  const g = groupEl(key);
  if (!g) return;
  const chip = g.querySelector("[data-countfor]");
  chip.textContent = Math.max(0, Number(chip.textContent) + delta);
  const empty = g.querySelector(".pgroup-empty");
  if (empty) empty.style.display = Number(chip.textContent) ? "none" : "";
  const strip = view.querySelector(`[data-stripfor="${key}"]`);
  if (strip) strip.textContent = Math.max(0, Number(strip.textContent) + delta);
};
function setGroupOpen(key, open) {
  const g = groupEl(key);
  if (!g) return;
  g.classList.toggle("closed", !open);
  COLLAPSED[key] = !open;
  saveCollapsed();
}

// ─── views ───────────────────────────────────────────────────────────────────

async function renderHome() {
  if (!KEY) return showLogin();
  const [{ tasks }, { projects }] = await Promise.all([api("/api/tasks?limit=1000"), api("/api/projects")]);
  const inboxTasks = tasks.filter((t) => !t.project);
  const byProject = new Map(projects.map((p) => [p.id, []]));
  for (const t of tasks) if (t.project && byProject.has(t.project.id)) byProject.get(t.project.id).push(t);
  view.innerHTML = `
    ${projects.length ? projectStrip(projects, tasks) : ""}
    ${quickAdd(projects)}
    ${groupCard({ key: "inbox", name: "Inbox", tasks: inboxTasks })}
    ${projects.map((p) => groupCard({ key: "p" + p.id, name: p.name, ref: p.ref, pid: p.id, tasks: byProject.get(p.id) || [] })).join("")}
    <a class="manage-link" href="#/settings">Manage projects in Settings →</a>`;
}

async function renderSettings() {
  if (!KEY) return showLogin();
  const { projects } = await api("/api/projects");
  const mcpUrl = location.origin + "/mcp";
  const bearer = "Bearer " + KEY;
  const clientJson = JSON.stringify({ mcpServers: { barrydo: { url: mcpUrl, headers: { Authorization: bearer } } } }, null, 2);
  view.innerHTML = `
    <div class="backbar"><button class="icon-btn" data-action="back" aria-label="back">${BACK}</button></div>
    <div class="page-title">Settings</div>
    <div class="panel">
      <div class="panel-title">MCP <span class="panel-sub">connect agents & tools</span></div>
      <div class="setrow">
        <div class="setrow-main">
          <div class="setrow-label">Endpoint URL</div>
          <div class="setrow-sub mono" id="mcp-url">${esc(mcpUrl)}</div>
        </div>
        <button class="btn subtle copy-btn" data-action="copy" data-copy="#mcp-url">Copy</button>
      </div>
      <div class="setrow">
        <div class="setrow-main">
          <div class="setrow-label">Header name</div>
          <div class="setrow-sub mono" id="mcp-hn">Authorization</div>
        </div>
        <button class="btn subtle copy-btn" data-action="copy" data-copy="#mcp-hn">Copy</button>
      </div>
      <div class="setrow">
        <div class="setrow-main">
          <div class="setrow-label">Header value</div>
          <div class="setrow-sub mono" id="mcp-hv">${esc(bearer)}</div>
        </div>
        <button class="btn subtle copy-btn" data-action="copy" data-copy="#mcp-hv">Copy</button>
      </div>
      <div class="setrow setrow-last">
        <div class="setrow-main">
          <div class="setrow-label">Client config (JSON)</div>
          <pre class="codeblock mono" id="mcp-json">${esc(clientJson)}</pre>
        </div>
        <button class="btn subtle copy-btn" style="align-self:flex-start" data-action="copy" data-copy="#mcp-json">Copy</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">${FOLDER.replace("<svg", '<svg width="16" height="16" style="color:var(--blue)"')} Projects <span class="count-chip" style="margin-left:auto">${projects.length}</span></div>
      ${projects.length
        ? projects.map((p) => `
        <div class="setrow">
          <div class="setrow-main">
            <div class="setrow-label">${esc(p.name)} <span class="ref">${p.ref}</span></div>
            <div class="setrow-sub">${p.active_tasks} active task${p.active_tasks === 1 ? "" : "s"}${p.description ? " · " + esc(p.description.slice(0, 70)) : ""}</div>
          </div>
          <button class="btn subtle" style="min-height:34px" data-action="editproject" data-id="${p.id}">Edit</button>
        </div>`).join("")
        : `<div class="panel-empty">No projects yet — create one below.</div>`}
      <div class="panel-body panel-divided">
        <form data-form="createproject">
          <div class="field"><label>New project</label><input name="name" class="input" placeholder="Project name" required></div>
          <div class="field"><input name="description" class="input" placeholder="Description (optional)"></div>
          <button class="btn primary block" type="submit">Create project</button>
        </form>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Account</div>
      <div class="setrow setrow-last">
        <div class="setrow-main">
          <div class="setrow-label">Sign out</div>
          <div class="setrow-sub">Clears the key from this device</div>
        </div>
        <button class="btn danger" style="min-height:34px" data-action="logout">Lock</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">About</div>
      <div class="setrow"><div class="setrow-main"><div class="setrow-label">Version</div></div><span class="setrow-sub mono">${APP_VERSION}</span></div>
      <div class="setrow"><div class="setrow-main"><div class="setrow-label">Build</div></div><span class="setrow-sub mono">${APP_BUILD}</span></div>
      <div class="setrow setrow-last"><div class="setrow-main"><div class="setrow-label">Service</div></div><span class="setrow-sub mono">${esc(location.host)}</span></div>
    </div>`;
}

async function renderProjectEdit(id) {
  if (!KEY) return showLogin();
  const { projects } = await api("/api/projects");
  const p = projects.find((x) => x.id === Number(id));
  if (!p) { toast("Project not found"); return (location.hash = "#/inbox"); }
  view.innerHTML = `
    <div class="backbar"><button class="icon-btn" data-action="back" aria-label="back">${BACK}</button></div>
    <div class="page-title">${FOLDER.replace("<svg", '<svg width="20" height="20" style="vertical-align:-3px;color:var(--n200)"')} Edit project</div>
    <form data-form="saveproject" data-id="${p.id}">
      <div class="panel">
        <div class="panel-title">Project <span class="ref" style="margin-left:auto">${p.ref}</span></div>
        <div class="panel-body">
          <div class="field"><label>Name</label><input name="name" class="input" value="${esc(p.name)}" required></div>
          <div class="field field-last"><label>Description</label><textarea name="description" class="input" style="min-height:64px">${esc(p.description)}</textarea></div>
        </div>
      </div>
      <div class="btn-row" style="margin-top:0">
        <button class="btn primary" type="submit">Save changes</button>
        <button class="btn subtle" type="button" data-action="canceledit">Cancel</button>
      </div>
    </form>
    <div class="panel">
      <div class="panel-title">Danger zone</div>
      <div class="panel-body">
        <button class="btn danger block" data-action="deleteproject" data-id="${p.id}">Delete project</button>
        <div class="hint" style="padding:10px 0 0">Deleting moves its tasks to Inbox on this page. Tasks are never deleted.</div>
      </div>
    </div>`;
}

async function renderTask(id) {
  if (!KEY) return showLogin();
  const [{ task: t }, { projects }] = await Promise.all([api("/api/tasks/" + id), api("/api/projects")]);
  const banner =
    t.status === "completed" ? `<div class="banner completed"><span>Completed ${t.completed_at?.slice(0, 10) ?? ""}</span><button class="btn subtle" data-action="reopen" data-id="${t.id}">Reopen</button></div>` :
    t.status === "deleted" ? `<div class="banner deleted"><span>Deleted ${t.deleted_at?.slice(0, 10) ?? ""} — soft deleted, restorable</span><button class="btn subtle" data-action="restore" data-id="${t.id}">Restore</button></div>` :
    "";
  view.innerHTML = `
    <div class="backbar"><button class="icon-btn" data-action="back" aria-label="back">${BACK}</button></div>
    ${banner}
    <form data-form="savetask" data-id="${t.id}">
      <div class="panel">
        <div class="panel-title">Details <span class="ref" style="margin-left:auto">${t.ref}</span></div>
        <div class="panel-body">
          <div class="field"><label>Title</label><input name="title" class="input" value="${esc(t.title)}" required></div>
          <div class="field field-last"><label>Description</label><textarea name="description" class="input" placeholder="Details…">${esc(t.description)}</textarea></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Attributes</div>
        <div class="panel-body">
          <div class="grid2">
            <div class="field"><label>Priority</label>
              <select name="priority" class="input">
                <option value="none" ${t.priority === "none" ? "selected" : ""}>None</option>
                <option value="high" ${t.priority === "high" ? "selected" : ""}>High</option>
                <option value="medium" ${t.priority === "medium" ? "selected" : ""}>Medium</option>
                <option value="low" ${t.priority === "low" ? "selected" : ""}>Low</option>
              </select>
            </div>
            <div class="field"><label>Due date</label><input type="date" name="due_date" class="input" value="${t.due_date ?? ""}"></div>
          </div>
          <div class="field field-last"><label>Project</label>
            <select name="project" class="input">
              <option value="" ${!t.project ? "selected" : ""}>Inbox (no project)</option>
              ${projects.map((p) => `<option value="${p.id}" ${t.project?.id === p.id ? "selected" : ""}>${esc(p.name)} (${p.ref})</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <button class="btn primary block" type="submit">Save changes</button>
    </form>
    <div class="panel">
      <div class="panel-title">Actions</div>
      <div class="panel-body btn-row" style="margin-top:0">
        ${t.status === "active" ? `<button class="btn subtle" data-action="complete" data-id="${t.id}">✓ Complete</button>` : ""}
        <button class="btn danger" data-action="softdelete" data-id="${t.id}">Delete</button>
      </div>
    </div>
    <div class="hint">Created ${t.created_at.slice(0, 10)} · updated ${t.updated_at.slice(0, 10)}. Delete is soft — it lands in History.</div>`;
}

async function renderHistory() {
  if (!KEY) return showLogin();
  const { tasks } = await api("/api/history?status=" + HIST_TAB + "&limit=400");
  view.innerHTML = `
    <div class="page-title">History</div>
    <div class="tabs">
      <button class="${HIST_TAB === "all" ? "on" : ""}" data-action="histtab" data-tab="all">All</button>
      <button class="${HIST_TAB === "completed" ? "on" : ""}" data-action="histtab" data-tab="completed">Completed</button>
      <button class="${HIST_TAB === "deleted" ? "on" : ""}" data-action="histtab" data-tab="deleted">Deleted</button>
    </div>
    ${tasks.length
      ? `<div class="cardstack">${tasks.map((t) => `
          <div class="row is-done" data-action="open" data-id="${t.id}">
            ${t.status === "deleted" ? `<span class="check dim"></span>` : `<span class="check on"></span>`}
            <div class="row-main">
              <div class="row-title">${esc(t.title)}</div>
              <div class="row-meta">
                <span class="ref">${t.ref}</span>
                <span class="pill status">${t.status}</span>
                ${t.project ? `<span class="chip proj">${esc(t.project.name)}</span>` : ""}
                ${t.completed_at ? `<span class="chip">done ${t.completed_at.slice(0, 10)}</span>` : ""}
                ${t.deleted_at ? `<span class="chip">deleted ${t.deleted_at.slice(0, 10)}</span>` : ""}
              </div>
            </div>
            <button class="btn subtle" style="min-height:30px;padding:4px 10px;font-size:12px" data-action="restore" data-id="${t.id}">Restore</button>
          </div>`).join("")}</div>`
      : emptyState("History is empty.")}`;
}

function showLogin(err = "") {
  view.innerHTML = `
    <div class="login" id="login">
      <div class="login-card">
        <img src="/icons/icon.svg" alt="barrydo">
        <h1>barrydo</h1>
        <p>Tasks + projects, keyed to you alone.</p>
        <form data-form="login">
          <div class="login-err">${esc(err)}</div>
          <div class="field">
            <input type="password" name="key" class="input" placeholder="API key" autocomplete="current-password" required autofocus>
          </div>
          <button class="btn primary block" type="submit">Unlock</button>
        </form>
      </div>
    </div>`;
}

// ─── drag & drop (reorder + move between groups / onto strip cards) ──────────

let suppressClick = false;
let drag = null;

function clearDrag() {
  if (!drag) return;
  drag.row?.classList.remove("dragging");
  if (drag.row) drag.row.style.cssText = "";
  drag.ph?.remove();
  document.querySelectorAll(".droptarget").forEach((n) => n.classList.remove("droptarget"));
  drag = null;
}

function initDrag() {
  document.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    const handle = e.target.closest("[data-drag]");
    if (!handle) return;
    const row = handle.closest(".row");
    if (!row) return;
    if (drag && drag.started) clearDrag(); // second finger / interrupted sequence — reset cleanly
    drag = {
      row, id: row.dataset.id, x: e.clientX, y: e.clientY, started: false,
      ids0: [...view.querySelectorAll(".row")].map((r) => r.dataset.id).join(","),
      origKey: row.closest(".pgroup")?.id?.replace(/^g-/, "") || null,
    };
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.started = true;
      suppressClick = true;
      const r = drag.row.getBoundingClientRect();
      drag.offY = e.clientY - r.top;
      drag.ph = document.createElement("div");
      drag.ph.className = "dropgap";
      drag.ph.style.height = r.height + "px";
      drag.row.after(drag.ph);
      drag.row.classList.add("dragging");
      Object.assign(drag.row.style, { position: "fixed", width: r.width + "px", left: r.left + "px", top: e.clientY - drag.offY + "px", zIndex: 99 });
    }
    drag.row.style.top = e.clientY - drag.offY + "px";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    document.querySelectorAll(".droptarget").forEach((n) => n.classList.remove("droptarget"));
    drag.proj = undefined;
    const proj = el?.closest?.("[data-dropproj]");
    if (proj) {
      drag.proj = proj.dataset.dropproj;
      proj.classList.add("droptarget");
      return;
    }
    const target = el?.closest?.(".row");
    if (target && target !== drag.row) {
      const tr = target.getBoundingClientRect();
      target.parentNode.insertBefore(drag.ph, e.clientY < tr.top + tr.height / 2 ? target : target.nextSibling);
      return;
    }
    // hovering a collapsed group's header: expand it live so rows become droppable
    const head = el?.closest?.(".pgroup.closed .pgroup-head");
    if (head) {
      const key = head.dataset.key;
      if (key) setGroupOpen(key, true);
      return;
    }
    // hovering a group's body/empty area (incl. empty groups): park placeholder at its end
    const grp = el?.closest?.(".pgroup");
    if (grp?.id?.startsWith("g-")) {
      const gkey = grp.id.replace(/^g-/, "");
      if (gkey !== drag.origKey) {
        const stack = grp.querySelector(".pgroup-body .cardstack");
        if (stack && !stack.contains(drag.ph)) stack.appendChild(drag.ph);
      }
    }
  });

  async function finish() {
    if (!drag) return;
    const { id, started, proj, ph, row, ids0, origKey } = drag;
    if (!started) { drag = null; return; }
    const phParent = ph?.parentNode;
    if (ph && ph.parentNode) ph.replaceWith(row);
    row.classList.remove("dragging");
    row.style.cssText = "";
    document.querySelectorAll(".droptarget").forEach((n) => n.classList.remove("droptarget"));
    drag = null;
    setTimeout(() => (suppressClick = false), 250);

    const newKey = row.closest(".pgroup")?.id?.replace(/^g-/, "") || null;
    let movedTo = null; // null = none, "inbox", or pid number

    if (proj !== undefined) {
      // dropped on a strip card → move to that project/inbox
      const pid = proj === "inbox" ? null : Number(proj);
      const targetBody = groupEl(pid ? "p" + pid : "inbox")?.querySelector(".pgroup-body .cardstack");
      if (targetBody) targetBody.prepend(row);
      movedTo = pid === null ? "inbox" : pid;
    } else if (newKey && newKey !== origKey) {
      // dragged into a different group on the page → move
      const pidNum = newKey === "inbox" ? null : Number(newKey.replace(/^p/, ""));
      movedTo = pidNum === null ? "inbox" : pidNum;
    }

    try {
      if (movedTo !== null) {
        await patch("/api/tasks/" + id, movedTo === "inbox" ? { project: null } : { project: Number(movedTo) });
        // optimistic UI already: update ref label + counts
        row.querySelector(".ref").textContent = (movedTo === "inbox" ? "T" : `P${movedTo}-T`) + id;
        if (origKey) bumpCount(origKey, -1);
        bumpCount(movedTo === "inbox" ? "inbox" : "p" + movedTo, 1);
        toast(movedTo === "inbox" ? "Moved to Inbox" : "Moved to project");
      }
      const ids = [...view.querySelectorAll(".row")].map((r) => Number(r.dataset.id));
      if (ids.join(",") !== ids0) await post("/api/tasks/reorder", { ids });
    } catch { route(); }
  }
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", clearDrag);
}

// ─── router ──────────────────────────────────────────────────────────────────

function route() {
  const h = (location.hash || "#/inbox").slice(2);
  const seg = h.split("/");
  const nav = seg[0] === "history" ? "history" : "home";
  document.querySelectorAll(".bottomnav a").forEach((a) => a.classList.toggle("on", a.dataset.nav === nav));
  if (seg[0] === "task" && seg[1]) return renderTask(seg[1]).catch(() => {});
  if (seg[0] === "settings") return renderSettings().catch(() => {});
  if (seg[0] === "project" && seg[1] && seg[2] === "edit") return renderProjectEdit(seg[1]).catch(() => {});
  if (seg[0] === "project" && seg[1]) return (location.hash = "#/inbox"); // single-project view is gone — grouped on Home
  return renderHome().catch(() => {});
}
// hashchange listener lives in the boot section (scroll-to-top + route)

// ─── events ──────────────────────────────────────────────────────────────────

document.addEventListener("click", async (e) => {
  if (suppressClick) return;
  const el = e.target.closest("[data-action]");
  if (!el || el.tagName === "A") return;
  const { action, id, key, tab, g } = el.dataset;
  const run = async (fn) => { el.disabled = true; try { await fn(); } finally { el.disabled = false; } };
  switch (action) {
    case "open": if (!e.target.closest("[data-action]:not([data-action=open])")) location.hash = `#/task/${id}`; break;
    case "back": history.length > 1 ? history.back() : (location.hash = "#/inbox"); break;
    case "addopts": ADD_OPEN = !ADD_OPEN; route(); break;
    case "collapse": {
      const grp = el.closest(".pgroup");
      const willOpen = grp.classList.contains("closed");
      setGroupOpen(key, willOpen);
      break;
    }
    case "scrollgroup": {
      const grp = groupEl(g);
      if (grp) {
        setGroupOpen(g, true);
        grp.scrollIntoView({ behavior: "smooth", block: "start" });
        grp.classList.remove("flash");
        void grp.offsetWidth; // restart animation
        grp.classList.add("flash");
      }
      break;
    }
    case "toggle": {
      // OPTIMISTIC: strike + check instantly, settle in background, then remove card
      const row = el.closest(".row");
      if (!row || row.classList.contains("is-done")) return;
      el.classList.add("on");
      row.classList.add("is-done");
      const grpKey = row.closest(".pgroup")?.id?.replace(/^g-/, "");
      try {
        await post(`/api/tasks/${id}/complete`);
        row.classList.add("leaving");
        setTimeout(() => row.remove(), 300);
        if (grpKey) bumpCount(grpKey, -1);
        toast("✓ Done");
      } catch {
        el.classList.remove("on");
        row.classList.remove("is-done");
      }
      break;
    }
    case "complete": await run(async () => { await post(`/api/tasks/${id}/complete`); toast("Completed"); history.length > 1 ? history.back() : (location.hash = "#/inbox"); }); break;
    case "reopen": await run(async () => { await post(`/api/tasks/${id}/reopen`); route(); }); break;
    case "restore": await run(async () => { await post(`/api/tasks/${id}/restore`); toast("Restored to active"); route(); }); break;
    case "softdelete":
      if (confirm("Delete this task? It moves to History and can be restored.")) {
        await run(async () => { await post(`/api/tasks/${id}/delete`); toast("Deleted → History"); history.length > 1 ? history.back() : (location.hash = "#/inbox"); });
      }
      break;
    case "editproject": location.hash = `#/project/${id}/edit`; break;
    case "settings": location.hash = "#/settings"; break;
    case "copy": {
      const src = view.querySelector(el.dataset.copy);
      if (!src) break;
      const text = src.textContent.trim();
      try {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard");
      } catch {
        // fallback for contexts without clipboard API: select the text for manual copy
        const range = document.createRange();
        range.selectNodeContents(src);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        toast("Selected — press copy");
      }
      break;
    }
    case "canceledit": history.length > 1 ? history.back() : (location.hash = "#/inbox"); break;
    case "deleteproject":
      if (confirm(`Delete this project? Its tasks move to Inbox.`)) {
        await run(async () => { await del("/api/projects/" + id); toast("Project deleted — tasks moved to Inbox"); location.hash = "#/inbox"; route(); });
      }
      break;
    case "histtab": HIST_TAB = tab; route(); break;
    case "logout": localStorage.removeItem("barrydo_key"); KEY = ""; showLogin(); break;
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const v = Object.fromEntries(fd.entries());
  const kind = form.dataset.form;
  try {
    if (kind === "login") {
      KEY = String(v.key || "").trim();
      await api("/api/verify");
      localStorage.setItem("barrydo_key", KEY);
      location.hash = "#/inbox";
      route();
    } else if (kind === "addtask") {
      // OPTIMISTIC CREATE — card appears instantly; + disabled while in flight; no page refetch
      const addBtn = form.querySelector(".add-btn");
      const titleInput = form.querySelector('input[name="title"]');
      const descInput = form.querySelector('input[name="description"]');
      const pidSel = form.querySelector('select[name="project"]');
      const pid = pidSel && pidSel.value ? Number(pidSel.value) : null;
      const key = pid ? "p" + pid : "inbox";
      const body = { title: v.title, description: v.description || "" };
      if (v.priority && v.priority !== "none") body.priority = v.priority;
      if (v.due_date) body.due_date = v.due_date;
      if (pid) body.project = pid;

      const grp = groupEl(key);
      if (!grp) return;
      setGroupOpen(key, true);
      const stack = grp.querySelector(".pgroup-body .cardstack");
      const empty = grp.querySelector(".pgroup-empty");
      if (empty) empty.style.display = "none";
      const temp = document.createElement("div");
      temp.innerHTML = taskRow({ id: "tmp", ref: "…", title: v.title, description: v.description || "", status: "active", priority: body.priority || "none", due_date: v.due_date || null, project: null }, true).replace('class="row ', 'class="row pending ');
      const tempRow = temp.firstElementChild;
      stack.prepend(tempRow);
      tempRow.scrollIntoView({ behavior: "smooth", block: "center" });

      // clear inputs + lock the button immediately
      titleInput.value = "";
      descInput.value = "";
      if (v.priority) pidSel && (form.querySelector('select[name=priority]').value = "none");
      addBtn.disabled = true;
      try {
        const { task } = await post("/api/tasks", body);
        tempRow.outerHTML = taskRow(task, true);
        bumpCount(key, 1);
        toast(`Added ${task.ref}`);
      } catch (err) {
        tempRow.remove();
        bumpCount(key, 0); // re-evaluates empty state
        throw err;
      } finally {
        addBtn.disabled = false;
      }
    } else if (kind === "savetask") {
      await patch("/api/tasks/" + form.dataset.id, {
        title: v.title,
        description: v.description || "",
        priority: v.priority || "none",
        due_date: v.due_date || null,
        project: v.project ? Number(v.project) : null,
      });
      toast("Saved");
      history.length > 1 ? history.back() : (location.hash = "#/inbox");
    } else if (kind === "createproject") {
      const body = { name: v.name };
      if (v.description) body.description = v.description;
      const { project } = await post("/api/projects", body);
      toast(`Created ${project.ref}`);
      route(); // new group needs rendering
    } else if (kind === "saveproject") {
      const body = { name: v.name };
      if (v.description !== undefined) body.description = v.description;
      await patch("/api/projects/" + form.dataset.id, body);
      toast("Saved");
      location.hash = "#/inbox";
    }
  } catch {
    /* api() already toasted */
  }
});

// ─── boot ───────────────────────────────────────────────────────────────────

initDrag();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // we own scroll — see hashchange
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); route(); }); // every navigation opens at the top
route();

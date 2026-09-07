// CAPABILITY: data layer — all D1 queries for tasks + projects
// CONTRACT: ids are stable monotonic integers, never reused (soft delete).
// REFS: task ref = `T<id>` or `P<projectId>-T<id>` when in a project; project ref = `P<id>`.

import type { Env } from "./env";

export const PRIORITIES = ["high", "medium", "low", "none"] as const;
export const STATUSES = ["active", "completed", "deleted"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface TaskRow {
  id: number;
  title: string;
  description: string;
  project_id: number | null;
  status: string;
  priority: string;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  proj_name?: string | null;
}

export interface ProjectRow {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  active_count?: number;
}

// ─── serializers ─────────────────────────────────────────────────────────────

export function serializeTask(t: TaskRow) {
  return {
    ref: t.project_id ? `P${t.project_id}-T${t.id}` : `T${t.id}`,
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    project: t.project_id ? { id: t.project_id, ref: `P${t.project_id}`, name: t.proj_name ?? null } : null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    completed_at: t.completed_at,
    deleted_at: t.deleted_at,
  };
}

export function serializeProject(p: ProjectRow) {
  return { ref: `P${p.id}`, id: p.id, name: p.name, description: p.description, active_tasks: p.active_count ?? 0, created_at: p.created_at, updated_at: p.updated_at };
}

// ─── ref parsing ─────────────────────────────────────────────────────────────

/** Accepts: 12 | "12" | "T12" | "t12" | "P3-T12". Rejects bare "P3" (project ref). */
export function parseTaskRef(ref: string | number): number {
  if (typeof ref === "number" && Number.isInteger(ref) && ref > 0) return ref;
  const s = String(ref).trim().toUpperCase();
  if (/^P\d+$/.test(s)) throw new ApiError(400, `"${s}" is a project ref, not a task ref`);
  const m = s.match(/^(\d+)$/) || s.match(/^T(\d+)$/) || s.match(/^P\d+-T(\d+)$/);
  if (!m) throw new ApiError(400, `Invalid task ref "${ref}" — use 12, T12 or P3-T12`);
  return parseInt(m[1], 10);
}

/** Accepts: 3 | "3" | "P3" | exact project name (case-insensitive). Returns project id. Throws 404 if unknown. */
export async function resolveProjectRef(env: Env, ref: string | number): Promise<number> {
  if (typeof ref === "number" && Number.isInteger(ref) && ref > 0) {
    const row = await env.DB.prepare(`SELECT id FROM projects WHERE id = ?`).bind(ref).first<{ id: number }>();
    if (!row) throw new ApiError(404, `Project ${ref} not found`);
    return row.id;
  }
  const s = String(ref).trim();
  const pref = s.toUpperCase().match(/^P(\d+)$/);
  const digit = s.match(/^(\d+)$/);
  if (pref || digit) {
    const id = parseInt((pref ?? digit)![1], 10);
    const row = await env.DB.prepare(`SELECT id FROM projects WHERE id = ?`).bind(id).first<{ id: number }>();
    if (!row) throw new ApiError(404, `Project ${s} not found`);
    return row.id;
  }
  const row = await env.DB.prepare(`SELECT id FROM projects WHERE lower(name) = lower(?) LIMIT 1`).bind(s).first<{ id: number }>();
  if (!row) throw new ApiError(404, `Project "${s}" not found`);
  return row.id;
}

// ─── validation ──────────────────────────────────────────────────────────────

export function assertPriority(v: unknown): Priority {
  if (typeof v === "string" && (PRIORITIES as readonly string[]).includes(v)) return v as Priority;
  throw new ApiError(400, `Invalid priority "${v}" — use high|medium|low|none`);
}

export function assertDueDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && DATE_RE.test(v)) {
    const d = new Date(v + "T00:00:00Z");
    if (!isNaN(d.getTime())) return v;
  }
  throw new ApiError(400, `Invalid due_date "${v}" — use YYYY-MM-DD`);
}

export function assertTitle(v: unknown): string {
  if (typeof v === "string" && v.trim().length > 0 && v.length <= 500) return v.trim();
  throw new ApiError(400, "Title is required (1-500 chars)");
}

export function assertName(v: unknown): string {
  if (typeof v === "string" && v.trim().length > 0 && v.length <= 200) return v.trim();
  throw new ApiError(400, "Project name is required (1-200 chars)");
}

// ─── task queries ────────────────────────────────────────────────────────────

const TASK_SELECT = `SELECT t.*, p.name AS proj_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id`;

export async function getTask(env: Env, id: number) {
  const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first<TaskRow>();
  if (!row) throw new ApiError(404, `Task T${id} not found`);
  return serializeTask(row);
}

export async function listTasks(env: Env, opts: { status?: string; projectId?: number | null; limit?: number; order?: "position" | "recent" }) {
  const status = opts.status === "all" ? "all" : opts.status && (STATUSES as readonly string[]).includes(opts.status) ? opts.status : "active";
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);
  const ORDER = opts.order === "recent" ? "t.updated_at DESC, t.id DESC" : "t.position ASC, t.id ASC";
  const where: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") {
    where.push("t.status = ?");
    params.push(status);
  }
  if (opts.projectId !== undefined && opts.projectId !== null) {
    where.push("t.project_id = ?");
    params.push(opts.projectId);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { results } = await env.DB.prepare(`${TASK_SELECT} ${w} ORDER BY ${ORDER} LIMIT ?`)
    .bind(...params, limit)
    .all<TaskRow>();
  return results.map(serializeTask);
}

export async function createTask(env: Env, input: { title: string; description?: string; priority?: string; due_date?: string | null; project_id?: number | null }) {
  const desc = typeof input.description === "string" ? input.description.slice(0, 10000) : "";
  await env.DB.prepare(`INSERT INTO tasks (title, description, project_id, priority, due_date, position)
                        VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1000 FROM tasks))`)
    .bind(input.title, desc, input.project_id ?? null, input.priority ?? "none", input.due_date ?? null)
    .run();
  const row = await env.DB.prepare(`SELECT id FROM tasks ORDER BY id DESC LIMIT 1`).first<{ id: number }>();
  return getTask(env, row!.id);
}

export async function updateTask(
  env: Env,
  id: number,
  patch: { title?: string; description?: string; priority?: string; due_date?: string | null; project_id?: number | null }
) {
  const sets: string[] = [`updated_at = ${NOW}`];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(assertTitle(patch.title));
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(String(patch.description).slice(0, 10000));
  }
  if (patch.priority !== undefined) {
    sets.push("priority = ?");
    params.push(assertPriority(patch.priority));
  }
  if (patch.due_date !== undefined) {
    sets.push("due_date = ?");
    params.push(assertDueDate(patch.due_date));
  }
  if (patch.project_id !== undefined) {
    sets.push("project_id = ?");
    params.push(patch.project_id);
  }
  if (sets.length === 1) return getTask(env, id); // only updated_at — no-op
  const res = await env.DB.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id).run();
  if (!res.meta.changes) throw new ApiError(404, `Task T${id} not found`);
  return getTask(env, id);
}

export async function setTaskStatus(env: Env, id: number, status: Status) {
  const extra =
    status === "completed" ? `, completed_at = ${NOW}` :
    status === "deleted" ? `, deleted_at = ${NOW}` :
    ", completed_at = NULL, deleted_at = NULL"; // active clears both
  const res = await env.DB.prepare(`UPDATE tasks SET status = ?, updated_at = ${NOW}${extra} WHERE id = ?`).bind(status, id).run();
  if (!res.meta.changes) throw new ApiError(404, `Task T${id} not found`);
  return getTask(env, id);
}

/** Rebalance positions to match the given id order (i*100). Order-only: no updated_at bump. */
export async function reorderTasks(env: Env, ids: number[]): Promise<number> {
  const clean = ids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 1000);
  if (!clean.length) return 0;
  await env.DB.batch(clean.map((id, i) => env.DB.prepare(`UPDATE tasks SET position = ? WHERE id = ?`).bind((i + 1) * 100, id)));
  return clean.length;
}

// ─── project queries ─────────────────────────────────────────────────────────

export async function listProjects(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'active') AS active_count
     FROM projects p ORDER BY p.id`
  ).all<ProjectRow>();
  return results.map(serializeProject);
}

export async function createProject(env: Env, input: { name: string; description?: string }) {
  const desc = typeof input.description === "string" ? input.description.slice(0, 2000) : "";
  await env.DB.prepare(`INSERT INTO projects (name, description) VALUES (?, ?)`).bind(input.name, desc).run();
  const row = await env.DB.prepare(`SELECT p.*, 0 AS active_count FROM projects p ORDER BY id DESC LIMIT 1`).first<ProjectRow>();
  return serializeProject(row!);
}

export async function updateProject(env: Env, id: number, patch: { name?: string; description?: string }) {
  const sets: string[] = [`updated_at = ${NOW}`];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(assertName(patch.name));
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(String(patch.description).slice(0, 2000));
  }
  if (sets.length === 1) return null;
  const res = await env.DB.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id).run();
  if (!res.meta.changes) throw new ApiError(404, `Project P${id} not found`);
  return null;
}

/** Soft-frees tasks to inbox, then removes the project. History keeps composite refs pointing at the bare task number. */
export async function deleteProject(env: Env, id: number) {
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE tasks SET project_id = NULL, updated_at = ${NOW} WHERE project_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(id),
  ]);
  if (!res[1].meta.changes) throw new ApiError(404, `Project P${id} not found`);
  return null;
}

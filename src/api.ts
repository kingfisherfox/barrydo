// CAPABILITY: REST surface for the PWA (/api/*) — same bearer auth as /mcp
// All handlers throw ApiError(status, msg); index.ts catches and serializes.

import type { Env } from "./env";
import { ApiError, assertDueDate, assertPriority, assertTitle, assertName, createProject, createTask, deleteProject, getTask, listProjects, listTasks, parseTaskRef, reorderTasks, reorderProjects, resolveProjectRef, setTaskStatus, updateProject, updateTask, STATUSES, type Status } from "./db";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const method = req.method;
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const seg = path.split("/").filter(Boolean);
  const q = new URL(req.url).searchParams;

  // GET /api/verify — key check for PWA login
  if (seg[0] === "verify" && method === "GET") {
    return json({ ok: true, service: "barrydo", time: new Date().toISOString() });
  }

  // ── projects ─────────────────────────────────────────────────
  if (seg[0] === "projects") {
    if (seg.length === 1) {
      if (method === "GET") return json({ projects: await listProjects(env) });
      if (method === "POST") {
        const b = await body(req);
        return json({ project: await createProject(env, { name: assertName(b.name), description: b.description as string | undefined }) }, 201);
      }
    }
    if (seg.length === 2 && seg[1] === "reorder" && method === "POST") {
      const b = await body(req);
      if (!Array.isArray(b.ids) || !b.ids.length) throw new ApiError(400, "Body { ids: [project ids in new order] } required");
      return json({ ok: true, reordered: await reorderProjects(env, b.ids.map((n: unknown) => Number(n))) });
    }
    if (seg.length === 2) {
      const id = await resolveProjectRef(env, seg[1]);
      if (method === "PATCH") {
        const b = await body(req);
        if (b.name !== undefined) assertName(b.name);
        await updateProject(env, id, { name: b.name as string | undefined, description: b.description as string | undefined });
        return json({ projects: await listProjects(env) });
      }
      if (method === "DELETE") {
        await deleteProject(env, id);
        return json({ ok: true, note: `Project P${id} deleted; its tasks moved to inbox` });
      }
    }
  }

  // ── tasks ────────────────────────────────────────────────────
  if (seg[0] === "tasks") {
    if (seg.length === 1) {
      if (method === "GET") {
        const pRef = q.get("project");
        const projectId = pRef === null ? undefined : pRef === "none" ? null : await resolveProjectRef(env, pRef);
        return json({ tasks: await listTasks(env, { status: q.get("status") ?? "active", projectId, limit: q.get("limit") ? parseInt(q.get("limit")!, 10) : undefined }) });
      }
      if (method === "POST") {
        const b = await body(req);
        const task = await createTask(env, {
          title: assertTitle(b.title),
          description: b.description as string | undefined,
          priority: b.priority === undefined ? undefined : assertPriority(b.priority),
          due_date: assertDueDate(b.due_date ?? null),
          project_id: b.project === undefined || b.project === null ? null : await resolveProjectRef(env, b.project as string | number),
        });
        return json({ task }, 201);
      }
    }
    if (seg.length >= 2) {
      if (seg[1] === "reorder" && method === "POST") {
        const b = await body(req);
        if (!Array.isArray(b.ids) || !b.ids.length) throw new ApiError(400, "Body { ids: [task ids in new order] } required");
        return json({ ok: true, reordered: await reorderTasks(env, b.ids.map((n: unknown) => Number(n))) });
      }
      const id = parseTaskRef(seg[1]);
      if (seg.length === 2) {
        if (method === "GET") return json({ task: await getTask(env, id) });
        if (method === "PATCH") {
          const b = await body(req);
          if (b.status !== undefined) return json({ task: await setTaskStatus(env, id, b.status as Status) });
          return json({
            task: await updateTask(env, id, {
              title: b.title as string | undefined,
              description: b.description as string | undefined,
              priority: b.priority as string | undefined,
              due_date: b.due_date as string | null | undefined,
              project_id: b.project === undefined ? undefined : b.project === null ? null : await resolveProjectRef(env, b.project as string | number),
            }),
          });
        }
      }
      if (seg.length === 3 && method === "POST") {
        const action = seg[2];
        const map: Record<string, Status> = { complete: "completed", reopen: "active", delete: "deleted", restore: "active" };
        if (!(action in map)) throw new ApiError(404, `Unknown action "${action}"`);
        if (!(STATUSES as readonly string[]).includes(map[action])) throw new ApiError(400, "bad status");
        return json({ task: await setTaskStatus(env, id, map[action]) });
      }
    }
  }

  // ── history ──────────────────────────────────────────────────
  if (seg[0] === "history" && method === "GET") {
    const status = q.get("status") ?? "all";
    const tasks = await listTasks(env, { status: status === "active" ? "all" : status, limit: q.get("limit") ? parseInt(q.get("limit")!, 10) : 200, order: "recent" });
    return json({ tasks: status === "all" ? tasks.filter((t) => t.status !== "active") : tasks });
  }

  throw new ApiError(404, `No route: ${method} /api/${path}`);
}

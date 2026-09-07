// CAPABILITY: MCP server (streamable HTTP, stateless) — every feature the PWA has, tool-shaped.
// Mounted at /mcp behind the same bearer key as /api.

import type { Env } from "./env";
import { assertDueDate, assertName, assertPriority, assertTitle, createProject, createTask, deleteProject, getTask, listProjects, listTasks, parseTaskRef, resolveProjectRef, serializeTask, setTaskStatus, updateProject, updateTask } from "./db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ─── formatting (agent-readable text out) ────────────────────────────────────

type Task = ReturnType<typeof serializeTask>;

function fmtTask(t: Task): string {
  const bits = [t.ref, JSON.stringify(t.title)];
  if (t.priority !== "none") bits.push(`[${t.priority}]`);
  if (t.due_date) bits.push(`due:${t.due_date}`);
  if (t.project) bits.push(`(${t.project.name})`);
  if (t.status !== "active") bits.push(`{${t.status}}`);
  return bits.join("  ");
}

function fmtProject(p: { ref: string; name: string; description: string; active_tasks?: number }): string {
  const d = p.description ? ` — ${p.description}` : "";
  return `${p.ref}  ${p.name}${d}  [${p.active_tasks ?? 0} active]`;
}

const ok = (s: string) => ({ content: [{ type: "text" as const, text: s + "\n" }] });
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
  isError: true,
});

async function run(fn: () => Promise<string>) {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

// ─── schemas ─────────────────────────────────────────────────────────────────

const taskRefSchema = z.union([z.string(), z.number()]).describe(`Task ref: 12 | "T12" | "P3-T12" (task 12). Bare "P3" is a project.`);
const projectRefSchema = z.union([z.string(), z.number(), z.null()]).describe(`Project: 3 | "P3" | exact project name. null = inbox (no project).`);
const prioritySchema = z.enum(["high", "medium", "low", "none"]).describe("Priority (default none)");
const dueSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Due date, YYYY-MM-DD (date only)");
const statusFilter = z.enum(["active", "completed", "deleted", "all"]).describe("Filter by status (default active)");

// ─── registration ────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, env: Env): void {
  server.registerTool("list_tasks", {
    title: "List tasks",
    description: "List tasks. Default: active (incomplete) tasks across inbox + all projects.",
    inputSchema: { status: statusFilter.optional(), project: projectRefSchema.optional(), limit: z.number().int().min(1).max(1000).optional() },
  }, async (a) => run(async () => {
    const projectId = a.project === undefined ? undefined : a.project === null ? null : await resolveProjectRef(env, a.project);
    const tasks = await listTasks(env, { status: a.status ?? "active", projectId, limit: a.limit });
    return `${tasks.length} task(s) (${a.status ?? "active"}):\n` + (tasks.map(fmtTask).join("\n") || "(none)");
  }));

  server.registerTool("get_task", {
    title: "Get task",
    description: "Full detail for one task by ref.",
    inputSchema: { id: taskRefSchema },
  }, async (a) => run(async () => {
    const t = await getTask(env, parseTaskRef(a.id));
    return [fmtTask(t), t.description ? `description: ${t.description}` : null, `created:${t.created_at} updated:${t.updated_at}${t.completed_at ? ` completed:${t.completed_at}` : ""}${t.deleted_at ? ` deleted:${t.deleted_at}` : ""}`].filter(Boolean).join("\n");
  }));

  server.registerTool("create_task", {
    title: "Create task",
    description: "Create a task. Returns its stable ref (T<n> in inbox, P<n>-T<n> in a project).",
    inputSchema: {
      title: z.string().min(1).describe("Task title"),
      description: z.string().optional().describe("Longer description"),
      priority: prioritySchema.optional(),
      due_date: dueSchema.optional(),
      project: projectRefSchema.optional(),
    },
  }, async (a) => run(async () => {
    const t = await createTask(env, {
      title: assertTitle(a.title),
      description: a.description,
      priority: a.priority === undefined ? undefined : assertPriority(a.priority),
      due_date: assertDueDate(a.due_date ?? null),
      project_id: a.project === undefined || a.project === null ? null : await resolveProjectRef(env, a.project),
    });
    return `Created ${fmtTask(t)}`;
  }));

  server.registerTool("update_task", {
    title: "Update task",
    description: "Edit fields of a task. Only provided fields change; project: null moves it to inbox.",
    inputSchema: {
      id: taskRefSchema,
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      priority: prioritySchema.optional(),
      due_date: dueSchema.nullable().optional(),
      project: projectRefSchema.optional(),
    },
  }, async (a) => run(async () => {
    const t = await updateTask(env, parseTaskRef(a.id), {
      title: a.title as string | undefined,
      description: a.description as string | undefined,
      priority: a.priority as string | undefined,
      due_date: a.due_date as string | null | undefined,
      project_id: a.project === undefined ? undefined : a.project === null ? null : await resolveProjectRef(env, a.project),
    });
    return `Updated ${fmtTask(t)}`;
  }));

  server.registerTool("move_task", {
    title: "Move task",
    description: "Move a task into a project, or to the inbox with project: null.",
    inputSchema: { id: taskRefSchema, project: projectRefSchema },
  }, async (a) => run(async () => {
    const projectId = a.project === null ? null : await resolveProjectRef(env, a.project);
    const t = await updateTask(env, parseTaskRef(a.id), { project_id: projectId });
    return `Moved to ${projectId ? `project ${projectId}` : "inbox"}: ${fmtTask(t)}`;
  }));

  const statusTool = (name: string, title: string, status: "completed" | "active" | "deleted", desc: string) =>
    server.registerTool(name, { title, description: desc, inputSchema: { id: taskRefSchema } }, async (a) =>
      run(async () => `${title}: ${fmtTask(await setTaskStatus(env, parseTaskRef(a.id), status))}`));

  statusTool("complete_task", "Complete task", "completed", "Mark a task done. Lives in history forever after.");
  statusTool("reopen_task", "Reopen task", "active", "Reopen a completed/deleted task back to active.");
  statusTool("delete_task", "Delete task", "deleted", "Soft-delete a task — goes to history, restorable, number never reused.");
  statusTool("restore_task", "Restore task", "active", "Restore a deleted task from history.");

  server.registerTool("list_projects", {
    title: "List projects",
    description: "All projects with active task counts.",
    inputSchema: {},
  }, async () => run(async () => {
    const ps = await listProjects(env);
    return `${ps.length} project(s):\n` + (ps.map(fmtProject).join("\n") || "(none)");
  }));

  server.registerTool("create_project", {
    title: "Create project",
    description: "Create a project. Ref is P<n>, stable forever.",
    inputSchema: { name: z.string().min(1).describe("Project name"), description: z.string().optional() },
  }, async (a) => run(async () => `Created ${fmtProject(await createProject(env, { name: assertName(a.name), description: a.description }))}`));

  server.registerTool("update_project", {
    title: "Update project",
    description: "Rename or re-describe a project.",
    inputSchema: { id: z.union([z.string(), z.number()]).describe(`Project: 3 | "P3" | name`), name: z.string().min(1).optional(), description: z.string().optional() },
  }, async (a) => run(async () => {
    const id = await resolveProjectRef(env, a.id);
    if (a.name !== undefined) assertName(a.name);
    await updateProject(env, id, { name: a.name, description: a.description });
    return `Updated P${id}`;
  }));

  server.registerTool("delete_project", {
    title: "Delete project",
    description: "Delete a project. Its tasks are moved to the inbox, not deleted.",
    inputSchema: { id: z.union([z.string(), z.number()]).describe(`Project: 3 | "P3" | name`) },
  }, async (a) => run(async () => {
    const id = await resolveProjectRef(env, a.id);
    await deleteProject(env, id);
    return `Deleted P${id} — tasks moved to inbox`;
  }));

  server.registerTool("history", {
    title: "Task history",
    description: "Completed + soft-deleted tasks (everything not active), newest first. Filter with status.",
    inputSchema: { status: z.enum(["completed", "deleted", "all"]).optional(), limit: z.number().int().min(1).max(1000).optional() },
  }, async (a) => run(async () => {
    const tasks = await listTasks(env, { status: a.status && a.status !== "all" ? a.status : "all", limit: a.limit, order: "recent" });
    const hist = a.status && a.status !== "all" ? tasks : tasks.filter((t) => t.status !== "active");
    return `${hist.length} task(s) in history:\n` + (hist.map(fmtTask).join("\n") || "(empty)");
  }));
}

export function newMcpServer(env: Env): McpServer {
  const server = new McpServer(
    { name: "barrydo", version: "1.0.0" },
    { instructions: "Single-user todo: tasks with stable numbered refs (T12, or P3-T12 inside project 3), projects (P3), priorities high/medium/low/none, date-only due dates, soft delete, permanent history." }
  );
  registerTools(server, env);
  return server;
}

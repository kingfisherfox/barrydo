// barrydo — single Worker: static PWA (assets) + REST (/api) + MCP (/mcp), one bearer key for all.

import type { Env } from "./env";
import { ApiError } from "./db";
import { handleApi } from "./api";
import { newMcpServer } from "./mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

function jsonErr(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

async function authorized(req: Request, env: Env): Promise<boolean> {
  const key = env.API_KEY;
  if (!key) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(token)), crypto.subtle.digest("SHA-256", enc.encode(key))]);
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function handleMcp(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const res = await (async () => {
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS" } });
    if (!(await authorized(req, env))) return jsonErr(401, "unauthorized");
    // stateless streamable-http: fresh server+transport per request, no session
    const server = newMcpServer(env);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req);
    } finally {
      await server.close();
    }
  })();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === "/mcp" || pathname === "/mcp/") return handleMcp(req, env);
      if (pathname.startsWith("/api/")) {
        if (!(await authorized(req, env))) {
          return env.API_KEY ? jsonErr(401, "unauthorized") : jsonErr(500, "API_KEY secret not configured — run: wrangler secret put API_KEY");
        }
        return await handleApi(req, env);
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof ApiError) return jsonErr(e.status, e.message);
      console.error("UNHANDLED", e);
      return jsonErr(500, e instanceof Error ? e.message : "internal error");
    }
  },
};

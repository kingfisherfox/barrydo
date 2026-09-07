// barrydo — Cloudflare Worker env bindings
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  API_KEY?: string; // wrangler secret; single-user bearer token for /api/* and /mcp
}

# Constraints — non-negotiable

- **Single user.** No registration, no users table. API key IS the identity (Bearer everywhere).
- **Stable numbering.** Task/project ids are AUTOINCREMENT, never reused; deletion is soft (`status='deleted'`). No hard task deletes exist anywhere.
- **History is forever.** Completed + deleted tasks stay queryable indefinitely.
- **Date-only due dates** (YYYY-MM-DD). No times, no timezones stored.
- **Priorities:** high / medium / low / none. Nothing else validates.
- **PWA online-only.** Service worker exists for installability only — never add offline caching of data.
- **Lightweight frontend.** Vanilla JS/CSS, Atlassian-flavoured tokens, no framework, no external font/CDN dependencies.
- **Cloudflare-only infra:** Worker (compute + MCP), D1 (data), Workers Assets (PWA), workers.dev domain.
- **One key, two planes:** same `API_KEY` secret for `/api/*` and `/mcp`.
- **No email/SMS integrations** — nothing here may ever send messages.

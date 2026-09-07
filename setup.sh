#!/usr/bin/env bash
# barrydo one-command bootstrap for a fresh clone:
# login check → worker name → D1 create + wire id → migrations → API key secret → deploy → print wiring.
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v node >/dev/null || die "Node.js 18+ required — https://nodejs.org"
command -v openssl >/dev/null || die "openssl required"
[ -d node_modules ] || { step "Installing dependencies…"; npm install; }

# seed local config from the tracked template (wrangler.jsonc is gitignored)
[ -f wrangler.jsonc ] || cp wrangler.template.jsonc wrangler.jsonc

step "Checking Cloudflare authentication…"
if ! npx wrangler whoami >/tmp/barrydo-whoami 2>&1; then
  bold "A browser window will open — log in to your Cloudflare account (free tier is fine)."
  npx wrangler login || die "Cloudflare login failed"
fi
echo "Logged in: $(grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+' /tmp/barrydo-whoami | head -1 || echo 'ok')"

# ── worker name (workers.dev names are globally unique) ─────────────────────
DEFAULT_NAME="barrydo-$RANDOM"
read -r -p "$(printf '\033[1mWorker name\033[0m (your app will be <name>.<subdomain>.workers.dev) [%s]: ' "$DEFAULT_NAME")" NAME
NAME="${NAME:-$DEFAULT_NAME}"
NAME=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')
[ -n "$NAME" ] || die "invalid worker name"
step "Using worker name: $NAME"
sed -i.bak -e "s/\"name\": \"[^\"]*\"/\"name\": \"$NAME\"/" wrangler.jsonc && rm -f wrangler.jsonc.bak

# ── D1 database ──────────────────────────────────────────────────────────────
CURRENT_ID=$(grep -oE '"database_id": *"[^"]*"' wrangler.jsonc | grep -oE '[0-9a-f-]{36}' || true)
if [ -n "$CURRENT_ID" ] && [ "$CURRENT_ID" != "REPLACE_WITH_D1_ID" ]; then
  echo "Existing D1 database id found ($CURRENT_ID) — reusing it. (Delete this line from wrangler.jsonc to force a fresh DB.)"
else
  step "Creating D1 database…"
  npx wrangler d1 create "$NAME" > /tmp/barrydo-d1.json 2>/tmp/barrydo-d1.err \
    || { cat /tmp/barrydo-d1.err; cat /tmp/barrydo-d1.json; die "d1 create failed"; }
  DB_ID=$(grep -oE '"uuid": *"[0-9a-f-]{36}"' /tmp/barrydo-d1.json | grep -oE '[0-9a-f-]{36}' | head -1)
  [ -n "$DB_ID" ] || die "could not parse database_id from wrangler output — check /tmp/barrydo-d1.json"
  sed -i.bak -e "s/\"database_id\": *\"[^\"]*\"/\"database_id\": \"$DB_ID\"/" wrangler.jsonc && rm -f wrangler.jsonc.bak
  echo "Database created: $DB_ID"
fi

# keep database_name aligned with the worker name for a fresh clone
sed -i.bak -e "s/\"database_name\": *\"[^\"]*\"/\"database_name\": \"$NAME\"/" wrangler.jsonc && rm -f wrangler.jsonc.bak

step "Applying database migrations…"
npx wrangler d1 migrations apply "$NAME" --remote || die "migrations failed"

# ── API key ──────────────────────────────────────────────────────────────────
step "Generating API key and storing it as a Worker secret…"
API_KEY=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
[ -n "$API_KEY" ] || die "key generation failed"
printf '%s' "$API_KEY" | npx wrangler secret put API_KEY || die "secret put failed"

# ── deploy ───────────────────────────────────────────────────────────────────
step "Deploying…"
DEPLOY_OUT=$(npx wrangler deploy 2>&1) || { echo "$DEPLOY_OUT"; die "deploy failed"; }
URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || URL="https://$NAME.<your-subdomain>.workers.dev (check 'npx wrangler deploy' output)"

clear 2>/dev/null || true
bold "══════════════ barrydo is live ══════════════"
echo ""
echo "  App (open on phone + Add to Home Screen):"
echo "    $URL"
echo ""
echo "  Your API key (the only credential — save it now):"
echo "    $API_KEY"
echo ""
echo "  MCP wiring for agents — also visible with copy buttons at Settings → MCP in the app:"
echo "    URL:     $URL/mcp"
echo "    Header:  Authorization: Bearer $API_KEY"
echo ""
echo '  Client JSON:'
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"barrydo\": {"
echo "        \"url\": \"$URL/mcp\","
echo "        \"headers\": { \"Authorization\": \"Bearer $API_KEY\" }"
echo "      }"
echo "    }"
echo "  }"
echo ""
bold "══════════════════════════════════════════════"
echo "Key rotation:  npx wrangler secret put API_KEY"
echo "Re-deploy:     npx wrangler deploy"
echo "Local dev:     echo \"API_KEY=dev\" > .dev.vars && npm run dev"

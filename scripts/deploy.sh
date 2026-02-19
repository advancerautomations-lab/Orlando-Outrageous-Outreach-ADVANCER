#!/bin/bash
set -euo pipefail

# ============================================================
# Lead Management System — New Client Deployment Script
#
# Prerequisites:
#   1. Node.js installed (for npx)
#   2. Supabase CLI: npm install -g supabase
#   3. A fresh Supabase project created at https://supabase.com
#   4. .env.local filled in (copy from .env.example)
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
# ============================================================

echo ""
echo "======================================"
echo "  Lead Management System — Deployer"
echo "======================================"
echo ""

# --- Check prerequisites ---
command -v npx >/dev/null 2>&1 || { echo "ERROR: npx not found. Install Node.js first."; exit 1; }
command -v supabase >/dev/null 2>&1 || { echo "ERROR: supabase CLI not found. Run: npm install -g supabase"; exit 1; }

# --- Prompt for values if not set ---
if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
    echo "Enter your Supabase project ref (from dashboard URL):"
    echo "  Example: xjyjbspwtqkykmwzqjew"
    read -r SUPABASE_PROJECT_REF
fi

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
    echo "Enter your Supabase database password:"
    read -rs SUPABASE_DB_PASSWORD
    echo ""
fi

# --- Step 1: Link Supabase project ---
echo "[1/4] Linking to Supabase project: ${SUPABASE_PROJECT_REF}..."
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
echo "  Linked successfully."
echo ""

# --- Step 2: Run database schema ---
echo "[2/4] Creating database schema..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
supabase db execute --file "$SCRIPT_DIR/schema.sql"
echo "  Schema created: 12 tables, indexes, triggers, RLS, realtime."
echo ""

# --- Step 3: Set edge function secrets ---
echo "[3/4] Setting edge function secrets..."
echo "  You'll be prompted for each secret. Press Enter to skip optional ones."
echo ""

prompt_secret() {
    local name=$1
    local desc=$2
    local required=${3:-false}
    local current_val="${!name:-}"

    if [ -n "$current_val" ]; then
        echo "  $name: using environment value"
        return
    fi

    if [ "$required" = "true" ]; then
        echo "  $name ($desc) [REQUIRED]:"
    else
        echo "  $name ($desc) [optional, Enter to skip]:"
    fi
    read -r val

    if [ -n "$val" ]; then
        eval "$name='$val'"
    elif [ "$required" = "true" ]; then
        echo "  WARNING: $name is required but was skipped."
    fi
}

prompt_secret GOOGLE_CLIENT_ID "Google OAuth Client ID" true
prompt_secret GOOGLE_CLIENT_SECRET "Google OAuth Client Secret" true
prompt_secret SUPABASE_SERVICE_ROLE_KEY "Supabase service_role key" true
prompt_secret GCP_PROJECT_ID "Google Cloud project ID" true
prompt_secret GEMINI_API_KEY "Gemini API key for email classification" false
prompt_secret TIMEZONE "IANA timezone, e.g. America/New_York" false
prompt_secret COMPANY_NAME "Company name for email templates" false
prompt_secret BLOCKED_EMAIL_DOMAINS "Comma-separated blocked domains" false
prompt_secret N8N_PROSPECT_REPLY_WEBHOOK_URL "n8n prospect reply webhook" false
prompt_secret N8N_FORM_SUBMISSION_WEBHOOK_URL "n8n form submission webhook" false
prompt_secret FORM_WEBHOOK_SECRET "Form webhook secret" false

# Build the secrets command
SECRETS_ARGS=""
for var in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SUPABASE_SERVICE_ROLE_KEY GCP_PROJECT_ID GEMINI_API_KEY TIMEZONE COMPANY_NAME BLOCKED_EMAIL_DOMAINS N8N_PROSPECT_REPLY_WEBHOOK_URL N8N_FORM_SUBMISSION_WEBHOOK_URL FORM_WEBHOOK_SECRET; do
    val="${!var:-}"
    if [ -n "$val" ]; then
        SECRETS_ARGS="$SECRETS_ARGS $var=$val"
    fi
done

if [ -n "$SECRETS_ARGS" ]; then
    supabase secrets set $SECRETS_ARGS
    echo "  Secrets set successfully."
else
    echo "  No secrets to set."
fi
echo ""

# --- Step 4: Deploy edge functions ---
echo "[4/4] Deploying edge functions..."

FUNCTIONS=(
    gmail-auth
    gmail-send
    gmail-watch
    gmail-webhook
    calendar-create
    calendar-update
    calendar-delete
    calendar-events
    form-webhook
    create-user
    update-permissions
)

for fn in "${FUNCTIONS[@]}"; do
    echo "  Deploying $fn..."
    supabase functions deploy "$fn" --no-verify-jwt 2>&1 | tail -1
done

echo ""
echo "======================================"
echo "  Deployment Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo ""
echo "  1. CREATE ADMIN USER"
echo "     Sign up in the app, then promote to admin:"
echo "     UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
echo ""
echo "  2. FRONTEND DEPLOY"
echo "     npm install && npm run build"
echo "     Deploy the dist/ folder to Vercel, Netlify, or your hosting platform."
echo ""
echo "  3. CONNECT GMAIL"
echo "     Go to Settings > Connected Accounts > Connect Gmail & Calendar"
echo ""
echo "  4. ACTIVATE GMAIL WATCH"
echo "     The app automatically sets up Gmail push notifications when you connect."
echo "     Verify in Settings that watch status shows as active."
echo ""
echo "  5. IMPORT N8N WORKFLOWS (optional)"
echo "     Import JSON files from n8n-workflows/ into your n8n instance."
echo "     Update Supabase credentials in each workflow."
echo ""

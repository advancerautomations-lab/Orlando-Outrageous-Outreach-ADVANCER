# Lead Management System — Deployment Guide

Deploy this CRM to a new client in under 30 minutes.

```
Clone repo → Fill .env → Run deploy.sh → Deploy frontend → Go live
```

---

## Prerequisites

- **Node.js** 18+ and npm
- **Supabase CLI**: `npm install -g supabase`
- **Google Cloud** account (for Gmail & Calendar integration)
- **Hosting platform** for the frontend (Vercel, Netlify, or any static host)

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note these values from **Settings > API**:
   - **Project URL** (e.g., `https://abcdefg.supabase.co`)
   - **Anon public key** (starts with `eyJ...`)
   - **Service role key** (starts with `eyJ...`, keep secret)
3. Note the **Project Ref** from the URL: `https://supabase.com/dashboard/project/PROJECT_REF`
4. Remember your **database password** (set during project creation)

---

## Step 2: Google Cloud Setup

### 2a. Create Project & Enable APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable these APIs (search in "APIs & Services > Library"):
   - **Gmail API**
   - **Google Calendar API**
   - **Cloud Pub/Sub API**
4. Note your **GCP Project ID** from the project settings

### 2b. Create OAuth Credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized JavaScript origins:
   - `http://localhost:3000` (development)
   - `https://your-production-domain.com` (production)
5. Authorized redirect URIs: same as above
6. Save and note the **Client ID** and **Client Secret**

### 2c. Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen**
2. User Type: **External** (or Internal if Google Workspace)
3. Fill in app name, support email, authorized domains
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Add test users (during development, before verification)

### 2d. Set Up Gmail Push Notifications (Pub/Sub)

1. Go to **Pub/Sub** in Google Cloud Console
2. Create a topic named `gmail-notifications`
3. Create a **Push Subscription** for the topic:
   - Endpoint URL: `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/gmail-webhook`
4. Add permissions to the topic:
   - Principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher**

---

## Step 3: Configure Environment

```bash
# Copy the template
cp .env.example .env.local

# Edit with your values
nano .env.local
```

Fill in:
| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your anon key |
| `VITE_GOOGLE_CLIENT_ID` | Your OAuth Client ID |
| `VITE_COMPANY_NAME` | Client's company name |

---

## Step 4: Run Deployment Script

```bash
# Install dependencies
npm install

# Run the deployment script (creates DB, sets secrets, deploys edge functions)
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

The script will:
1. Link to your Supabase project
2. Create all 12 database tables, indexes, triggers, and RLS policies
3. Set edge function secrets (prompts for each value)
4. Deploy all 11 edge functions

---

## Step 5: Deploy Frontend

### Option A: Vercel (Recommended)

```bash
npm install -g vercel
npm run build
vercel deploy --prod
```

Set environment variables in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_COMPANY_NAME`
- `VITE_DEEP_RESEARCH_WEBHOOK_URL` (if using)

### Option B: Netlify

```bash
npm run build
# Deploy dist/ folder via Netlify dashboard or CLI
```

### Option C: Any Static Host

```bash
npm run build
# Upload contents of dist/ to your host
```

---

## Step 6: Post-Deployment Setup

### 6a. Create Admin User

1. Sign up in the app using your email
2. Run this SQL in Supabase SQL Editor:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

### 6b. Connect Gmail

1. Log in to the app
2. Go to **Settings > Connected Accounts**
3. Click **Connect Gmail & Calendar**
4. Authorize with Google

### 6c. Verify Gmail Watch

After connecting Gmail, the app automatically sets up push notifications.
Check in Settings that watch status shows as **Active**.

### 6d. Import n8n Workflows (Optional)

1. Import JSON files from `n8n-workflows/` into your n8n instance
2. Create a Supabase credential in n8n with the new project's URL and service role key
3. Update credential references in imported workflows
4. Activate the workflows

---

## Environment Variables Reference

### Frontend (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID |
| `VITE_COMPANY_NAME` | Yes | Company name for branding |
| `VITE_COMPANY_LOGO_URL` | No | Company logo URL |
| `VITE_DEEP_RESEARCH_WEBHOOK_URL` | No | n8n deep research webhook |

### Supabase Secrets (Edge Functions)

| Secret | Required | Description |
|--------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Same as frontend |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `GCP_PROJECT_ID` | Yes | Google Cloud project ID |
| `GEMINI_API_KEY` | No | AI email classification |
| `TIMEZONE` | No | IANA timezone (default: UTC) |
| `COMPANY_NAME` | No | Email template branding |
| `BLOCKED_EMAIL_DOMAINS` | No | Auto-dismiss email domains |
| `N8N_PROSPECT_REPLY_WEBHOOK_URL` | No | Prospect reply tracking |
| `N8N_FORM_SUBMISSION_WEBHOOK_URL` | No | Form submission handler |
| `FORM_WEBHOOK_SECRET` | No | Form webhook validation |

---

## Database Schema

The deployment script runs `scripts/schema.sql` which creates:

| Table | Purpose |
|-------|---------|
| `users` | Team members (extends auth.users) |
| `prospects` | Cold prospect pipeline |
| `leads` | Warm lead pipeline |
| `messages` | Email conversations |
| `meetings` | Calendar events |
| `activities` | Activity log |
| `gmail_tokens` | OAuth tokens per user |
| `email_campaigns` | Campaign metadata |
| `email_to_campaign` | Emails within campaigns |
| `email_campaign_recipients` | Recipient tracking |
| `email_campaign_statistics` | Campaign analytics |
| `pending_emails` | Inbound email queue |

Plus: indexes, triggers (prospect-to-lead conversion), realtime subscriptions, and RLS policies.

---

## Edge Functions

All 11 functions deploy with `--no-verify-jwt`:

| Function | Purpose |
|----------|---------|
| `gmail-auth` | OAuth token exchange |
| `gmail-send` | Send emails via Gmail API |
| `gmail-watch` | Setup Gmail push notifications |
| `gmail-webhook` | Receive Gmail push notifications |
| `calendar-create` | Create calendar events + invites |
| `calendar-update` | Update calendar events |
| `calendar-delete` | Delete calendar events |
| `calendar-events` | List calendar events |
| `form-webhook` | Receive form submissions |
| `create-user` | Create user profiles |
| `update-permissions` | Manage user permissions |

---

## Troubleshooting

### Edge functions return 401
Make sure functions are deployed with `--no-verify-jwt`.

### Gmail watch not activating
- Verify Pub/Sub topic exists with correct name (`gmail-notifications`)
- Verify `gmail-api-push@system.gserviceaccount.com` has Publisher role
- Verify webhook endpoint URL is correct in the push subscription

### OAuth popup blocked
Add your domain to authorized JavaScript origins AND redirect URIs in Google Cloud Console.

### Calendar events show wrong timezone
Set the `TIMEZONE` secret: `supabase secrets set TIMEZONE=America/New_York`

### Email template shows wrong company name
Set the `COMPANY_NAME` secret: `supabase secrets set COMPANY_NAME=YourCompany`

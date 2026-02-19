-- ============================================================
-- Superior Lead Management System — Full Database Schema
-- Run this on a FRESH Supabase project to create all tables.
-- ============================================================

-- 1. USERS (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'sales_rep' CHECK (role IN ('admin', 'sales_rep')),
    can_view_analytics BOOLEAN DEFAULT false,
    can_view_prospects BOOLEAN DEFAULT false,
    can_delete_leads BOOLEAN DEFAULT false,
    setup_complete BOOLEAN DEFAULT true,
    linkedin_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PROSPECTS (cold pipeline)
CREATE TABLE IF NOT EXISTS public.prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT,
    country TEXT,
    location TEXT,
    industry TEXT,
    company_name TEXT,
    job_title TEXT,
    seniority TEXT,
    website_url TEXT,
    linkedin_url TEXT,
    analysed BOOLEAN DEFAULT false,
    research_report TEXT,
    pain_points TEXT,
    email_sent BOOLEAN DEFAULT false,
    opened BOOLEAN DEFAULT false,
    added_to_mailchimp BOOLEAN DEFAULT false,
    received_customer_research_report BOOLEAN DEFAULT false,
    date_opened TIMESTAMPTZ,
    date_received_report TIMESTAMPTZ,
    date_sent TIMESTAMPTZ,
    mailchimp_subscriber_hash TEXT,
    current_campaign_step INT DEFAULT 0,
    last_email_opened_at TIMESTAMPTZ,
    last_email_clicked_at TIMESTAMPTZ,
    mailchimp_status TEXT DEFAULT 'subscribed',
    converted_to_lead_id UUID,  -- FK added after leads table exists
    current_email_stage TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. LEADS (warm pipeline)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    company TEXT DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT,
    estimated_value NUMERIC DEFAULT 0,
    lead_status TEXT DEFAULT 'new',
    lead_source TEXT DEFAULT '',
    avatar_url TEXT,
    notes TEXT,
    research_report TEXT,
    pain_points TEXT,
    assigned_to UUID REFERENCES public.users(id),
    prospect_id UUID REFERENCES public.prospects(id),
    linkedin_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bidirectional FK: prospects -> leads
ALTER TABLE public.prospects
    ADD CONSTRAINT fk_prospects_converted_lead
    FOREIGN KEY (converted_to_lead_id) REFERENCES public.leads(id);

-- 4. MESSAGES (email conversations)
-- CRITICAL: DB uses "body" and "sent_at", NOT "content"/"timestamp"
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    direction TEXT NOT NULL DEFAULT 'outbound',
    subject TEXT,
    body TEXT DEFAULT '',
    sent_at TIMESTAMPTZ DEFAULT now(),
    is_read BOOLEAN DEFAULT true,
    gmail_thread_id TEXT,
    sender_name TEXT,
    sender_email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. MEETINGS (calendar events)
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    lead_id UUID REFERENCES public.leads(id),
    user_id UUID REFERENCES public.users(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    google_event_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ACTIVITIES (activity log)
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. GMAIL_TOKENS (OAuth tokens per user)
CREATE TABLE IF NOT EXISTS public.gmail_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ NOT NULL,
    gmail_email TEXT,
    watch_expiration TIMESTAMPTZ,
    watch_history_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. EMAIL_CAMPAIGNS
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES public.users(id),
    status TEXT DEFAULT 'draft',
    email_subject TEXT,
    email_body TEXT,
    from_name TEXT,
    from_email TEXT,
    total_recipients INT DEFAULT 0,
    send_schedule JSONB,
    mailchimp_automation_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- 9. EMAIL_TO_CAMPAIGN (individual emails in a campaign)
CREATE TABLE IF NOT EXISTS public.email_to_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_campaign UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    name TEXT,
    "order" INT,
    mailchimp_id TEXT,
    subject TEXT,
    link_to_editor TEXT,
    picture TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. EMAIL_CAMPAIGN_RECIPIENTS
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id),
    prospect_id UUID REFERENCES public.prospects(id),
    email_to_campaign_id UUID REFERENCES public.email_to_campaign(id),
    mailchimp_email_id TEXT,
    current_email_step INT DEFAULT 0,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    first_opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ,
    open_count INT DEFAULT 0,
    click_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. EMAIL_CAMPAIGN_STATISTICS
CREATE TABLE IF NOT EXISTS public.email_campaign_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    total_sent INT DEFAULT 0,
    total_delivered INT DEFAULT 0,
    total_opened INT DEFAULT 0,
    total_clicked INT DEFAULT 0,
    total_replied INT DEFAULT 0,
    total_bounced INT DEFAULT 0,
    total_unsubscribed INT DEFAULT 0,
    unique_opens INT DEFAULT 0,
    unique_clicks INT DEFAULT 0,
    open_rate NUMERIC DEFAULT 0,
    click_rate NUMERIC DEFAULT 0,
    reply_rate NUMERIC DEFAULT 0,
    bounce_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. PENDING_EMAILS (inbound email classification queue)
CREATE TABLE IF NOT EXISTS public.pending_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    from_email TEXT NOT NULL,
    from_name TEXT,
    subject TEXT NOT NULL,
    content TEXT,
    gmail_message_id TEXT,
    received_at TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'likely_lead', 'needs_review', 'auto_dismissed')),
    ai_classification TEXT,
    ai_confidence NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_prospect_email
    ON public.email_campaign_recipients(prospect_id, email_to_campaign_id)
    WHERE prospect_id IS NOT NULL AND email_to_campaign_id IS NOT NULL;

-- ============================================================
-- TRIGGER: Prospect-to-Lead conversion backfill
-- When a lead is created/updated with a prospect_id, this:
--   1. Links the prospect back to the lead
--   2. Backfills lead_id on campaign recipients for that prospect
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_prospect_to_lead_conversion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.prospect_id IS NOT NULL THEN
        -- Link prospect back to this lead
        UPDATE public.prospects
        SET converted_to_lead_id = NEW.id
        WHERE id = NEW.prospect_id
          AND converted_to_lead_id IS NULL;

        -- Backfill lead_id on campaign recipients
        UPDATE public.email_campaign_recipients
        SET lead_id = NEW.id
        WHERE prospect_id = NEW.prospect_id
          AND lead_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prospect_to_lead ON public.leads;
CREATE TRIGGER trg_prospect_to_lead
    AFTER INSERT OR UPDATE OF prospect_id ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_prospect_to_lead_conversion();

-- ============================================================
-- REALTIME — Enable for tables that need live updates
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_emails;

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables. Basic policy: authenticated users
-- have full access. Tighten per client as needed.
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_to_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_emails ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access (single-tenant default)
CREATE POLICY "auth_full_access" ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.gmail_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.prospects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.email_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.email_to_campaign FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.email_campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.email_campaign_statistics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON public.pending_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role: full access (needed for edge functions)
CREATE POLICY "service_full_access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.meetings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.activities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.gmail_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.prospects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.email_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.email_to_campaign FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.email_campaign_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.email_campaign_statistics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON public.pending_emails FOR ALL TO service_role USING (true) WITH CHECK (true);

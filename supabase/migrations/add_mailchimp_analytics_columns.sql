-- Migration: Add MailChimp Analytics columns
-- Run this in the Supabase SQL Editor

-- 1a. Add prospect_id to leads table (link converted prospects back)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id);

-- 1b. Add columns to email_campaign_recipients
ALTER TABLE email_campaign_recipients
  ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id),
  ADD COLUMN IF NOT EXISTS email_to_campaign_id UUID REFERENCES email_to_campaign(id),
  ADD COLUMN IF NOT EXISTS mailchimp_email_id TEXT,
  ADD COLUMN IF NOT EXISTS current_email_step INT DEFAULT 0;

-- 1c. Add mailchimp_automation_id to email_campaigns
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS mailchimp_automation_id TEXT UNIQUE;

-- 1d. Add tracking columns to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS mailchimp_subscriber_hash TEXT,
  ADD COLUMN IF NOT EXISTS current_campaign_step INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_email_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_email_clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mailchimp_status TEXT DEFAULT 'subscribed',
  ADD COLUMN IF NOT EXISTS converted_to_lead_id UUID REFERENCES leads(id);

-- 1e. Create unique constraint for upsert on email_campaign_recipients
-- This allows n8n to upsert on (prospect_id, email_to_campaign_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecr_prospect_email
  ON email_campaign_recipients(prospect_id, email_to_campaign_id)
  WHERE prospect_id IS NOT NULL AND email_to_campaign_id IS NOT NULL;

-- 1f. Trigger: When a lead is created with prospect_id, backfill the link
CREATE OR REPLACE FUNCTION handle_prospect_to_lead_conversion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when prospect_id is set on a lead
  IF NEW.prospect_id IS NOT NULL THEN
    -- Set bidirectional link on prospect
    UPDATE prospects
    SET converted_to_lead_id = NEW.id
    WHERE id = NEW.prospect_id
      AND converted_to_lead_id IS NULL;

    -- Backfill lead_id on all campaign recipient rows for this prospect
    UPDATE email_campaign_recipients
    SET lead_id = NEW.id
    WHERE prospect_id = NEW.prospect_id
      AND lead_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prospect_to_lead ON leads;
CREATE TRIGGER trg_prospect_to_lead
  AFTER INSERT OR UPDATE OF prospect_id ON leads
  FOR EACH ROW
  EXECUTE FUNCTION handle_prospect_to_lead_conversion();

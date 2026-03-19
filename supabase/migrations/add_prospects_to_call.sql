-- Create prospects_to_call table
CREATE TABLE IF NOT EXISTS public.prospects_to_call (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES public.prospects(id),
    campaign_id UUID REFERENCES public.email_campaigns(id),
    prospect_email TEXT NOT NULL,
    prospect_name TEXT NOT NULL DEFAULT '',
    prospect_company TEXT DEFAULT '',
    prospect_phone TEXT,
    total_opens INT DEFAULT 0,
    total_clicks INT DEFAULT 0,
    emails_opened_count INT DEFAULT 0,
    emails_clicked_count INT DEFAULT 0,
    last_opened_at TIMESTAMPTZ,
    last_clicked_at TIMESTAMPTZ,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'called', 'promising', 'converted', 'dismissed')),
    notes TEXT,
    called_at TIMESTAMPTZ,
    called_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(prospect_id, campaign_id)
);

-- Enable RLS
ALTER TABLE public.prospects_to_call ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read/write
CREATE POLICY "Authenticated users can manage prospects_to_call"
ON public.prospects_to_call
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy: service_role has full access
CREATE POLICY "Service role has full access to prospects_to_call"
ON public.prospects_to_call
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant table-level permissions (required in addition to RLS policies)
GRANT ALL ON public.prospects_to_call TO authenticated;
GRANT ALL ON public.prospects_to_call TO service_role;
GRANT ALL ON public.prospects_to_call TO anon;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.prospects_to_call;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_prospects_to_call_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prospects_to_call_updated_at
    BEFORE UPDATE ON public.prospects_to_call
    FOR EACH ROW
    EXECUTE FUNCTION public.update_prospects_to_call_updated_at();

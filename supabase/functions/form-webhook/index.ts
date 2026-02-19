import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

// Format form fields into readable notes
function formatFormNotes(body: any): string {
    const lines: string[] = []

    if (body.form_name) {
        lines.push(`Form: ${body.form_name}`)
    }

    if (body.message) {
        lines.push(`Message: ${body.message}`)
    }

    // Add any custom fields
    if (body.fields && typeof body.fields === 'object') {
        if (lines.length > 0) lines.push('---')
        for (const [key, value] of Object.entries(body.fields)) {
            // Convert snake_case/camelCase to Title Case
            const label = key
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/^\w/, c => c.toUpperCase())
                .trim()
            lines.push(`${label}: ${value}`)
        }
    }

    return lines.join('\n')
}

serve(async (req) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Validate webhook secret (if configured)
        const webhookSecret = Deno.env.get('FORM_WEBHOOK_SECRET')
        if (webhookSecret) {
            const url = new URL(req.url)
            const querySecret = url.searchParams.get('secret')
            const headerSecret = req.headers.get('x-webhook-secret')

            if (querySecret !== webhookSecret && headerSecret !== webhookSecret) {
                return new Response(
                    JSON.stringify({ error: 'Unauthorized' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        const body = await req.json()

        // Email is required
        const email = (body.email || '').trim().toLowerCase()
        if (!email) {
            return new Response(
                JSON.stringify({ error: 'Email is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('Form submission received for:', email)

        // Initialize Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Check if lead already exists with this email
        const { data: existingLeads } = await supabase
            .from('leads')
            .select('id, notes')
            .ilike('email', email)
            .limit(1)

        if (existingLeads && existingLeads.length > 0) {
            const existingLead = existingLeads[0]
            const formNotes = formatFormNotes(body)

            // Append form data to existing lead's notes
            const updatedNotes = existingLead.notes
                ? `${existingLead.notes}\n\n--- New Form Submission ---\n${formNotes}`
                : formNotes

            await supabase
                .from('leads')
                .update({ notes: updatedNotes })
                .eq('id', existingLead.id)

            console.log('Appended form data to existing lead:', existingLead.id)

            return new Response(
                JSON.stringify({ success: true, lead_id: existingLead.id, action: 'updated' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Try to match a prospect by email
        const { data: prospects } = await supabase
            .from('prospects')
            .select('*')
            .ilike('email', email)
            .limit(1)

        const prospect = prospects?.[0] || null

        // Build lead data — use form fields, fallback to prospect data
        const firstName = body.first_name || prospect?.first_name || ''
        const lastName = body.last_name || prospect?.last_name || ''
        const company = body.company || prospect?.company_name || ''
        const phone = body.phone || prospect?.phone || null
        const formNotes = formatFormNotes(body)

        // Create the lead
        const { data: newLead, error: leadError } = await supabase
            .from('leads')
            .insert({
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone: phone,
                company: company,
                estimated_value: 0,
                lead_status: 'new',
                lead_source: 'form_submission',
                notes: formNotes || null,
                research_report: prospect?.research_report || null,
                pain_points: prospect?.pain_points || null,
                prospect_id: prospect?.id || null,
                linkedin_url: prospect?.linkedin_url || null,
            })
            .select()
            .single()

        if (leadError) {
            console.error('Error creating lead from form:', leadError)
            return new Response(
                JSON.stringify({ error: 'Failed to create lead' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('Created lead from form submission:', newLead.id)

        // Update prospect with converted_to_lead_id (if prospect was matched)
        if (prospect) {
            const { error: prospectUpdateError } = await supabase
                .from('prospects')
                .update({ converted_to_lead_id: newLead.id })
                .eq('id', prospect.id)

            if (prospectUpdateError) {
                console.error('Error updating prospect converted_to_lead_id:', prospectUpdateError)
            } else {
                console.log('Updated prospect', prospect.id, 'with converted_to_lead_id:', newLead.id)
            }
        }

        // Trigger n8n webhook (fire-and-forget)
        const n8nWebhookUrl = Deno.env.get('N8N_FORM_SUBMISSION_WEBHOOK_URL') || Deno.env.get('N8N_PROSPECT_REPLY_WEBHOOK_URL')
        if (n8nWebhookUrl) {
            try {
                await fetch(n8nWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'form_submission',
                        prospect_email: email,
                        prospect: prospect ? {
                            id: prospect.id,
                            email: prospect.email,
                            first_name: prospect.first_name,
                            last_name: prospect.last_name,
                            company_name: prospect.company_name,
                        } : null,
                        lead: {
                            id: newLead.id,
                            email: newLead.email,
                        },
                        form_data: {
                            form_name: body.form_name || null,
                            message: body.message || null,
                            fields: body.fields || {},
                        },
                        timestamp: new Date().toISOString(),
                    }),
                })
                console.log('n8n webhook triggered for form submission:', email)
            } catch (webhookErr) {
                console.error('n8n webhook failed (non-fatal):', webhookErr)
            }
        }

        return new Response(
            JSON.stringify({ success: true, lead_id: newLead.id, action: 'created' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Form webhook error:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

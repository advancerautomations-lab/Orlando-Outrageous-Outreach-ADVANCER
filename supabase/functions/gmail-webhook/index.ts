import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Refresh expired access token
async function refreshAccessToken(supabase: any, tokenData: any): Promise<string> {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId!,
            client_secret: clientSecret!,
            refresh_token: tokenData.refresh_token,
            grant_type: 'refresh_token',
        }),
    })

    const tokens = await response.json()
    if (tokens.error) throw new Error('Token refresh failed: ' + tokens.error_description)

    await supabase
        .from('gmail_tokens')
        .update({
            access_token: tokens.access_token,
            token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('user_id', tokenData.user_id)

    return tokens.access_token
}

// Fetch new messages using Gmail History API
async function fetchNewMessages(accessToken: string, startHistoryId: string): Promise<any[]> {
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`

    const historyResponse = await fetch(historyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    })

    const historyData = await historyResponse.json()

    if (historyData.error) {
        console.error('History API error:', historyData.error)
        return []
    }

    if (!historyData.history) return []

    // Extract message IDs from messagesAdded events (INBOX only)
    const messageIds: string[] = []
    for (const record of historyData.history) {
        if (record.messagesAdded) {
            for (const added of record.messagesAdded) {
                if (added.message.labelIds?.includes('INBOX')) {
                    messageIds.push(added.message.id)
                }
            }
        }
    }

    // Fetch full message details for each
    const messages = []
    for (const msgId of messageIds) {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`
        const msgResponse = await fetch(msgUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        })
        const msgData = await msgResponse.json()
        if (!msgData.error) {
            messages.push(msgData)
        }
    }

    return messages
}

// Extract email body from Gmail message
function extractEmailBody(gmailMessage: any): string {
    let bodyContent = ''

    if (gmailMessage.payload?.body?.data) {
        bodyContent = atob(gmailMessage.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    } else if (gmailMessage.payload?.parts) {
        // Multipart message - find text/plain first, then text/html
        const textPart = gmailMessage.payload.parts.find((p: any) => p.mimeType === 'text/plain')
        const htmlPart = gmailMessage.payload.parts.find((p: any) => p.mimeType === 'text/html')

        const part = textPart || htmlPart
        if (part?.body?.data) {
            bodyContent = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
        }
    }

    // Convert block-level HTML tags to newlines to preserve paragraph structure
    bodyContent = bodyContent
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '')          // Strip remaining inline tags
        .replace(/[ \t]+/g, ' ')          // Collapse horizontal whitespace only (preserve \n)
        .replace(/\n /g, '\n')            // Trim leading spaces after newlines
        .replace(/\n{3,}/g, '\n\n')       // Collapse 3+ newlines to double
        .trim()

    return bodyContent
}

// Quick heuristic check — returns true if email is almost certainly not a lead
function isObviouslyNotALead(senderEmail: string, headers: any[]): boolean {
    const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const email = senderEmail.toLowerCase()

    // No-reply / system addresses
    const noReplyPatterns = [
        /^no-?reply@/i,
        /^noreply@/i,
        /^do-?not-?reply@/i,
        /^mailer-daemon@/i,
        /^postmaster@/i,
        /^bounce[s]?@/i,
        /^notification[s]?@/i,
        /^alert[s]?@/i,
    ]
    if (noReplyPatterns.some(p => p.test(email))) return true

    // Has List-Unsubscribe header (newsletters/marketing)
    if (getHeader('List-Unsubscribe')) return true

    // Has Precedence: bulk or list (mailing lists)
    const precedence = getHeader('Precedence').toLowerCase()
    if (precedence === 'bulk' || precedence === 'list') return true

    // Blocked domains from env var (configurable per deployment)
    const blockedDomains = (Deno.env.get('BLOCKED_EMAIL_DOMAINS') || '')
        .split(',')
        .map((d: string) => d.trim().toLowerCase())
        .filter(Boolean)
    const senderDomain = email.split('@')[1]
    if (blockedDomains.includes(senderDomain)) return true

    return false
}

// Async AI classification using Gemini — fire-and-forget, never blocks webhook
async function classifyEmailAsync(
    supabase: any,
    pendingEmailId: string,
    senderEmail: string,
    senderName: string,
    subject: string,
    body: string
): Promise<void> {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    console.log(`[AI] Starting classification for ${senderEmail} (pending_id: ${pendingEmailId})`)
    console.log(`[AI] GEMINI_API_KEY present: ${!!geminiKey}, length: ${geminiKey?.length || 0}`)

    if (!geminiKey) {
        console.log('[AI] GEMINI_API_KEY not set — skipping AI classification')
        return
    }

    try {
        const prompt = `You are an email classifier for a B2B lead management CRM.
Classify this inbound email from an unknown sender.

Sender: ${senderName} <${senderEmail}>
Subject: ${subject}
Body (first 500 chars): ${body.substring(0, 500)}

Classify as ONE of:
- "lead": A real person expressing interest, asking questions, requesting info, or responding to outreach
- "spam": Unsolicited sales pitch, phishing, or scam
- "promotional": Newsletter, marketing email, or automated notification
- "transactional": Receipt, shipping notification, password reset, service alert
- "unknown": Cannot determine with confidence

Respond in JSON only: {"classification": "...", "confidence": 0.0-1.0, "reason": "one sentence"}`

        console.log('[AI] Calling Gemini API...')
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 150,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        )

        console.log(`[AI] Gemini response status: ${response.status}`)
        const data = await response.json()
        console.log('[AI] Gemini response data:', JSON.stringify(data).substring(0, 500))

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
            console.log('[AI] No text in Gemini response — check API key or quota')
            return
        }

        const result = JSON.parse(text)
        console.log(`[AI] Parsed result: ${JSON.stringify(result)}`)

        // Map AI result to status — asymmetric thresholds (conservative on dismiss)
        let newStatus = 'needs_review'
        if (result.classification === 'lead' && result.confidence >= 0.6) {
            newStatus = 'likely_lead'
        } else if (
            ['spam', 'promotional', 'transactional'].includes(result.classification) &&
            result.confidence >= 0.85
        ) {
            newStatus = 'auto_dismissed'
        }

        console.log(`[AI] Updating pending_emails ${pendingEmailId} -> status: ${newStatus}`)
        const { error: updateError } = await supabase
            .from('pending_emails')
            .update({
                status: newStatus,
                ai_classification: result.classification,
                ai_confidence: result.confidence,
            })
            .eq('id', pendingEmailId)

        if (updateError) {
            console.error('[AI] DB update error:', updateError)
        } else {
            console.log(`[AI] SUCCESS: ${senderEmail} classified as ${result.classification} (${result.confidence}) -> ${newStatus}`)
        }
    } catch (err) {
        console.error('[AI] Classification error (non-fatal):', err)
        // Email stays as 'pending' — no harm done
    }
}

// Strip quoted reply content from email body
function stripQuotedContent(body: string): string {
    let cleaned = body

    // Remove "On [date] [name] wrote:" and everything after
    // Matches: "On Mon, Jan 1, 2026 at 1:00 PM Name <email> wrote:"
    const onWrotePattern = /On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^]*?wrote:/i
    const onWroteMatch = cleaned.match(onWrotePattern)
    if (onWroteMatch) {
        cleaned = cleaned.substring(0, onWroteMatch.index).trim()
    }

    // Also handle "On [date] at [time]" without "wrote:" (multiline)
    const onDatePattern = /On\s+\w{3},\s+\w{3}\s+\d/i
    const onDateMatch = cleaned.match(onDatePattern)
    if (onDateMatch) {
        cleaned = cleaned.substring(0, onDateMatch.index).trim()
    }

    // Remove lines starting with > (quoted text)
    cleaned = cleaned
        .split('\n')
        .filter(line => !line.trim().startsWith('>'))
        .join('\n')
        .trim()

    // Remove "Sent via [Company]" footer if somehow included
    const company = Deno.env.get('COMPANY_NAME') || 'Superior'
    cleaned = cleaned.replace(new RegExp(`Sent via ${company}[^\\n]*`, 'gi'), '').trim()

    return cleaned || body // Fallback to original if everything was stripped
}

// Process and store inbound email
async function processInboundEmail(supabase: any, userId: string, gmailMessage: any): Promise<void> {
    const headers = gmailMessage.payload?.headers || []
    const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const fromHeader = getHeader('From')
    const subject = getHeader('Subject')
    const date = getHeader('Date')
    const messageId = gmailMessage.id
    const threadId = gmailMessage.threadId

    // Parse "From" header - extract email and name
    // Formats: "Name <email@example.com>" or "email@example.com"
    const emailMatch = fromHeader.match(/<([^>]+)>/)
    const senderEmail = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()
    const senderName = emailMatch ? fromHeader.replace(/<[^>]+>/, '').trim() : ''

    const rawBody = extractEmailBody(gmailMessage)
    const bodyContent = stripQuotedContent(rawBody)

    // Find matching lead by sender email
    const { data: leads } = await supabase
        .from('leads')
        .select('id, email')
        .ilike('email', senderEmail)
        .limit(1)

    if (leads && leads.length > 0) {
        const lead = leads[0]

        // Check for duplicate by gmail_message_id or recent subject+timestamp
        const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('lead_id', lead.id)
            .eq('subject', subject || '(No Subject)')
            .eq('direction', 'inbound')
            .gte('timestamp', new Date(Date.now() - 60000).toISOString())
            .limit(1)

        if (existing && existing.length > 0) {
            console.log('Duplicate message detected, skipping')
            return
        }

        // Insert inbound message (DB columns: body, sent_at — NOT content/timestamp)
        await supabase.from('messages').insert({
            lead_id: lead.id,
            user_id: userId,
            direction: 'inbound',
            subject: subject || '(No Subject)',
            body: bodyContent.substring(0, 10000),
            sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
            is_read: false,
            gmail_thread_id: threadId || null
        })

        console.log('Stored inbound message from:', senderEmail, 'for lead:', lead.id)
    } else {
        // No matching lead — check prospects table for cold outreach replies
        const { data: prospects } = await supabase
            .from('prospects')
            .select('*')
            .ilike('email', senderEmail)
            .limit(1)

        if (prospects && prospects.length > 0) {
            const prospect = prospects[0]
            console.log('Matched prospect:', prospect.email, '— auto-promoting to lead')

            // Create a new lead from the prospect data (carry over research)
            const { data: newLead, error: leadError } = await supabase
                .from('leads')
                .insert({
                    first_name: prospect.first_name || '',
                    last_name: prospect.last_name || '',
                    email: prospect.email,
                    phone: prospect.phone || null,
                    company: prospect.company_name || '',
                    estimated_value: 0,
                    lead_status: 'new',
                    lead_source: 'cold_outreach',
                    research_report: prospect.research_report || null,
                    pain_points: prospect.pain_points || null,
                    prospect_id: prospect.id,
                    linkedin_url: prospect.linkedin_url || null,
                })
                .select()
                .single()

            if (leadError) {
                console.error('Error promoting prospect to lead:', leadError)
                return
            }

            // Update prospect record with the new lead ID
            const { error: prospectUpdateError } = await supabase
                .from('prospects')
                .update({ converted_to_lead_id: newLead.id })
                .eq('id', prospect.id)

            if (prospectUpdateError) {
                console.error('Error updating prospect converted_to_lead_id:', prospectUpdateError)
            }

            // Store the inbound message linked to the new lead
            await supabase.from('messages').insert({
                lead_id: newLead.id,
                user_id: userId,
                direction: 'inbound',
                subject: subject || '(No Subject)',
                body: bodyContent.substring(0, 10000),
                sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                is_read: false,
                gmail_thread_id: threadId || null
            })

            // Trigger n8n webhook for prospect reply (fire-and-forget)
            const n8nWebhookUrl = Deno.env.get('N8N_PROSPECT_REPLY_WEBHOOK_URL')
            if (n8nWebhookUrl) {
                try {
                    await fetch(n8nWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'prospect_replied',
                            prospect_email: prospect.email,
                            prospect: {
                                id: prospect.id,
                                email: prospect.email,
                                first_name: prospect.first_name,
                                last_name: prospect.last_name,
                                company_name: prospect.company_name,
                            },
                            lead: {
                                id: newLead.id,
                                email: newLead.email,
                            },
                            message: {
                                subject: subject || '(No Subject)',
                                body: bodyContent.substring(0, 2000),
                                received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                            },
                            timestamp: new Date().toISOString(),
                        }),
                    })
                    console.log('n8n webhook triggered for prospect reply:', prospect.email)
                } catch (webhookErr) {
                    console.error('n8n webhook failed (non-fatal):', webhookErr)
                }
            }

            console.log('Promoted prospect to lead:', newLead.id, 'and stored inbound message')
        } else {
            // No matching lead or prospect — check heuristics first
            const msgHeaders = gmailMessage.payload?.headers || []
            if (isObviouslyNotALead(senderEmail, msgHeaders)) {
                console.log('Heuristic filter: skipping obvious non-lead:', senderEmail)
                return
            }

            // Store in pending_emails for review
            const { data: insertedPending, error: pendingError } = await supabase
                .from('pending_emails')
                .insert({
                    user_id: userId,
                    from_email: senderEmail,
                    from_name: senderName || null,
                    subject: subject || '(No Subject)',
                    content: bodyContent.substring(0, 10000),
                    gmail_message_id: messageId,
                    received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                    status: 'pending'
                })
                .select('id')
                .single()

            if (pendingError && pendingError.code !== '23505') { // Ignore duplicate key errors
                console.error('Error storing pending email:', pendingError)
            } else if (insertedPending) {
                console.log('Stored pending email from unknown sender:', senderEmail)

                // Await AI classification — Gemini Flash is fast (~200-500ms)
                // Must await because Deno isolate terminates after response is sent
                await classifyEmailAsync(supabase, insertedPending.id, senderEmail, senderName, subject, bodyContent)
            }
        }
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json()

        // Pub/Sub sends: { message: { data: base64, messageId, publishTime }, subscription }
        if (!body.message?.data) {
            console.log('No message data in request')
            return new Response('OK', { status: 200, headers: corsHeaders })
        }

        // Decode base64 data
        const decodedData = JSON.parse(atob(body.message.data))
        const { emailAddress, historyId } = decodedData

        if (!emailAddress || !historyId) {
            console.log('Missing emailAddress or historyId')
            return new Response('OK', { status: 200, headers: corsHeaders })
        }

        console.log('Received notification for:', emailAddress, 'historyId:', historyId)

        // Initialize Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Find user by Gmail email
        const { data: tokenData, error: tokenError } = await supabase
            .from('gmail_tokens')
            .select('*')
            .eq('gmail_email', emailAddress.toLowerCase())
            .single()

        if (tokenError || !tokenData) {
            console.log('No user found for email:', emailAddress)
            return new Response('OK', { status: 200, headers: corsHeaders })
        }

        // Get valid access token (refresh if needed)
        let accessToken = tokenData.access_token
        if (new Date(tokenData.token_expiry) < new Date()) {
            console.log('Refreshing expired token')
            accessToken = await refreshAccessToken(supabase, tokenData)
        }

        // Fetch history changes since last known historyId
        const previousHistoryId = tokenData.watch_history_id || historyId
        const newMessages = await fetchNewMessages(accessToken, previousHistoryId)

        console.log('Found', newMessages.length, 'new messages')

        // Process each new message
        for (const message of newMessages) {
            await processInboundEmail(supabase, tokenData.user_id, message)
        }

        // Update stored historyId
        await supabase
            .from('gmail_tokens')
            .update({ watch_history_id: historyId })
            .eq('user_id', tokenData.user_id)

        return new Response(
            JSON.stringify({ success: true, processed: newMessages.length }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Webhook error:', error)
        // Return 200 to acknowledge - prevents Pub/Sub retries
        return new Response('OK', { status: 200, headers: corsHeaders })
    }
})

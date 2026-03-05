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
    // Recursively search nested multipart structures for the best body part.
    // Prefers text/plain over text/html at each level, then recurses into sub-parts.
    function findBodyInParts(parts: any[]): string {
        // Pass 1: text/plain at this level
        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
                return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
            }
        }
        // Pass 2: text/html at this level
        for (const part of parts) {
            if (part.mimeType === 'text/html' && part.body?.data) {
                return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
            }
        }
        // Pass 3: recurse into nested multipart/* sub-parts
        for (const part of parts) {
            if (part.mimeType?.startsWith('multipart/') && part.parts?.length) {
                const nested = findBodyInParts(part.parts)
                if (nested) return nested
            }
        }
        return ''
    }

    let bodyContent = ''

    if (gmailMessage.payload?.body?.data) {
        // Simple single-part message
        bodyContent = atob(gmailMessage.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
    } else if (gmailMessage.payload?.parts) {
        // Multipart message — search recursively
        bodyContent = findBodyInParts(gmailMessage.payload.parts)
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

    // Blocked specific email addresses from env var
    const blockedAddresses = (Deno.env.get('BLOCKED_EMAIL_ADDRESSES') || '')
        .split(',')
        .map((a: string) => a.trim().toLowerCase())
        .filter(Boolean)
    if (blockedAddresses.includes(email.toLowerCase())) return true

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
        const userPrompt = `Sender: ${senderName} <${senderEmail}>
Subject: ${subject}
Body: ${body.substring(0, 500)}

Classify as ONE of: "lead", "spam", "promotional", "transactional", "unknown".
Return ONLY this JSON with no other text: {"classification": "lead", "confidence": 0.85, "reason": "one sentence"}`

        console.log('[AI] Calling Gemini API...')
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: 'You are an email classifier for a B2B lead management CRM. You MUST respond with ONLY a JSON object. No preamble, no explanation, no markdown. Output only the raw JSON.' }]
                    },
                    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024,
                        responseMimeType: 'application/json',
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                }),
            }
        )

        console.log(`[AI] Gemini response status: ${response.status}`)
        const data = await response.json()
        console.log('[AI] Gemini response data:', JSON.stringify(data).substring(0, 800))

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
            console.log('[AI] No text in Gemini response — check API key or quota')
            return
        }

        console.log('[AI] Raw text from Gemini:', text.substring(0, 300))

        // Extract JSON — handles edge case where model still adds preamble
        const jsonMatch = text.match(/\{[\s\S]*?\}/)
        if (!jsonMatch) throw new Error(`No JSON object found in response: ${JSON.stringify(text)}`)
        const result = JSON.parse(jsonMatch[0])
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

// Parse comma-separated email list header into array of email addresses
function parseEmailList(header: string): string[] {
    if (!header) return []
    return header.split(',').map(addr => {
        const match = addr.match(/<([^>]+)>/)
        return (match ? match[1] : addr).toLowerCase().trim()
    }).filter(Boolean)
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
    const gmailApiId = gmailMessage.id        // Per-account Gmail API ID (used for cc_thread_ids matching & threadId)
    const rfcMessageId = getHeader('Message-ID') // RFC 2822 Message-ID — SAME across all recipients' copies of the same email
    const threadId = gmailMessage.threadId

    // Extract To and Cc recipients for CC visibility
    const toEmails = parseEmailList(getHeader('To'))
    const ccEmails = parseEmailList(getHeader('Cc'))

    // Parse "From" header - extract email and name
    // Formats: "Name <email@example.com>" or "email@example.com"
    const emailMatch = fromHeader.match(/<([^>]+)>/)
    const senderEmail = (emailMatch ? emailMatch[1] : fromHeader).toLowerCase().trim()
    const senderName = emailMatch ? fromHeader.replace(/<[^>]+>/, '').trim() : ''

    const rawBody = extractEmailBody(gmailMessage)
    const bodyContent = stripQuotedContent(rawBody)

    // ------------------------------------------------------------------
    // Step 1: Check if this message was sent by one of our own app users.
    // When User A sends an email and CCs User B, Gmail delivers a copy to
    // User B's INBOX. User B's webhook fires, but the sender is User A
    // (another app user), not a lead. We store a shadow outbound record for
    // User B so they have their own gmail_thread_id to use when replying.
    // ------------------------------------------------------------------
    const { data: senderUsers } = await supabase
        .from('users')
        .select('id')
        .ilike('email', senderEmail)
        .limit(1)

    if (senderUsers && senderUsers.length > 0) {
        // Sender is a team member — this is a CC'd copy of an outbound email landing in our inbox.
        // Don't create a new row. Instead, find the primary outbound row that gmail-send already
        // created and add our gmail_thread_id to its cc_thread_ids map so we can reply correctly.

        // Get current webhook user's email so we can key the map
        const { data: currentUserData } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single()

        if (!currentUserData?.email) {
            console.log('Could not fetch email for user:', userId)
            return
        }

        // Find the primary outbound row by Gmail API ID (gmail-send stores sendData.id)
        const { data: primaryRow } = await supabase
            .from('messages')
            .select('id, cc_thread_ids')
            .eq('gmail_message_id', gmailApiId)
            .eq('direction', 'outbound')
            .limit(1)

        if (primaryRow && primaryRow.length > 0) {
            const row = primaryRow[0]
            const updatedMap = { ...(row.cc_thread_ids || {}), [currentUserData.email.toLowerCase()]: threadId }
            await supabase
                .from('messages')
                .update({ cc_thread_ids: updatedMap })
                .eq('id', row.id)
            console.log('Updated cc_thread_ids for', currentUserData.email, '→', threadId)
        } else {
            // Primary row not found yet (race condition: webhook arrived before gmail-send finished).
            // Fall back to matching by subject + recent sent_at + direction
            const leadEmail = toEmails.find(e => e !== senderEmail) || ''
            const { data: fallbackRow } = await supabase
                .from('messages')
                .select('id, cc_thread_ids')
                .eq('direction', 'outbound')
                .eq('subject', subject || '(No Subject)')
                .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
                .limit(1)

            if (fallbackRow && fallbackRow.length > 0) {
                const row = fallbackRow[0]
                const updatedMap = { ...(row.cc_thread_ids || {}), [currentUserData.email.toLowerCase()]: threadId }
                await supabase
                    .from('messages')
                    .update({ cc_thread_ids: updatedMap })
                    .eq('id', row.id)
                console.log('Updated cc_thread_ids (fallback) for', currentUserData.email, '→', threadId)
            } else {
                console.log('No primary outbound row found to attach cc_thread_id. Lead email:', leadEmail)
            }
        }
        return
    }

    // ------------------------------------------------------------------
    // Step 2: Normal inbound processing — find matching lead/prospect.
    // Deduplication key: rfcMessageId (the RFC 2822 Message-ID header).
    // This header is IDENTICAL across all recipients' copies of the same email,
    // unlike gmailMessage.id which is unique per Gmail account.
    // The unique index on gmail_message_id enforces this at the DB level.
    // If two webhooks fire simultaneously, the second INSERT gets a 23505
    // unique violation which we treat as a successful no-op.
    // ------------------------------------------------------------------

    // Determine which user to attribute the inbound message to.
    // Prefer the user who sent the original outbound email (User A), so the
    // message always lands on the right user regardless of which webhook wins.
    const { data: outboundMsg } = await supabase
        .from('messages')
        .select('user_id')
        .eq('direction', 'outbound')
        .contains('to_emails', [senderEmail])
        .order('sent_at', { ascending: false })
        .limit(1)
    const attributedUserId = outboundMsg?.[0]?.user_id || userId

    // ------------------------------------------------------------------
    // Step 3: Normal inbound processing — find matching lead/prospect
    // ------------------------------------------------------------------
    const { data: leads } = await supabase
        .from('leads')
        .select('id, email, prospect_id')
        .ilike('email', senderEmail)
        .limit(1)

    if (leads && leads.length > 0) {
        const lead = leads[0]

        const { error: insertError } = await supabase.from('messages').insert({
            lead_id: lead.id,
            prospect_id: lead.prospect_id || null,
            user_id: attributedUserId,
            direction: 'inbound',
            subject: subject || '(No Subject)',
            body: bodyContent.substring(0, 10000),
            sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
            is_read: false,
            gmail_thread_id: threadId || null,
            gmail_message_id: rfcMessageId || null,
            to_emails: toEmails.length > 0 ? toEmails : null,
            cc_emails: ccEmails.length > 0 ? ccEmails : null,
        })

        if (insertError) {
            if (insertError.code === '23505') {
                console.log('Duplicate inbound message (23505), skipping:', rfcMessageId)
            } else {
                console.error('Error storing inbound message:', insertError)
            }
        } else {
            console.log('Stored inbound message from:', senderEmail, 'for lead:', lead.id)
        }
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

            // Backfill lead_id on any existing outbound messages sent to this prospect
            await supabase
                .from('messages')
                .update({ lead_id: newLead.id })
                .eq('prospect_id', prospect.id)
                .eq('direction', 'outbound')

            // Store the inbound message linked to both the new lead and the prospect
            const { error: insertError } = await supabase.from('messages').insert({
                lead_id: newLead.id,
                prospect_id: prospect.id,
                user_id: attributedUserId,
                direction: 'inbound',
                subject: subject || '(No Subject)',
                body: bodyContent.substring(0, 10000),
                sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                is_read: false,
                gmail_thread_id: threadId || null,
                gmail_message_id: rfcMessageId || null,
                to_emails: toEmails.length > 0 ? toEmails : null,
                cc_emails: ccEmails.length > 0 ? ccEmails : null,
            })

            if (insertError) {
                if (insertError.code === '23505') {
                    console.log('Duplicate prospect reply (23505), skipping:', rfcMessageId)
                } else {
                    console.error('Error storing prospect reply:', insertError)
                }
            }

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
            // No matching lead or prospect — check if we've previously emailed this person
            const { data: previousOutbound } = await supabase
                .from('messages')
                .select('lead_id, prospect_id')
                .contains('to_emails', [senderEmail])
                .eq('direction', 'outbound')
                .limit(1)

            if (previousOutbound && previousOutbound.length > 0) {
                const prev = previousOutbound[0]
                const { error: insertError } = await supabase.from('messages').insert({
                    lead_id: prev.lead_id || null,
                    prospect_id: prev.prospect_id || null,
                    user_id: attributedUserId,
                    direction: 'inbound',
                    subject: subject || '(No Subject)',
                    body: bodyContent.substring(0, 10000),
                    sent_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                    is_read: false,
                    gmail_thread_id: threadId || null,
                    gmail_message_id: rfcMessageId || null,
                    sender_name: senderName || null,
                    sender_email: senderEmail,
                    to_emails: toEmails.length > 0 ? toEmails : null,
                    cc_emails: ccEmails.length > 0 ? ccEmails : null,
                })
                if (insertError) {
                    if (insertError.code === '23505') {
                        console.log('Duplicate previously-emailed reply (23505), skipping:', rfcMessageId)
                    } else {
                        console.error('Error storing previously-emailed reply:', insertError)
                    }
                } else {
                    console.log('Stored inbound reply from previously emailed contact:', senderEmail)
                }
                return
            }

            // No matching lead, prospect, or previous outbound — check heuristics
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
                    gmail_message_id: rfcMessageId || gmailApiId,
                    received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                    status: 'pending',
                    cc_emails: ccEmails.length > 0 ? ccEmails : null,
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

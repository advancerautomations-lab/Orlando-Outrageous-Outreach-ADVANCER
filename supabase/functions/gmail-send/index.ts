import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fetch the user's Gmail signature via the Settings API
async function fetchGmailSignature(accessToken: string): Promise<string> {
    try {
        const res = await fetch(
            'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        )
        if (!res.ok) return ''
        const data = await res.json()
        // Find the default/primary send-as address
        const primary = (data.sendAs || []).find((s: any) => s.isPrimary) || data.sendAs?.[0]
        return primary?.signature || ''
    } catch {
        return ''
    }
}

// Build the outgoing HTML: plain body + Gmail signature (if any)
function buildEmailHtml(body: string, signature: string): string {
    const formattedBody = body.replace(/\n/g, '<br>')
    if (!signature) return formattedBody
    // Gmail renders signatures separated by -- convention; replicate it
    return `${formattedBody}<br><br>--<br>${signature}`
}

// Create multipart MIME email with attachments
function createEmailWithAttachments(
    to: string,
    subject: string,
    htmlBody: string,
    attachments?: { filename: string; mimeType: string; content: string }[]
): string {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substring(2)}`

    const parts = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        htmlBody
    ]

    // Add each attachment
    if (attachments && attachments.length > 0) {
        for (const att of attachments) {
            parts.push(
                `--${boundary}`,
                `Content-Type: ${att.mimeType}; name="${att.filename}"`,
                `Content-Disposition: attachment; filename="${att.filename}"`,
                'Content-Transfer-Encoding: base64',
                '',
                att.content
            )
        }
    }

    // Close boundary
    parts.push(`--${boundary}--`)

    return parts.join('\r\n')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId, leadId, to, subject, body, attachments, threadId } = await req.json()

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get tokens
        const { data: tokenData, error: tokenError } = await supabase
            .from('gmail_tokens')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (tokenError || !tokenData) throw new Error('No Gmail connection found')

        // Look up sender info for message attribution
        const { data: userData } = await supabase
            .from('users')
            .select('full_name, email')
            .eq('id', userId)
            .single()

        let accessToken = tokenData.access_token

        // Check expiry and refresh if needed (simplified check)
        if (new Date(tokenData.token_expiry) < new Date()) {
            const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
            const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId!,
                    client_secret: clientSecret!,
                    refresh_token: tokenData.refresh_token,
                    grant_type: 'refresh_token',
                }),
            })

            const newTokens = await refreshResponse.json()
            if (newTokens.error) throw new Error('Failed to refresh token')

            accessToken = newTokens.access_token

            // Update stored token
            await supabase
                .from('gmail_tokens')
                .update({
                    access_token: accessToken,
                    token_expiry: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
        }

        // Fetch Gmail signature and build plain email body
        const signature = await fetchGmailSignature(accessToken)
        const htmlBody = buildEmailHtml(body, signature)

        let emailRaw: string
        if (attachments && attachments.length > 0) {
            // Build multipart MIME with attachments
            const rawEmail = createEmailWithAttachments(to, subject, htmlBody, attachments)
            emailRaw = btoa(unescape(encodeURIComponent(rawEmail)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '')
        } else {
            // Simple email without attachments
            const emailParts = [
                `To: ${to}`,
                `Subject: ${subject}`,
                'MIME-Version: 1.0',
                'Content-Type: text/html; charset=utf-8',
                '',
                htmlBody
            ]
            emailRaw = btoa(unescape(encodeURIComponent(emailParts.join('\r\n'))))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '')
        }

        // Send via Gmail API (include threadId for replies to keep messages in the same thread)
        const sendPayload: any = { raw: emailRaw }
        if (threadId) {
            sendPayload.threadId = threadId
        }

        const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(sendPayload)
        })

        const sendData = await sendResponse.json()
        if (sendData.error) throw new Error(sendData.error.message)

        // Log to messages table (DB columns: body, sent_at — NOT content/timestamp)
        const messageRow: Record<string, any> = {
            user_id: userId,
            subject,
            body: body,
            direction: 'outbound',
            sent_at: new Date().toISOString(),
            is_read: true,
            gmail_thread_id: sendData.threadId || null,
            sender_name: userData?.full_name || null,
            sender_email: userData?.email || null,
        }
        if (leadId) messageRow.lead_id = leadId
        const { error: insertError } = await supabase.from('messages').insert(messageRow)

        if (insertError) {
            console.error('Failed to log message:', insertError)
        }

        return new Response(
            JSON.stringify({
                success: true,
                messageId: sendData.id,
                threadId: sendData.threadId,
                dbInsert: insertError ? { error: insertError.message } : { ok: true }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

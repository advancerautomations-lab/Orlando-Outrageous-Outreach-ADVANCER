import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID')
if (!GCP_PROJECT_ID) throw new Error('GCP_PROJECT_ID secret not set')
const PUBSUB_TOPIC = `projects/${GCP_PROJECT_ID}/topics/gmail-notifications`

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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const results: { user_id: string; gmail_email: string; status: string; error?: string }[] = []

    try {
        // Get all users with Gmail tokens
        const { data: allTokens, error } = await supabase
            .from('gmail_tokens')
            .select('*')

        if (error) throw new Error('Failed to query gmail_tokens: ' + error.message)
        if (!allTokens || allTokens.length === 0) {
            return new Response(
                JSON.stringify({ message: 'No Gmail accounts connected', renewed: 0 }),
                { headers: { 'Content-Type': 'application/json' } }
            )
        }

        const now = new Date()
        const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

        for (const tokenData of allTokens) {
            const watchExpiration = tokenData.watch_expiration ? new Date(tokenData.watch_expiration) : null

            // Renew if: no watch set, already expired, or expires within 2 days
            const needsRenewal = !watchExpiration || watchExpiration <= twoDaysFromNow

            if (!needsRenewal) {
                const daysLeft = Math.round((watchExpiration!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                console.log(`[${tokenData.gmail_email}] Watch still valid (${daysLeft} days left), skipping`)
                results.push({ user_id: tokenData.user_id, gmail_email: tokenData.gmail_email, status: 'skipped' })
                continue
            }

            try {
                // Refresh access token if expired
                let accessToken = tokenData.access_token
                if (new Date(tokenData.token_expiry) < now) {
                    console.log(`[${tokenData.gmail_email}] Refreshing expired access token`)
                    accessToken = await refreshAccessToken(supabase, tokenData)
                }

                // Call Gmail Watch API
                const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        topicName: PUBSUB_TOPIC,
                        labelIds: ['INBOX'],
                        labelFilterAction: 'include'
                    })
                })

                const watchData = await watchResponse.json()

                if (watchData.error) {
                    throw new Error(watchData.error.message || 'Gmail watch API error')
                }

                const expirationMs = parseInt(watchData.expiration)
                const expirationDate = new Date(expirationMs)

                await supabase
                    .from('gmail_tokens')
                    .update({
                        watch_history_id: watchData.historyId,
                        watch_expiration: expirationDate.toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', tokenData.user_id)

                const daysUntil = Math.round((expirationMs - Date.now()) / (1000 * 60 * 60 * 24))
                console.log(`[${tokenData.gmail_email}] Watch renewed, expires in ${daysUntil} days`)
                results.push({ user_id: tokenData.user_id, gmail_email: tokenData.gmail_email, status: 'renewed' })

            } catch (userError) {
                console.error(`[${tokenData.gmail_email}] Failed to renew:`, userError.message)
                results.push({ user_id: tokenData.user_id, gmail_email: tokenData.gmail_email, status: 'failed', error: userError.message })
            }
        }

        const renewed = results.filter(r => r.status === 'renewed').length
        const failed = results.filter(r => r.status === 'failed').length
        const skipped = results.filter(r => r.status === 'skipped').length

        console.log(`Gmail watch renewal complete: ${renewed} renewed, ${failed} failed, ${skipped} skipped`)

        return new Response(
            JSON.stringify({ renewed, failed, skipped, results }),
            { headers: { 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('gmail-watch-renew error:', error)
        return new Response(
            JSON.stringify({ error: error.message, results }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// GCP Project ID — set via Supabase secrets
const GCP_PROJECT_ID = Deno.env.get('GCP_PROJECT_ID')
if (!GCP_PROJECT_ID) throw new Error('GCP_PROJECT_ID secret not set')
const PUBSUB_TOPIC = `projects/${GCP_PROJECT_ID}/topics/gmail-notifications`

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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId, action } = await req.json()

        if (!userId) {
            throw new Error('userId is required')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get user's Gmail tokens
        const { data: tokenData, error: tokenError } = await supabase
            .from('gmail_tokens')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (tokenError || !tokenData) {
            throw new Error('No Gmail connection found. Please connect Gmail first.')
        }

        // Refresh token if needed
        let accessToken = tokenData.access_token
        if (new Date(tokenData.token_expiry) < new Date()) {
            console.log('Refreshing expired token')
            accessToken = await refreshAccessToken(supabase, tokenData)
        }

        // Handle stop action
        if (action === 'stop') {
            const stopResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` }
            })

            // Gmail returns 204 No Content on success
            if (!stopResponse.ok && stopResponse.status !== 204) {
                const errorData = await stopResponse.json()
                console.error('Stop watch error:', errorData)
            }

            await supabase
                .from('gmail_tokens')
                .update({
                    watch_expiration: null,
                    watch_history_id: null,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)

            return new Response(
                JSON.stringify({ success: true, action: 'stopped' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Start/renew watch
        console.log('Setting up Gmail watch with topic:', PUBSUB_TOPIC)

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
            console.error('Watch API error:', watchData.error)
            throw new Error(watchData.error.message || 'Failed to set up Gmail watch')
        }

        // watchData = { historyId: "12345", expiration: "1234567890000" }
        const expirationMs = parseInt(watchData.expiration)
        const expirationDate = new Date(expirationMs)

        console.log('Watch created - historyId:', watchData.historyId, 'expires:', expirationDate.toISOString())

        // Store watch info
        await supabase
            .from('gmail_tokens')
            .update({
                watch_history_id: watchData.historyId,
                watch_expiration: expirationDate.toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)

        return new Response(
            JSON.stringify({
                success: true,
                historyId: watchData.historyId,
                expiration: expirationDate.toISOString(),
                expiresIn: Math.round((expirationMs - Date.now()) / (1000 * 60 * 60 * 24)) + ' days'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Watch setup error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

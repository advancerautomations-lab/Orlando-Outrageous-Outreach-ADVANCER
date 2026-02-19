import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { code, userId, redirectUrl } = await req.json()

        if (!code || !userId) {
            throw new Error('Missing code or userId')
        }

        const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
        const redirectUri = redirectUrl || Deno.env.get('REDIRECT_URI') || 'http://localhost:3000'

        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId!,
                client_secret: clientSecret!,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        })

        const tokens = await tokenResponse.json()
        if (tokens.error) throw new Error(tokens.error_description)

        // Get user email
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const userData = await userResponse.json()

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Store tokens (upsert to handle reconnection)
        const { error } = await supabase
            .from('gmail_tokens')
            .upsert({
                user_id: userId,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                gmail_email: userData.email,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })

        if (error) throw error

        return new Response(
            JSON.stringify({ success: true, email: userData.email }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

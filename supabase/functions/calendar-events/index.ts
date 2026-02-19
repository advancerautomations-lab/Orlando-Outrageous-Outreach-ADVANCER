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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { userId, timeMin, timeMax } = await req.json()

        if (!userId || !timeMin || !timeMax) {
            throw new Error('userId, timeMin, and timeMax are required')
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Get user's tokens
        const { data: tokenData, error: tokenError } = await supabase
            .from('gmail_tokens')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (tokenError || !tokenData) {
            throw new Error('No Google connection found. Please connect Google first.')
        }

        // Refresh token if needed
        let accessToken = tokenData.access_token
        if (new Date(tokenData.token_expiry) < new Date()) {
            console.log('Refreshing expired token')
            accessToken = await refreshAccessToken(supabase, tokenData)
        }

        // Fetch events from Google Calendar
        const calendarUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
        calendarUrl.searchParams.set('timeMin', timeMin)
        calendarUrl.searchParams.set('timeMax', timeMax)
        calendarUrl.searchParams.set('singleEvents', 'true')
        calendarUrl.searchParams.set('orderBy', 'startTime')
        calendarUrl.searchParams.set('maxResults', '100')

        const calendarResponse = await fetch(calendarUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` }
        })

        const calendarData = await calendarResponse.json()

        if (calendarData.error) {
            console.error('Calendar API error:', calendarData.error)
            throw new Error(calendarData.error.message || 'Failed to fetch calendar events')
        }

        // Transform events to simpler format
        const events = (calendarData.items || []).map((event: any) => ({
            id: event.id,
            summary: event.summary || '(No title)',
            description: event.description || '',
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            allDay: !event.start?.dateTime,
            attendees: (event.attendees || []).map((a: any) => ({
                email: a.email,
                responseStatus: a.responseStatus
            })),
            htmlLink: event.htmlLink
        }))

        return new Response(
            JSON.stringify({ success: true, events }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Calendar events error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

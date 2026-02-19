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
        const { userId, eventId, title, description, startTime, endTime, attendeeEmail } = await req.json()

        if (!userId || !eventId) {
            throw new Error('userId and eventId are required')
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

        // Build event update object (only include provided fields)
        const eventUpdate: any = {}
        if (title !== undefined) eventUpdate.summary = title
        if (description !== undefined) eventUpdate.description = description
        if (startTime) {
            eventUpdate.start = { dateTime: startTime, timeZone: 'UTC' }
        }
        if (endTime) {
            eventUpdate.end = { dateTime: endTime, timeZone: 'UTC' }
        }
        if (attendeeEmail) {
            eventUpdate.attendees = [{ email: attendeeEmail }]
        }

        // Update event in Google Calendar using PATCH
        // sendUpdates=all sends notification to attendees about the change
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`

        const calendarResponse = await fetch(calendarUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventUpdate)
        })

        const calendarData = await calendarResponse.json()

        if (calendarData.error) {
            console.error('Calendar API error:', calendarData.error)
            throw new Error(calendarData.error.message || 'Failed to update calendar event')
        }

        console.log('Updated calendar event:', calendarData.id)

        // Update local meetings table
        const meetingUpdate: any = { updated_at: new Date().toISOString() }
        if (title !== undefined) meetingUpdate.title = title
        if (description !== undefined) meetingUpdate.description = description
        if (startTime) meetingUpdate.start_time = startTime
        if (endTime) meetingUpdate.end_time = endTime

        const { data: meeting, error: meetingError } = await supabase
            .from('meetings')
            .update(meetingUpdate)
            .eq('google_event_id', eventId)
            .select()
            .single()

        if (meetingError) {
            console.error('Failed to update meeting locally:', meetingError)
            // Don't fail - the Google Calendar event was updated
        }

        return new Response(
            JSON.stringify({
                success: true,
                googleEventId: calendarData.id,
                htmlLink: calendarData.htmlLink,
                meeting: meeting || null
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Calendar update error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

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
        const { userId, leadId, title, description, startTime, endTime, attendeeEmail } = await req.json()

        if (!userId || !title || !startTime || !endTime) {
            throw new Error('userId, title, startTime, and endTime are required')
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

        // Build event object
        const event: any = {
            summary: title,
            description: description || '',
            start: {
                dateTime: startTime,
                timeZone: Deno.env.get('TIMEZONE') || 'UTC'
            },
            end: {
                dateTime: endTime,
                timeZone: Deno.env.get('TIMEZONE') || 'UTC'
            },
            conferenceData: {
                createRequest: {
                    requestId: crypto.randomUUID(),
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        }

        // Add attendee if provided
        if (attendeeEmail) {
            event.attendees = [{ email: attendeeEmail }]
        }

        // Create event in Google Calendar
        // conferenceDataVersion=1 is required to auto-generate a Google Meet link
        // sendUpdates=all sends email invitations to attendees
        const params = new URLSearchParams({ conferenceDataVersion: '1' })
        if (attendeeEmail) {
            params.set('sendUpdates', 'all')
        }
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`

        const calendarResponse = await fetch(
            calendarUrl,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(event)
            }
        )

        const calendarData = await calendarResponse.json()

        if (calendarData.error) {
            console.error('Calendar API error:', calendarData.error)
            throw new Error(calendarData.error.message || 'Failed to create calendar event')
        }

        console.log('Created calendar event:', calendarData.id)

        // Save to local meetings table
        const meetingData: any = {
            title,
            description: description || null,
            start_time: startTime,
            end_time: endTime,
            user_id: userId,
            google_event_id: calendarData.id
        }

        if (leadId) {
            meetingData.lead_id = leadId
        }

        const { data: meeting, error: meetingError } = await supabase
            .from('meetings')
            .insert(meetingData)
            .select()
            .single()

        if (meetingError) {
            console.error('Failed to save meeting locally:', meetingError)
            // Don't fail - the Google Calendar event was created
        }

        const meetLink = calendarData.conferenceData?.entryPoints?.find(
            (ep: any) => ep.entryPointType === 'video'
        )?.uri || null

        console.log('Google Meet link:', meetLink)

        return new Response(
            JSON.stringify({
                success: true,
                googleEventId: calendarData.id,
                htmlLink: calendarData.htmlLink,
                meetLink,
                meeting: meeting || null
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Calendar create error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

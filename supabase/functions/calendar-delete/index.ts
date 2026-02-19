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
        const { userId, eventId } = await req.json()

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

        // Delete event from Google Calendar
        // sendUpdates=all sends cancellation notification to attendees
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`

        const calendarResponse = await fetch(calendarUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        })

        // DELETE returns 204 No Content on success
        if (calendarResponse.status !== 204) {
            const errorData = await calendarResponse.json()
            console.error('Calendar API error:', errorData.error)
            throw new Error(errorData.error?.message || 'Failed to delete calendar event')
        }

        console.log('Deleted calendar event:', eventId)

        // Delete from local meetings table
        const { error: meetingError } = await supabase
            .from('meetings')
            .delete()
            .eq('google_event_id', eventId)

        if (meetingError) {
            console.error('Failed to delete meeting locally:', meetingError)
            // Don't fail - the Google Calendar event was deleted
        }

        return new Response(
            JSON.stringify({
                success: true,
                deleted: true,
                eventId
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Calendar delete error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

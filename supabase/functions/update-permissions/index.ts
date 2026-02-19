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
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Admin client (service role — bypasses RLS)
        const adminClient = createClient(supabaseUrl, serviceRoleKey)

        // Verify caller identity
        const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(
            authHeader.replace('Bearer ', '')
        )
        if (authError || !caller) {
            return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Verify caller is admin
        const { data: callerProfile, error: profileError } = await adminClient
            .from('users')
            .select('role')
            .eq('id', caller.id)
            .single()

        if (profileError || callerProfile?.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Only admins can update permissions' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Parse request body
        const { user_id, permissions } = await req.json()
        if (!user_id || !permissions) {
            return new Response(JSON.stringify({ error: 'user_id and permissions are required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Only allow updating known permission fields
        const allowed = ['can_view_analytics', 'can_view_prospects', 'can_delete_leads', 'role']
        const safePerms: Record<string, any> = {}
        for (const key of allowed) {
            if (key in permissions) {
                safePerms[key] = permissions[key]
            }
        }

        if (Object.keys(safePerms).length === 0) {
            return new Response(JSON.stringify({ error: 'No valid permission fields provided' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Update using service role (bypasses RLS)
        const { data, error: updateError } = await adminClient
            .from('users')
            .update(safePerms)
            .eq('id', user_id)
            .select()

        if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        if (!data || data.length === 0) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
                status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ success: true, user: data[0] }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err) {
        console.error('Unexpected error:', err)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

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

        // Client with caller's JWT to verify identity
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Admin client (service role — bypasses RLS)
        const adminClient = createClient(supabaseUrl, serviceRoleKey)

        // Get the calling user
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
            return new Response(JSON.stringify({ error: 'Only admins can create users' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Parse request body
        const { email, full_name, role = 'sales_rep' } = await req.json()
        if (!email || !full_name) {
            return new Response(JSON.stringify({ error: 'Email and full_name are required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Generate a random temporary password
        const tempPassword = crypto.randomUUID() + '!Aa1'

        // Try to create the auth user
        let userId: string

        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password: tempPassword,
            email_confirm: true,
        })

        if (createError) {
            // If user already exists in auth, find them and continue
            if (createError.message?.includes('already been registered') ||
                createError.message?.includes('already exists')) {
                // Look up existing auth user by email
                const { data: { users: existingUsers }, error: listError } = await adminClient.auth.admin.listUsers()
                if (listError) {
                    return new Response(JSON.stringify({ error: 'Failed to look up existing user' }), {
                        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    })
                }
                const existing = existingUsers?.find((u: any) => u.email === email)
                if (!existing) {
                    return new Response(JSON.stringify({ error: createError.message }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    })
                }
                userId = existing.id
            } else {
                return new Response(JSON.stringify({ error: createError.message }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
            }
        } else {
            userId = newUser.user.id
        }

        // Upsert into users table (handles both new and existing rows)
        const { error: upsertError } = await adminClient.from('users').upsert({
            id: userId,
            email,
            full_name,
            role,
            can_view_analytics: false,
            can_view_prospects: false,
            can_delete_leads: false,
            setup_complete: false,
        }, { onConflict: 'id' })

        if (upsertError) {
            console.error('Error upserting user row:', upsertError)
            return new Response(JSON.stringify({ error: 'User created in auth but profile save failed: ' + upsertError.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Send password reset email so user can set their own password
        const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${req.headers.get('origin') || supabaseUrl}`,
        })

        if (resetError) {
            console.error('Reset password email error:', resetError)
            // Not a fatal error — user was created successfully
        }

        return new Response(JSON.stringify({
            success: true,
            user_id: userId,
            message: `User created. Password reset email sent to ${email}.`,
        }), {
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

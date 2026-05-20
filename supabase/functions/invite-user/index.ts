import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Nicht autorisiert')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Check calling user is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user } } = await callerClient.auth.getUser()
    if (!user) throw new Error('Nicht eingeloggt')

    const { data: profile } = await callerClient
      .from('users')
      .select('roles(name)')
      .eq('id', user.id)
      .single()

    const roleName = (profile as any)?.roles?.name
    if (roleName !== 'admin') throw new Error('Nur Admins dürfen Mitarbeiter einladen')

    // Get invite data
    const { email, full_name, role } = await req.json()
    if (!email || !full_name) throw new Error('E-Mail und Name sind Pflichtfelder')

    // Send invite via admin client
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: role || 'mitarbeiter' },
      redirectTo: `${req.headers.get('origin') || 'https://steuberwork.netlify.app'}/`,
    })

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, user_id: data.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

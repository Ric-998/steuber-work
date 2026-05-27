import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Nicht autorisiert' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    })

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: profile, error: profileErr } = await callerClient.rpc('get_my_profile')
    if (profileErr || !profile || profile.role_name !== 'admin') {
      return new Response(JSON.stringify({ error: 'Nur Admins dürfen Mitarbeiter anlegen' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const { firstName, lastName, email, phone, role } = await req.json()
    if (!firstName || !lastName || !email || !role) {
      return new Response(JSON.stringify({ error: 'Pflichtfelder fehlen (Vorname, Nachname, E-Mail, Rolle)' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const tempPassword = generateTempPassword()
    const fullName = `${firstName.trim()} ${lastName.trim()}`

    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (authErr || !authData.user) return new Response(JSON.stringify({ error: authErr?.message || 'Auth-Fehler' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })

    const { data: roleData } = await adminClient.from('roles').select('id').eq('name', role).single()
    if (!roleData) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: 'Rolle nicht gefunden' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // is_onboarded: true — Admin hat alle nötigen Daten bereits eingegeben
    // upsert statt insert, falls handle_new_user-Trigger bereits gefeuert hat
    const { error: upsertErr } = await adminClient.from('users').upsert({
      id: authData.user.id,
      full_name: fullName,
      email: email.trim(),
      phone: phone?.trim() || null,
      role_id: roleData.id,
      is_active: true,
      is_onboarded: true,
    }, { onConflict: 'id' })

    if (upsertErr) {
      await adminClient.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, tempPassword, userId: authData.user.id, fullName }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})

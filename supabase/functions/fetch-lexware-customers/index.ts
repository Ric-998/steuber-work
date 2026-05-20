import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Auth check – nur Admin darf Lexware-Daten abrufen
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const { data: profile } = await supabase.rpc('get_my_profile')
    if (!profile || profile.role_name !== 'admin') {
      return new Response(JSON.stringify({ error: 'Nur Admins können Lexware-Daten abrufen' }), { status: 403, headers: corsHeaders })
    }

    const LEXWARE_API_KEY = Deno.env.get('LEXWARE_API_KEY')
    if (!LEXWARE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LEXWARE_API_KEY nicht konfiguriert' }), { status: 500, headers: corsHeaders })
    }

    // Lexware Office API: Kontakte vom Typ "customer" abrufen
    const { search } = new URL(req.url)
    const params = new URLSearchParams(search)
    const query = params.get('q') || ''

    const lexUrl = `https://api.lexoffice.io/v1/contacts?type=customer&pageSize=100${query ? `&name=${encodeURIComponent(query)}` : ''}`

    const lexRes = await fetch(lexUrl, {
      headers: {
        'Authorization': `Bearer ${LEXWARE_API_KEY}`,
        'Accept': 'application/json',
      }
    })

    if (!lexRes.ok) {
      const err = await lexRes.text()
      return new Response(JSON.stringify({ error: `Lexware API Fehler: ${lexRes.status}`, detail: err }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const lexData = await lexRes.json()

    // Normalisierte Kundenliste zurückgeben
    const customers = (lexData.content || []).map((c: any) => {
      const company = c.company || c.person
      const name = company?.name || `${c.person?.firstName || ''} ${c.person?.lastName || ''}`.trim()
      const billing = c.addresses?.billing?.[0] || {}
      const contactPerson = c.company?.contactPersons?.[0]
      const contactName = contactPerson
        ? `${contactPerson.firstName || ''} ${contactPerson.lastName || ''}`.trim()
        : ''
      return {
        lexware_id: c.id,
        name,
        contact_person: contactName || null,
        email: c.emailAddresses?.business?.[0] || c.emailAddresses?.private?.[0] || null,
        phone: c.phoneNumbers?.business?.[0] || c.phoneNumbers?.mobile?.[0] || null,
        address: billing.street || null,
        city: billing.city || null,
        postal_code: billing.zip || null,
      }
    })

    return new Response(JSON.stringify({ customers }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

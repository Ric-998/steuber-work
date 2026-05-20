import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAPID_PUBLIC_KEY = 'BIVxcSSeFZEXfg82j5-GQR6x4nOZxgiFVaPbRxkBarjj8oP2y7auEww2-aWuj_PpOcBuXXzrBbqU_D8eNqTEZik'
const VAPID_PRIVATE_KEY = 'IdNS0z8rH8kaN346LqlVlDkn50UlRSrRS3JC1wNsZUk'
const VAPID_SUBJECT = 'mailto:info@steuber-dienstleistungen.de'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

async function sendWebPush(subscription: any, payload: any) {
  const { endpoint, keys: { p256dh, auth } } = subscription

  // Import VAPID keys
  const vapidPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    urlBase64ToUint8Array(VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const expiration = now + 12 * 3600
  const audience = new URL(endpoint).origin

  // Create JWT
  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const claims = btoa(JSON.stringify({ aud: audience, exp: expiration, sub: VAPID_SUBJECT })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const sigInput = `${header}.${claims}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidPrivateKey, new TextEncoder().encode(sigInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${sigInput}.${sigB64}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body: new TextEncoder().encode(JSON.stringify(payload)),
  })

  return res.status
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { user_id, title, body, url, tag } = await req.json()

    // Get all subscriptions for user
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let sent = 0
    for (const sub of subs) {
      try {
        await sendWebPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title, body, url: url || '/', tag: tag || 'steuberwork' }
        )
        sent++
      } catch(e) {
        console.error('Push failed for sub:', sub.id, e)
        // Remove invalid subscriptions
        await admin.from('push_subscriptions').delete().eq('id', sub.id)
      }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch(err: any) {
    return new Response(JSON.stringify({ error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})

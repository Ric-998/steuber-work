import { createClient } from 'jsr:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = 'BIVxcSSeFZEXfg82j5-GQR6x4nOZxgiFVaPbRxkBarjj8oP2y7auEww2-aWuj_PpOcBuXXzrBbqU_D8eNqTEZik'
const VAPID_PRIVATE_KEY = 'IdNS0z8rH8kaN346LqlVlDkn50UlRSrRS3JC1wNsZUk'
const VAPID_SUBJECT     = 'mailto:info@steuber-dienstleistungen.de'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function b64u(s: string): Uint8Array {
  const pad = '='.repeat((4 - s.length % 4) % 4)
  return new Uint8Array([...atob((s + pad).replace(/-/g,'+').replace(/_/g,'/'))].map(c=>c.charCodeAt(0)))
}
function toB64u(a: Uint8Array): string {
  return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}
function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0))
  let o=0; for(const p of parts){out.set(p,o);o+=p.length}; return out
}

// Wrap raw 32-byte P-256 private key in PKCS8 DER envelope
function toPkcs8(rawB64u: string): Uint8Array {
  return cat(
    new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,
                    0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20]),
    b64u(rawB64u)
  )
}

// One-shot HKDF (Extract + Expand, single block ≤ 32 bytes)
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', salt, {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
  const prk     = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm))
  const prkKey  = await crypto.subtle.importKey('raw', prk, {name:'HMAC',hash:'SHA-256'}, false, ['sign'])
  const okm     = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, cat(info, new Uint8Array([1]))))
  return okm.slice(0, len)
}

// RFC 8291 aes128gcm payload encryption
async function encryptPayload(p256dhB64: string, authB64: string, plaintext: string): Promise<Uint8Array> {
  const uaPub  = b64u(p256dhB64)
  const auth   = b64u(authB64)
  const plain  = new TextEncoder().encode(plaintext)

  const senderPair  = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, true, ['deriveBits'])
  const senderPub   = new Uint8Array(await crypto.subtle.exportKey('raw', senderPair.publicKey))
  const receiverKey = await crypto.subtle.importKey('raw', uaPub, {name:'ECDH',namedCurve:'P-256'}, false, [])
  const ecdhBits    = await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey}, senderPair.privateKey, 256)
  const salt        = crypto.getRandomValues(new Uint8Array(16))

  const ikm   = await hkdf(b64u(authB64), new Uint8Array(ecdhBits),
                  cat(new TextEncoder().encode('WebPush: info\x00'), uaPub, senderPub), 32)
  const cek   = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16)
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12)

  const cekKey    = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce}, cekKey, cat(plain, new Uint8Array([2]))))

  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false)
  return cat(salt, rs, new Uint8Array([65]), senderPub, encrypted)
}

async function vapidJwt(endpoint: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const hdr = toB64u(new TextEncoder().encode(JSON.stringify({typ:'JWT',alg:'ES256'})))
  const pay = toB64u(new TextEncoder().encode(JSON.stringify({aud:new URL(endpoint).origin,exp:now+43200,sub:VAPID_SUBJECT})))
  const sigInput = `${hdr}.${pay}`
  const privKey  = await crypto.subtle.importKey('pkcs8', toPkcs8(VAPID_PRIVATE_KEY), {name:'ECDSA',namedCurve:'P-256'}, false, ['sign'])
  const sig      = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, privKey, new TextEncoder().encode(sigInput)))
  return `${sigInput}.${toB64u(sig)}`
}

async function sendWebPush(sub: {endpoint:string;p256dh:string;auth:string}, payload: object): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload))
  const res  = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${await vapidJwt(sub.endpoint)},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body,
  })
  return res.status
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { user_id, title, body, url, tag } = await req.json()
    if (!user_id) return new Response(JSON.stringify({error:'user_id required'}), {status:400,headers:{...cors,'Content-Type':'application/json'}})

    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user_id)
    if (!subs?.length) return new Response(JSON.stringify({sent:0}), {headers:{...cors,'Content-Type':'application/json'}})

    let sent = 0; const stale: string[] = []
    for (const sub of subs) {
      try {
        const status = await sendWebPush({endpoint:sub.endpoint,p256dh:sub.p256dh,auth:sub.auth}, {title,body,url:url||'/',tag:tag||'steuberwork'})
        if (status >= 200 && status < 300) sent++
        else if (status === 404 || status === 410) stale.push(sub.id)
      } catch(e) { console.error('Push error:', e); stale.push(sub.id) }
    }
    if (stale.length) await admin.from('push_subscriptions').delete().in('id', stale)
    return new Response(JSON.stringify({sent, stale:stale.length}), {headers:{...cors,'Content-Type':'application/json'}})
  } catch(err: any) {
    return new Response(JSON.stringify({error:err.message}), {status:500,headers:{...cors,'Content-Type':'application/json'}})
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildInviteEmail(full_name: string, inviteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Einladung zu SteuberWork</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#085d68;padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">SteuberWork</p>
              <p style="margin:6px 0 0;font-size:13px;color:#a8d5da;">Auftragsmanagement · Steuber Dienstleistungen GmbH</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;font-weight:600;">Hallo ${full_name},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
                du wurdest als Mitarbeiter zu <strong>SteuberWork</strong> eingeladen –
                der internen App der Steuber Dienstleistungen GmbH für
                Aufträge, Zeitpläne und mehr.
              </p>
              <p style="margin:0 0 8px;font-size:15px;color:#444;line-height:1.6;">
                Klick auf den Button, um dein Konto einzurichten und loszulegen:
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="border-radius:8px;background:#085d68;">
                    <a href="${inviteUrl}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Einladung annehmen →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#888;line-height:1.5;">
                Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
              </p>
              <p style="margin:0;font-size:12px;word-break:break-all;">
                <a href="${inviteUrl}" style="color:#085d68;">${inviteUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;line-height:1.5;">
                Diese Einladung wurde von einem Administrator der Steuber Dienstleistungen GmbH versandt.
                Falls du diese Mail nicht erwartet hast, kannst du sie ignorieren.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Nicht autorisiert')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // SMTP-Konfiguration (in Supabase → Edge Functions → Secrets hinterlegen)
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')
    const smtpFrom = Deno.env.get('SMTP_FROM') || 'einladung@steuber-work.de'

    // Admin-Prüfung
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

    const { email, full_name, role } = await req.json()
    if (!email || !full_name) throw new Error('E-Mail und Name sind Pflichtfelder')

    const appUrl = 'https://steuberwork.netlify.app'
    const adminClient = createClient(supabaseUrl, serviceKey)

    // SMTP konfiguriert → eigene Branded Email
    if (smtpHost && smtpUser && smtpPass) {
      // 1. Invite-Link generieren (ohne Email zu schicken)
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { full_name, role: role || 'mitarbeiter' },
          redirectTo: `${appUrl}/`,
        },
      })
      if (linkError) throw linkError

      const inviteUrl = linkData.properties?.action_link
      if (!inviteUrl) throw new Error('Einladungslink konnte nicht generiert werden')

      // 2. Branded HTML-Email via SMTP
      const smtp = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port: smtpPort,
          tls: smtpPort === 465,   // SSL bei Port 465, STARTTLS bei 587
          auth: { username: smtpUser, password: smtpPass },
        },
      })

      await smtp.send({
        from: smtpFrom,
        to: email,
        subject: `${full_name}, du wurdest zu SteuberWork eingeladen`,
        html: buildInviteEmail(full_name, inviteUrl),
      })

      await smtp.close()

      // 3. User-Profil anlegen
      const userId = linkData.user?.id
      if (userId) {
        const { data: roleRow } = await adminClient
          .from('roles')
          .select('id')
          .eq('name', role || 'mitarbeiter')
          .single()

        if (roleRow) {
          await adminClient.from('users').upsert({
            id: userId,
            full_name,
            role_id: roleRow.id,
            is_active: true,
          }, { onConflict: 'id', ignoreDuplicates: true })
        }
      }

      return new Response(
        JSON.stringify({ success: true, user_id: userId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Fallback: Standard Supabase inviteUserByEmail (keine SMTP-Secrets gesetzt)
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: role || 'mitarbeiter' },
      redirectTo: `${appUrl}/`,
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

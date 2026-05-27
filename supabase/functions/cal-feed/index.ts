import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function icsEscape(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function foldLine(line: string): string {
  const result: string[] = []
  while (line.length > 75) {
    result.push(line.substring(0, 75))
    line = ' ' + line.substring(75)
  }
  result.push(line)
  return result.join('\r\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return new Response('Missing token', { status: 400 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: calToken, error: tokenErr } = await supabase
    .from('calendar_tokens').select('user_id').eq('token', token).single()
  if (tokenErr || !calToken) return new Response('Invalid token', { status: 404 })

  const userId = calToken.user_id
  const { data: profile } = await supabase.from('users').select('full_name').eq('id', userId).single()

  const today = new Date()
  const past = new Date(today); past.setDate(past.getDate() - 30)
  const future = new Date(today); future.setDate(future.getDate() + 365)

  const { data: assignments } = await supabase
    .from('task_assignments')
    .select('id, due_date, status, tasks(title, description, categories(name, emoji), objects(address, city, postal_code))')
    .eq('user_id', userId)
    .gte('due_date', past.toISOString().slice(0, 10))
    .lte('due_date', future.toISOString().slice(0, 10))
    .order('due_date')

  const displayName = profile?.full_name || 'Mitarbeiter'
  const STATUS_MAP: Record<string, string> = {
    offen: 'NEEDS-ACTION', in_arbeit: 'IN-PROCESS', erledigt: 'COMPLETED',
    problem: 'CANCELLED', vertretung: 'CANCELLED',
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `-//SteuberWork//Kalender//DE`,
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:SteuberWork – ${icsEscape(displayName)}`),
    'X-WR-TIMEZONE:Europe/Berlin', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const a of assignments ?? []) {
    const task = a.tasks as any
    const obj = task?.objects
    const title = `${task?.categories?.emoji || ''} ${task?.title || 'Aufgabe'}`.trim()
    const dtStart = toIcsDate(a.due_date)
    const dtEnd = (() => {
      const d = new Date(a.due_date + 'T00:00:00'); d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10).replace(/-/g, '')
    })()
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${a.id}@steuberwork`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
    lines.push(foldLine(`SUMMARY:${icsEscape(title)}`))
    if (obj) lines.push(foldLine(`LOCATION:${icsEscape(`${obj.address}, ${obj.postal_code} ${obj.city}`)}`))
    if (task?.description) lines.push(foldLine(`DESCRIPTION:${icsEscape(task.description)}`))
    lines.push(`STATUS:${STATUS_MAP[a.status] || 'NEEDS-ACTION'}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar;charset=utf-8',
      'Content-Disposition': `attachment; filename="steuberwork.ics"`,
      'Cache-Control': 'no-cache, no-store',
      ...corsHeaders,
    },
  })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

/** Rolling horizon per interval (days to look ahead) */
const HORIZON: Record<string, number> = {
  'täglich':       90,
  'wöchentlich':   365,
  'monatlich':     730,
  'quartalsweise': 1095,
}

/** Minimum remaining days before we top up */
const REFILL_THRESHOLD: Record<string, number> = {
  'täglich':       30,
  'wöchentlich':   60,
  'monatlich':     90,
  'quartalsweise': 180,
}

function getWeekdayInMonth(year: number, month: number, week: number, weekday: number): Date {
  if (week === 5) {
    // Last weekday of month
    let d = new Date(year, month + 1, 0)
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
    return d
  }
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (week - 1) * 7)
}

function generateDates(
  interval: string,
  from: Date,        // start generating FROM this date (exclusive: day after last existing)
  until: Date,       // generate UP TO this date
  task: any,
): string[] {
  const dates: string[] = []
  if (interval === 'einmalig') return []

  const endDate = task.end_date
    ? new Date(task.end_date + 'T00:00:00')
    : null
  const limit = endDate && endDate < until ? endDate : until

  if (interval === 'monatlich' && task.monthly_mode === 'weekday' && task.monthly_week && task.monthly_weekday) {
    let year = from.getFullYear()
    let month = from.getMonth()
    for (let i = 0; i < 120; i++) { // safety: max 10 years
      const d = getWeekdayInMonth(year, month, task.monthly_week, task.monthly_weekday)
      if (d > limit) break
      if (d > from) dates.push(localDateStr(d))
      month++
      if (month > 11) { month = 0; year++ }
    }
    return dates
  }

  // For täglich/wöchentlich/monatlich/quartalsweise — step from `from`
  // Find the first occurrence >= from based on task's original due_date rhythm
  const anchor = new Date(task.due_date + 'T00:00:00')
  let current = new Date(anchor)

  // Fast-forward current to the first date > from
  if (interval === 'täglich') {
    const diffDays = Math.ceil((from.getTime() - current.getTime()) / 86400000)
    if (diffDays > 0) current = addDays(anchor, diffDays)
  } else if (interval === 'wöchentlich') {
    while (current <= from) current = addDays(current, 7)
  } else if (interval === 'monatlich') {
    while (current <= from) current.setMonth(current.getMonth() + 1)
  } else if (interval === 'quartalsweise') {
    while (current <= from) current.setMonth(current.getMonth() + 3)
  }

  while (current <= limit) {
    if (current > from) dates.push(localDateStr(current))
    if (interval === 'täglich')            current = addDays(current, 1)
    else if (interval === 'wöchentlich')   current = addDays(current, 7)
    else if (interval === 'monatlich')     { current = new Date(current); current.setMonth(current.getMonth() + 1) }
    else if (interval === 'quartalsweise') { current = new Date(current); current.setMonth(current.getMonth() + 3) }
    else break
  }

  return dates
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow manual trigger via POST as well as cron
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = localDateStr(today)

  let generated = 0
  let skipped = 0
  let errors: string[] = []

  // 1. Load all active recurring tasks
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, interval, due_date, end_date, default_assignee_id, monthly_mode, monthly_week, monthly_weekday')
    .eq('is_active', true)
    .neq('interval', 'einmalig')
    .not('due_date', 'is', null)

  if (tasksErr || !tasks) {
    return new Response(JSON.stringify({ error: tasksErr?.message }), { status: 500 })
  }

  for (const task of tasks) {
    try {
      // Skip if task has end_date in the past
      if (task.end_date && task.end_date < todayStr) { skipped++; continue }

      // 2. Find latest existing assignment for this task
      const { data: latest } = await supabase
        .from('task_assignments')
        .select('due_date')
        .eq('task_id', task.id)
        .order('due_date', { ascending: false })
        .limit(1)
        .single()

      const latestDate = latest?.due_date
        ? new Date(latest.due_date + 'T00:00:00')
        : new Date(task.due_date + 'T00:00:00')

      const threshold = REFILL_THRESHOLD[task.interval] ?? 30
      const daysRemaining = Math.ceil((latestDate.getTime() - today.getTime()) / 86400000)

      // Also check: does today have an assignment? (gap fill)
      if (daysRemaining > threshold && latestDate >= today) {
        // Check for today specifically in case of gaps
        const { data: todayAssign } = await supabase
          .from('task_assignments')
          .select('id')
          .eq('task_id', task.id)
          .eq('due_date', todayStr)
          .limit(1)
          .single()

        if (todayAssign) { skipped++; continue } // today covered, window fine
      }

      // 3. Generate new dates from latestDate onward
      const horizon = HORIZON[task.interval] ?? 90
      const until = addDays(today, horizon)

      const newDates = generateDates(task.interval, latestDate, until, task)

      if (newDates.length === 0) { skipped++; continue }

      // 4. Deduplicate against existing assignments
      const { data: existing } = await supabase
        .from('task_assignments')
        .select('due_date')
        .eq('task_id', task.id)
        .in('due_date', newDates)

      const existingSet = new Set((existing ?? []).map((e: any) => e.due_date))
      const toInsert = newDates
        .filter(d => !existingSet.has(d))
        .map(d => ({
          task_id:  task.id,
          user_id:  task.default_assignee_id ?? null,  // null = Teamleiter muss verteilen
          due_date: d,
          status:   'offen',
        }))

      if (toInsert.length === 0) { skipped++; continue }

      const { error: insertErr } = await supabase
        .from('task_assignments')
        .insert(toInsert)

      if (insertErr) {
        errors.push(`task ${task.id}: ${insertErr.message}`)
      } else {
        generated += toInsert.length
      }
    } catch (e: any) {
      errors.push(`task ${task.id}: ${e.message}`)
    }
  }

  const result = {
    ok: true,
    tasksProcessed: tasks.length,
    assignmentsGenerated: generated,
    skipped,
    errors,
    runAt: new Date().toISOString(),
  }

  console.log('generate-assignments:', JSON.stringify(result))
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})

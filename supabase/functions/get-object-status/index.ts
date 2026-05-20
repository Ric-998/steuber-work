// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response(JSON.stringify({ error: 'token required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Resolve token → object_id
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('object_tokens')
      .select('object_id, expires_at')
      .eq('token', token)
      .single()

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check expiry
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'token expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const objectId = tokenRow.object_id

    // Load object data
    const { data: object, error: objErr } = await supabase
      .from('objects')
      .select('id, name, address, city, postal_code, customers(name)')
      .eq('id', objectId)
      .single()

    if (objErr || !object) {
      return new Response(JSON.stringify({ error: 'object not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Date range: last 30 days + next 7 days
    const rangeStart = new Date()
    rangeStart.setDate(rangeStart.getDate() - 30)
    const rangeEnd = new Date()
    rangeEnd.setDate(rangeEnd.getDate() + 7)

    // Load task_assignments for this object via tasks join
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('id, title')
      .eq('object_id', objectId)

    const taskIds = (taskRows ?? []).map((t: any) => t.id)
    const taskTitleMap: Record<string, string> = {}
    ;(taskRows ?? []).forEach((t: any) => { taskTitleMap[t.id] = t.title })

    let tasks: { title: string; due_date: string; status: string }[] = []

    if (taskIds.length > 0) {
      const { data: assignments } = await supabase
        .from('task_assignments')
        .select('id, due_date, status, task_id')
        .in('task_id', taskIds)
        .gte('due_date', rangeStart.toISOString().split('T')[0])
        .lte('due_date', rangeEnd.toISOString().split('T')[0])
        .order('due_date', { ascending: false })

      tasks = (assignments ?? []).map((a: any) => ({
        title: taskTitleMap[a.task_id] ?? '–',
        due_date: a.due_date,
        status: a.status,
      }))
    }

    return new Response(
      JSON.stringify({ object, tasks }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? 'internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

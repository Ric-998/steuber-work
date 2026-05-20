import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Haversine distance in km between two lat/lng points
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Nearest-neighbor TSP heuristic
function nearestNeighbor(
  start: { lat: number; lng: number },
  stops: Array<{ id: string; lat: number; lng: number; objKey: string }>
): string[] {
  const remaining = [...stops]
  const order: string[] = []
  let current = start

  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversine(current.lat, current.lng, remaining[i].lat, remaining[i].lng)
      if (dist < nearestDist) { nearestDist = dist; nearestIdx = i }
    }
    const nearest = remaining.splice(nearestIdx, 1)[0]
    order.push(nearest.objKey)
    current = nearest
  }
  return order
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { user_id, date } = await req.json()
    if (!user_id || !date) return new Response(JSON.stringify({ error: 'user_id and date required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get user home coordinates
    const { data: user } = await supabase.from('users').select('home_lat,home_lng').eq('id', user_id).single()
    const homeLat = user?.home_lat ?? 48.1351  // fallback: Munich
    const homeLng = user?.home_lng ?? 11.5820

    // Get all assignments for this user+date with object coordinates
    const { data: assignments } = await supabase
      .from('task_assignments')
      .select('id,tasks(object_id,objects(id,lat,lng,address))')
      .eq('user_id', user_id)
      .eq('due_date', date)
      .in('status', ['offen', 'in_arbeit'])

    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ order: [], message: 'No assignments found' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Group by object – each unique object is a stop
    const objectMap: Record<string, { lat: number; lng: number; ids: string[] }> = {}
    const noCoords: string[] = []

    for (const a of assignments) {
      const obj = (a.tasks as any)?.objects
      const objId = obj?.id || 'unknown'
      const lat = obj?.lat
      const lng = obj?.lng

      if (!lat || !lng) {
        noCoords.push(a.id)
        continue
      }
      if (!objectMap[objId]) objectMap[objId] = { lat, lng, ids: [] }
      objectMap[objId].ids.push(a.id)
    }

    const stops = Object.entries(objectMap).map(([objKey, v]) => ({
      objKey, lat: v.lat, lng: v.lng, ids: v.ids
    }))

    if (stops.length < 2) {
      return new Response(JSON.stringify({ order: [], message: 'Not enough stops with coordinates to optimize' }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    // Run nearest-neighbor from home
    const orderedObjKeys = nearestNeighbor(
      { lat: homeLat, lng: homeLng },
      stops.map(s => ({ id: s.objKey, lat: s.lat, lng: s.lng, objKey: s.objKey }))
    )

    // Assign sort_order values and update DB
    const orderResult: Array<{ id: string; sort_order: number }> = []
    let sortBase = 0

    for (const objKey of orderedObjKeys) {
      const stop = stops.find(s => s.objKey === objKey)!
      for (let i = 0; i < stop.ids.length; i++) {
        const so = sortBase + i
        await supabase.from('task_assignments').update({ sort_order: so }).eq('id', stop.ids[i])
        orderResult.push({ id: stop.ids[i], sort_order: so })
      }
      sortBase += 100
    }

    // Assignments without coords get pushed to the end
    for (let i = 0; i < noCoords.length; i++) {
      const so = sortBase + i
      await supabase.from('task_assignments').update({ sort_order: so }).eq('id', noCoords[i])
      orderResult.push({ id: noCoords[i], sort_order: so })
    }

    return new Response(JSON.stringify({ order: orderResult, optimized: orderedObjKeys.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})

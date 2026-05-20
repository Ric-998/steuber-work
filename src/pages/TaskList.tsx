import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { OnboardingTour, InstallGuide, useOnboarding, resetTour } from '../components/OnboardingTour'
import { PWAInstallBanner } from '../components/PWAInstallBanner'
import BugReport from '../components/BugReport'
import MapView from '../components/MapView'
import { registerServiceWorker, subscribeToPush, unsubscribeFromPush, isPushSubscribed, isPushSupported } from '../lib/push'
import { TaskAssignment } from '../types'

interface Props {
  userId: string
  userName: string
  onLogout: () => void
}

const DAYS = ['So','Mo','Di','Mi','Do','Fr','Sa']
const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

function getWeekDays(baseDate: Date) {
  const dow = baseDate.getDay()
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatDue(dateStr: string) {
  const due = new Date(dateStr); const today = new Date()
  today.setHours(0,0,0,0); due.setHours(0,0,0,0)
  const diff = (due.getTime() - today.getTime()) / 86400000
  if (diff === 0) return { label: 'Heute fällig', urgent: true }
  if (diff === 1) return { label: 'Morgen fällig', urgent: false }
  if (diff < 0) return { label: 'Überfällig', urgent: true }
  return { label: `${DAYS[due.getDay()]}, ${due.getDate()}. ${MONTHS[due.getMonth()]}`, urgent: false }
}

const STATUS_META: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  offen:      { label: 'Offen',      icon: 'radio_button_unchecked', bg: '#fff8e6', color: '#92400e' },
  in_arbeit:  { label: 'In Arbeit',  icon: 'pending',                bg: '#e0f4f6', color: 'var(--pri)' },
  erledigt:   { label: 'Erledigt',   icon: 'check_circle',           bg: '#dcfce7', color: '#166534' },
  problem:    { label: 'Problem',    icon: 'error',                  bg: '#ffdad6', color: '#93000a' },
  vertretung: { label: 'Vertretung', icon: 'swap_horiz',             bg: '#f3f0ff', color: '#5b21b6' },
}

const CAT_ICONS: Record<string, string> = {
  'Gebäudereinigung': 'apartment',
  'Sanitärreinigung': 'water_drop',
  'Glasreinigung': 'window',
  'Grünanlagenpflege': 'park',
  'Winterdienst': 'ac_unit',
  'Hausmeisterservice': 'build',
  'Außenflächen': 'local_parking',
  'Sonderauftrag': 'inventory_2',
}

interface VertretungItem {
  id: string
  due_date: string
  status: string
  user_id: string
  tasks: {
    title: string
    description: string | null
    objects: { address: string; city: string } | null
  } | null
}

export default function TaskList({ userId, userName, onLogout }: Props) {
  const [assignments, setAssignments] = useState<TaskAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tasks'|'zeit'|'profile'>('tasks')
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [detail, setDetail] = useState<TaskAssignment | null>(null)
  const [sheetTask, setSheetTask] = useState<TaskAssignment | null>(null)
  const [sheetType, setSheetType] = useState<'complete'|'problem'|'vertretung'|null>(null)
  const [selectedOption, setSelectedOption] = useState('')
  const [problemNote, setProblemNote] = useState('')
  const [vertretungNote, setVertretungNote] = useState('')
  const [photoFile, setPhotoFile] = useState<File|null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [toast, setToast] = useState<{msg:string;type:'ok'|'warn'}|null>(null)

  // Zeiterfassung & Routing
  const [travelMinutes, setTravelMinutes] = useState<number>(0)
  const [customTravel, setCustomTravel] = useState('')
  const [optimizingRoute, setOptimizingRoute] = useState(false)

  // Urlaubs-/Krankmeldungs-Daten für Kalender
  const [myLeaves, setMyLeaves] = useState<any[]>([])
  const [vacationDaysPerYear, setVacationDaysPerYear] = useState(30)
  const [showMonthView, setShowMonthView] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)

  // Tauschbörse state
  const [availableVertretungen, setAvailableVertretungen] = useState<VertretungItem[]>([])
  const [vertretungDetail, setVertretungDetail] = useState<VertretungItem | null>(null)
  const [takingOver, setTakingOver] = useState(false)

  const showToast = (msg:string, type:'ok'|'warn'='ok') => {
    setToast({msg,type})
    setTimeout(()=>setToast(null), 2800)
  }

  const weekBase = new Date()
  weekBase.setDate(weekBase.getDate() + weekOffset * 7)
  const weekDays = getWeekDays(weekBase)

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)

  useEffect(() => {
    registerServiceWorker()
    setPushSupported(isPushSupported())
    isPushSubscribed().then(setPushEnabled)
  }, [])

  const togglePush = async () => {
    if (pushEnabled) {
      await unsubscribeFromPush(userId)
      setPushEnabled(false)
    } else {
      const ok = await subscribeToPush(userId)
      setPushEnabled(ok)
    }
  }
  const today = new Date(); today.setHours(0,0,0,0)
  const firstName = userName.split(' ')[0]
  const { show: showTour, setShow: setShowTour } = useOnboarding()
  const [showBugReport, setShowBugReport] = useState(false)
  const initials = userName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()

  useEffect(() => {
    fetchAssignments()
    fetchVertretungen()
    fetchMyLeaves()
    // Fetch vacation days from own profile
    supabase.from('users').select('vacation_days_per_year').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (data?.vacation_days_per_year) setVacationDaysPerYear(data.vacation_days_per_year) })
  }, [userId])

  const fetchMyLeaves = async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('user_id', userId)
      .order('from_date', { ascending: false })
    if (data) setMyLeaves(data)
  }

  const fetchVertretungen = async () => {
    const { data } = await supabase
      .from('task_assignments')
      .select('id,due_date,status,user_id,tasks(title,description,objects(address,city))')
      .eq('status', 'vertretung')
      .neq('user_id', userId)
    if (data) setAvailableVertretungen(data as unknown as VertretungItem[])
  }

  const fetchAssignments = async () => {
    setLoading(true)
    // Fetch wider range to cover week navigation
    const rangeStart = new Date()
    rangeStart.setDate(rangeStart.getDate() - 14)
    const rangeEnd = new Date()
    rangeEnd.setDate(rangeEnd.getDate() + 28)
    const { data } = await supabase
      .from('task_assignments')
      .select(`*, tasks(id,title,description,interval,categories(id,name,emoji),objects(id,name,address,city,postal_code,customers(name)))`)
      .eq('user_id', userId)
      .gte('due_date', rangeStart.toISOString().split('T')[0])
      .lte('due_date', rangeEnd.toISOString().split('T')[0])
      .order('due_date', { ascending: true })
    if (data) {
      const sorted = (data as TaskAssignment[]).sort((a, b) => {
        if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      setAssignments(sorted)
    }
    setLoading(false)
  }

  const filteredByDay = assignments.filter(a => {
    const d = new Date(a.due_date); d.setHours(0,0,0,0)
    const sel = new Date(selectedDay); sel.setHours(0,0,0,0)
    return d.getTime() === sel.getTime()
  })

  const grouped = filteredByDay.reduce<Record<string, TaskAssignment[]>>((acc, a) => {
    const key = a.tasks?.objects?.id || 'other'
    if (!acc[key]) acc[key] = []
    acc[key].push(a); return acc
  }, {})

  // Sorted groups for day view (by sort_order)
  const sortedGroupEntries = Object.entries(grouped).sort(([, aArr], [, bArr]) => {
    const aMin = Math.min(...aArr.map(x => x.sort_order ?? 999))
    const bMin = Math.min(...bArr.map(x => x.sort_order ?? 999))
    return aMin - bMin
  })

  // Only count current week for summary pills
  const weekStart = weekDays[0]; weekStart.setHours(0,0,0,0)
  const weekEnd = weekDays[6]; weekEnd.setHours(23,59,59,999)
  const weekAssignments = assignments.filter(a => {
    const d = new Date(a.due_date); return d >= weekStart && d <= weekEnd
  })
  const open = weekAssignments.filter(a => a.status === 'offen').length
  const inProgress = weekAssignments.filter(a => a.status === 'in_arbeit').length
  const done = weekAssignments.filter(a => a.status === 'erledigt').length

  const updateStatus = async (id: string, status: TaskAssignment['status'], extra?: Partial<TaskAssignment>) => {
    setUpdating(true)
    const updates: Partial<TaskAssignment> = { status, ...extra }
    if (status === 'in_arbeit') updates.started_at = new Date().toISOString()
    if (status === 'erledigt') updates.completed_at = new Date().toISOString()
    const { error } = await supabase.from('task_assignments').update(updates).eq('id', id)
    if (!error) {
      setAssignments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
      if (detail?.id === id) setDetail(prev => prev ? { ...prev, ...updates } : prev)
    }
    setUpdating(false); setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote('')
  }

  const confirmAction = async () => {
    if (!sheetTask) return
    setPhotoUploading(true)

    if (sheetType === 'complete') {
      let photoUrl: string | null = null

      // Upload photo if selected
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()
        const path = `${sheetTask.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('task-photos')
          .upload(path, photoFile, { upsert: true })
        if (!upErr) {
          const { data } = supabase.storage.from('task-photos').getPublicUrl(path)
          photoUrl = data.publicUrl
        }
      }

      await updateStatus(sheetTask.id, 'erledigt', { travel_minutes: travelMinutes })

      // Save report with photo
      await supabase.from('task_reports').insert({
        assignment_id: sheetTask.id,
        report_type: photoUrl ? 'foto' : 'abschluss',
        photo_urls: photoUrl ? [photoUrl] : [],
      })

      showToast('✓ Aufgabe abgeschlossen!', 'ok')
    } else {
      await updateStatus(sheetTask.id, 'problem')
      const problemNoteText = selectedOption + (problemNote.trim() ? ': ' + problemNote.trim() : '')
      await supabase.from('task_reports').insert({
        assignment_id: sheetTask.id,
        report_type: 'problem',
        note: problemNoteText,
      })
      // Push-Benachrichtigung an alle Admins senden
      try {
        const { data: roles } = await supabase.from('roles').select('id').eq('name', 'admin').single()
        if (roles) {
          const { data: admins } = await supabase.from('users').select('id').eq('role_id', roles.id).eq('is_active', true)
          const taskTitle = sheetTask.tasks?.title ?? 'Aufgabe'
          const objAddr = sheetTask.tasks?.objects?.address ?? ''
          for (const admin of (admins ?? [])) {
            await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
              body: JSON.stringify({
                user_id: admin.id,
                title: '⚠ Problem gemeldet',
                body: `${taskTitle}${objAddr ? ' · ' + objAddr : ''}: ${problemNoteText}`,
                tag: 'problem-' + sheetTask.id,
              }),
            }).catch(() => {/* ignore push errors */})
          }
        }
      } catch { /* push errors dürfen App nicht blockieren */ }
      showToast('⚠ Problem wurde gemeldet', 'warn')
    }

    setPhotoFile(null)
    setPhotoUploading(false)
  }

  // Reorder object-groups within the selected day
  const reorderGroup = async (objectId: string, direction: 'up' | 'down') => {
    const dayStr = selectedDay.toISOString().split('T')[0]
    const dayAssigns = assignments.filter(a => a.due_date === dayStr)
    // Build sorted group list
    const grpMap: Record<string, TaskAssignment[]> = {}
    dayAssigns.forEach(a => { const k = a.tasks?.objects?.id || 'other'; if (!grpMap[k]) grpMap[k] = []; grpMap[k].push(a) })
    const groups = Object.entries(grpMap).sort(([, a], [, b]) => {
      const aMin = Math.min(...a.map(x => x.sort_order ?? 999))
      const bMin = Math.min(...b.map(x => x.sort_order ?? 999))
      return aMin - bMin
    })
    const idx = groups.findIndex(([k]) => k === objectId)
    if (idx < 0) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === groups.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const curGroup = groups[idx][1]
    const swapGroup = groups[swapIdx][1]
    const curBase = swapIdx * 100
    const swapBase = idx * 100
    await Promise.all([
      ...curGroup.map((a, i) => supabase.from('task_assignments').update({ sort_order: curBase + i }).eq('id', a.id)),
      ...swapGroup.map((a, i) => supabase.from('task_assignments').update({ sort_order: swapBase + i }).eq('id', a.id)),
    ])
    setAssignments(prev => prev.map(a => {
      const ci = curGroup.findIndex(x => x.id === a.id)
      if (ci >= 0) return { ...a, sort_order: curBase + ci }
      const si = swapGroup.findIndex(x => x.id === a.id)
      if (si >= 0) return { ...a, sort_order: swapBase + si }
      return a
    }).sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    }))
  }

  const optimizeRoute = async () => {
    setOptimizingRoute(true)
    const dayStr = selectedDay.toISOString().split('T')[0]
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/optimize-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: userId, date: dayStr }),
      })
      const result = await res.json()
      if (result?.order) {
        setAssignments(prev => prev.map(a => {
          const found = result.order.find((o: any) => o.id === a.id)
          return found ? { ...a, sort_order: found.sort_order } : a
        }).sort((a, b) => {
          if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
          return (a.sort_order ?? 0) - (b.sort_order ?? 0)
        }))
        showToast('Route optimiert!', 'ok')
      } else {
        showToast('Optimierung fehlgeschlagen', 'warn')
      }
    } catch { showToast('Optimierung fehlgeschlagen', 'warn') }
    setOptimizingRoute(false)
  }

  const confirmVertretung = async () => {
    if (!sheetTask) return
    setUpdating(true)
    const { error } = await supabase
      .from('task_assignments')
      .update({ status: 'vertretung' })
      .eq('id', sheetTask.id)
    if (!error) {
      setAssignments(prev => prev.map(a => a.id === sheetTask.id ? { ...a, status: 'vertretung' } : a))
      if (detail?.id === sheetTask.id) setDetail(prev => prev ? { ...prev, status: 'vertretung' } : prev)
      if (vertretungNote.trim()) {
        await supabase.from('task_reports').insert({
          assignment_id: sheetTask.id,
          report_type: 'vertretung',
          note: vertretungNote.trim(),
        })
      }
      showToast('Vertretung angeboten', 'ok')
      await fetchVertretungen()
    }
    setUpdating(false)
    setSheetTask(null)
    setSheetType(null)
    setVertretungNote('')
  }

  const takeOverVertretung = async (item: VertretungItem) => {
    setTakingOver(true)
    const { error } = await supabase
      .from('task_assignments')
      .update({ user_id: userId, status: 'offen' })
      .eq('id', item.id)
    if (!error) {
      setAvailableVertretungen(prev => prev.filter(v => v.id !== item.id))
      setVertretungDetail(null)
      showToast('Aufgabe übernommen!', 'ok')
      await fetchAssignments()
    } else {
      showToast('Fehler beim Übernehmen', 'warn')
    }
    setTakingOver(false)
  }

  return (
    <div style={s.shell}>
      {/* ── TOP BAR: teal, only name + date + bell ── */}
      <header style={s.appHead}>
        <div style={s.topBarInner}>
          <div style={s.topBarLeft}>
            <div style={s.topAva}>{initials}</div>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:'#fff', fontFamily:'Manrope,sans-serif', letterSpacing:'-0.02em' }}>{firstName}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:1 }}>{today.getDate()}. {MONTHS[today.getMonth()]} {today.getFullYear()}</div>
            </div>
          </div>
          <button style={{ background:'rgba(255,255,255,0.15)', border:'none', width:36, height:36, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ color:'#fff', fontSize:20 }}>notifications</span>
          </button>
        </div>
      </header>

      {/* ── CALENDAR CARD ── */}
      {activeTab === 'tasks' && (() => {
        // Month view base: today + monthOffset months
        const mvBase = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
        const mvYr = mvBase.getFullYear(), mvMo = mvBase.getMonth()
        const mvFirstDay = new Date(mvYr, mvMo, 1)
        const mvLastDay  = new Date(mvYr, mvMo + 1, 0)
        let mvStartPad = mvFirstDay.getDay() - 1; if (mvStartPad < 0) mvStartPad = 6
        const mvCells: (Date|null)[] = Array(mvStartPad).fill(null)
        for (let d = 1; d <= mvLastDay.getDate(); d++) mvCells.push(new Date(mvYr, mvMo, d))
        while (mvCells.length % 7 !== 0) mvCells.push(null)
        const todayStr = today.toISOString().split('T')[0]

        return (
          <div style={{ background:'#fff', padding:'14px 16px 16px', borderBottom:'1px solid #EDF1F2', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', flexShrink:0, marginTop:8, borderRadius:'16px 16px 0 0' }}>
            {/* Header row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <button
                onClick={() => showMonthView ? setMonthOffset(o=>o-1) : (setWeekOffset(o=>o-1), setSelectedDay(weekDays[0]))}
                style={{ background:'#F0F8F9', border:'none', width:32, height:32, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'#2f7681' }}>chevron_left</span>
              </button>

              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, justifyContent:'center' }}>
                <span style={{ fontSize:13, fontWeight:800, color:'#2f7681', letterSpacing:'0.04em', textTransform:'uppercase', fontFamily:'Manrope,sans-serif' }}>
                  {showMonthView
                    ? `${MONTHS[mvMo]} ${mvYr}`
                    : weekDays[0].getMonth() === weekDays[6].getMonth()
                      ? `${MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getFullYear()}`
                      : `${MONTHS[weekDays[0].getMonth()]} / ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
                  }
                </span>
                {((!showMonthView && weekOffset === 0) || (showMonthView && monthOffset === 0)) && (
                  <span style={{ fontSize:9, fontWeight:800, background:'#E6F3F4', color:'#2f7681', padding:'3px 8px', borderRadius:999, letterSpacing:'0.06em', textTransform:'uppercase' }}>Heute</span>
                )}
              </div>

              {/* Toggle */}
              <button
                onClick={() => { setShowMonthView(v => !v); setMonthOffset(0) }}
                style={{ padding:'5px 10px', borderRadius:10, border:'1.5px solid #2f7681', background: showMonthView ? '#2f7681' : 'transparent', color: showMonthView ? '#fff' : '#2f7681', fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ fontSize:14 }}>{showMonthView ? 'view_week' : 'calendar_month'}</span>
                {showMonthView ? 'Woche' : 'Monat'}
              </button>

              <button
                onClick={() => showMonthView ? setMonthOffset(o=>o+1) : (setWeekOffset(o=>o+1), setSelectedDay(weekDays[6]))}
                style={{ background:'#F0F8F9', border:'none', width:32, height:32, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'#2f7681' }}>chevron_right</span>
              </button>
            </div>

            {/* ── WEEK VIEW ── */}
            {!showMonthView && (
              <div style={{ display:'flex', gap:4 }}>
                {weekDays.map((d, i) => {
                  const isToday = d.getTime() === today.getTime()
                  const isSel = d.toDateString() === selectedDay.toDateString()
                  const hasTasks = assignments.some(a => { const ad = new Date(a.due_date); ad.setHours(0,0,0,0); return ad.getTime() === d.getTime() })
                  const dStr = d.toISOString().split('T')[0]
                  const dayLeave = myLeaves.find((l:any) => dStr >= l.from_date && dStr <= l.to_date)
                  const lc = dayLeave
                    ? dayLeave.request_type === 'krankmeldung' ? '#e53935'
                      : dayLeave.status === 'genehmigt' ? '#2f7681' : '#f59e0b'
                    : null
                  return (
                    <div key={i} onClick={() => setSelectedDay(d)} style={{
                      flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                      padding:'8px 4px', borderRadius:14, cursor:'pointer',
                      background: isSel ? '#2f7681' : lc && !isSel ? lc+'18' : isToday ? '#F0F8F9' : 'transparent',
                      border: lc && !isSel ? `1.5px solid ${lc}35` : '1.5px solid transparent',
                      transition:'background 0.15s',
                    }}>
                      <span style={{ fontSize:9, fontWeight:700, color: isSel ? 'rgba(255,255,255,0.75)' : '#9BA8A9', textTransform:'uppercase', letterSpacing:'0.05em' }}>{DAYS[d.getDay()]}</span>
                      <span style={{ fontSize:15, fontWeight: isSel||isToday ? 800 : 500, color: isSel ? '#fff' : isToday ? '#2f7681' : '#3a4a4b', fontFamily:'Manrope,sans-serif' }}>{d.getDate()}</span>
                      {lc && !isSel
                        ? <span style={{ width:5, height:5, borderRadius:'50%', background: lc }}/>
                        : <span style={{ width:5, height:5, borderRadius:'50%', background: hasTasks ? (isSel ? 'rgba(255,255,255,0.7)' : '#2f7681') : 'transparent' }}/>
                      }
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── MONTH VIEW ── */}
            {showMonthView && (
              <div>
                {/* Weekday headers */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:4 }}>
                  {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => (
                    <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'#9BA8A9', padding:'2px 0' }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                  {mvCells.map((d, i) => {
                    if (!d) return <div key={i}/>
                    const dStr = d.toISOString().split('T')[0]
                    const isToday2 = dStr === todayStr
                    const isSel2   = dStr === selectedDay.toISOString().split('T')[0]
                    const dayLeave2 = myLeaves.find((l:any) => dStr >= l.from_date && dStr <= l.to_date)
                    const hasTask2  = assignments.some((a:any) => a.due_date === dStr)
                    const lc2 = dayLeave2
                      ? dayLeave2.request_type === 'krankmeldung' ? '#e53935'
                        : dayLeave2.status === 'genehmigt' ? '#2f7681' : '#f59e0b'
                      : null
                    return (
                      <div key={i}
                        onClick={() => { setSelectedDay(d); setShowMonthView(false); setWeekOffset(Math.round((d.getTime()-new Date().getTime())/(7*24*3600*1000))) }}
                        style={{
                          aspectRatio:'1', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
                          borderRadius:10, cursor:'pointer',
                          background: isSel2 ? '#2f7681' : lc2 ? lc2+'22' : isToday2 ? '#E6F3F4' : 'transparent',
                          border: isSel2 ? 'none' : isToday2 ? '2px solid #2f7681' : lc2 ? `1.5px solid ${lc2}40` : '1.5px solid transparent',
                          transition:'background 0.12s',
                        }}>
                        <span style={{ fontSize:13, fontWeight: isToday2||isSel2 ? 800 : 400, color: isSel2 ? '#fff' : isToday2 ? '#2f7681' : '#3a4a4b', fontFamily:'Manrope,sans-serif' }}>{d.getDate()}</span>
                        {(hasTask2 || lc2) && (
                          <span style={{ width:4, height:4, borderRadius:'50%', background: isSel2 ? 'rgba(255,255,255,0.75)' : lc2 ?? '#2f7681' }}/>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div style={{ display:'flex', gap:16, marginTop:10, justifyContent:'center', flexWrap:'wrap' }}>
                  {[{c:'#2f7681',op:0.45,r:4,l:'Urlaub'},{c:'#f59e0b',op:0.45,r:4,l:'Ausstehend'},{c:'#e53935',op:0.45,r:4,l:'Krank'},{c:'#2f7681',op:1,r:99,l:'Aufgaben'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#9BA8A9' }}>
                      <span style={{ width:8, height:8, borderRadius:x.r, background:x.c, opacity:x.op, flexShrink:0 }}/>
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Content */}
      <div style={s.content}>
        {activeTab === 'tasks' && (
          <>


            {/* Vertretungen Banner */}
            {availableVertretungen.length > 0 && (
              <div
                onClick={() => setVertretungDetail(availableVertretungen[0])}
                style={{ display:'flex', alignItems:'center', gap:12, background:'linear-gradient(135deg,#5b21b6,#7c3aed)', borderRadius:16, padding:'14px 16px', marginBottom:16, cursor:'pointer', boxShadow:'0 4px 16px rgba(91,33,182,0.25)' }}
              >
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ color:'#fff', fontSize:22 }}>swap_horiz</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:'Manrope,sans-serif' }}>
                    Verfügbare Vertretungen ({availableVertretungen.length})
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:2 }}>
                    Kollege sucht Vertretung – Tippe für Details
                  </div>
                </div>
                <span className="material-symbols-outlined" style={{ color:'rgba(255,255,255,0.75)', fontSize:20 }}>chevron_right</span>
              </div>
            )}

            {/* Summary row */}
            <div style={{ display:'flex', gap:10, marginBottom:20 }}>
              {/* Offen */}
              <div style={{ flex:1, background:'#fff', borderRadius:18, padding:'16px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #EDF1F2' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: open+inProgress > 0 ? '#f59e0b' : '#ccc', flexShrink:0 }}/>
                  <span style={{ fontSize:10, fontWeight:700, color:'#9BA8A9', textTransform:'uppercase', letterSpacing:'0.08em' }}>Offen</span>
                </div>
                <div style={{ fontSize:34, fontWeight:800, color:'#1a2020', fontFamily:'Manrope,sans-serif', lineHeight:1 }}>{open + inProgress}</div>
                <div style={{ fontSize:11, color:'#9BA8A9', marginTop:4 }}>diese Woche</div>
              </div>
              {/* Erledigt */}
              <div style={{ flex:1, background:'#fff', borderRadius:18, padding:'16px 14px', boxShadow:'0 2px 10px rgba(0,0,0,0.06)', border:'1px solid #EDF1F2' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: done > 0 ? '#2f7681' : '#ccc', flexShrink:0 }}/>
                  <span style={{ fontSize:10, fontWeight:700, color:'#9BA8A9', textTransform:'uppercase', letterSpacing:'0.08em' }}>Erledigt</span>
                </div>
                <div style={{ fontSize:34, fontWeight:800, color: done > 0 ? '#2f7681' : '#1a2020', fontFamily:'Manrope,sans-serif', lineHeight:1 }}>{done}</div>
                <div style={{ fontSize:11, color:'#9BA8A9', marginTop:4 }}>diese Woche</div>
              </div>
            </div>



            {/* Task list */}
            <section style={{ ...s.secHead, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
              <h3 style={s.secTitle}>Aufgaben – {selectedDay.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
              {Object.keys(grouped).length >= 2 && (
                <button onClick={optimizeRoute} disabled={optimizingRoute}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:12, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:12, fontWeight:700, cursor:optimizingRoute?'default':'pointer', opacity:optimizingRoute?0.6:1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:15 }}>{optimizingRoute ? 'hourglass_empty' : 'route'}</span>
                  {optimizingRoute ? 'Optimiere…' : 'Route optimieren'}
                </button>
              )}
            </section>

            {loading ? (
              <div style={s.empty}><span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--txt-muted)', opacity: 0.4 }}>hourglass_empty</span><p style={s.emptyTxt}>Wird geladen...</p></div>
            ) : filteredByDay.length === 0 ? (
              (() => {
                const dStr2 = selectedDay.toISOString().split('T')[0]
                const activLeave = myLeaves.find(l => dStr2 >= l.from_date && dStr2 <= l.to_date)
                if (activLeave) {
                  const isKrank = activLeave.request_type === 'krankmeldung'
                  const stMap: Record<string,string> = { genehmigt:'Genehmigt', ausstehend:'Ausstehend', abgelehnt:'Abgelehnt' }
                  return (
                    <div style={{ background: isKrank ? '#ffeaea' : 'var(--pri-xl)', borderRadius:16, padding:'20px 18px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, textAlign:'center' }}>
                      <span className="material-symbols-outlined icon-fill" style={{ fontSize:36, color: isKrank ? '#e53935' : 'var(--pri)' }}>{isKrank ? 'sick' : 'beach_access'}</span>
                      <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color: isKrank ? '#b71c1c' : 'var(--pri)' }}>{isKrank ? 'Krankmeldung' : 'Urlaub'}</div>
                      <div style={{ fontSize:12, color:'var(--txt-muted)' }}>{new Date(activLeave.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'long'})} – {new Date(activLeave.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})}</div>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: activLeave.status === 'genehmigt' ? 'var(--ok-bg)' : activLeave.status === 'ausstehend' ? '#fff3cd' : '#ffdad6', color: activLeave.status === 'genehmigt' ? 'var(--ok)' : activLeave.status === 'ausstehend' ? '#b45309' : 'var(--err-dot)' }}>{stMap[activLeave.status] ?? activLeave.status}</span>
                    </div>
                  )
                }
                return <div style={s.empty}><span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--ok)', opacity: 0.5 }}>check_circle</span><p style={s.emptyTxt}>Keine Aufgaben für diesen Tag</p><p style={s.emptySub}>Genieß den freien Tag!</p></div>
              })()
            ) : (
              sortedGroupEntries.map(([objectKey, tasks], groupIdx) => {
                const groupCount = sortedGroupEntries.length;
                const obj = tasks[0].tasks?.objects
                return (
                  <div key={tasks[0].id} style={{ marginBottom: 20 }}>
                    <div style={{ ...s.groupHead, justifyContent:'space-between' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)' }}>location_on</span>
                        <span style={s.groupName}>{obj ? `${obj.address}, ${obj.city}` : 'Objekt unbekannt'}</span>
                      </div>
                      {groupCount > 1 && (
                        <div style={{ display:'flex', gap:4 }}>
                          <button disabled={groupIdx === 0} onClick={() => reorderGroup(objectKey, 'up')}
                            style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--outline)', background:'var(--surf-low)', color: groupIdx===0?'var(--txt-muted)':'var(--pri)', cursor:groupIdx===0?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:groupIdx===0?0.4:1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:16 }}>expand_less</span>
                          </button>
                          <button disabled={groupIdx === groupCount-1} onClick={() => reorderGroup(objectKey, 'down')}
                            style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--outline)', background:'var(--surf-low)', color: groupIdx===groupCount-1?'var(--txt-muted)':'var(--pri)', cursor:groupIdx===groupCount-1?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:groupIdx===groupCount-1?0.4:1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:16 }}>expand_more</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {tasks.map(a => {
                        const due = formatDue(a.due_date)
                        const meta = STATUS_META[a.status]
                        const catName = a.tasks?.categories?.name || ''
                        const catIcon = CAT_ICONS[catName] || 'cleaning_services'
                        const isDone = a.status === 'erledigt'
                        const isProb = a.status === 'problem'
                        return (
                          <div key={a.id} style={{ ...s.tcard, opacity: isDone ? 0.65 : 1 }}>
                            <div style={{ ...s.tcardIcon, background: isProb ? 'var(--err-bg)' : isDone ? 'var(--ok-bg)' : 'var(--surf-low)' }}>
                              <span className="material-symbols-outlined" style={{ color: isProb ? 'var(--err-dot)' : isDone ? '#166534' : 'var(--pri)' }}>{catIcon}</span>
                            </div>
                            <div style={{ flex: 1 }} onClick={() => setDetail(a)}>
                              <h4 style={{ ...s.tcardTitle, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--txt-muted)' : 'var(--txt)' }}>{a.tasks?.title}</h4>
                              <div style={s.tcardMeta}>
                                {catName && <span style={s.catBadge}>{catName}</span>}
                                <span style={s.tcardDue}>
                                  <span className="material-symbols-outlined icon-sm" style={{ color: due.urgent ? 'var(--err-dot)' : 'var(--txt-muted)' }}>schedule</span>
                                  <span style={{ color: due.urgent ? 'var(--err-dot)' : 'var(--txt-muted)', fontWeight: due.urgent ? 600 : 400 }}>{due.label}</span>
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ ...s.statusBadge, background: meta.bg, color: meta.color }}>
                                <span className="material-symbols-outlined icon-sm icon-fill">{meta.icon}</span>
                                {meta.label}
                              </span>
                              <button style={s.chevronBtn} onClick={() => setDetail(a)}>
                                <span className="material-symbols-outlined">chevron_right</span>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        {activeTab === 'zeit' && <ZeitTab userId={userId} myLeaves={myLeaves} vacationDaysPerYear={vacationDaysPerYear} assignments={assignments} onLeavesChanged={fetchMyLeaves} />}
        {activeTab === 'profile' && <ProfileTab userName={userName} initials={initials} onLogout={onLogout} userId={userId} pushEnabled={pushEnabled} pushSupported={pushSupported} onTogglePush={togglePush} onBugReport={()=>setShowBugReport(true)} />}
      </div>

      {/* Bottom nav */}
      <nav style={s.botNav}>
        {([
          { id: 'tasks',   icon: 'dashboard',      label: 'Aufgaben' },
          { id: 'zeit',    icon: 'calendar_month', label: 'Zeitplan' },
          { id: 'profile', icon: 'person',          label: 'Profil' },
        ] as const).map(item => {
          const isOn = activeTab === item.id
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ ...s.navItem, ...(isOn ? s.navItemOn : {}) }}>
              <span className={`material-symbols-outlined${isOn ? ' icon-fill' : ''}`} style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Detail overlay */}
      {detail && (
        <div style={s.overlay}>
          <header style={{ ...s.topBar, position: 'relative', backdropFilter: 'none', background: 'var(--surf-card)', borderBottom: '1px solid var(--outline)' }}>
            <div style={s.topBarInner}>
              <div style={s.topBarLeft}>
                <button style={s.backBtn} onClick={() => setDetail(null)}>
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-head)', color: 'var(--txt)' }}>{detail.tasks?.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{detail.tasks?.objects?.address}</div>
                </div>
              </div>
            </div>
          </header>

          <div style={s.detScroll}>
            {/* Info grid */}
            <p style={s.secLabel}>Auftragsdetails</p>
            <div style={s.infoGrid}>
              {[
                { icon: 'category', label: 'Kategorie', val: detail.tasks?.categories ? `${detail.tasks.categories.emoji} ${detail.tasks.categories.name}` : '–' },
                { icon: 'repeat', label: 'Rhythmus', val: detail.tasks?.interval || '–' },
                { icon: 'event', label: 'Fällig', val: formatDue(detail.due_date).label },
                { icon: 'info', label: 'Status', val: STATUS_META[detail.status]?.label || detail.status },
              ].map(({ icon, label, val }) => (
                <div key={label} style={s.infoCard}>
                  <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)', marginBottom: 6 }}>{icon}</span>
                  <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{val}</div>
                </div>
              ))}
            </div>

            {detail.tasks?.description && (
              <>
                <p style={{ ...s.secLabel, marginTop: 20 }}>Beschreibung & Umfang</p>
                <div style={s.descCard}>{detail.tasks.description}</div>
              </>
            )}

            {detail.tasks?.objects && (
              <>
                <p style={{ ...s.secLabel, marginTop: 20 }}>Objekt</p>
                <MapView
                  address={detail.tasks.objects.address}
                  city={detail.tasks.objects.city}
                  postalCode={detail.tasks.objects.postal_code}
                />
              </>
            )}

            {/* ICS-Export entfernt – Kalender über Profil → "Kalender abonnieren" */}
          </div>

          {detail.status !== 'erledigt' && detail.status !== 'problem' && detail.status !== 'vertretung' && (
            <div style={{ ...s.detFooter, flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:10, width:'100%' }}>
                <button style={s.btnWarn} onClick={() => { setSheetTask(detail); setSheetType('problem'); setSelectedOption('') }}>
                  <span className="material-symbols-outlined icon-sm">warning</span> Problem
                </button>
                <button style={s.btnPri} onClick={() => {
                  if (detail.status === 'offen') updateStatus(detail.id, 'in_arbeit')
                  else { setSheetTask(detail); setSheetType('complete'); setSelectedOption(''); setTravelMinutes(0); setCustomTravel('') }
                }}>
                  <span className="material-symbols-outlined icon-sm">{detail.status === 'offen' ? 'play_arrow' : 'check'}</span>
                  {detail.status === 'offen' ? 'Starten' : 'Abschließen'}
                </button>
              </div>
              {(detail.status === 'offen' || detail.status === 'in_arbeit') && (
                <button
                  style={{ width:'100%', padding:'11px 0', borderRadius:14, border:'1.5px solid #7c3aed', background:'rgba(124,58,237,0.07)', color:'#7c3aed', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer' }}
                  onClick={() => { setSheetTask(detail); setSheetType('vertretung'); setVertretungNote('') }}
                >
                  <span className="material-symbols-outlined icon-sm">swap_horiz</span> Vertretung anfragen
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Sheet */}
      {sheetTask && sheetType && (
        <div style={s.backdrop} onClick={() => { setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote(''); setVertretungNote(''); setTravelMinutes(0); setCustomTravel('') }}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <h3 style={s.sheetTitle}>
              {sheetType === 'complete' ? 'Aufgabe abschließen' : sheetType === 'vertretung' ? 'Vertretung anfragen' : 'Problem melden'}
            </h3>
            <p style={s.sheetSub}>{sheetTask.tasks?.title}</p>

            {sheetType === 'vertretung' && (
              <>
                <div style={{ background:'rgba(124,58,237,0.08)', borderRadius:12, padding:'12px 14px', marginBottom:14, fontSize:13, color:'#5b21b6', lineHeight:1.5 }}>
                  Die Aufgabe wird für alle Kollegen als "Vertretung gesucht" sichtbar. Ein Kollege kann sie dann übernehmen.
                </div>
                <div style={{ marginBottom:14 }}>
                  <textarea
                    value={vertretungNote}
                    onChange={e => setVertretungNote(e.target.value)}
                    placeholder="Warum brauchst du Vertretung? (optional)"
                    rows={3}
                    style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #7c3aed', background:'var(--surf-low)', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)', resize:'none', outline:'none', boxSizing:'border-box' }}
                    autoFocus
                  />
                </div>
                <button
                  disabled={updating}
                  onClick={confirmVertretung}
                  style={{ ...s.btnPri, width:'100%', justifyContent:'center', background:'linear-gradient(135deg,#5b21b6,#7c3aed)', boxShadow:'0 4px 14px rgba(91,33,182,0.3)', opacity:updating?0.6:1 }}
                >
                  {updating ? 'Wird gespeichert...' : 'Anbieten'}
                </button>
              </>
            )}

            {sheetType !== 'vertretung' && (
              <>
                {/* ── Arbeitszeit + Fahrzeit (nur bei Abschluss) ── */}
                {sheetType === 'complete' && (() => {
                  const startedAt = sheetTask.started_at ? new Date(sheetTask.started_at) : null
                  const workedMin = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : null
                  const workedStr = workedMin !== null
                    ? workedMin < 60 ? `${workedMin} Min.` : `${Math.floor(workedMin/60)} Std. ${workedMin%60} Min.`
                    : '–'
                  return (
                    <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
                      {workedMin !== null && (
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>timer</span>
                            <span style={{ fontSize:13, color:'var(--txt-sec)', fontWeight:600 }}>Arbeitszeit</span>
                          </div>
                          <span style={{ fontSize:15, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)' }}>{workedStr}</span>
                        </div>
                      )}
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14, verticalAlign:'middle', marginRight:4 }}>directions_car</span>
                        Fahrzeit (Hin + Rückfahrt)
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                        {[0, 15, 30, 45, 60].map(m => (
                          <button key={m} onClick={() => { setTravelMinutes(m); setCustomTravel('') }}
                            style={{ padding:'7px 14px', borderRadius:10, border:`1.5px solid ${travelMinutes===m && customTravel==='' ? 'var(--pri)' : 'var(--outline)'}`, background:travelMinutes===m && customTravel==='' ? 'var(--pri-xl)' : 'var(--surf-card)', color:travelMinutes===m && customTravel==='' ? 'var(--pri)' : 'var(--txt)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                            {m === 0 ? 'Keine' : `${m} Min.`}
                          </button>
                        ))}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)' }}>edit</span>
                        <input type="number" min={0} max={480} placeholder="Eigene Eingabe (min)" value={customTravel}
                          onChange={e => { setCustomTravel(e.target.value); setTravelMinutes(parseInt(e.target.value)||0) }}
                          style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--txt)' }} />
                        <span style={{ fontSize:12, color:'var(--txt-muted)' }}>min</span>
                      </div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {(sheetType === 'complete'
                    ? [{ val:'done', icon:'check_circle', label:'Erledigt', sub:'Alles wie vereinbart durchgeführt' },
                       { val:'photo', icon:'photo_camera', label:'Erledigt + Foto', sub:'Mit Fotodokumentation abschließen' }]
                    : [{ val:'Kein Zugang', icon:'lock', label:'Kein Zugang', sub:'Gebäude/Bereich nicht zugänglich' },
                       { val:'Schaden', icon:'build', label:'Schaden festgestellt', sub:'Defekt, Bruch, Wasserschaden o.ä.' },
                       { val:'Sonstiges', icon:'chat', label:'Sonstiges', sub:'Anderes Problem beschreiben' }]
                  ).map(o => (
                    <div key={o.val} onClick={() => setSelectedOption(o.val)} style={{ ...s.sheetOpt, borderColor: selectedOption===o.val ? (sheetType==='problem'?'var(--err-dot)':'var(--pri)') : 'var(--outline)', background: selectedOption===o.val ? (sheetType==='problem'?'var(--err-bg)':'var(--pri-xl)') : 'var(--surf-card)' }}>
                      <span className="material-symbols-outlined" style={{ color: sheetType==='problem' ? 'var(--err-dot)' : 'var(--pri)' }}>{o.icon}</span>
                      <div><div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div><div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{o.sub}</div></div>
                    </div>
                  ))}
                </div>
                {sheetType === 'problem' && selectedOption && (
                  <div style={{ marginBottom: 12 }}>
                    <textarea
                      value={problemNote}
                      onChange={e => setProblemNote(e.target.value)}
                      placeholder={selectedOption === 'Sonstiges' ? 'Was ist genau passiert? (Pflicht)' : 'Zusätzliche Details (optional)…'}
                      rows={3}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${selectedOption === 'Sonstiges' && !problemNote.trim() ? 'var(--err-dot)' : 'var(--outline)'}`, background: 'var(--surf-low)', fontSize: 14, color: 'var(--txt)', fontFamily: 'var(--font-body)', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                      autoFocus
                    />
                    {selectedOption === 'Sonstiges' && !problemNote.trim() && (
                      <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                        Bitte beschreibe das Problem kurz.
                      </div>
                    )}
                  </div>
                )}
                <button
                  disabled={!selectedOption || updating || photoUploading || (selectedOption === 'Sonstiges' && !problemNote.trim())}
                  onClick={confirmAction}
                  style={{ ...s.btnPri, width: '100%', justifyContent: 'center', opacity: (selectedOption && !(selectedOption === 'Sonstiges' && !problemNote.trim())) ? 1 : 0.4, background: sheetType==='problem' ? 'linear-gradient(135deg,#ba1a1a,#ef4444)' : undefined }}
                >
                  {(updating||photoUploading) ? 'Wird gespeichert...' : 'Bestätigen'}
                </button>
              </>
            )}

            <button onClick={() => { setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote(''); setVertretungNote(''); setTravelMinutes(0); setCustomTravel('') }} style={{ width:'100%', marginTop:8, padding:13, borderRadius:14, border:'none', background:'var(--surf-low)', color:'var(--txt-muted)', fontSize:14, fontWeight:600 }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {/* Vertretung Detail Sheet */}
      {vertretungDetail && (
        <div style={s.backdrop} onClick={() => setVertretungDetail(null)}>
          <div style={s.sheet} onClick={e => e.stopPropagation()}>
            <div style={s.sheetHandle} />
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:'rgba(124,58,237,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ color:'#7c3aed', fontSize:20 }}>swap_horiz</span>
              </div>
              <h3 style={{ ...s.sheetTitle, margin:0 }}>Vertretung übernehmen</h3>
            </div>
            <p style={s.sheetSub}>{vertretungDetail.tasks?.title}</p>
            <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', flexDirection:'column', gap:8 }}>
              {vertretungDetail.tasks?.objects && (
                <div style={{ display:'flex', gap:8, fontSize:13 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', flexShrink:0 }}>location_on</span>
                  <span style={{ color:'var(--txt)' }}>
                    {vertretungDetail.tasks.objects.address}, {vertretungDetail.tasks.objects.city}
                  </span>
                </div>
              )}
              <div style={{ display:'flex', gap:8, fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', flexShrink:0 }}>event</span>
                <span style={{ color:'var(--txt)' }}>
                  {new Date(vertretungDetail.due_date).toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' })}
                </span>
              </div>
              {vertretungDetail.tasks?.description && (
                <div style={{ display:'flex', gap:8, fontSize:13 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', flexShrink:0 }}>info</span>
                  <span style={{ color:'var(--txt-muted)' }}>{vertretungDetail.tasks.description}</span>
                </div>
              )}
            </div>
            <button
              disabled={takingOver}
              onClick={() => takeOverVertretung(vertretungDetail)}
              style={{ ...s.btnPri, width:'100%', justifyContent:'center', background:'linear-gradient(135deg,#5b21b6,#7c3aed)', boxShadow:'0 4px 14px rgba(91,33,182,0.3)', opacity:takingOver?0.6:1 }}
            >
              <span className="material-symbols-outlined icon-sm">check_circle</span>
              {takingOver ? 'Wird übernommen...' : 'Übernehmen'}
            </button>
            {availableVertretungen.length > 1 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Weitere Vertretungen</div>
                {availableVertretungen.filter(v => v.id !== vertretungDetail.id).map(v => (
                  <div key={v.id} onClick={() => setVertretungDetail(v)} style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:12, border:'1px solid var(--outline)', marginBottom:6, cursor:'pointer', background:'var(--surf-card)' }}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'#7c3aed', flexShrink:0, marginTop:1 }}>swap_horiz</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{v.tasks?.title}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{new Date(v.due_date).toLocaleDateString('de-DE')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setVertretungDetail(null)} style={{ width:'100%', marginTop:8, padding:13, borderRadius:14, border:'none', background:'var(--surf-low)', color:'var(--txt-muted)', fontSize:14, fontWeight:600 }}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* Onboarding Tour */}
      {showTour && <OnboardingTour onClose={() => setShowTour(false)} />}

      {/* Bug Report */}
      {showBugReport && <BugReport userId={userId} onClose={()=>setShowBugReport(false)} />}
      <PWAInstallBanner />

      {/* Success / Warning Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)',
          background: toast.type==='ok' ? '#166534' : '#92400e',
          color:'#fff', padding:'12px 20px', borderRadius:999,
          fontSize:14, fontWeight:700, zIndex:9998,
          display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 4px 20px rgba(0,0,0,0.2)',
          animation:'slideUp 0.25s ease',
          whiteSpace:'nowrap',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function ZeitTab({ userId, myLeaves, vacationDaysPerYear, assignments, onLeavesChanged }: {
  userId: string
  myLeaves: any[]
  vacationDaysPerYear: number
  assignments: any[]
  onLeavesChanged: () => Promise<void>
}) {
  const [section, setSection] = useState<'uebersicht'|'urlaub'|'krank'>('uebersicht')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null)
  const [conflictAssigns, setConflictAssigns] = useState<any[]>([])
  const [showConflict, setShowConflict] = useState(false)
  const [swapRequested, setSwapRequested] = useState<Set<string>>(new Set())
  const [editReq, setEditReq] = useState<any|null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [overviewYear, setOverviewYear] = useState(new Date().getFullYear())
  const [overviewMonth, setOverviewMonth] = useState<number|null>(null) // null = full year
  const requests = myLeaves

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSending(true); setMsg(null)
    const reqType = section === 'krank' ? 'krankmeldung' : 'urlaub'
    const { error } = await supabase.from('leave_requests').insert({ user_id: userId, from_date: from, to_date: to, request_type: reqType, note: note || null })
    if (!error) {
      // Check for affected task_assignments in this date range
      const { data: affected } = await supabase
        .from('task_assignments')
        .select('id,due_date,status,tasks(title,categories(emoji,name),objects(address,city))')
        .eq('user_id', userId)
        .gte('due_date', from)
        .lte('due_date', to)
        .in('status', ['offen', 'in_arbeit'])
        .order('due_date')
      if (affected && affected.length > 0) {
        setConflictAssigns(affected)
        setShowConflict(true)
      } else {
        setMsg({ text: section === 'krank' ? 'Krankmeldung wurde übermittelt.' : 'Urlaubsantrag wurde gesendet!', ok: true })
      }
      setFrom(''); setTo(''); setNote('')
      await onLeavesChanged()
    } else {
      setMsg({ text: error.message, ok: false })
    }
    setSending(false)
  }

  const requestSwap = async (assignId: string) => {
    await supabase.from('task_assignments').update({ status: 'vertretung' }).eq('id', assignId)
    setSwapRequested(prev => new Set([...prev, assignId]))
  }

  const ST: Record<string, {icon:string;color:string;label:string}> = {
    ausstehend: { icon:'hourglass_empty', color:'var(--warn)', label:'Ausstehend' },
    genehmigt:  { icon:'check_circle',    color:'var(--ok)',   label:'Genehmigt' },
    abgelehnt:  { icon:'cancel',          color:'var(--err)',  label:'Abgelehnt' },
  }

  return (
    <div>
      <h2 style={{ fontSize:22, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:4 }}>Zeitplan</h2>
      <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:18 }}>Urlaub, Krankmeldung & Verfügbarkeit</p>

      {/* Section tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {([
          { id:'uebersicht', icon:'bar_chart',    label:'Übersicht' },
          { id:'urlaub',     icon:'beach_access', label:'Urlaub' },
          { id:'krank',      icon:'sick',         label:'Krankmeldung' },
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setSection(t.id)} style={{ flex:1, padding:'10px 8px', borderRadius:14, border:`1.5px solid ${section===t.id?'var(--pri)':'var(--outline)'}`, background:section===t.id?'var(--pri-xl)':'var(--surf-card)', color:section===t.id?'var(--pri)':'var(--txt-muted)', fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:section===t.id?'var(--pri)':'var(--txt-muted)' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Übersicht ── */}
      {section === 'uebersicht' && (() => {
        const MONTH_NAMES = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
        const years = Array.from(new Set([new Date().getFullYear(), new Date().getFullYear()-1, ...(myLeaves.map((l:any)=>new Date(l.from_date).getFullYear()))])).sort((a,b)=>b-a)

        // Filter leaves by year (and optional month)
        const filteredLeaves = myLeaves.filter((l:any) => {
          const y = new Date(l.from_date).getFullYear()
          if (y !== overviewYear) return false
          if (overviewMonth !== null) {
            const m = new Date(l.from_date).getMonth()
            return m === overviewMonth
          }
          return true
        })

        // Calculate vacation days used (only genehmigt)
        const countDays = (l: any) => {
          let count = 0
          const cur = new Date(l.from_date)
          const end = new Date(l.to_date)
          while (cur <= end) { count++; cur.setDate(cur.getDate()+1) }
          return count
        }
        const urlaubDays = filteredLeaves.filter((l:any)=>l.request_type==='urlaub'&&l.status==='genehmigt').reduce((s:number,l:any)=>s+countDays(l),0)
        const urlaubPending = filteredLeaves.filter((l:any)=>l.request_type==='urlaub'&&l.status==='ausstehend').reduce((s:number,l:any)=>s+countDays(l),0)
        const krankDays = filteredLeaves.filter((l:any)=>l.request_type==='krankmeldung'&&l.status==='genehmigt').reduce((s:number,l:any)=>s+countDays(l),0)
        const urlaubLeft = Math.max(0, vacationDaysPerYear - urlaubDays - urlaubPending)

        // Work hours from assignments
        const workAssigns = assignments.filter((a:any) => {
          const y = new Date(a.due_date).getFullYear()
          if (y !== overviewYear) return false
          if (overviewMonth !== null) return new Date(a.due_date).getMonth() === overviewMonth
          return true
        })
        const workedMin = workAssigns
          .filter((a:any)=>a.status==='erledigt'&&a.started_at&&a.completed_at)
          .reduce((s:number,a:any)=>s+Math.round((new Date(a.completed_at).getTime()-new Date(a.started_at).getTime())/60000),0)
        const workedH = Math.floor(workedMin/60), workedM = workedMin%60

        return (
          <div>
            {/* ── Jahr-Chips ── */}
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              {years.map(y => (
                <button key={y} onClick={()=>setOverviewYear(y)}
                  style={{ flex:1, padding:'8px 4px', borderRadius:12, border:`1.5px solid ${overviewYear===y?'#2f7681':'var(--outline)'}`, background:overviewYear===y?'#2f7681':'var(--surf-card)', color:overviewYear===y?'#fff':'var(--txt-muted)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font-head)', transition:'all 0.12s' }}>
                  {y}
                </button>
              ))}
            </div>

            {/* ── Monat-Chips (horizontal scrollbar) ── */}
            <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:18, WebkitOverflowScrolling:'touch', scrollbarWidth:'none' }}>
              {[{label:'Gesamt', val:null}, ...MONTH_NAMES.map((m,i)=>({label:m, val:i}))].map(m => {
                const active = overviewMonth === m.val
                return (
                  <button key={String(m.val)} onClick={()=>setOverviewMonth(m.val)}
                    style={{ flexShrink:0, padding:'7px 14px', borderRadius:20, border:`1.5px solid ${active?'#2f7681':'var(--outline)'}`, background:active?'#2f7681':'var(--surf-card)', color:active?'#fff':'var(--txt-muted)', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.12s' }}>
                    {m.label}
                  </button>
                )
              })}
            </div>

            {/* KPI Grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {[
                { icon:'beach_access', color:'#2f7681', bg:'#e6f3f4', label:'Urlaub genommen', val:`${urlaubDays} Tage` },
                { icon:'event_available', color:'#b45309', bg:'#fff3cd', label:'Resturlaub', val:`${urlaubLeft} Tage` },
                { icon:'sick', color:'#e53935', bg:'#ffeaea', label:'Krank', val:krankDays > 0 ? `${krankDays} Tage` : '–' },
                { icon:'schedule', color:'#2f7681', bg:'#e6f3f4', label:'Gearbeitet', val: workedMin > 0 ? `${workedH}h ${workedM}m` : '–' },
              ].map(k=>(
                <div key={k.label} style={{ background:'var(--surf-card)', borderRadius:16, padding:'16px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1px solid var(--outline)' }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:k.color }}>{k.icon}</span>
                  </div>
                  <div style={{ fontSize:22, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', lineHeight:1 }}>{k.val}</div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4, fontWeight:600 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Urlaubskonto bar */}
            <div style={{ background:'var(--surf-card)', borderRadius:14, padding:'14px 16px', marginBottom:20, border:'1px solid var(--outline)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>Urlaubskonto {overviewYear}</span>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--pri)' }}>{urlaubLeft} / {vacationDaysPerYear} Tage übrig</span>
              </div>
              <div style={{ height:8, borderRadius:99, background:'var(--surf-high)', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,var(--pri),var(--pri-c))', width:`${Math.min(100,Math.round((urlaubDays/vacationDaysPerYear)*100))}%`, transition:'width 0.4s' }}/>
              </div>
              <div style={{ display:'flex', gap:12, marginTop:8, fontSize:11, color:'var(--txt-muted)' }}>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'var(--pri)', flexShrink:0 }}/>{urlaubDays} genommen</span>
                {urlaubPending > 0 && <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:2, background:'#f59e0b', flexShrink:0 }}/>{urlaubPending} ausstehend</span>}
              </div>
            </div>

            {/* Antragsverlauf */}
            {filteredLeaves.length > 0 && (
              <div>
                <h3 style={{ fontSize:13, fontWeight:700, color:'var(--txt-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Anträge</h3>
                {filteredLeaves.map((r:any)=>{
                  const isKrank = r.request_type==='krankmeldung'
                  const stColor: Record<string,string> = { genehmigt:'var(--ok)', ausstehend:'#b45309', abgelehnt:'var(--err-dot)' }
                  const stBg: Record<string,string> = { genehmigt:'var(--ok-bg)', ausstehend:'#fff3cd', abgelehnt:'#ffdad6' }
                  return (
                    <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, border:'1px solid var(--outline)', display:'flex', alignItems:'center', gap:10 }}>
                      <span className="material-symbols-outlined icon-fill" style={{ color: isKrank?'#e53935':'var(--pri)', flexShrink:0 }}>{isKrank?'sick':'beach_access'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{isKrank?'Krankmeldung':'Urlaub'} · {new Date(r.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – {new Date(r.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
                        {r.note && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>„{r.note}"</div>}
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:stBg[r.status]??'var(--surf-high)', color:stColor[r.status]??'var(--txt-muted)', display:'inline-block', marginTop:4 }}>{r.status==='genehmigt'?'Genehmigt':r.status==='ausstehend'?'Ausstehend':'Abgelehnt'}</span>
                      </div>
                      {/* Edit / Cancel buttons */}
                      {r.status !== 'abgelehnt' && (
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button onClick={()=>{setEditReq(r);setEditFrom(r.from_date);setEditTo(r.to_date);setEditNote(r.note??'')}}
                            style={{ padding:'6px 10px', borderRadius:9, border:'1px solid var(--outline)', background:'var(--surf-low)', fontSize:11, fontWeight:700, cursor:'pointer', color:'var(--txt)', display:'flex', alignItems:'center', gap:3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:13 }}>edit</span>
                          </button>
                          <button onClick={async()=>{
                            if (!confirm('Antrag stornieren?')) return
                            await supabase.from('leave_requests').delete().eq('id',r.id)
                            await onLeavesChanged()
                          }}
                            style={{ padding:'6px 10px', borderRadius:9, border:'1px solid var(--err-dot)', background:'transparent', fontSize:11, fontWeight:700, cursor:'pointer', color:'var(--err-dot)', display:'flex', alignItems:'center', gap:3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:13 }}>delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Urlaub */}
      {section === 'urlaub' && (
        <form onSubmit={submit} style={{ background:'var(--surf-card)', borderRadius:16, padding:18, marginBottom:20, boxShadow:'0 2px 12px rgba(8,93,104,0.06)' }}>
          <h3 style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', marginBottom:14 }}>Urlaub beantragen</h3>
          {[{label:'Von',val:from,set:setFrom},{label:'Bis',val:to,set:setTo}].map(f=>(
            <div key={f.label} style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>{f.label}</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                <input type="date" value={f.val} onChange={e=>f.set(e.target.value)} required style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14 }}/>
              </div>
            </div>
          ))}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Notiz</label>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>chat_bubble</span>
              <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="z.B. Familienurlaub" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14 }}/>
            </div>
          </div>
          {msg && <div style={{ background:msg.ok?'var(--ok-bg)':'var(--err-bg)', color:msg.ok?'var(--ok)':'var(--err)', borderRadius:10, padding:'11px 14px', fontSize:13, display:'flex', gap:8, marginBottom:14 }}>
            <span className="material-symbols-outlined icon-sm icon-fill">{msg.ok?'check_circle':'error'}</span>{msg.text}
          </div>}
          <button type="submit" disabled={sending} style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">{sending?'hourglass_empty':'send'}</span>{sending?'Wird gesendet...':'Urlaub beantragen'}
          </button>
        </form>
      )}

      {/* Krankmeldung */}
      {section === 'krank' && (
        <form onSubmit={submit} style={{ background:'var(--surf-card)', borderRadius:16, padding:18, marginBottom:20, boxShadow:'0 2px 12px rgba(8,93,104,0.06)' }}>
          <div style={{ background:'var(--err-bg)', borderRadius:12, padding:'12px 14px', marginBottom:16, display:'flex', gap:10 }}>
            <span className="material-symbols-outlined" style={{ color:'var(--err-dot)', flexShrink:0 }}>sick</span>
            <div style={{ fontSize:13, color:'var(--err)', lineHeight:1.5 }}>Bitte nur bei echter Erkrankung nutzen. Till wird sofort informiert.</div>
          </div>
          {[{label:'Erkrankt ab',val:from,set:setFrom},{label:'Voraussichtlich bis',val:to,set:setTo}].map(f=>(
            <div key={f.label} style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>{f.label}</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                <input type="date" value={f.val} onChange={e=>f.set(e.target.value)} required style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14 }}/>
              </div>
            </div>
          ))}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Anmerkung</label>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>chat_bubble</span>
              <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14 }}/>
            </div>
          </div>
          {msg && <div style={{ background:msg.ok?'var(--ok-bg)':'var(--err-bg)', color:msg.ok?'var(--ok)':'var(--err)', borderRadius:10, padding:'11px 14px', fontSize:13, display:'flex', gap:8, marginBottom:14 }}>
            <span className="material-symbols-outlined icon-sm icon-fill">{msg.ok?'check_circle':'error'}</span>{msg.text}
          </div>}
          <button type="submit" disabled={sending} style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,#ba1a1a,#ef4444)', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">{sending?'hourglass_empty':'sick'}</span>{sending?'Wird übermittelt...':'Krankmeldung senden'}
          </button>
        </form>
      )}

      {/* Verfügbarkeit */}
      {false && (
        <div style={{ background:'var(--surf-card)', borderRadius:16, padding:18, marginBottom:20, boxShadow:'0 2px 12px rgba(8,93,104,0.06)' }}>
          <h3 style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', marginBottom:6 }}>Verfügbarkeit</h3>
          <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:16 }}>Zeig Till wann du verfügbar bist.</p>
          <div style={{ background:'var(--pri-xl)', borderRadius:12, padding:'14px 16px', display:'flex', gap:10, alignItems:'center' }}>
            <span className="material-symbols-outlined" style={{ color:'var(--pri)', flexShrink:0 }}>construction</span>
            <div style={{ fontSize:13, color:'var(--pri)', fontWeight:600 }}>Kommt in Phase 3 – Wochenplan & Schichtplanung</div>
          </div>
        </div>
      )}

      {/* History (in urlaub/krank sections only) */}
      {(section==='urlaub'||section==='krank') && requests.length > 0 && (
        <>
          <h3 style={{ fontSize:13, fontWeight:700, color:'var(--txt-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Verlauf</h3>
          {requests.filter((r:any)=>section==='krank'?r.request_type==='krankmeldung':r.request_type==='urlaub').map((r:any)=>{
            const stColor: Record<string,string> = { genehmigt:'var(--ok)', ausstehend:'#b45309', abgelehnt:'var(--err-dot)' }
            const stBg: Record<string,string> = { genehmigt:'var(--ok-bg)', ausstehend:'#fff3cd', abgelehnt:'#ffdad6' }
            const isKrank = r.request_type === 'krankmeldung'
            return (
              <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, border:'1px solid var(--outline)', display:'flex', alignItems:'center', gap:10 }}>
                <span className="material-symbols-outlined icon-fill" style={{ color: isKrank ? '#e53935' : 'var(--pri)', flexShrink:0 }}>{isKrank?'sick':'beach_access'}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{isKrank?'Krankmeldung':'Urlaub'} · {new Date(r.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – {new Date(r.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}</div>
                  {r.note && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>„{r.note}"</div>}
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:stBg[r.status]??'var(--surf-high)', color:stColor[r.status]??'var(--txt-muted)', display:'inline-block', marginTop:4 }}>{r.status==='genehmigt'?'Genehmigt':r.status==='ausstehend'?'Ausstehend':'Abgelehnt'}</span>
                </div>
                {r.status !== 'abgelehnt' && (
                  <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                    <button onClick={()=>{setEditReq(r);setEditFrom(r.from_date);setEditTo(r.to_date);setEditNote(r.note??'')}}
                      style={{ padding:'6px 9px', borderRadius:9, border:'1px solid var(--outline)', background:'var(--surf-low)', cursor:'pointer', color:'var(--txt)', display:'flex', alignItems:'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:14 }}>edit</span>
                    </button>
                    <button onClick={async()=>{
                      if (!confirm('Antrag stornieren?')) return
                      await supabase.from('leave_requests').delete().eq('id',r.id)
                      await onLeavesChanged()
                    }}
                      style={{ padding:'6px 9px', borderRadius:9, border:'1px solid var(--err-dot)', background:'transparent', cursor:'pointer', color:'var(--err-dot)', display:'flex', alignItems:'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:14 }}>delete</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── Edit Overlay ── */}
      {editReq && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', padding:'20px 18px 32px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Antrag bearbeiten</h3>
              <button onClick={()=>setEditReq(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--txt-sec)', display:'block', marginBottom:4 }}>Von</label>
                <input type="date" value={editFrom} onChange={e=>setEditFrom(e.target.value)}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)', boxSizing:'border-box' }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'var(--txt-sec)', display:'block', marginBottom:4 }}>Bis</label>
                <input type="date" value={editTo} onChange={e=>setEditTo(e.target.value)}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--txt-sec)', display:'block', marginBottom:4 }}>Notiz (optional)</label>
              <input type="text" value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Grund, Reise, …"
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)', boxSizing:'border-box' }} />
            </div>
            <button disabled={editSaving||!editFrom||!editTo} onClick={async()=>{
              setEditSaving(true)
              await supabase.from('leave_requests').update({ from_date:editFrom, to_date:editTo, note:editNote||null, status:'ausstehend' }).eq('id',editReq.id)
              await onLeavesChanged()
              setEditReq(null)
              setEditSaving(false)
            }}
              style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:editSaving?0.6:1 }}>
              {editSaving ? 'Wird gespeichert…' : 'Änderungen speichern'}
            </button>
            <p style={{ textAlign:'center', fontSize:11, color:'var(--txt-muted)', marginTop:10 }}>Geänderte Anträge werden erneut zur Genehmigung vorgelegt.</p>
          </div>
        </div>
      )}

      {/* ── Urlaubskonflikt Modal ── */}
      {showConflict && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:400, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px', flexShrink:0 }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }} />
            </div>
            <div style={{ padding:'8px 18px 14px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--outline)', flexShrink:0 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'var(--warn-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ color:'var(--warn)' }}>warning</span>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)' }}>Betroffene Termine</div>
                <div style={{ fontSize:12, color:'var(--txt-muted)' }}>Du hast {conflictAssigns.length} offene Termin{conflictAssigns.length > 1 ? 'e' : ''} im Abwesenheitszeitraum</div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>
              <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:14, lineHeight:1.5 }}>
                Dein Antrag wurde gespeichert. Bitte klär die folgenden Termine ab – du kannst Vertretung anfragen oder den Admin informieren.
              </p>
              {conflictAssigns.map((a:any) => {
                const done = swapRequested.has(a.id)
                return (
                  <div key={a.id} style={{ background:'var(--surf-card)', borderRadius:12, padding:'12px 14px', marginBottom:10, border:'1px solid var(--outline)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{a.tasks?.categories?.emoji || '📋'}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{a.tasks?.title}</div>
                        <div style={{ fontSize:11, color:'var(--txt-muted)' }}>
                          {a.tasks?.objects?.address} · {new Date(a.due_date).toLocaleDateString('de-DE', {weekday:'short', day:'2-digit', month:'2-digit'})}
                        </div>
                      </div>
                      {done && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--ok)' }}>check_circle</span>}
                    </div>
                    {!done && (
                      <button onClick={() => requestSwap(a.id)} style={{ width:'100%', padding:'10px', borderRadius:10, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                        <span className="material-symbols-outlined icon-sm">swap_horiz</span>
                        Vertretung anfragen
                      </button>
                    )}
                    {done && (
                      <div style={{ fontSize:12, color:'var(--ok)', fontWeight:600, textAlign:'center', padding:'6px 0' }}>
                        Vertretungsanfrage gesendet – andere MAs sehen diesen Termin jetzt in der Tauschbörse
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ padding:'14px 18px', borderTop:'1px solid var(--outline)', flexShrink:0 }}>
              <button onClick={() => { setShowConflict(false); setConflictAssigns([]); setSwapRequested(new Set()); setMsg({ text: 'Antrag gespeichert!', ok:true }) }} style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function ProfileTab({ userName, initials, onLogout, userId, pushEnabled, pushSupported, onTogglePush, onBugReport }: {
  userName:string; initials:string; onLogout:()=>void; userId:string;
  pushEnabled:boolean; pushSupported:boolean; onTogglePush:()=>void; onBugReport:()=>void
}) {
  const [showGuide, setShowGuide] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const [calToken, setCalToken] = useState<string|null>(null)
  const [calLoading, setCalLoading] = useState(false)
  const [calCopied, setCalCopied] = useState(false)
  const [showCalInfo, setShowCalInfo] = useState(false)

  const SUPABASE_URL = 'https://hdemkyonurqfcohhfbgj.supabase.co'

  const loadOrCreateCalToken = async () => {
    setCalLoading(true)
    setShowCalInfo(true)
    const { data: existing } = await supabase.from('calendar_tokens').select('token').eq('user_id', userId).maybeSingle()
    if (existing?.token) {
      setCalToken(existing.token)
      setCalLoading(false)
      return
    }
    const { data: created } = await supabase.from('calendar_tokens').insert({ user_id: userId }).select('token').single()
    if (created?.token) setCalToken(created.token)
    setCalLoading(false)
  }

  const calFeedUrl = calToken ? `${SUPABASE_URL}/functions/v1/cal-feed?token=${calToken}` : ''
  const webcalUrl = calFeedUrl.replace('https://', 'webcal://')

  const copyCalLink = () => {
    navigator.clipboard.writeText(calFeedUrl).then(() => {
      setCalCopied(true); setTimeout(() => setCalCopied(false), 2500)
    })
  }

  // Konto-State
  const [email, setEmailState] = useState('')
  const [showPwForm, setShowPwForm] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw1, setShowPw1] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ok:boolean;text:string}|null>(null)

  // Eigene Daten bearbeiten
  const [showDataForm, setShowDataForm] = useState(false)
  const [editName, setEditName] = useState(userName)
  const [editPhone, setEditPhone] = useState('')
  const [editHomeAddress, setEditHomeAddress] = useState('')
  const [dataSaving, setDataSaving] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ok:boolean;text:string}|null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmailState(data.user.email)
    })
    supabase.from('users').select('phone,full_name,home_address').eq('id', userId).single().then(({ data }) => {
      if (data?.phone) setEditPhone(data.phone)
      if (data?.full_name) setEditName(data.full_name)
      if (data?.home_address) setEditHomeAddress(data.home_address)
    })
  }, [userId])

  const handlePwSave = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg(null)
    if (pw1.length < 8) { setPwMsg({ok:false, text:'Mindestens 8 Zeichen erforderlich.'}); return }
    if (pw1 !== pw2)    { setPwMsg({ok:false, text:'Passwörter stimmen nicht überein.'}); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) { setPwMsg({ok:false, text:error.message}) }
    else {
      setPwMsg({ok:true, text:'Passwort erfolgreich geändert!'})
      setPw1(''); setPw2('')
      setTimeout(() => { setShowPwForm(false); setPwMsg(null) }, 2000)
    }
    setPwSaving(false)
  }

  const handleDataSave = async (e: React.FormEvent) => {
    e.preventDefault(); setDataMsg(null)
    if (!editName.trim()) { setDataMsg({ok:false, text:'Name darf nicht leer sein.'}); return }
    setDataSaving(true)
    // Geocode home address if changed
    let geoUpdate: {home_lat?: number, home_lng?: number} = {}
    const addrTrimmed = editHomeAddress.trim()
    if (addrTrimmed) {
      try {
        const q = encodeURIComponent(addrTrimmed + ', Deutschland')
        const gr = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, { headers:{ 'User-Agent':'SteuberWork/1.0' } })
        const gj = await gr.json()
        if (gj?.[0]) { geoUpdate = { home_lat: parseFloat(gj[0].lat), home_lng: parseFloat(gj[0].lon) } }
      } catch {}
    }
    const { error } = await supabase.from('users').update({ full_name: editName.trim(), phone: editPhone.trim() || null, home_address: addrTrimmed || null, ...geoUpdate }).eq('id', userId)
    if (error) { setDataMsg({ok:false, text:error.message}) }
    else { setDataMsg({ok:true, text:'Daten gespeichert!'}); setTimeout(() => { setShowDataForm(false); setDataMsg(null) }, 2000) }
    setDataSaving(false)
  }

  const pwInputRow = (icon: string, placeholder: string, value: string, setValue: (v:string)=>void, show: boolean, setShow: (v:boolean)=>void) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
      <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{icon}</span>
      <input type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} required
        style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
      <button type="button" onClick={() => setShow(!show)} style={{ background:'none', border:'none', cursor:'pointer', padding:2, color:'var(--txt-muted)', display:'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize:18 }}>{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  )

  const Row = ({ icon, iconBg, label, sub, chevron, right, onClick, last }: {
    icon:string; iconBg:string; label:string; sub?:string; chevron?:boolean;
    right?: React.ReactNode; onClick?:()=>void; last?:boolean
  }) => (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px',
      borderBottom: last ? 'none' : '1px solid var(--outline)', cursor:onClick?'pointer':'default' }}>
      <div style={{ width:34, height:34, borderRadius:10, background:iconBg,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>{icon}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{sub}</div>}
      </div>
      {right}
      {chevron && <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>chevron_right</span>}
    </div>
  )

  return (
    <div style={{ paddingBottom:32 }}>

      {/* ── Compact Profile Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 4px', marginBottom:8 }}>
        <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--pri)', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:17, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)' }}>{initials}</div>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)', letterSpacing:'-0.01em' }}>{userName}</div>
          <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>Steuber Dienstleistungen GmbH</div>
        </div>
      </div>

      {/* ── Konto ── */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, paddingLeft:4 }}>Konto</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden', border:'1px solid var(--outline)', marginBottom:20 }}>
        {/* E-Mail */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', borderBottom:'1px solid var(--outline)' }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>mail</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>E-Mail</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{email || '…'}</div>
          </div>
        </div>

        {/* Persönliche Daten bearbeiten */}
        <div style={{ borderBottom:'1px solid var(--outline)' }}>
          <div onClick={() => { setShowDataForm(f=>!f); setDataMsg(null) }} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background: showDataForm ? 'var(--pri-xl)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color: showDataForm ? 'var(--pri)' : 'var(--pri)' }}>person_edit</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color: showDataForm ? 'var(--pri)' : 'var(--txt)' }}>Meine Daten</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Name und Telefonnummer</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform: showDataForm ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
          </div>
          {showDataForm && (
            <form onSubmit={handleDataSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10, borderTop:'1px solid var(--outline)' }}>
              <div style={{ height:4 }} />
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>person</span>
                <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Vor- und Nachname" required
                  style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>phone</span>
                <input type="tel" value={editPhone} onChange={e=>setEditPhone(e.target.value)} placeholder="+49 160 12345678"
                  style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>home</span>
                <input type="text" value={editHomeAddress} onChange={e=>setEditHomeAddress(e.target.value)} placeholder="Heimadresse (für Routenplanung)"
                  style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }} />
              </div>
              </div>
              {dataMsg && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background: dataMsg.ok ? 'var(--ok-bg)' : 'var(--err-bg)', color: dataMsg.ok ? 'var(--ok)' : 'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm icon-fill">{dataMsg.ok ? 'check_circle' : 'error'}</span>{dataMsg.text}
              </div>}
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>{setShowDataForm(false);setDataMsg(null)}} style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button type="submit" disabled={dataSaving} style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined icon-sm">{dataSaving?'hourglass_empty':'save'}</span>{dataSaving?'…':'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Passwort ändern */}
        <div>
          <div onClick={() => { setShowPwForm(f=>!f); setPwMsg(null); setPw1(''); setPw2('') }} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background: showPwForm ? 'var(--pri-xl)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>lock</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color: showPwForm ? 'var(--pri)' : 'var(--txt)' }}>Passwort ändern</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Neues Passwort festlegen</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform: showPwForm ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
          </div>
          {showPwForm && (
            <form onSubmit={handlePwSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10, borderTop:'1px solid var(--outline)' }}>
              <div style={{ height:4 }} />
              {pwInputRow('lock', 'Neues Passwort (mind. 8 Zeichen)', pw1, setPw1, showPw1, setShowPw1)}
              {pwInputRow('lock_reset', 'Passwort wiederholen', pw2, setPw2, showPw2, setShowPw2)}
              {pwMsg && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background: pwMsg.ok ? 'var(--ok-bg)' : 'var(--err-bg)', color: pwMsg.ok ? 'var(--ok)' : 'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm icon-fill">{pwMsg.ok ? 'check_circle' : 'error'}</span>{pwMsg.text}
              </div>}
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>{setShowPwForm(false);setPwMsg(null)}} style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button type="submit" disabled={pwSaving||!pw1||!pw2} style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:(pw1&&pw2&&!pwSaving)?'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)':'var(--outline)', color:(pw1&&pw2)?'#fff':'var(--txt-muted)', fontSize:14, fontWeight:700, cursor:(pw1&&pw2)?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined icon-sm">{pwSaving?'hourglass_empty':'check'}</span>{pwSaving?'…':'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Kalender ── */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:8, paddingLeft:4 }}>Kalender</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden',
        border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row icon="calendar_month" iconBg="var(--pri-xl)" label="Kalender abonnieren"
          sub="Alle Aufgaben automatisch im Kalender"
          chevron onClick={loadOrCreateCalToken} last />
        {showCalInfo && (
          <div style={{ padding:'4px 16px 16px' }}>
            {calLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 0', color:'var(--txt-muted)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm">hourglass_empty</span>
                Link wird generiert…
              </div>
            ) : calToken ? (<>
              <div style={{ background:'var(--surf-low)', borderRadius:10, padding:'10px 12px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ flex:1, fontSize:11, color:'var(--txt)', wordBreak:'break-all', fontFamily:'monospace', lineHeight:1.5 }}>{calFeedUrl}</span>
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                <button onClick={copyCalLink} style={{ flex:1, padding:'10px', borderRadius:10, border:'none', background: calCopied ? 'var(--ok)' : 'var(--pri)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined icon-sm">{calCopied ? 'check' : 'content_copy'}</span>
                  {calCopied ? 'Kopiert!' : 'Link kopieren'}
                </button>
                <a href={webcalUrl} style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, textDecoration:'none' }}>
                  <span className="material-symbols-outlined icon-sm">open_in_new</span>
                  Direkt öffnen
                </a>
              </div>
              <div style={{ fontSize:12, color:'var(--txt-muted)', lineHeight:1.6 }}>
                <div style={{ fontWeight:700, color:'var(--txt-sec)', marginBottom:6, fontSize:13 }}>So richtest du es ein:</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontWeight:700, color:'var(--pri)', minWidth:20 }}>📱</span>
                    <span><strong>iPhone/iPad:</strong> Tippe auf "Direkt öffnen" – iOS fragt automatisch ob du abonnieren möchtest. Oder: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen → Link einfügen.</span>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontWeight:700, color:'var(--pri)', minWidth:20 }}>🤖</span>
                    <span><strong>Android:</strong> Google Kalender → + → Über URL → Link einfügen.</span>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontWeight:700, color:'var(--pri)', minWidth:20 }}>💻</span>
                    <span><strong>Outlook/Mac:</strong> Neuer Kalender → Aus Internet abonnieren → Link einfügen.</span>
                  </div>
                </div>
                <div style={{ marginTop:10, padding:'8px 10px', background:'var(--pri-xl)', borderRadius:8, display:'flex', gap:8 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', flexShrink:0 }}>info</span>
                  <span style={{ color:'var(--pri)', fontSize:11 }}>Der Kalender aktualisiert sich automatisch stündlich. Alle deine Aufgaben erscheinen als Ganztagesereignisse.</span>
                </div>
              </div>
            </>) : null}
          </div>
        )}
      </div>

      {/* ── Einstellungen ── */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:8, paddingLeft:4 }}>Einstellungen</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden',
        border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row
          icon="notifications" iconBg="var(--pri-xl)" label="Push-Benachrichtigungen"
          sub={!pushSupported ? 'Nicht unterstützt' : pushEnabled ? 'Aktiv' : 'Deaktiviert'}
          right={pushSupported ? (
            <button onClick={e=>{ e.stopPropagation(); onTogglePush() }}
              style={{ width:46, height:26, borderRadius:999, border:'none', cursor:'pointer',
                background:pushEnabled ? 'var(--pri)' : '#c8d0d1', position:'relative',
                transition:'background 0.2s', flexShrink:0 }}>
              <span style={{ position:'absolute', top:3, left:pushEnabled?23:3, width:20, height:20,
                borderRadius:'50%', background:'#fff', transition:'left 0.2s',
                boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
            </button>
          ) : undefined}
          last
        />
        {!pushSupported && /iPad|iPhone|iPod/.test(navigator.userAgent) && (
          <div style={{ margin:'0 16px 14px', background:'var(--warn-bg)', borderRadius:10,
            padding:'10px 12px', fontSize:12, color:'var(--warn)', lineHeight:1.5 }}>
            iOS: Füge die App zuerst zum Homescreen hinzu (Teilen → Zum Homescreen).
          </div>
        )}
      </div>

      {/* ── Hilfe ── */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:8, paddingLeft:4 }}>Hilfe & Info</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden',
        border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row icon="menu_book" iconBg="var(--pri-xl)" label="App-Tour" sub="Interaktiver Rundgang"
          chevron onClick={()=>setShowGuide(!showGuide)} />
        {showGuide && (
          <div style={{ padding:'4px 16px 16px', borderBottom:'1px solid var(--outline)' }}>
            {[
              { icon:'task_alt', title:'Aufgaben erledigen', desc:'Tippe auf eine Aufgabe für Details. Kreis links zum Abhaken, oder "Starten" wenn du beginnst.' },
              { icon:'warning', title:'Problem melden', desc:'Kein Zugang? Schaden? Aufgabe → "Problem" → Grund auswählen. Till wird informiert.' },
              { icon:'swap_horiz', title:'Vertretung anfragen', desc:'Wenn du verhindert bist, kannst du über das Drei-Punkte-Menü eine Vertretung anfragen.' },
              { icon:'calendar_month', title:'Woche navigieren', desc:'Pfeile oben zum Wechseln. Punkte unter dem Tag zeigen Aufgaben an.' },
              { icon:'beach_access', title:'Urlaub beantragen', desc:'Im Tab "Zeitplan" Urlaub und Krankmeldungen übermitteln.' },
            ].map((g,i,arr)=>(
              <div key={g.title} style={{ display:'flex', gap:12, paddingTop:14, paddingBottom:14,
                borderBottom: i<arr.length-1 ? '1px solid var(--outline)' : 'none' }}>
                <div style={{ width:32, height:32, borderRadius:9, background:'var(--pri-xl)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--pri)' }}>{g.icon}</span>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{g.title}</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', lineHeight:1.6 }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <Row icon="install_mobile" iconBg="var(--pri-xl)" label="App installieren" sub="iOS & Android Anleitung"
          chevron onClick={()=>setShowInstall(!showInstall)} />
        {showInstall && (
          <div style={{ padding:'4px 16px 16px', borderBottom:'1px solid var(--outline)' }}>
            <InstallGuide />
          </div>
        )}
        <Row icon="replay" iconBg="var(--pri-xl)" label="App-Tour wiederholen"
          chevron onClick={()=>{ resetTour(); window.location.reload() }} last />
      </div>

      {/* ── Sonstiges ── */}
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden',
        border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row icon="bug_report" iconBg="rgba(186,26,26,0.08)" label="Fehler melden"
          sub="Problem in der App mitteilen" chevron onClick={onBugReport} last />
      </div>

      {/* ── Logout ── */}
      <button onClick={onLogout} style={{ width:'100%', padding:'14px', borderRadius:16,
        border:'none', background:'rgba(186,26,26,0.08)', color:'var(--err-dot)',
        fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <span className="material-symbols-outlined icon-sm">logout</span> Abmelden
      </button>
    </div>
  )
}


const s: Record<string, React.CSSProperties> = {
  shell: { display:'flex', flexDirection:'column', height:'100dvh', maxWidth:480, margin:'0 auto', background:'var(--bg)', position:'relative', overflow:'hidden' },
  appHead: { background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', flexShrink:0, borderRadius:'0 0 22px 22px', boxShadow:'0 4px 20px rgba(8,93,104,0.18)', zIndex:10, position:'relative' as const },
  topBar: { position:'sticky', top:0, zIndex:50, background:'rgba(248,249,250,0.8)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(191,200,202,0.4)', flexShrink:0 },
  topBarInner: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px' },
  topBarLeft: { display:'flex', alignItems:'center', gap:10 },
  topAva: { width:36, height:36, borderRadius:'50%', background:'var(--sec-c)', color:'var(--pri)', fontSize:13, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-head)' },
  topTitle: { fontSize:18, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)', letterSpacing:'-0.03em' },
  iconBtn: { background:'none', border:'none', padding:8, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' },
  content: { flex:1, overflowY:'auto', padding:'0 16px 24px' },
  welcomeSec: { padding:'20px 0 12px' },
  welcomeHead: { fontSize:26, fontWeight:800, fontFamily:'var(--font-head)', letterSpacing:'-0.03em', marginBottom:4 },
  welcomeSub: { fontSize:14, color:'var(--txt-muted)' },
  bento: { display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:20 },
  bentoMain: { background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:20, padding:'20px 18px', minHeight:140, display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow:'0 8px 24px rgba(8,93,104,0.2)' },
  bentoLabel: { fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 },
  bentoNum: { fontSize:18, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)', lineHeight:1.2 },
  bentoPills: { display:'flex', gap:8, flexWrap:'wrap', marginTop:12 },
  bentoPill: { display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.15)', padding:'4px 10px', borderRadius:999, fontSize:11, color:'#fff', fontWeight:500 },
  bentoPillDot: { width:7, height:7, borderRadius:'50%', background:'#fff', flexShrink:0 },
  bentoSide: { background:'var(--surf-card)', borderRadius:20, padding:'18px 16px', display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow:'0 2px 12px rgba(8,93,104,0.06)' },
  bentoCatLabel: { fontSize:11, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' },
  bentoBigNum: { fontSize:36, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)', lineHeight:1 },
  bentoBar: { height:6, borderRadius:999, background:'var(--surf-high)', overflow:'hidden', marginTop:10 },
  bentoBarFill: { height:'100%', borderRadius:999, background:'var(--pri)', transition:'width 0.4s ease' },
  weekWrap: { background:'var(--surf-card)', borderRadius:20, padding:'12px 8px', marginBottom:20, boxShadow:'0 2px 12px rgba(8,93,104,0.05)' },
  weekStrip: { display:'flex', gap:2, overflowX:'auto', scrollbarWidth:'none' },
  wday: { display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 10px', borderRadius:14, cursor:'pointer', flexShrink:0, transition:'background 0.15s', minWidth:42 },
  wdName: { fontSize:9, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' },
  wdNum: { fontSize:15 },
  wdDot: { width:4, height:4, borderRadius:'50%' },
  secHead: { marginBottom:12 },
  secTitle: { fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' },
  secLabel: { fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 },
  empty: { display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 20px', gap:10 },
  emptyTxt: { fontSize:15, fontWeight:700, color:'var(--txt-muted)', fontFamily:'var(--font-head)' },
  emptySub: { fontSize:13, color:'var(--txt-muted)', opacity:0.7 },
  groupHead: { display:'flex', alignItems:'center', gap:6, marginBottom:10 },
  groupName: { fontSize:12, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.05em' },
  tcard: { background:'var(--surf-card)', borderRadius:16, padding:'14px 14px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 8px rgba(8,93,104,0.06)', transition:'transform 0.15s' },
  tcardIcon: { width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  tcardTitle: { fontSize:14, fontWeight:700, fontFamily:'var(--font-head)', marginBottom:6 },
  tcardMeta: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
  catBadge: { fontSize:10, fontWeight:600, background:'var(--sec-c)', color:'var(--pri)', padding:'2px 8px', borderRadius:999, opacity:0.9 },
  tcardDue: { display:'flex', alignItems:'center', gap:3, fontSize:11 },
  statusBadge: { display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:999, whiteSpace:'nowrap', flexShrink:0 },
  chevronBtn: { background:'none', border:'none', padding:4, color:'var(--txt-muted)', display:'flex', alignItems:'center', flexShrink:0 },
  botNav: { background:'rgba(248,249,250,0.85)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderTop:'1px solid rgba(191,200,202,0.4)', display:'flex', justifyContent:'space-around', padding:'8px 8px calc(16px + env(safe-area-inset-bottom, 0px))', flexShrink:0, boxShadow:'0 -8px 24px rgba(8,93,104,0.06)' },
  navItem: { display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 20px', borderRadius:14, border:'none', background:'transparent', color:'#6b7a7b', cursor:'pointer', transition:'all 0.15s' },
  navItemOn: { background:'var(--pri)', color:'#fff', boxShadow:'0 4px 12px rgba(8,93,104,0.25)' },
  overlay: { position:'absolute', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', zIndex:100, overflow:'hidden' },
  backBtn: { background:'var(--surf-low)', border:'none', width:36, height:36, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt)', cursor:'pointer', flexShrink:0 },
  detScroll: { flex:1, overflowY:'auto', padding:18 },
  infoGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  infoCard: { background:'var(--surf-low)', borderRadius:14, padding:'14px', border:'1px solid var(--outline)', display:'flex', flexDirection:'column' },
  descCard: { background:'var(--surf-card)', borderRadius:14, padding:16, border:'1px solid var(--outline)', fontSize:14, lineHeight:1.7, color:'var(--txt)' },
  detFooter: { padding:'14px 18px 20px', borderTop:'1px solid var(--outline)', display:'flex', gap:10, flexShrink:0, background:'var(--surf-card)' },
  btnWarn: { flex:1, padding:13, borderRadius:14, border:'1.5px solid var(--err-dot)', background:'transparent', color:'var(--err-dot)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 },
  btnPri: { flex:2, padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6, boxShadow:'0 4px 14px rgba(8,93,104,0.25)' },
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:200, display:'flex', alignItems:'flex-end' },
  sheet: { background:'var(--surf-card)', width:'100%', borderRadius:'24px 24px 0 0', padding:'18px 18px 32px', boxShadow:'0 -8px 40px rgba(0,0,0,0.15)' },
  sheetHandle: { width:36, height:4, borderRadius:2, background:'var(--outline)', margin:'0 auto 20px' },
  sheetTitle: { fontSize:18, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:6 },
  sheetSub: { fontSize:13, color:'var(--txt-muted)', marginBottom:18 },
  sheetOpt: { display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:'1.5px solid var(--outline)', cursor:'pointer', transition:'all 0.15s' },
}

// ─── Kalender-Export (ICS) ────────────────────────────────────────────────────
async function exportToCalendar(assignment: any) {
  const task     = assignment.tasks
  const obj      = task?.objects
  const customer = obj?.customers
  const title    = task?.title    || 'Aufgabe'
  const taskDesc = task?.description || ''
  const interval = task?.interval || 'einmalig'

  const locParts = [obj?.address, obj?.postal_code, obj?.city].filter(Boolean)
  const loc      = locParts.join(', ')

  // Ansprechpartner laden
  let contactLine = ''
  if (customer?.id) {
    try {
      const { supabase } = await import('../lib/supabase')
      const { data: contacts } = await supabase
        .from('contact_persons')
        .select('name, phone, role')
        .eq('customer_id', customer.id)
        .limit(1)
      if (contacts && contacts.length > 0) {
        const cp = contacts[0]
        contactLine = `Ansprechpartner: ${cp.name}${cp.role ? ` (${cp.role})` : ''}${cp.phone ? ` · ${cp.phone}` : ''}`
      }
    } catch { /* ignore */ }
  }

  const descParts = [
    taskDesc,
    customer?.name ? `Kunde: ${customer.name}` : '',
    contactLine,
    loc ? `Objekt: ${loc}` : '',
  ].filter(Boolean)
  const descText = descParts.join('\n')

  const [y, m, d] = assignment.due_date.split('-').map(Number)
  const dtStart   = `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`
  const nextDay   = new Date(y, m - 1, d + 1)
  const dtEnd     = `${nextDay.getFullYear()}${String(nextDay.getMonth()+1).padStart(2,'0')}${String(nextDay.getDate()).padStart(2,'0')}`

  const rruleMap: Record<string, string> = {
    'täglich':       'RRULE:FREQ=DAILY',
    'wöchentlich':   'RRULE:FREQ=WEEKLY',
    'monatlich':     'RRULE:FREQ=MONTHLY',
    'quartalsweise': 'RRULE:FREQ=MONTHLY;INTERVAL=3',
  }
  const rrule = rruleMap[interval] || ''

  const uid   = `${assignment.id}@steuberwork`
  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SteuberWork//SteuberWork App//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SteuberWork',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${icsEsc(title)}${obj?.address ? ' – ' + icsEsc(obj.address) : ''}`,
    descText ? `DESCRIPTION:${icsEsc(descText)}` : '',
    loc      ? `LOCATION:${icsEsc(loc)}`         : '',
    rrule    ? rrule                              : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '-')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function icsEsc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

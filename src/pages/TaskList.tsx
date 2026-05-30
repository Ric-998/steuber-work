import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { supabase } from '../lib/supabase'
import { OnboardingTour, InstallGuide, useOnboarding, resetTour } from '../components/OnboardingTour'
import { WasIstNeu } from '../components/WasIstNeu'
import { PWAInstallBanner } from '../components/PWAInstallBanner'
import BugReport from '../components/BugReport'
import FeedbackSheet from '../components/FeedbackSheet'
import { ChatTab, useChatUnread } from '../components/Chat'
const MapView = lazy(() => import('../components/MapView'))
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
    categories?: { emoji: string; name: string } | null
    objects: { address: string; city: string } | null
  } | null
  users?: { full_name: string } | null
}

export default function TaskList({ userId, userName, onLogout }: Props) {
  const [assignments, setAssignments] = useState<TaskAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'start'|'tasks'|'zeit'|'chat'|'profile'>('start')
  const [selectedDay, setSelectedDay] = useState(new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [detail, setDetail] = useState<TaskAssignment | null>(null)
  const [sheetTask, setSheetTask] = useState<TaskAssignment | null>(null)
  const [sheetType, setSheetType] = useState<'complete'|'problem'|'vertretung'|null>(null)
  const [selectedOption, setSelectedOption] = useState('')
  const [problemNote, setProblemNote] = useState('')
  const [problemUrgent, setProblemUrgent] = useState(false)
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
  const [monthOffset, setMonthOffset] = useState(0)
  const [showKonfetti, setShowKonfetti] = useState(false)
  const [monthSheetOpen, setMonthSheetOpen] = useState(false)
  const [objectSheetObj, setObjectSheetObj] = useState<any>(null)

  // Tauschbörse state
  const [availableVertretungen, setAvailableVertretungen] = useState<VertretungItem[]>([])
  const [ownVertretungen, setOwnVertretungen] = useState<VertretungItem[]>([])
  const [cancellingVertretung, setCancellingVertretung] = useState<string|null>(null)
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
  const chatUnread = useChatUnread(userId)
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
  const [showFeedback, setShowFeedback] = useState(false)
  const [showFeedbackNudge, setShowFeedbackNudge] = useState(false)
  const initials = userName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()

  // Feedback-Nudge: nach jeweils 10 App-Öffnungen Toast zeigen
  useEffect(() => {
    const KEY_COUNT = 'sw_app_opens'
    const KEY_LAST = 'sw_nudge_last'
    const count = parseInt(localStorage.getItem(KEY_COUNT) || '0') + 1
    localStorage.setItem(KEY_COUNT, String(count))
    const lastNudge = parseInt(localStorage.getItem(KEY_LAST) || '0')
    if (count - lastNudge >= 10) {
      localStorage.setItem(KEY_LAST, String(count))
      setTimeout(() => setShowFeedbackNudge(true), 3000)
    }
  }, [])

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
    const [othersRes, ownRes] = await Promise.all([
      supabase
        .from('task_assignments')
        .select('id,due_date,status,user_id,tasks(title,description,categories(emoji,name),objects(address,city)),users!task_assignments_user_id_fkey(full_name)')
        .eq('status', 'vertretung')
        .neq('user_id', userId),
      supabase
        .from('task_assignments')
        .select('id,due_date,status,user_id,tasks(title,description,categories(emoji,name),objects(address,city))')
        .eq('status', 'vertretung')
        .eq('user_id', userId)
    ])
    if (othersRes.data) setAvailableVertretungen(othersRes.data as unknown as VertretungItem[])
    if (ownRes.data) setOwnVertretungen(ownRes.data as unknown as VertretungItem[])
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
      .select(`*, tasks(id,title,description,interval,categories(id,name,emoji),objects(id,name,address,city,postal_code,access_note,parking_note,floor_info,notes,customers(id,name)))`)
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
      setAssignments(prev => {
        const next = prev.map((a: TaskAssignment) => a.id === id ? { ...a, ...updates } : a)
        if (status === 'erledigt') {
          const todayStr2 = new Date().toISOString().split('T')[0]
          const todayAll = next.filter((a: TaskAssignment) => a.due_date === todayStr2)
          if (todayAll.length > 0 && todayAll.every((a: TaskAssignment) => a.status === 'erledigt')) {
            setTimeout(() => { setShowKonfetti(true); setTimeout(() => setShowKonfetti(false), 3200) }, 200)
          }
        }
        return next
      })
      if (detail?.id === id) setDetail(prev => prev ? { ...prev, ...updates } : prev)
    }
    setUpdating(false); setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote(''); setProblemUrgent(false)
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
          const pushTitle = problemUrgent ? '🚨 DRINGEND: Problem gemeldet' : '⚠ Problem gemeldet'
          for (const admin of (admins ?? [])) {
            await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
              body: JSON.stringify({
                user_id: admin.id,
                title: pushTitle,
                body: `${taskTitle}${objAddr ? ' · ' + objAddr : ''}: ${problemNoteText}`,
                tag: 'problem-' + sheetTask.id,
                requireInteraction: problemUrgent,
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
    const originalUserId = item.user_id
    const { error } = await supabase
      .from('task_assignments')
      .update({ user_id: userId, status: 'offen' })
      .eq('id', item.id)
    if (!error) {
      setAvailableVertretungen(prev => prev.filter(v => v.id !== item.id))
      setVertretungDetail(null)
      showToast('Aufgabe übernommen!', 'ok')
      // Push notification to original MA
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await fetch(`https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({
              user_id: originalUserId,
              title: 'Vertretung übernommen ✅',
              body: `${item.tasks?.title || 'Deine Aufgabe'} am ${new Date(item.due_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} wurde von einem Kollegen übernommen.`,
            })
          })
        }
      } catch(e) { /* push optional */ }
      await fetchAssignments()
      await fetchVertretungen()
    } else {
      showToast('Fehler beim Übernehmen', 'warn')
    }
    setTakingOver(false)
  }

  const cancelVertretung = async (id: string) => {
    setCancellingVertretung(id)
    const { error } = await supabase
      .from('task_assignments')
      .update({ status: 'offen' })
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) {
      setOwnVertretungen(prev => prev.filter(v => v.id !== id))
      showToast('Vertretungsangebot zurückgezogen', 'ok')
      await fetchAssignments()
    } else {
      showToast('Fehler beim Zurückziehen', 'warn')
    }
    setCancellingVertretung(null)
  }

  return (
    <div style={s.shell}>
      {/* Konfetti overlay */}
      {showKonfetti && <Konfetti />}
      {/* ── TOP BAR: teal, only name + date + bell ── */}
      <header style={s.appHead}>
        <div style={s.topBarInner}>
          <div style={s.topLogo}>
            <span style={s.topLogoBold}>STEUBER</span>
            <span style={s.topLogoLight}>WORK</span>
          </div>
          <div style={s.topAva} onClick={() => setActiveTab('profile')}>{initials}</div>
        </div>
      </header>


      {/* Content */}
      <div style={{ ...s.content, paddingTop: activeTab === 'start' ? 12 : activeTab === 'tasks' ? 0 : undefined, padding: activeTab === 'chat' ? '0 14px' : undefined }}>
        {activeTab === 'start' && (() => {
          const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
          const todayAll = assignments.filter(a => a.due_date === todayStr2)
          const todayOpen2 = todayAll.filter(a => a.status==='offen'||a.status==='in_arbeit').length
          const todayDone2 = todayAll.filter(a => a.status==='erledigt').length
          const todayProb2 = todayAll.filter(a => a.status==='problem').length
          const todayTotal2 = todayAll.length
          const hour = new Date().getHours()
          const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : 'Guten Abend'
          const pct = todayTotal2 > 0 ? Math.round((todayDone2/todayTotal2)*100) : 0
          const dayName = today.toLocaleDateString('de-DE', { weekday:'long' })
          const dayNum = today.getDate()
          const monthStr2 = today.toLocaleDateString('de-DE', { month:'long' })

          // Mo–Sa strip (6 days from Monday of current week)
          const mondayOffset = (today.getDay() + 6) % 7
          const weekStrip = Array.from({length:6}, (_:unknown, i:number) => {
            const d = new Date(today); d.setDate(today.getDate() - mondayOffset + i)
            const ds = d.toISOString().split('T')[0]
            const dt = assignments.filter(a => a.due_date === ds)
            return { d, ds, count:dt.length, hasProb:dt.some(a=>a.status==='problem'), allDone:dt.length>0&&dt.every(a=>a.status==='erledigt') }
          })

          // Mitteilungen from leave requests (recent status changes)
          const mitteilungen = myLeaves.slice(0,4).map((l:any) => ({
            id: l.id,
            icon: l.request_type==='krankmeldung' ? 'sick' : l.status==='genehmigt' ? 'beach_access' : 'event_busy',
            accent: l.status==='genehmigt' ? 'green' : l.status==='abgelehnt' ? 'red' : 'amber',
            title: l.status==='genehmigt' ? (l.request_type==='krankmeldung'?'Krankmeldung erfasst':'Urlaubsantrag genehmigt')
                 : l.status==='abgelehnt' ? 'Urlaubsantrag abgelehnt'
                 : l.request_type==='krankmeldung' ? 'Krankmeldung eingereicht' : 'Urlaubsantrag eingereicht',
            body: `${new Date(l.from_date).toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'})} – ${new Date(l.to_date).toLocaleDateString('de-DE',{day:'numeric',month:'long'})}${l.note ? ' · '+l.note : ''}`,
            unread: l.status === 'genehmigt' || l.status === 'abgelehnt',
          }))

          // Problem-Aufgaben als Mitteilungen
          const probAssignments = todayAll.filter(a=>a.status==='problem').slice(0,2).map(a=>({
            id: 'prob_'+a.id,
            icon: 'warning',
            accent: 'red',
            title: 'Problem gemeldet: '+a.tasks?.title,
            body: a.tasks?.objects?.address || '',
            unread: false,
          }))

          const allMitt = [...probAssignments, ...mitteilungen].slice(0,5)
          const unreadCount = allMitt.filter(n=>n.unread).length

          return (
            <div style={{ paddingBottom:8 }}>
              {/* ── Clean Greeting ── */}
              <div style={{ padding:'20px 0 16px' }}>
                <div style={{ fontSize:13, color:'var(--txt-muted)', fontWeight:600, marginBottom:6 }}>
                  {greeting}, {firstName} 👋
                </div>
                <div style={{ fontSize:28, fontWeight:800, fontFamily:'Manrope,sans-serif', letterSpacing:'-0.03em', color:'var(--txt)', lineHeight:1.1, marginBottom:4 }}>
                  {dayName}
                </div>
                <div style={{ fontSize:13, color:'var(--txt-muted)', marginBottom: todayTotal2 > 0 && todayOpen2 > 0 ? 10 : 0 }}>
                  {dayNum}. {monthStr2}{todayTotal2 > 0 ? ` · ${todayOpen2 === 0 ? 'Alles erledigt ✓' : `${todayOpen2} offen`}` : ''}
                </div>
                {todayTotal2 > 0 && todayOpen2 > 0 && (
                  <div style={{ height:3, borderRadius:99, background:'var(--surf-high)', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99, background:'var(--pri)', width:`${pct}%`, transition:'width 0.6s' }}/>
                  </div>
                )}
              </div>

              {/* ── Wochenstreifen ── */}
              <div style={{ display:'flex', gap:5, marginBottom:18 }}>
                {weekStrip.map(({ d, ds, count, hasProb, allDone }) => {
                  const isToday3 = ds === todayStr2
                  const DAY_ABBR2 = ['So','Mo','Di','Mi','Do','Fr','Sa']
                  const dotColor = hasProb ? 'var(--err)' : allDone ? 'var(--ok)' : 'var(--txt-muted)'
                  return (
                    <div key={ds}
                      onClick={() => { setSelectedDay(new Date(ds+'T12:00:00')); setActiveTab('tasks') }}
                      style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:14, cursor:'pointer',
                        background: isToday3 ? 'var(--pri)' : 'var(--surf-card)',
                        border: isToday3 ? 'none' : '1px solid var(--outline)',
                        boxShadow: isToday3 ? '0 4px 12px rgba(9,106,112,0.2)' : 'none',
                      }}>
                      <span style={{ fontSize:9, fontWeight:700, color: isToday3 ? 'rgba(255,255,255,0.75)' : 'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{DAY_ABBR2[d.getDay()]}</span>
                      <span style={{ fontSize:15, fontWeight:800, fontFamily:'Manrope,sans-serif', color: isToday3 ? '#fff' : 'var(--txt)' }}>{d.getDate()}</span>
                      {count > 0
                        ? <span style={{ width:5, height:5, borderRadius:'50%', background: isToday3 ? 'rgba(255,255,255,0.8)' : dotColor }}/>
                        : <span style={{ width:5, height:5 }}/>}
                    </div>
                  )
                })}
              </div>

              <div style={{ padding:'0' }}>
                {/* KPI-Kacheln */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
                  <button onClick={() => { setSelectedDay(new Date(todayStr2+'T12:00:00')); setActiveTab('tasks') }}
                    style={{ background:'var(--surf-card)', border:'1px solid var(--outline)', borderRadius:16, padding:'14px 10px', cursor:'pointer', textAlign:'center', boxShadow:'0 1px 6px rgba(9,106,112,0.05)' }}>
                    <div style={{ fontSize:26, fontWeight:800, fontFamily:'Manrope,sans-serif', color:'var(--pri)', lineHeight:1 }}>{todayOpen2}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4, fontWeight:600 }}>Offen</div>
                  </button>
                  <button onClick={() => { setSelectedDay(new Date(todayStr2+'T12:00:00')); setActiveTab('tasks') }}
                    style={{ background: todayDone2 > 0 ? 'var(--ok-bg)' : 'var(--surf-card)', border:`1px solid ${todayDone2 > 0 ? '#b6dec5' : 'var(--outline)'}`, borderRadius:16, padding:'14px 10px', cursor:'pointer', textAlign:'center', boxShadow:'0 1px 6px rgba(9,106,112,0.05)' }}>
                    <div style={{ fontSize:26, fontWeight:800, fontFamily:'Manrope,sans-serif', color: todayDone2 > 0 ? 'var(--ok)' : 'var(--txt-muted)', lineHeight:1 }}>{todayDone2}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4, fontWeight:600 }}>Erledigt</div>
                  </button>
                  <button onClick={() => { setSelectedDay(new Date(todayStr2+'T12:00:00')); setActiveTab('tasks') }}
                    style={{ background: todayProb2 > 0 ? 'var(--err-bg)' : 'var(--surf-card)', border:`1px solid ${todayProb2 > 0 ? '#fca5a5' : 'var(--outline)'}`, borderRadius:16, padding:'14px 10px', cursor:'pointer', textAlign:'center', boxShadow:'0 1px 6px rgba(9,106,112,0.05)' }}>
                    <div style={{ fontSize:26, fontWeight:800, fontFamily:'Manrope,sans-serif', color: todayProb2 > 0 ? 'var(--err)' : 'var(--txt-muted)', lineHeight:1 }}>{todayProb2}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4, fontWeight:600 }}>Probleme</div>
                  </button>
                </div>

                {/* Mitteilungen */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Mitteilungen</div>
                    {unreadCount > 0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:'var(--pri-xl)', color:'var(--pri)' }}>{unreadCount} neu</span>}
                  </div>
                  {allMitt.length === 0 ? (
                    <div style={{ background:'var(--surf-card)', borderRadius:12, padding:'18px', textAlign:'center', border:'1px solid var(--outline)', color:'var(--txt-muted)', fontSize:13 }}>
                      Keine neuen Mitteilungen
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {allMitt.map((n:any) => {
                        const ACCENT: Record<string, {bg:string;fg:string}> = {
                          green:{bg:'var(--ok-bg)',fg:'var(--ok)'},
                          teal:{bg:'var(--pri-xl)',fg:'var(--pri)'},
                          amber:{bg:'#fff8e6',fg:'#92400e'},
                          red:{bg:'var(--err-bg)',fg:'var(--err-dot)'},
                        }
                        const ac = ACCENT[n.accent] || ACCENT.teal
                        return (
                          <div key={n.id} style={{ background:'var(--surf-card)', borderRadius:12, padding:'11px 12px', border:'1px solid var(--outline)', display:'flex', gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:10, background:ac.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <span className="material-symbols-outlined icon-fill" style={{ fontSize:17, color:ac.fg }}>{n.icon}</span>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                {n.unread && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--pri)', flexShrink:0 }}/>}
                                <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n.title}</div>
                              </div>
                              {n.body && <div style={{ fontSize:12, color:'var(--txt-muted)', lineHeight:1.4 }}>{n.body}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}


      {activeTab === 'tasks' && (() => {
          const DAY_FULL = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
          const selStr = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth()+1).padStart(2,'0')}-${String(selectedDay.getDate()).padStart(2,'0')}`
          const todayStr2 = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
          const isTodaySelected = selStr === todayStr2
          const shiftDay = (n: number) => { const d = new Date(selectedDay); d.setDate(d.getDate()+n); setSelectedDay(d) }
          const dayTotal = filteredByDay.length
          const dayDone = filteredByDay.filter((a: TaskAssignment) => a.status === 'erledigt').length
          const dayProgress = dayTotal > 0 ? Math.round((dayDone/dayTotal)*100) : 0
          return (
          <>
            {/* ── Wochenstreifen ── */}
            {(() => {
              const mondayOffset = (selectedDay.getDay() + 6) % 7
              const weekDays = Array.from({length:6}, (_:unknown, i:number) => {
                const d = new Date(selectedDay)
                d.setDate(selectedDay.getDate() - mondayOffset + i)
                const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                const dayAssignments = assignments.filter((a:any) => a.due_date === ds)
                return { d, ds, count: dayAssignments.length, hasProb: dayAssignments.some((a:any)=>a.status==='problem'), allDone: dayAssignments.length>0&&dayAssignments.every((a:any)=>a.status==='erledigt') }
              })
              const DAY_ABBR = ['So','Mo','Di','Mi','Do','Fr','Sa']
              const kw = (() => { const d=new Date(selectedDay); d.setHours(0,0,0,0); d.setDate(d.getDate()+4-(d.getDay()||7)); const y=new Date(d.getFullYear(),0,1); return Math.ceil(((d.getTime()-y.getTime())/86400000+1)/7) })()
              return (
                <div style={{ marginTop:12, marginBottom:14 }}>
                  {/* Header Zeile */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={() => shiftDay(-7)} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)' }}>chevron_left</span>
                      </button>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--txt-muted)' }}>KW {kw}</span>
                      <button onClick={() => shiftDay(7)} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)' }}>chevron_right</span>
                      </button>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {!isTodaySelected && (
                        <button onClick={() => setSelectedDay(new Date())} style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99, border:'1px solid var(--pri)', background:'transparent', color:'var(--pri)', cursor:'pointer' }}>
                          Heute
                        </button>
                      )}
                      <button onClick={() => setMonthSheetOpen(true)} style={{ width:28, height:28, borderRadius:8, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)' }}>calendar_month</span>
                      </button>
                    </div>
                  </div>
                  {/* Tages-Streifen */}
                  <div style={{ display:'flex', gap:5 }}>
                    {weekDays.map(({ d, ds, count, hasProb, allDone }) => {
                      const isSelected = ds === selStr
                      const isToday = ds === todayStr2
                      const dotColor = hasProb ? 'var(--err)' : allDone ? 'var(--ok)' : 'rgba(255,255,255,0.8)'
                      return (
                        <div key={ds} onClick={() => setSelectedDay(new Date(ds+'T12:00:00'))}
                          style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 4px', borderRadius:14, cursor:'pointer', transition:'all 0.15s',
                            background: isSelected ? 'var(--pri)' : 'var(--surf-card)',
                            border: isSelected ? 'none' : isToday ? '1.5px solid var(--pri)' : '1px solid var(--outline)',
                            boxShadow: isSelected ? '0 4px 12px rgba(9,106,112,0.22)' : 'none',
                          }}>
                          <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--txt-muted)' }}>{DAY_ABBR[d.getDay()]}</span>
                          <span style={{ fontSize:15, fontWeight:800, fontFamily:'Manrope,sans-serif', color: isSelected ? '#fff' : isToday ? 'var(--pri)' : 'var(--txt)' }}>{d.getDate()}</span>
                          {count > 0
                            ? <span style={{ width:5, height:5, borderRadius:'50%', background: isSelected ? dotColor : hasProb ? 'var(--err)' : allDone ? 'var(--ok)' : 'var(--outline)' }}/>
                            : <span style={{ width:5, height:5 }}/>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* ── Fortschritt (slim) ── */}
            {dayTotal > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                  <span style={{ fontSize:12, fontWeight:600, color: dayProgress===100 ? 'var(--ok)' : 'var(--txt-muted)' }}>
                    {dayProgress===100 ? 'Alle erledigt ✓' : `${dayDone} von ${dayTotal} erledigt`}
                  </span>
                  <span style={{ fontSize:12, fontWeight:700, color: dayProgress===100 ? 'var(--ok)' : 'var(--pri)' }}>{dayProgress}%</span>
                </div>
                <div style={{ height:4, borderRadius:99, background:'var(--surf-high)', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:99, background: dayProgress===100 ? 'var(--ok)' : 'var(--pri)', width:`${dayProgress}%`, transition:'width 0.5s' }}/>
                </div>
              </div>
            )}

            {/* Vertretungen Banner */}
            {availableVertretungen.length > 0 && (
              <div
                onClick={() => setVertretungDetail(availableVertretungen[0])}
                style={{ display:'flex', alignItems:'center', gap:12, background:'linear-gradient(135deg,var(--pri),var(--pri-c))', borderRadius:16, padding:'14px 16px', marginBottom:14, cursor:'pointer', boxShadow:'0 4px 16px rgba(9,106,112,0.22)' }}
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





            {/* Task list */}
            {loading ? (
              <div style={s.empty}><span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--txt-muted)', opacity: 0.4 }}>hourglass_empty</span><p style={s.emptyTxt}>Wird geladen...</p></div>
            ) : filteredByDay.length === 0 ? (
              (() => {
                const dStr2 = `${selectedDay.getFullYear()}-${String(selectedDay.getMonth()+1).padStart(2,'0')}-${String(selectedDay.getDate()).padStart(2,'0')}`
                const activLeave = myLeaves.find((l: any) => l.status !== 'abgelehnt' && dStr2 >= l.from_date && dStr2 <= l.to_date)
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
                return (
                  <div style={{ background:'var(--surf-card)', borderRadius:16, padding:36, textAlign:'center', border:'1px solid var(--outline)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:42, color:'var(--outline)', display:'block', marginBottom:8 }}>event_available</span>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>Kein Einsatz</div>
                    <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:4 }}>Für diesen Tag sind keine Aufgaben geplant.</div>
                  </div>
                )
              })()
            ) : (
              <>
                {filteredByDay.some((a: TaskAssignment) => a.status === 'offen' || a.status === 'in_arbeit') && (
                  <div style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:13, color:'var(--pri)', opacity:0.7 }}>swipe</span>
                    <span style={{ opacity:0.7 }}>Wischen zum Abschließen oder Melden</span>
                  </div>
                )}
                {sortedGroupEntries.map(([objectKey, tasks], groupIdx) => {
                  const groupCount = sortedGroupEntries.length
                  const obj = (tasks[0] as TaskAssignment).tasks?.objects
                  return (
                    <div key={(tasks[0] as TaskAssignment).id} style={{ marginBottom:18 }}>
                      {/* Object group header */}
                      <button onClick={() => obj && setObjectSheetObj(obj)}
                        style={{ width:'100%', display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'8px 10px', borderRadius:12, background:'transparent', border:'none', cursor: obj ? 'pointer' : 'default', textAlign:'left' }}>
                        <div style={{ width:32, height:32, borderRadius:9, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, borderLeft:'3px solid var(--pri)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--pri)' }}>apartment</span>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', display:'flex', alignItems:'center', gap:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {obj ? (obj.name && obj.name !== obj.address ? obj.name : `${obj.address}, ${obj.city}`) : 'Objekt unbekannt'}
                            {obj && <span className="material-symbols-outlined" style={{ fontSize:14, color:'var(--txt-muted)', flexShrink:0 }}>arrow_forward_ios</span>}
                          </div>
                          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {[obj?.postal_code, obj?.city].filter(Boolean).join(' ')} · {tasks.length} Aufgabe{tasks.length>1?'n':''}
                          </div>
                        </div>
                        {groupCount > 1 && (
                          <div style={{ display:'flex', gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
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
                      </button>
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {(tasks as TaskAssignment[]).map(a => {
                          const due = formatDue(a.due_date)
                          const meta = STATUS_META[a.status]
                          const catName = a.tasks?.categories?.name || ''
                          const catIcon = CAT_ICONS[catName] || 'cleaning_services'
                          return (
                            <SwipeableTaskCard
                              key={a.id} a={a} meta={meta} due={due} catIcon={catIcon} catName={catName}
                              onOpenDetail={() => setDetail(a)}
                              onSwipeRight={() => {
                                if (a.status === 'offen') updateStatus(a.id, 'in_arbeit')
                                else { setSheetTask(a); setSheetType('complete'); setSelectedOption(''); setTravelMinutes(0); setCustomTravel('') }
                              }}
                              onSwipeLeft={() => { setSheetTask(a); setSheetType('problem'); setSelectedOption(''); setProblemNote(''); setProblemUrgent(false) }}
                              onInlineStart={() => updateStatus(a.id, 'in_arbeit')}
                              onInlineComplete={() => { setSheetTask(a); setSheetType('complete'); setSelectedOption(''); setTravelMinutes(0); setCustomTravel('') }}
                              onInlineProblem={() => { setSheetTask(a); setSheetType('problem'); setSelectedOption(''); setProblemNote(''); setProblemUrgent(false) }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </>
          )
        })()}

        {activeTab === 'zeit' && <ZeitTab userId={userId} myLeaves={myLeaves} vacationDaysPerYear={vacationDaysPerYear} assignments={assignments} onLeavesChanged={fetchMyLeaves} availableVertretungen={availableVertretungen} ownVertretungen={ownVertretungen} onTakeOver={takeOverVertretung} onCancelVertretung={cancelVertretung} takingOver={takingOver} cancellingVertretung={cancellingVertretung} />}
        {activeTab === 'chat' && <ChatTab currentUserName={userName} currentUserId={userId} />}
        {activeTab === 'profile' && <ProfileTab userName={userName} initials={initials} onLogout={onLogout} userId={userId} pushEnabled={pushEnabled} pushSupported={pushSupported} onTogglePush={togglePush} onBugReport={()=>setShowBugReport(true)} onFeedback={()=>setShowFeedback(true)} />}
      </div>
      {/* MonthSheet */}
      <MonthSheet
        open={monthSheetOpen}
        anchorDate={selectedDay}
        assignments={assignments}
        myLeaves={myLeaves}
        onClose={() => setMonthSheetOpen(false)}
        onSelectDay={(d) => {
          setSelectedDay(d)
          setWeekOffset(Math.round((d.getTime() - new Date().getTime()) / (7*24*3600*1000)))
          setMonthSheetOpen(false)
        }}
      />

      {/* ObjectSheet */}
      {objectSheetObj && (
        <ObjectSheet
          obj={objectSheetObj}
          onClose={() => setObjectSheetObj(null)}
        />
      )}

      {/* Bottom nav */}
      <nav style={s.botNav}>
        {([
          { id: 'start',   icon: 'home',           label: 'Start' },
          { id: 'tasks',   icon: 'task_alt',        label: 'Aufgaben' },
          { id: 'chat',    icon: 'chat_bubble',     label: 'Chat',   badge: chatUnread },
          { id: 'zeit',    icon: 'calendar_month',  label: 'Zeitplan' },
          { id: 'profile', icon: 'person',          label: 'Profil' },
        ] as const).map(item => {
          const isOn = activeTab === item.id
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ ...s.navItem, ...(isOn ? s.navItemOn : {}), position: 'relative' }}>
              <span className={`material-symbols-outlined${isOn ? ' icon-fill' : ''}`} style={{ fontSize: 22 }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</span>
              {'badge' in item && (item as any).badge > 0 && <span style={{ position: 'absolute', top: 4, right: 8, minWidth: 16, height: 16, borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{(item as any).badge}</span>}
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
                <Suspense fallback={<div style={{height:160,borderRadius:16,background:'var(--surf-low)'}}/>}>
                  <MapView
                  address={detail.tasks.objects.address}
                  city={detail.tasks.objects.city}
                  postalCode={detail.tasks.objects.postal_code}
                />
                </Suspense>
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
        <div style={s.backdrop} onClick={() => { setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote(''); setProblemUrgent(false); setVertretungNote(''); setTravelMinutes(0); setCustomTravel('') }}>
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

                {/* ── COMPLETE OPTIONS ── */}
                {sheetType === 'complete' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {([{ val:'done', icon:'check_circle', label:'Erledigt', sub:'Alles wie vereinbart durchgeführt' },
                      { val:'photo', icon:'photo_camera', label:'Erledigt + Foto', sub:'Mit Fotodokumentation abschließen' }
                    ] as const).map(o => (
                      <div key={o.val} onClick={() => setSelectedOption(o.val)} style={{ ...s.sheetOpt, borderColor: selectedOption===o.val ? 'var(--pri)' : 'var(--outline)', background: selectedOption===o.val ? 'var(--pri-xl)' : 'var(--surf-card)' }}>
                        <span className="material-symbols-outlined" style={{ color: 'var(--pri)' }}>{o.icon}</span>
                        <div><div style={{ fontSize: 14, fontWeight: 600 }}>{o.label}</div><div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{o.sub}</div></div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── PROBLEM OPTIONS (neue Design-Version) ── */}
                {sheetType === 'problem' && (
                  <>
                    {/* Info-Hinweis */}
                    <div style={{ fontSize: 12, color: '#92400e', background: '#fff8e6', borderRadius: 10, padding: '9px 12px', marginBottom: 14, border: '1px solid #f4e3b8', display: 'flex', gap: 8, lineHeight: 1.45, alignItems: 'flex-start' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>info</span>
                      <span>Till bekommt sofort eine Push-Nachricht — je mehr Infos, desto schneller die Hilfe.</span>
                    </div>

                    {/* Problemtyp-Chips */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Was ist los?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
                      {(['Schlüssel fehlt', 'Kein Zugang', 'Schaden / Defekt', 'Reinigungsmittel fehlt', 'Nicht anwesend', 'Sonstiges'] as const).map((opt, idx) => {
                        const icons = ['vpn_key','lock','build','cleaning_services','person_off','chat']
                        const on = selectedOption === opt
                        return (
                          <button key={opt} onClick={() => setSelectedOption(opt)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, border: on ? '1.5px solid var(--err-dot)' : '1px solid var(--outline)', background: on ? 'var(--err-bg)' : 'var(--surf-card)', color: on ? 'var(--err-dot)' : 'var(--txt)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icons[idx]}</span>
                            {opt}
                          </button>
                        )
                      })}
                    </div>

                    {/* Notiz */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Notiz an Till (optional)</div>
                    <textarea
                      value={problemNote}
                      onChange={e => setProblemNote(e.target.value)}
                      placeholder="z.B. Wo genau, was du brauchst, ob du weiterarbeiten kannst…"
                      rows={2}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--outline)', background: 'var(--surf-low)', fontSize: 14, color: 'var(--txt)', fontFamily: 'var(--font-body)', resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
                    />

                    {/* Dringlichkeit-Toggle */}
                    <div onClick={() => setProblemUrgent((u: boolean) => !u)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: `1px solid ${problemUrgent ? '#fca5a5' : 'var(--outline)'}`, background: problemUrgent ? 'var(--err-bg)' : 'var(--surf-card)', marginBottom: 16, cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: problemUrgent ? 'var(--err-dot)' : 'var(--txt-muted)' }}>priority_high</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: problemUrgent ? 'var(--err-dot)' : 'var(--txt)' }}>Dringend</div>
                        <div style={{ fontSize: 11, color: problemUrgent ? 'var(--err-dot)' : 'var(--txt-muted)', marginTop: 1 }}>Till wird mit Notruf-Push benachrichtigt</div>
                      </div>
                      <div style={{ width: 42, height: 24, borderRadius: 999, background: problemUrgent ? 'var(--err-dot)' : '#D7DEE0', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: problemUrgent ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </div>
                    </div>
                  </>
                )}

                <button
                  disabled={!selectedOption || updating || photoUploading}
                  onClick={confirmAction}
                  style={{ ...s.btnPri, width: '100%', justifyContent: 'center', opacity: selectedOption ? 1 : 0.4, background: sheetType==='problem' ? (problemUrgent ? 'linear-gradient(135deg,#7f1d1d,#ef4444)' : 'linear-gradient(135deg,#ba1a1a,#ef4444)') : undefined }}
                >
                  {(updating||photoUploading) ? 'Wird gespeichert...' : sheetType==='problem' ? (problemUrgent ? 'Senden · Notruf an Till' : 'Senden · Till informieren') : 'Bestätigen'}
                </button>
              </>
            )}

            <button onClick={() => { setSheetTask(null); setSheetType(null); setSelectedOption(''); setProblemNote(''); setProblemUrgent(false); setVertretungNote(''); setTravelMinutes(0); setCustomTravel('') }} style={{ width:'100%', marginTop:8, padding:13, borderRadius:14, border:'none', background:'var(--surf-low)', color:'var(--txt-muted)', fontSize:14, fontWeight:600 }}>
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
      <WasIstNeu role="mitarbeiter" />

      {/* Bug Report */}
      {showBugReport && <BugReport userId={userId} onClose={()=>setShowBugReport(false)} />}
      {showFeedback && <FeedbackSheet onClose={()=>setShowFeedback(false)} />}

      {/* Feedback-Nudge Toast */}
      {showFeedbackNudge && (
        <div style={{
          position:'fixed', bottom: 88, left: 12, right: 12, zIndex: 1200,
          background: '#085d68', borderRadius: 16, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(8,93,104,0.35)',
          animation: 'slideUp 0.3s ease',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#a8ece8', flexShrink: 0 }}>lightbulb</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Hast du Ideen oder Feedback?</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>Hilf uns, die App besser zu machen</div>
          </div>
          <button
            onClick={() => { setShowFeedbackNudge(false); setShowFeedback(true) }}
            style={{ padding: '7px 14px', borderRadius: 10, border: 'none',
              background: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Ja →
          </button>
          <button
            onClick={() => setShowFeedbackNudge(false)}
            style={{ width: 28, height: 28, borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}
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


// ─── Chat (see src/components/Chat.tsx) ─────────────────────────────────────
// ─── SwipeableTaskCard ────────────────────────────────────────────────────────
// Swipe rechts → starten (offen) / abschließen (in_arbeit)
// Swipe links → Problem-Sheet öffnen
// Tap → Detail-Overlay öffnen
function SwipeableTaskCard({ a, meta, due, catIcon, catName, onOpenDetail, onSwipeRight, onSwipeLeft, onInlineStart, onInlineComplete, onInlineProblem }: {
  a: TaskAssignment
  meta: { label: string; icon: string; bg: string; color: string }
  due: { label: string; urgent: boolean }
  catIcon: string
  catName: string
  onOpenDetail: () => void
  onSwipeRight: () => void
  onSwipeLeft: () => void
  onInlineStart?: () => void
  onInlineComplete?: () => void
  onInlineProblem?: () => void
}) {
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const locked = useRef(false)

  const isDone = a.status === 'erledigt'
  const isProb = a.status === 'problem'
  const isActive = a.status === 'offen' || a.status === 'in_arbeit'

  const tsStart = (clientX: number, clientY: number) => {
    if (!isActive) return
    startX.current = clientX; startY.current = clientY
    locked.current = false; setAnim(false)
  }
  const tsMove = (clientX: number, clientY: number, cancelable: boolean) => {
    if (!isActive || startX.current === null || startY.current === null) return
    const dX = clientX - startX.current
    const dY = clientY - startY.current
    if (!locked.current) {
      if (Math.abs(dY) > 8 && Math.abs(dY) > Math.abs(dX)) { startX.current = null; return }
      if (Math.abs(dX) > 8) locked.current = true; else return
    }
    setDx(Math.max(-130, Math.min(130, dX)))
  }
  const tsEnd = () => {
    if (startX.current === null) return
    startX.current = null; setAnim(true)
    if (dx > 90) {
      setDx(400); setTimeout(() => { onSwipeRight(); setDx(0); setAnim(false) }, 200)
    } else if (dx < -90) {
      setDx(-400); setTimeout(() => { onSwipeLeft(); setDx(0); setAnim(false) }, 200)
    } else { setDx(0); setTimeout(() => setAnim(false), 240) }
  }

  const swipeOp = Math.min(1, Math.abs(dx) / 90)

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 0 }}>
      {/* Swipe-Reveal-Hintergrund */}
      {isActive && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: dx > 0 ? 'flex-start' : 'flex-end', padding: '0 16px',
          background: dx > 0 ? (a.status === 'offen' ? '#1565c0' : '#16a34a') : '#b91c1c',
          opacity: swipeOp, borderRadius: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 800, fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
              {dx > 0 ? (a.status === 'offen' ? 'play_arrow' : 'task_alt') : 'warning'}
            </span>
            {dx > 0 ? (a.status === 'offen' ? 'Starten' : 'Erledigt') : 'Problem'}
          </div>
        </div>
      )}

      {/* Eigentliche Card */}
      <div
        onTouchStart={e => tsStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => { tsMove(e.touches[0].clientX, e.touches[0].clientY, e.cancelable); if (locked.current && e.cancelable) e.preventDefault() }}
        onTouchEnd={tsEnd}
        onMouseDown={e => tsStart(e.clientX, e.clientY)}
        onMouseMove={e => { if (e.buttons === 1 && startX.current !== null) tsMove(e.clientX, e.clientY, false) }}
        onMouseUp={tsEnd}
        onMouseLeave={() => { if (startX.current !== null) tsEnd() }}
        style={{
          ...s.tcard, opacity: isDone ? 0.65 : 1,
          transform: `translateX(${dx}px)`,
          transition: anim ? 'transform 0.22s cubic-bezier(.32,.72,0,1)' : 'none',
          touchAction: isActive ? 'pan-y' : 'auto', userSelect: 'none', position: 'relative', zIndex: 1,
        }}
      >
        <div style={{ ...s.tcardIcon, background: isProb ? 'var(--err-bg)' : isDone ? 'var(--ok-bg)' : 'var(--surf-low)' }}>
          <span className="material-symbols-outlined" style={{ color: isProb ? 'var(--err-dot)' : isDone ? '#166534' : 'var(--pri)' }}>{catIcon}</span>
        </div>
        <div style={{ flex: 1 }} onClick={onOpenDetail}>
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
          <button style={s.chevronBtn} onClick={onOpenDetail}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        {/* ── Inline action buttons ── */}
        {a.status === 'offen' && (
          <div style={{ display:'flex', gap:8, marginTop:10 }} onClick={e => e.stopPropagation()}>
            <button onClick={onInlineStart}
              style={{ flex:1, padding:'9px 0', borderRadius:12, border:'none', background:'#1565c0', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:15 }}>play_arrow</span>Starten
            </button>
            <button onClick={onInlineComplete}
              style={{ flex:1, padding:'9px 0', borderRadius:12, border:'1px solid #b6dec533', background:'var(--ok-bg)', color:'var(--ok)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:15, fontVariationSettings:"'FILL' 1" }}>task_alt</span>Fertig
            </button>
            <button onClick={onInlineProblem}
              style={{ padding:'9px 14px', borderRadius:12, border:'1px solid #fca5a533', background:'var(--err-bg)', color:'var(--err-dot)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:15 }}>warning</span>
            </button>
          </div>
        )}
        {a.status === 'in_arbeit' && (
          <div style={{ display:'flex', gap:8, marginTop:10 }} onClick={e => e.stopPropagation()}>
            <button onClick={onInlineComplete}
              style={{ flex:1, padding:'9px 0', borderRadius:12, border:'none', background:'var(--ok)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:15, fontVariationSettings:"'FILL' 1" }}>task_alt</span>Abschließen
            </button>
            <button onClick={onInlineProblem}
              style={{ flex:1, padding:'9px 0', borderRadius:12, border:'1px solid #fca5a533', background:'var(--err-bg)', color:'var(--err-dot)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:15 }}>warning</span>Problem
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


// ── ObjectSheet ────────────────────────────────────────────────────────────────
function ObjectSheet({ obj, onClose }: { obj: any; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [contacts, setContacts] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    // Load contacts for this customer
    if (obj?.customers?.id) {
      supabase
        .from('contact_persons')
        .select('id,name,role,phone,email')
        .eq('customer_id', obj.customers.id)
        .order('sort_order', { ascending: true })
        .then(({ data }) => { if (data) setContacts(data) })
    }
  }, [obj])

  const close = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  if (!mounted) return null

  const fullAddress = [obj.address, obj.address_supplement, obj.postal_code, obj.city].filter(Boolean).join(', ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(fullAddress)}`

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300,
      background: visible ? 'rgba(13,31,34,0.45)' : 'rgba(13,31,34,0)',
      transition:'background 0.25s', display:'flex', alignItems:'flex-end',
    }} onClick={close}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', background:'var(--surf-card)', borderRadius:'24px 24px 0 0',
        maxHeight:'88vh', overflowY:'auto',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform 0.28s cubic-bezier(.32,.72,0,1)',
        boxShadow:'0 -8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
          <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)' }}/>
        </div>

        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)',
          padding:'18px 20px 22px', color:'#fff', position:'relative', overflow:'hidden',
        }}>
          <span className="material-symbols-outlined" style={{
            position:'absolute', right:-20, bottom:-30, fontSize:160,
            color:'rgba(255,255,255,0.07)',
          }}>apartment</span>
          <div style={{ position:'relative', zIndex:1 }}>
            {obj.customers?.name && (
              <div style={{ fontSize:10, fontWeight:700, opacity:0.7, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>
                {obj.customers.name}
              </div>
            )}
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'Manrope,sans-serif', lineHeight:1.15, marginBottom:4 }}>
              {obj.name || obj.address}
            </div>
            <div style={{ fontSize:13, opacity:0.9 }}>
              {[obj.address, obj.postal_code, obj.city].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        {/* Action tiles */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderBottom:'1px solid var(--outline)' }}>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={close}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'18px 0', textDecoration:'none', borderRight:'1px solid var(--outline)' }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'var(--pri)' }}>directions</span>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>Navigation</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>In Maps öffnen</div>
          </a>
          {contacts.length > 0 && contacts[0].phone ? (
            <a href={`tel:${contacts[0].phone}`}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'18px 0', textDecoration:'none' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'var(--pri)' }}>call</span>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>Anrufen</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', maxWidth:120, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{contacts[0].name}</div>
            </a>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'18px 0', opacity:0.35 }}>
              <span className="material-symbols-outlined" style={{ fontSize:22, color:'var(--txt-muted)' }}>call</span>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt-muted)' }}>Anrufen</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)' }}>Kein Kontakt</div>
            </div>
          )}
        </div>

        {/* Info blocks */}
        <div style={{ padding:'18px 20px 28px' }}>
          {obj.access_note && (
            <ObjInfoBlock icon="vpn_key" label="Zugang" text={obj.access_note} />
          )}
          {obj.parking_note && (
            <ObjInfoBlock icon="local_parking" label="Parken" text={obj.parking_note} />
          )}
          {obj.floor_info && (
            <ObjInfoBlock icon="layers" label="Etagen" text={obj.floor_info} />
          )}

          {/* Contacts */}
          {contacts.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, marginTop: (obj.access_note||obj.parking_note||obj.floor_info) ? 6 : 0 }}>
                Ansprechpartner
              </div>
              {contacts.map(c => {
                const initials = c.name.split(' ').map((w:string)=>w[0]).join('').toUpperCase().slice(0,2)
                return (
                  <div key={c.id} style={{
                    display:'flex', alignItems:'center', gap:12,
                    background:'var(--surf-low)', border:'1px solid var(--outline)',
                    borderRadius:14, padding:'12px 14px', marginBottom:10,
                  }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'var(--pri)', flexShrink:0 }}>
                      {initials}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{c.name}</div>
                      {c.role && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{c.role}</div>}
                      {c.email && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{c.email}</div>}
                    </div>
                    {c.phone && (
                      <a href={`tel:${c.phone}`}
                        style={{ background:'var(--pri-xl)', color:'var(--pri)', width:38, height:38, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', flexShrink:0 }}>
                        <span className="material-symbols-outlined icon-fill" style={{ fontSize:18 }}>call</span>
                      </a>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {/* Notes hint box */}
          {obj.notes && (
            <div style={{ display:'flex', gap:10, padding:'12px 14px', background:'#fffbeb', border:'1px solid #f4e3b8', borderRadius:12, marginTop: contacts.length > 0 ? 6 : 0 }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:'#92400e', flexShrink:0, marginTop:1 }}>info</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Hinweis</div>
                <div style={{ fontSize:13, color:'#5b3107', lineHeight:1.45 }}>{obj.notes}</div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!obj.access_note && !obj.parking_note && !obj.floor_info && contacts.length === 0 && !obj.notes && (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--txt-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8, opacity:0.4 }}>info</span>
              <div style={{ fontSize:13 }}>Noch keine Objektinfos hinterlegt.</div>
              <div style={{ fontSize:12, marginTop:4, opacity:0.7 }}>Der Admin kann Zugang & Kontakt ergänzen.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ObjInfoBlock({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div style={{ display:'flex', gap:12, marginBottom:14 }}>
      <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize:17, color:'var(--pri)' }}>{icon}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>{label}</div>
        <div style={{ fontSize:13, color:'var(--txt)', lineHeight:1.45 }}>{text}</div>
      </div>
    </div>
  )
}


// ── Konfetti ──────────────────────────────────────────────────────────────────
function Konfetti() {
  const pieces = Array.from({length:32}, (_:unknown, i:number) => ({
    id: i,
    x: Math.random()*100,
    delay: Math.random()*0.8,
    dur: 2.2 + Math.random()*1.2,
    size: 6 + Math.random()*8,
    color: ['#096a70','#16a34a','#f59e0b','#3b82f6','#8b5cf6','#ec4899'][i%6],
    shape: i%3===0 ? 'circle' : 'rect',
  }))
  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:999, overflow:'hidden' }}>
      <style>{`@keyframes konfettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(900px) rotate(720deg);opacity:0}}`}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:'absolute', left:`${p.x}%`, top:0,
          width:p.size, height:p.shape==='circle' ? p.size : p.size*0.6,
          borderRadius: p.shape==='circle' ? '50%' : 2,
          background: p.color,
          animation:`konfettiFall ${p.dur}s ${p.delay}s ease-in forwards`,
        }}/>
      ))}
      <div style={{
        position:'absolute', top:'35%', left:'50%', transform:'translate(-50%,-50%)',
        fontSize:30, fontWeight:900, color:'var(--ok)', textAlign:'center',
        fontFamily:'Manrope,sans-serif', letterSpacing:'-0.02em',
        textShadow:'0 2px 16px rgba(22,163,74,0.2)',
      }}>Alle erledigt! 🎉</div>
    </div>
  )
}

// ── MonthSheet ─────────────────────────────────────────────────────────────────
const MONTHS_LONG = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
const DAY_ABBR = ['Mo','Di','Mi','Do','Fr','Sa','So']

function MonthSheet({ open, anchorDate, assignments, myLeaves, onClose, onSelectDay }: {
  open: boolean; anchorDate: Date; assignments: TaskAssignment[]; myLeaves: any[];
  onClose: () => void; onSelectDay: (d: Date) => void
}) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))

  useEffect(() => {
    if (open) {
      setViewMonth(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))
      setMounted(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 280)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!mounted) return null

  const todayStr = new Date().toISOString().split('T')[0]
  const anchorStr = anchorDate.toISOString().split('T')[0]
  const year = viewMonth.getFullYear(), month = viewMonth.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - firstWeekday)
  const days = Array.from({length:42}, (_:unknown, i:number) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate()+i); return d
  })

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:300,
      background: visible ? 'rgba(13,31,34,0.45)' : 'rgba(13,31,34,0)',
      transition:'background 0.25s', display:'flex', alignItems:'flex-end',
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', background:'var(--surf-card)', borderRadius:'24px 24px 0 0',
        maxHeight:'80vh', overflowY:'auto',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition:'transform 0.28s cubic-bezier(.32,.72,0,1)',
        boxShadow:'0 -8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
          <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)' }}/>
        </div>
        <div style={{ padding:'4px 16px 32px' }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 4px 16px' }}>
            <button onClick={()=>setViewMonth(new Date(year,month-1,1))}
              style={{ width:38, height:38, borderRadius:12, border:'1px solid var(--outline)', background:'var(--surf-low)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:22, color:'var(--txt)' }}>chevron_left</span>
            </button>
            <button onClick={()=>{const t=new Date();setViewMonth(new Date(t.getFullYear(),t.getMonth(),1))}}
              style={{ display:'flex', alignItems:'baseline', gap:6, background:'none', border:'none', cursor:'pointer' }}>
              <span style={{ fontSize:18, fontWeight:800, fontFamily:'Manrope,sans-serif', color:'var(--txt)' }}>{MONTHS_LONG[month]}</span>
              <span style={{ fontSize:14, fontWeight:600, color:'var(--txt-muted)' }}>{year}</span>
            </button>
            <button onClick={()=>setViewMonth(new Date(year,month+1,1))}
              style={{ width:38, height:38, borderRadius:12, border:'1px solid var(--outline)', background:'var(--surf-low)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:22, color:'var(--txt)' }}>chevron_right</span>
            </button>
          </div>

          {/* Weekday headers */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:6 }}>
            {DAY_ABBR.map(d => (
              <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', paddingBottom:4 }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {days.map((d, i) => {
              const inMonth = d.getMonth() === month
              const ds = d.toISOString().split('T')[0]
              const isToday = ds === todayStr
              const isAnchor = ds === anchorStr
              const dayTasks = assignments.filter((a:TaskAssignment) => a.due_date === ds)
              const total = dayTasks.length
              const done = dayTasks.filter((a:TaskAssignment) => a.status === 'erledigt').length
              const hasProb = dayTasks.some((a:TaskAssignment) => a.status === 'problem')
              const allDone = total > 0 && done === total
              const leave = myLeaves.find((l:any) => l.status!=='abgelehnt' && ds>=l.from_date && ds<=l.to_date)
              const leaveColor = leave
                ? leave.request_type==='krankmeldung' ? '#e53935'
                : leave.status==='genehmigt' ? 'var(--pri)' : '#f59e0b'
                : null
              return (
                <button key={i}
                  onClick={() => { onSelectDay(new Date(ds+'T12:00:00')); onClose() }}
                  style={{
                    aspectRatio:'1', padding:0, border:'none', cursor:'pointer', borderRadius:10,
                    background: isAnchor ? 'var(--pri)' : isToday ? 'var(--pri-xl)' : leaveColor ? leaveColor+'22' : 'transparent',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3,
                  }}>
                  <span style={{
                    fontSize:14, fontWeight: isToday||isAnchor ? 800 : 500, fontFamily:'Manrope,sans-serif',
                    color: isAnchor ? '#fff' : !inMonth ? 'var(--txt-muted)' : isToday ? 'var(--pri)' : leaveColor ?? 'var(--txt)',
                  }}>{d.getDate()}</span>
                  {total > 0 ? (
                    <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background: isAnchor?'#fff':hasProb?'var(--err-dot)':allDone?'var(--ok)':'var(--warn)' }}/>
                      <span style={{ fontSize:9, fontWeight:700, color: isAnchor?'rgba(255,255,255,0.8)':'var(--txt-muted)' }}>{total}</span>
                    </div>
                  ) : <div style={{height:5}}/>}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:18, paddingTop:14, borderTop:'1px solid var(--outline)' }}>
            <div style={{ display:'flex', gap:12, fontSize:10, color:'var(--txt-muted)', flexWrap:'wrap' }}>
              {[{c:'var(--warn)',l:'Offen'},{c:'var(--ok)',l:'Fertig'},{c:'var(--err-dot)',l:'Problem'}].map(({c,l})=>(
                <span key={l} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:c, display:'inline-block' }}/>
                  {l}
                </span>
              ))}
            </div>
            <button onClick={()=>{ onSelectDay(new Date()); onClose() }}
              style={{ fontSize:12, fontWeight:700, color:'var(--pri)', background:'none', border:'none', cursor:'pointer', padding:'4px 8px' }}>
              Heute →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZeitTab({ userId, myLeaves, vacationDaysPerYear, assignments, onLeavesChanged, availableVertretungen, ownVertretungen, onTakeOver, onCancelVertretung, takingOver, cancellingVertretung }: {
  userId: string
  myLeaves: any[]
  vacationDaysPerYear: number
  assignments: any[]
  onLeavesChanged: () => Promise<void>
  availableVertretungen: VertretungItem[]
  ownVertretungen: VertretungItem[]
  onTakeOver: (item: VertretungItem) => Promise<void>
  onCancelVertretung: (id: string) => Promise<void>
  takingOver: boolean
  cancellingVertretung: string | null
}) {
  const [showAntrag, setShowAntrag] = useState(false)
  const [showTausch, setShowTausch]   = useState(false)
  const [reqType, setReqType] = useState<'urlaub'|'krankmeldung'>('urlaub')
  const [from, setFrom]   = useState('')
  const [to, setTo]       = useState('')
  const [note, setNote]   = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg]     = useState<{text:string;ok:boolean}|null>(null)
  const [blackouts, setBlackouts] = useState<any[]>([])
  const [conflictAssigns, setConflictAssigns] = useState<any[]>([])
  const [showConflict, setShowConflict] = useState(false)
  const [swapRequested, setSwapRequested] = useState<Set<string>>(new Set())
  const [editReq, setEditReq]   = useState<any|null>(null)
  const [editFrom, setEditFrom] = useState('')
  const [editTo, setEditTo]     = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    supabase.from('vacation_blackouts')
      .select('*')
      .gte('to_date', new Date().toISOString().slice(0,10))
      .then(({ data }) => setBlackouts(data ?? []))
  }, [])

  const today = new Date().toISOString().slice(0,10)

  const countDays = (l: any) => {
    let count = 0; const cur = new Date(l.from_date); const end = new Date(l.to_date)
    while (cur <= end) { count++; cur.setDate(cur.getDate()+1) }
    return count
  }

  const urlaubDays    = myLeaves.filter((l:any)=>l.request_type==='urlaub'&&l.status==='genehmigt').reduce((s:number,l:any)=>s+countDays(l),0)
  const urlaubPending = myLeaves.filter((l:any)=>l.request_type==='urlaub'&&l.status==='ausstehend').reduce((s:number,l:any)=>s+countDays(l),0)
  const urlaubLeft    = Math.max(0, vacationDaysPerYear - urlaubDays - urlaubPending)
  const krankDays     = myLeaves.filter((l:any)=>l.request_type==='krankmeldung'&&l.status==='genehmigt').reduce((s:number,l:any)=>s+countDays(l),0)

  const pendingReqs  = myLeaves.filter((l:any) => l.status === 'ausstehend')
  const activeLeave  = myLeaves.find((l:any) => l.status === 'genehmigt' && l.from_date <= today && l.to_date >= today)
  const upcomingLeaves = myLeaves
    .filter((l:any) => l.status === 'genehmigt' && l.from_date > today)
    .sort((a:any,b:any) => a.from_date.localeCompare(b.from_date))
    .slice(0,3)

  // Verlauf: abgeschlossene Einträge – nur zeigen wenn to_date noch nicht länger als 30 Tage her
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10)
  const verlauf = myLeaves
    .filter((l:any) => l.status !== 'ausstehend' && l.to_date >= thirtyDaysAgo)
    .sort((a:any,b:any) => b.from_date.localeCompare(a.from_date))

  const tauschBadge = availableVertretungen.length + ownVertretungen.length

  const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string) =>
    !(aTo < bFrom || aFrom > bTo)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setMsg(null)

    // 1) Gegenteiligen Typ im gleichen Zeitraum prüfen
    const oppositeType = reqType === 'urlaub' ? 'krankmeldung' : 'urlaub'
    const conflict = myLeaves.find((l:any) =>
      l.status !== 'abgelehnt' &&
      l.request_type === oppositeType &&
      overlaps(from, to, l.from_date, l.to_date)
    )
    if (conflict) {
      const label = conflict.request_type === 'krankmeldung' ? 'einer Krankmeldung' : 'einem Urlaubsantrag'
      setMsg({ text: `Nicht möglich: Im gewählten Zeitraum besteht bereits ${label}.`, ok: false })
      setSending(false)
      return
    }

    // 2) Gleicher Typ im gleichen Zeitraum prüfen (Duplikat)
    const duplicate = myLeaves.find((l:any) =>
      l.status !== 'abgelehnt' &&
      l.request_type === reqType &&
      overlaps(from, to, l.from_date, l.to_date)
    )
    if (duplicate) {
      setMsg({ text: 'Für diesen Zeitraum wurde bereits ein Antrag gestellt.', ok: false })
      setSending(false)
      return
    }

    // 3) Urlaubssperren prüfen (nur für Urlaub)
    if (reqType === 'urlaub') {
      const blocked = blackouts.find(b => overlaps(from, to, b.from_date, b.to_date))
      if (blocked) {
        setMsg({ text: `Urlaubssperre aktiv: ${blocked.reason || 'In diesem Zeitraum können keine Urlaube beantragt werden.'}`, ok: false })
        setSending(false)
        return
      }
    }

    // 4) Eintragen
    const { error } = await supabase.from('leave_requests').insert({
      user_id: userId, from_date: from, to_date: to, request_type: reqType, note: note || null
    })
    if (!error) {
      const { data: affected } = await supabase
        .from('task_assignments')
        .select('id,due_date,status,tasks(title,categories(emoji,name),objects(address,city))')
        .eq('user_id', userId).gte('due_date', from).lte('due_date', to)
        .in('status', ['offen','in_arbeit']).order('due_date')
      if (affected && affected.length > 0) { setConflictAssigns(affected); setShowConflict(true) }
      else setMsg({ text: reqType === 'krankmeldung' ? 'Krankmeldung übermittelt.' : 'Urlaubsantrag gesendet!', ok: true })
      setFrom(''); setTo(''); setNote('')
      await onLeavesChanged()
      if (!affected?.length) setShowAntrag(false)
    } else {
      setMsg({ text: error.message, ok: false })
    }
    setSending(false)
  }

  const requestSwap = async (assignId: string) => {
    await supabase.from('task_assignments').update({ status: 'vertretung' }).eq('id', assignId)
    setSwapRequested(prev => new Set([...prev, assignId]))
  }

  const openAntrag = (type: 'urlaub'|'krankmeldung') => {
    setReqType(type); setMsg(null); setFrom(''); setTo(''); setNote(''); setShowAntrag(true)
  }

  // Day count preview helper
  const dayCount = (f: string, t: string) => {
    if (!f || !t || f > t) return 0
    let c = 0; const cur = new Date(f); const end = new Date(t)
    while (cur <= end) { c++; cur.setDate(cur.getDate()+1) }
    return c
  }

  const pct = Math.min(100, Math.round((urlaubDays / vacationDaysPerYear) * 100))

  return (
    <div style={{ paddingBottom: 16 }}>

      {/* ── Urlaubskonto-Card ── */}
      <div style={{ background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:22, padding:'20px 20px 18px', marginBottom:16, color:'#fff', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-18, top:-18, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }}/>
        <div style={{ position:'absolute', right:20, bottom:-30, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }}/>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.12em', opacity:0.7, marginBottom:10, textTransform:'uppercase' }}>
          Urlaubskonto {new Date().getFullYear()}
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <div style={{ fontSize:48, fontWeight:900, fontFamily:'var(--font-head)', lineHeight:1 }}>{urlaubLeft}</div>
            <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>Tage verfügbar von {vacationDaysPerYear}</div>
          </div>
          <div style={{ textAlign:'right', paddingBottom:4 }}>
            <div style={{ fontSize:11, opacity:0.65, marginBottom:2 }}>genommen</div>
            <div style={{ fontSize:28, fontWeight:800, fontFamily:'var(--font-head)', lineHeight:1 }}>{urlaubDays}</div>
          </div>
        </div>
        <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.2)', overflow:'hidden', marginBottom:10 }}>
          <div style={{ height:'100%', borderRadius:99, background:'#fff', width:`${pct}%`, transition:'width 0.5s ease' }}/>
        </div>
        <div style={{ display:'flex', gap:16, fontSize:12, opacity:0.85 }}>
          {urlaubPending > 0 && (
            <span style={{ display:'flex', alignItems:'center', gap:4 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>hourglass_empty</span>
              {urlaubPending} ausstehend
            </span>
          )}
          <span style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:14 }}>sick</span>
            {krankDays} Krankentage
          </span>
        </div>
      </div>

      {/* ── Aktive Abwesenheit Banner ── */}
      {activeLeave && (() => {
        const isKrank = activeLeave.request_type === 'krankmeldung'
        return (
          <div style={{ background: isKrank ? '#fef2f2' : 'var(--pri-xl)', border:`1.5px solid ${isKrank?'#fca5a5':'var(--pri)'}`, borderRadius:16, padding:'14px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:14, background: isKrank?'#fee2e2':'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:isKrank?'#dc2626':'var(--pri)' }}>{isKrank?'sick':'beach_access'}</span>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:isKrank?'#b91c1c':'var(--pri)', fontFamily:'var(--font-head)' }}>
                {isKrank ? 'Du bist heute krank gemeldet' : 'Du bist heute im Urlaub'}
              </div>
              <div style={{ fontSize:12, color:isKrank?'#dc2626':'var(--pri)', opacity:0.8, marginTop:1 }}>
                bis {new Date(activeLeave.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'long'})}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Schnellaktionen ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:18 }}>
        <button onClick={()=>openAntrag('urlaub')} style={{ padding:'14px 12px', borderRadius:16, border:'1.5px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
          <div style={{ width:38, height:38, borderRadius:12, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'var(--pri)' }}>beach_access</span>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--txt)' }}>Urlaub</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>beantragen</div>
          </div>
        </button>
        <button onClick={()=>openAntrag('krankmeldung')} style={{ padding:'14px 12px', borderRadius:16, border:'1.5px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
          <div style={{ width:38, height:38, borderRadius:12, background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#dc2626' }}>sick</span>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--txt)' }}>Krank</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>melden</div>
          </div>
        </button>
      </div>

      {/* ── Tauschbörse-Hinweis ── */}
      {tauschBadge > 0 && (
        <button onClick={()=>setShowTausch(true)} style={{ width:'100%', background:'#f3e8ff', border:'1.5px solid #d8b4fe', borderRadius:16, padding:'13px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:16, textAlign:'left' }}>
          <div style={{ width:38, height:38, borderRadius:12, background:'#ede9fe', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#7c3aed' }}>swap_horiz</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#5b21b6' }}>Tauschbörse</div>
            <div style={{ fontSize:11, color:'#7c3aed', marginTop:1 }}>{availableVertretungen.length > 0 ? `${availableVertretungen.length} Vertretung${availableVertretungen.length>1?'en':''} verfügbar` : `${ownVertretungen.length} eigene${ownVertretungen.length>1?'':''} Angebot${ownVertretungen.length>1?'e':''}`}</div>
          </div>
          <span style={{ background:'#7c3aed', color:'#fff', borderRadius:999, minWidth:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, padding:'0 5px' }}>{tauschBadge}</span>
        </button>
      )}

      {/* ── Ausstehende Anträge ── */}
      {pendingReqs.length > 0 && (
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Ausstehend</div>
          {pendingReqs.map((r:any) => {
            const isKrank = r.request_type === 'krankmeldung'
            return (
              <div key={r.id} style={{ background:'#fffbeb', borderRadius:16, padding:'14px 16px', marginBottom:8, border:'1.5px solid #fbbf24', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:13, background:isKrank?'#fee2e2':'#fff3cd', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:isKrank?'#dc2626':'#b45309' }}>{isKrank?'sick':'beach_access'}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{isKrank?'Krankmeldung':'Urlaubsantrag'}</div>
                  <div style={{ fontSize:12, color:'#92400e', marginTop:2 }}>
                    {new Date(r.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – {new Date(r.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                    {' · '}{countDays(r)} Tag{countDays(r)>1?'e':''}
                  </div>
                  {r.note && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>„{r.note}"</div>}
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={()=>{setEditReq(r);setEditFrom(r.from_date);setEditTo(r.to_date);setEditNote(r.note??'')}}
                    style={{ width:34, height:34, borderRadius:10, border:'1px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16 }}>edit</span>
                  </button>
                  <button onClick={async()=>{ if (!confirm('Antrag stornieren?')) return; await supabase.from('leave_requests').delete().eq('id',r.id); await onLeavesChanged() }}
                    style={{ width:34, height:34, borderRadius:10, border:'1px solid #fca5a5', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#dc2626' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16 }}>close</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Geplante Abwesenheiten ── */}
      {upcomingLeaves.length > 0 && (
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Geplant</div>
          {upcomingLeaves.map((r:any) => {
            const isKrank = r.request_type === 'krankmeldung'
            return (
              <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, border:'1px solid var(--outline)', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:12, background:isKrank?'#fee2e2':'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:19, color:isKrank?'#dc2626':'var(--pri)' }}>{isKrank?'sick':'beach_access'}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{isKrank?'Krankmeldung':'Urlaub'}</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>
                    {new Date(r.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})} – {new Date(r.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
                  </div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background:'var(--ok-bg)', color:'var(--ok)' }}>✓ Genehmigt</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Verlauf (letzte 30 Tage) ── */}
      {verlauf.length > 0 && (
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Verlauf</div>
          {verlauf.slice(0,8).map((r:any) => {
            const isKrank = r.request_type === 'krankmeldung'
            const stColor: Record<string,string> = { genehmigt:'var(--ok)', abgelehnt:'#dc2626' }
            const stBg: Record<string,string> = { genehmigt:'var(--ok-bg)', abgelehnt:'#fef2f2' }
            return (
              <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:12, padding:'10px 14px', marginBottom:7, border:'1px solid var(--outline)', display:'flex', alignItems:'center', gap:10 }}>
                <span className="material-symbols-outlined icon-fill" style={{ color:isKrank?'#e53935':'var(--pri)', flexShrink:0, fontSize:18 }}>{isKrank?'sick':'beach_access'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--txt)' }}>
                    {isKrank?'Krank':'Urlaub'} · {new Date(r.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})} – {new Date(r.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                  </div>
                  {r.note && <div style={{ fontSize:11, color:'var(--txt-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>„{r.note}"</div>}
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:stBg[r.status]??'var(--surf-low)', color:stColor[r.status]??'var(--txt-muted)', flexShrink:0, whiteSpace:'nowrap' }}>
                  {r.status==='genehmigt'?'✓ Genehmigt':'✕ Abgelehnt'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Leerstate */}
      {myLeaves.length === 0 && (
        <div style={{ textAlign:'center', padding:'32px 0 12px', color:'var(--txt-muted)' }}>
          <span className="material-symbols-outlined" style={{ fontSize:44, display:'block', marginBottom:10, opacity:0.2 }}>event_available</span>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>Noch keine Anträge</div>
          <div style={{ fontSize:13, marginTop:6, lineHeight:1.5 }}>Nutze die Buttons oben, um Urlaub oder eine Krankmeldung einzureichen.</div>
        </div>
      )}

      {/* ══ Antrag-Bottom-Sheet ══ */}
      {showAntrag && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'flex-end' }} onClick={e=>{if(e.target===e.currentTarget)setShowAntrag(false)}}>
          <div style={{ background:'var(--bg)', borderRadius:'22px 22px 0 0', width:'100%', padding:'20px 18px 36px', maxHeight:'90vh', overflowY:'auto' }}>
            {/* Handle */}
            <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)', margin:'0 auto 16px' }}/>

            {/* Typ-Toggle */}
            <div style={{ display:'flex', background:'var(--surf-low)', borderRadius:14, padding:4, marginBottom:18, gap:4 }}>
              {([{id:'urlaub' as const,icon:'beach_access',label:'Urlaub'},{id:'krankmeldung' as const,icon:'sick',label:'Krankmeldung'}]).map(t=>(
                <button key={t.id} onClick={()=>{setReqType(t.id);setMsg(null)}}
                  style={{ flex:1, padding:'11px 8px', borderRadius:11, border:'none', background:reqType===t.id?'var(--surf-card)':'transparent', color:reqType===t.id?(t.id==='krankmeldung'?'#dc2626':'var(--pri)'):'var(--txt-muted)', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7, boxShadow:reqType===t.id?'0 1px 4px rgba(0,0,0,0.08)':'none', transition:'all 0.15s' }}>
                  <span className="material-symbols-outlined icon-sm">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>

            {reqType === 'krankmeldung' && (
              <div style={{ background:'#fef2f2', borderRadius:12, padding:'12px 14px', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span className="material-symbols-outlined" style={{ color:'#dc2626', fontSize:18, flexShrink:0, marginTop:1 }}>info</span>
                <div style={{ fontSize:12, color:'#991b1b', lineHeight:1.5 }}>Nur bei echter Erkrankung nutzen. Till wird sofort benachrichtigt.</div>
              </div>
            )}

            <form onSubmit={submit}>
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{reqType==='krankmeldung'?'Erkrankt ab':'Von'}</label>
                  <input type="date" value={from} onChange={e=>setFrom(e.target.value)} required
                    style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{reqType==='krankmeldung'?'Voraus. bis':'Bis'}</label>
                  <input type="date" value={to} onChange={e=>setTo(e.target.value)} required
                    style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
                </div>
              </div>

              {from && to && from <= to && (() => {
                const c = dayCount(from, to)
                return (
                  <div style={{ background:'var(--surf-low)', borderRadius:10, padding:'9px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize:16, color:'var(--pri)' }}>info</span>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{c} Tag{c>1?'e':''}</span>
                    <span style={{ fontSize:12, color:'var(--txt-muted)' }}>
                      {new Date(from).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})} – {new Date(to).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'2-digit'})}
                    </span>
                  </div>
                )
              })()}

              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notiz (optional)</label>
                <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder={reqType==='krankmeldung'?'z.B. Arztbesuch notwendig':'z.B. Familienurlaub'}
                  style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
              </div>

              {msg && (
                <div style={{ background:msg.ok?'var(--ok-bg)':'#fef2f2', color:msg.ok?'var(--ok)':'#dc2626', borderRadius:10, padding:'11px 14px', fontSize:13, display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:16 }}>{msg.ok?'check_circle':'error'}</span>{msg.text}
                </div>
              )}

              <button type="submit" disabled={sending||!from||!to||from>to}
                style={{ width:'100%', padding:15, borderRadius:14, border:'none', background:reqType==='krankmeldung'?'linear-gradient(135deg,#dc2626,#ef4444)':'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', opacity:(!from||!to||from>to)?0.5:1, transition:'opacity 0.15s' }}>
                <span className="material-symbols-outlined icon-sm">{sending?'hourglass_empty':reqType==='krankmeldung'?'sick':'send'}</span>
                {sending?'Wird gesendet…':reqType==='krankmeldung'?'Krankmeldung senden':'Urlaub beantragen'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══ Tauschbörse-Sheet ══ */}
      {showTausch && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'flex-end' }} onClick={e=>{if(e.target===e.currentTarget)setShowTausch(false)}}>
          <div style={{ background:'var(--bg)', borderRadius:'22px 22px 0 0', width:'100%', padding:'20px 18px 36px', maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)', margin:'0 auto 18px' }}/>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <h3 style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Tauschbörse</h3>
              <button onClick={()=>setShowTausch(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {availableVertretungen.length > 0 && (
              <div style={{ marginBottom:22 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Verfügbare Vertretungen</div>
                {availableVertretungen.map(v => {
                  const task = v.tasks; const obj = task?.objects
                  const dateStr = new Date(v.due_date).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'})
                  return (
                    <div key={v.id} style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', marginBottom:10, border:'1.5px solid #e9d5ff' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:12 }}>
                        <div style={{ width:40, height:40, borderRadius:12, background:'#f3e8ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{task?.categories?.emoji||'📋'}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:700 }}>{task?.title||'–'}</div>
                          {obj && <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{obj.address}, {obj.city}</div>}
                          <div style={{ fontSize:12, color:'#7c3aed', marginTop:3, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:14 }}>event</span>{dateStr}
                          </div>
                          {v.users?.full_name && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>Von: {v.users.full_name}</div>}
                        </div>
                      </div>
                      <button onClick={()=>onTakeOver(v)} disabled={takingOver}
                        style={{ width:'100%', padding:'11px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#5b21b6,#7c3aed)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16 }}>swap_horiz</span>Vertretung übernehmen
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {ownVertretungen.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.09em', marginBottom:10 }}>Meine Angebote</div>
                {ownVertretungen.map(v => {
                  const task = v.tasks; const obj = task?.objects
                  const dateStr = new Date(v.due_date).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'2-digit'})
                  return (
                    <div key={v.id} style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', marginBottom:10, border:'1px solid var(--outline)', display:'flex', alignItems:'flex-start', gap:10 }}>
                      <div style={{ width:40, height:40, borderRadius:12, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{task?.categories?.emoji||'📋'}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700 }}>{task?.title||'–'}</div>
                        {obj && <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{obj.address}, {obj.city}</div>}
                        <div style={{ fontSize:12, color:'#7c3aed', marginTop:3, fontWeight:600 }}>{dateStr}</div>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, fontSize:10, fontWeight:700, color:'#7c3aed', background:'#f3e8ff', borderRadius:999, padding:'2px 8px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize:12 }}>hourglass_empty</span>Wird gesucht…
                        </span>
                      </div>
                      <button onClick={()=>onCancelVertretung(v.id)} disabled={cancellingVertretung===v.id}
                        style={{ flexShrink:0, background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, padding:'7px 10px', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14 }}>close</span>
                        {cancellingVertretung===v.id?'…':'Zurückziehen'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {availableVertretungen.length === 0 && ownVertretungen.length === 0 && (
              <div style={{ textAlign:'center', padding:'24px 0', color:'var(--txt-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:36, display:'block', marginBottom:8, opacity:0.3 }}>swap_horiz</span>
                <div style={{ fontSize:13 }}>Keine Vertretungen verfügbar.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Antrag-Edit-Sheet ══ */}
      {editReq && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:500, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', borderRadius:'22px 22px 0 0', width:'100%', padding:'20px 18px 36px' }}>
            <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)', margin:'0 auto 16px' }}/>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Antrag bearbeiten</h3>
              <button onClick={()=>setEditReq(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.07em' }}>Von</label>
                <input type="date" value={editFrom} onChange={e=>setEditFrom(e.target.value)} style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.07em' }}>Bis</label>
                <input type="date" value={editTo} onChange={e=>setEditTo(e.target.value)} style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.07em' }}>Notiz (optional)</label>
              <input type="text" value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Grund, Reise, …" style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
            </div>
            <button disabled={editSaving||!editFrom||!editTo} onClick={async()=>{
              setEditSaving(true)
              await supabase.from('leave_requests').update({ from_date:editFrom, to_date:editTo, note:editNote||null, status:'ausstehend' }).eq('id',editReq.id)
              await onLeavesChanged(); setEditReq(null); setEditSaving(false)
            }} style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:editSaving?0.6:1 }}>
              {editSaving?'Wird gespeichert…':'Änderungen speichern'}
            </button>
            <p style={{ textAlign:'center', fontSize:11, color:'var(--txt-muted)', marginTop:10 }}>Geänderte Anträge werden erneut zur Genehmigung vorgelegt.</p>
          </div>
        </div>
      )}

      {/* ══ Urlaubskonflikt-Modal ══ */}
      {showConflict && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:400, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', borderRadius:'22px 22px 0 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 18px 14px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--outline)', flexShrink:0 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'var(--warn-bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span className="material-symbols-outlined" style={{ color:'var(--warn)' }}>warning</span>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)' }}>Betroffene Termine</div>
                <div style={{ fontSize:12, color:'var(--txt-muted)' }}>{conflictAssigns.length} offene Termin{conflictAssigns.length>1?'e':''} im Abwesenheitszeitraum</div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>
              <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:14, lineHeight:1.5 }}>Dein Antrag wurde gespeichert. Bitte klär die folgenden Termine – du kannst Vertretung anfragen.</p>
              {conflictAssigns.map((a:any) => {
                const done = swapRequested.has(a.id)
                return (
                  <div key={a.id} style={{ background:'var(--surf-card)', borderRadius:12, padding:'12px 14px', marginBottom:10, border:'1px solid var(--outline)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{a.tasks?.categories?.emoji||'📋'}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{a.tasks?.title}</div>
                        <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{a.tasks?.objects?.address} · {new Date(a.due_date).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})}</div>
                      </div>
                      {done && <span className="material-symbols-outlined" style={{ color:'var(--ok)', fontSize:18 }}>check_circle</span>}
                    </div>
                    {!done ? (
                      <button onClick={()=>requestSwap(a.id)} style={{ width:'100%', padding:'10px', borderRadius:10, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16 }}>swap_horiz</span>Vertretung anfragen
                      </button>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--ok)', fontWeight:600, textAlign:'center', padding:'6px 0' }}>Vertretungsanfrage gesendet ✓</div>
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ padding:'14px 18px', borderTop:'1px solid var(--outline)', flexShrink:0 }}>
              <button onClick={()=>{ setShowConflict(false); setConflictAssigns([]); setSwapRequested(new Set()); setShowAntrag(false); setMsg({ text:'Antrag gespeichert!', ok:true }) }}
                style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function ProfileTab({ userName, initials, onLogout, userId, pushEnabled, pushSupported, onTogglePush, onBugReport, onFeedback }: {
  userName:string; initials:string; onLogout:()=>void; userId:string;
  pushEnabled:boolean; pushSupported:boolean; onTogglePush:()=>void; onBugReport:()=>void; onFeedback:()=>void
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
        <Row icon="lightbulb" iconBg="rgba(217,119,6,0.08)" label="Feedback & Ideen"
          sub="Fehler melden, Feature-Wünsche, Vorschläge" chevron onClick={onFeedback} />
        <Row icon="bug_report" iconBg="rgba(186,26,26,0.08)" label="Fehler melden (alt)"
          sub="Schnelle Fehlermeldung" chevron onClick={onBugReport} last />
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
  appHead: { background:'rgba(248,249,250,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(191,200,202,0.4)', flexShrink:0, paddingTop:'env(safe-area-inset-top, 0px)', zIndex:10 },
  topBar: { position:'sticky', top:0, zIndex:50, background:'rgba(248,249,250,0.8)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(191,200,202,0.4)', flexShrink:0 },
  topBarInner: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px' },
  topBarLeft: { display:'flex', alignItems:'center', gap:10 },
  topAva: { width:36, height:36, borderRadius:'50%', background:'var(--sec-c)', color:'var(--pri)', fontSize:13, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-head)', cursor:'pointer', flexShrink:0 },
  topLogo:      { display:'flex', flexDirection:'column', gap:0, lineHeight:1.05 },
  topLogoBold:  { fontFamily:'Manrope,sans-serif', fontWeight:800, fontSize:16, color:'var(--pri)', letterSpacing:'-0.3px', textTransform:'uppercase' as const },
  topLogoLight: { fontFamily:'Manrope,sans-serif', fontWeight:300, fontSize:16, color:'var(--pri-c)', letterSpacing:'4px', textTransform:'uppercase' as const },
  topTitle: { fontSize:18, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)', letterSpacing:'-0.03em' },
  iconBtn: { background:'none', border:'none', padding:8, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' },
  content: { flex:1, overflowY:'auto', padding:'0 16px 24px' },
  welcomeSec: { padding:'20px 0 12px' },
  welcomeHead: { fontSize:26, fontWeight:800, fontFamily:'var(--font-head)', letterSpacing:'-0.03em', marginBottom:4 },
  welcomeSub: { fontSize:14, color:'var(--txt-muted)' },
  bento: { display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:20 },
  bentoMain: { background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:20, padding:'20px 18px', minHeight:140, display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow:'0 8px 24px rgba(9,106,112,0.2)' },
  bentoLabel: { fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 },
  bentoNum: { fontSize:18, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)', lineHeight:1.2 },
  bentoPills: { display:'flex', gap:8, flexWrap:'wrap', marginTop:12 },
  bentoPill: { display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.15)', padding:'4px 10px', borderRadius:999, fontSize:11, color:'#fff', fontWeight:500 },
  bentoPillDot: { width:7, height:7, borderRadius:'50%', background:'#fff', flexShrink:0 },
  bentoSide: { background:'var(--surf-card)', borderRadius:20, padding:'18px 16px', display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow:'0 2px 12px rgba(9,106,112,0.06)' },
  bentoCatLabel: { fontSize:11, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' },
  bentoBigNum: { fontSize:36, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)', lineHeight:1 },
  bentoBar: { height:6, borderRadius:999, background:'var(--surf-high)', overflow:'hidden', marginTop:10 },
  bentoBarFill: { height:'100%', borderRadius:999, background:'var(--pri)', transition:'width 0.4s ease' },
  weekWrap: { background:'var(--surf-card)', borderRadius:20, padding:'12px 8px', marginBottom:20, boxShadow:'0 2px 12px rgba(9,106,112,0.05)' },
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
  tcard: { background:'var(--surf-card)', borderRadius:16, padding:'14px 14px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 8px rgba(9,106,112,0.06)', transition:'transform 0.15s' },
  tcardIcon: { width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  tcardTitle: { fontSize:14, fontWeight:700, fontFamily:'var(--font-head)', marginBottom:6 },
  tcardMeta: { display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' },
  catBadge: { fontSize:10, fontWeight:600, background:'var(--sec-c)', color:'var(--pri)', padding:'2px 8px', borderRadius:999, opacity:0.9 },
  tcardDue: { display:'flex', alignItems:'center', gap:3, fontSize:11 },
  statusBadge: { display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:999, whiteSpace:'nowrap', flexShrink:0 },
  chevronBtn: { background:'none', border:'none', padding:4, color:'var(--txt-muted)', display:'flex', alignItems:'center', flexShrink:0 },
  botNav: { background:'rgba(248,249,250,0.85)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderTop:'1px solid rgba(191,200,202,0.4)', display:'flex', justifyContent:'space-around', padding:'8px 8px calc(16px + env(safe-area-inset-bottom, 0px))', flexShrink:0, boxShadow:'0 -8px 24px rgba(9,106,112,0.06)' },
  navItem: { display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'8px 20px', borderRadius:14, border:'none', background:'transparent', color:'#6b7a7b', cursor:'pointer', transition:'all 0.15s' },
  navItemOn: { background:'var(--pri)', color:'#fff', boxShadow:'0 4px 12px rgba(9,106,112,0.25)' },
  overlay: { position:'absolute', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', zIndex:100, overflow:'hidden' },
  backBtn: { background:'var(--surf-low)', border:'none', width:36, height:36, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt)', cursor:'pointer', flexShrink:0 },
  detScroll: { flex:1, overflowY:'auto', padding:18 },
  infoGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 },
  infoCard: { background:'var(--surf-low)', borderRadius:14, padding:'14px', border:'1px solid var(--outline)', display:'flex', flexDirection:'column' },
  descCard: { background:'var(--surf-card)', borderRadius:14, padding:16, border:'1px solid var(--outline)', fontSize:14, lineHeight:1.7, color:'var(--txt)' },
  detFooter: { padding:'14px 18px 20px', borderTop:'1px solid var(--outline)', display:'flex', gap:10, flexShrink:0, background:'var(--surf-card)' },
  btnWarn: { flex:1, padding:13, borderRadius:14, border:'1.5px solid var(--err-dot)', background:'transparent', color:'var(--err-dot)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 },
  btnPri: { flex:2, padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6, boxShadow:'0 4px 14px rgba(9,106,112,0.25)' },
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

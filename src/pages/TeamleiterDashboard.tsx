import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import FeedbackSheet from '../components/FeedbackSheet'

interface Props {
  userId: string
  userName: string
  onLogout: () => void
}

type Tab = 'uebersicht' | 'aufgaben' | 'objekte' | 'team' | 'profil'

const STATUS_COLOR: Record<string, string> = {
  offen:'#6b7280', in_arbeit:'#d97706', erledigt:'#16a34a', problem:'#dc2626', vertretung:'#7c3aed',
}
const STATUS_BG: Record<string, string> = {
  offen:'#f3f4f6', in_arbeit:'#fffbeb', erledigt:'#f0fdf4', problem:'#fef2f2', vertretung:'#f5f3ff',
}
const STATUS_LABEL: Record<string, string> = {
  offen:'Offen', in_arbeit:'In Arbeit', erledigt:'Erledigt', problem:'Problem', vertretung:'Vertretung',
}
const LEAVE_LABEL: Record<string, string> = {
  krankmeldung:'Krank', urlaub:'Urlaub', sonstiges:'Sonstiges',
}
const LEAVE_COLOR: Record<string, { c:string; bg:string }> = {
  krankmeldung:{ c:'#dc2626', bg:'#fef2f2' }, urlaub:{ c:'#0369a1', bg:'#e0f2fe' }, sonstiges:{ c:'#6b7280', bg:'#f3f4f6' },
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDaysISO(days: number) {
  const d = new Date(); d.setDate(d.getDate()+days)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE',{ weekday:'short', day:'2-digit', month:'short' })
}

// ── Reusable Row component for ProfileTab ───────────────────────────
function Row({ icon, iconBg, label, sub, chevron, right, onClick, last }: {
  icon:string; iconBg:string; label:string; sub?:string; chevron?:boolean;
  right?:React.ReactNode; onClick?:()=>void; last?:boolean
}) {
  return (
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
}

export default function TeamleiterDashboard({ userId, userName, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('uebersicht')
  const [objects, setObjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [todayAssigns, setTodayAssigns] = useState<any[]>([])
  const [upcomingAssigns, setUpcomingAssigns] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [weekAssigns, setWeekAssigns] = useState<any[]>([])
  const [selectedObj, setSelectedObj] = useState<any>(null)
  const [objTasks, setObjTasks] = useState<any[]>([])
  const [objAssigns, setObjAssigns] = useState<any[]>([])

  // Categories (for new task form)
  const [categories, setCategories] = useState<any[]>([])

  // Neue Aufgabe Form
  const [showNewTask, setShowNewTask] = useState(false)
  const [ntObj, setNtObj] = useState('')
  const [ntTitle, setNtTitle] = useState('')
  const [ntCat, setNtCat] = useState('')
  const [ntInterval, setNtInterval] = useState<'einmalig'|'täglich'|'wöchentlich'|'monatlich'|'quartalsweise'>('einmalig')
  const [ntDate, setNtDate] = useState(localToday())
  const [ntAssignee, setNtAssignee] = useState('')
  const [ntSaving, setNtSaving] = useState(false)
  const [ntErr, setNtErr] = useState('')

  // Toast-Feedback
  const [toast, setToast] = useState<string|null>(null)
  const showToast = (msg:string) => { setToast(msg); setTimeout(()=>setToast(null), 2500) }

  // Zuweisung entfernen
  const [confirmUnassign, setConfirmUnassign] = useState<any>(null)
  const [unassigning, setUnassigning] = useState(false)

  // Einteilen-Sheet
  const [editingAssign, setEditingAssign] = useState<any>(null)   // task object
  const [assignUser, setAssignUser] = useState('')
  const [assignDate, setAssignDate] = useState(localToday())
  const [saving, setSaving] = useState(false)

  // Vertretung-Sheet
  const [substAssign, setSubstAssign] = useState<any>(null)       // task_assignment object
  const [substUser, setSubstUser] = useState('')
  const [substSaving, setSubstSaving] = useState(false)

  // Profile state
  const [email, setEmailState] = useState('')
  const [showPwForm, setShowPwForm] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw1, setShowPw1] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ok:boolean;text:string}|null>(null)
  const [showDataForm, setShowDataForm] = useState(false)
  const [editName, setEditName] = useState(userName)
  const [editPhone, setEditPhone] = useState('')
  const [dataSaving, setDataSaving] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ok:boolean;text:string}|null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [editStreet, setEditStreet] = useState('')
  const [editCity, setEditCity] = useState('')

  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Responsive breakpoints
  const [vw, setVw] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setVw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const isDesktop = vw >= 1024
  const isTablet  = vw >= 768 && vw < 1024
  const isMobile  = vw < 768

  const load = useCallback(async () => {
    setLoading(true)
    const today = localToday()
    const horizon = addDaysISO(14)
    const [objRes, usersRes, catRes] = await Promise.all([
      supabase.from('objects').select('*').eq('objektleiter_id', userId).eq('is_active', true).order('name'),
      supabase.from('users').select('id,full_name,is_active,teamleiter_id,roles(name)').eq('is_active', true).order('full_name'),
      supabase.from('categories').select('id,name,emoji').order('name'),
    ])
    setCategories(catRes.data || [])
    const objs = objRes.data || []
    setObjects(objs)
    const filteredUsers = (usersRes.data || []).filter((u:any) => u.id !== userId && u.roles?.name === 'mitarbeiter' && u.teamleiter_id === userId)
    setAllUsers(filteredUsers)

    if (objs.length > 0) {
      const objIds = objs.map((o: any) => o.id)
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id,title,interval,object_id,is_active,category_id,default_assignee_id,categories(emoji,name),users!tasks_default_assignee_id_fkey(full_name)')
        .in('object_id', objIds).eq('is_active', true).order('title')
      const tks = tasksData || []
      setTasks(tks)
      const taskIds = tks.map((t: any) => t.id)

      if (taskIds.length > 0) {
        const monthAgo = addDaysISO(-30)
        const weekStart = addDaysISO(-6)
        const [todayRes, upcomingRes, teamRes, weekRes] = await Promise.all([
          supabase.from('task_assignments')
            .select('id,task_id,user_id,substitute_id,due_date,status,travel_minutes,work_minutes,started_at,completed_at,tasks(title,object_id,categories(emoji)),users!task_assignments_user_id_fkey(id,full_name),substitute:users!task_assignments_substitute_id_fkey(id,full_name)')
            .in('task_id', taskIds).eq('due_date', today),
          supabase.from('task_assignments')
            .select('id,task_id,user_id,substitute_id,due_date,status,tasks(title,object_id,categories(emoji)),users!task_assignments_user_id_fkey(id,full_name),substitute:users!task_assignments_substitute_id_fkey(id,full_name)')
            .in('task_id', taskIds).gte('due_date', today).lte('due_date', horizon).order('due_date'),
          supabase.from('task_assignments')
            .select('user_id,users!task_assignments_user_id_fkey(id,full_name)')
            .in('task_id', taskIds).gte('due_date', monthAgo),
          supabase.from('task_assignments')
            .select('id,user_id,due_date,status,work_minutes,travel_minutes')
            .in('task_id', taskIds).gte('due_date', weekStart).lte('due_date', today),
        ])
        setTodayAssigns(todayRes.data || [])
        setUpcomingAssigns(upcomingRes.data || [])
        setWeekAssigns(weekRes.data || [])

        const seen = new Set<string>()
        const uniqueTeam: any[] = []
        ;(teamRes.data || []).forEach((a: any) => {
          if (a.user_id && !seen.has(a.user_id)) { seen.add(a.user_id); uniqueTeam.push(a.users) }
        })
        setTeam(uniqueTeam.filter(Boolean))
      } else {
        setTodayAssigns([]); setUpcomingAssigns([]); setTeam([]); setWeekAssigns([])
      }
    } else {
      setTasks([]); setTodayAssigns([]); setUpcomingAssigns([]); setTeam([]); setWeekAssigns([])
    }

    // Leaves always based on filteredUsers (not on task assignments)
    if (filteredUsers.length > 0) {
      const monthAgo = addDaysISO(-30)
      const memberIds = filteredUsers.map((u:any) => u.id)
      const { data: leaveData } = await supabase.from('leave_requests')
        .select('id,user_id,request_type,from_date,to_date,status,note,users!leave_requests_user_id_fkey(full_name)')
        .in('user_id', memberIds).neq('status','abgelehnt').gte('to_date', monthAgo).order('from_date')
      setLeaves(leaveData || [])
    } else {
      setLeaves([])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmailState(data.user.email)
    })
    supabase.from('users').select('phone,full_name,street,city').eq('id', userId).single().then(({ data }) => {
      if (data?.phone) setEditPhone(data.phone)
      if (data?.full_name) setEditName(data.full_name)
      if (data?.street) setEditStreet(data.street)
      if (data?.city) setEditCity(data.city)
      setProfileLoaded(true)
    })
  }, [userId])

  const loadObjectDetail = async (obj: any) => {
    setSelectedObj(obj)
    const { data: tks } = await supabase
      .from('tasks')
      .select('id,title,interval,is_active,category_id,default_assignee_id,categories(emoji,name),users!tasks_default_assignee_id_fkey(full_name)')
      .eq('object_id', obj.id).eq('is_active', true).order('title')
    setObjTasks(tks || [])
    const taskIds = (tks || []).map((t: any) => t.id)
    if (taskIds.length > 0) {
      const today = localToday()
      const { data: assigns } = await supabase
        .from('task_assignments')
        .select('id,task_id,user_id,substitute_id,due_date,status,users!task_assignments_user_id_fkey(id,full_name),substitute:users!task_assignments_substitute_id_fkey(id,full_name)')
        .in('task_id', taskIds).gte('due_date', today).order('due_date')
      setObjAssigns(assigns || [])
    } else { setObjAssigns([]) }
  }

  const handleSaveAssign = async () => {
    if (!editingAssign || !assignUser || !assignDate) return
    setSaving(true)
    const { data: existing } = await supabase.from('task_assignments').select('id')
      .eq('task_id', editingAssign.id).eq('due_date', assignDate).maybeSingle()
    if (existing) {
      await supabase.from('task_assignments').update({ user_id: assignUser, substitute_id: null, status: 'offen' }).eq('id', existing.id)
    } else {
      await supabase.from('task_assignments').insert({ task_id: editingAssign.id, user_id: assignUser, due_date: assignDate, status: 'offen' })
    }
    const assignedName = allUsers.find((u:any)=>u.id===assignUser)?.full_name || 'Mitarbeiter'
    const assignedDate = assignDate
    setSaving(false); setEditingAssign(null); setAssignUser('')
    if (selectedObj) loadObjectDetail(selectedObj)
    load()
    showToast(`${assignedName} eingeteilt · ${fmtDate(assignedDate)}`)
  }

  const handleUnassign = async (assignment: any) => {
    setUnassigning(true)
    const { error } = await supabase.from('task_assignments').delete().eq('id', assignment.id)
    setUnassigning(false)
    setConfirmUnassign(null)
    if (!error) {
      if (selectedObj) loadObjectDetail(selectedObj)
      load()
      showToast('Zuweisung entfernt')
    }
  }

  const handleSaveSubst = async () => {
    if (!substAssign || !substUser) return
    setSubstSaving(true)
    await supabase.from('task_assignments')
      .update({ substitute_id: substUser, status: 'vertretung' })
      .eq('id', substAssign.id)
    const substName = allUsers.find((u:any)=>u.id===substUser)?.full_name || 'Mitarbeiter'
    setSubstSaving(false); setSubstAssign(null); setSubstUser('')
    if (selectedObj) loadObjectDetail(selectedObj)
    load()
    showToast(`Vertretung gesetzt: ${substName}`)
  }

  const handleCreateTask = async () => {
    if (!ntObj || !ntTitle.trim()) { setNtErr('Objekt und Titel sind Pflichtfelder'); return }
    setNtSaving(true); setNtErr('')
    // Insert task
    const { data: newTask, error: taskErr } = await supabase.from('tasks').insert({
      object_id: ntObj,
      title: ntTitle.trim(),
      category_id: ntCat || null,
      interval: ntInterval,
      due_date: ntDate,
      is_active: true,
      default_assignee_id: ntAssignee || null,
    }).select().single()
    if (taskErr || !newTask) { setNtErr(taskErr?.message || 'Fehler beim Speichern'); setNtSaving(false); return }
    // Insert assignment for chosen date
    if (ntAssignee) {
      await supabase.from('task_assignments').insert({
        task_id: newTask.id, user_id: ntAssignee, due_date: ntDate, status: 'offen',
      })
    } else if (ntInterval === 'einmalig') {
      // einmalig ohne Mitarbeiter: trotzdem assignment anlegen (unzugewiesen)
      await supabase.from('task_assignments').insert({
        task_id: newTask.id, due_date: ntDate, status: 'offen',
      })
    }
    setNtSaving(false)
    setShowNewTask(false)
    setNtTitle(''); setNtCat(''); setNtInterval('einmalig'); setNtAssignee(''); setNtErr('')
    load()
    showToast(`Aufgabe angelegt: ${newTask.title}`)
  }

  const handlePwSave = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg(null)
    if (pw1.length < 8) { setPwMsg({ok:false, text:'Mindestens 8 Zeichen erforderlich.'}); return }
    if (pw1 !== pw2)    { setPwMsg({ok:false, text:'Passwörter stimmen nicht überein.'}); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) { setPwMsg({ok:false, text:error.message}) }
    else { setPwMsg({ok:true, text:'Passwort erfolgreich geändert!'}); setPw1(''); setPw2(''); setTimeout(()=>{setShowPwForm(false);setPwMsg(null)},2000) }
    setPwSaving(false)
  }

  const handleDataSave = async (e: React.FormEvent) => {
    e.preventDefault(); setDataMsg(null)
    if (!editName.trim()) { setDataMsg({ok:false, text:'Name darf nicht leer sein.'}); return }
    setDataSaving(true)
    const { error } = await supabase.from('users').update({ full_name: editName.trim(), phone: editPhone.trim() || null, street: editStreet.trim() || null, city: editCity.trim() || null }).eq('id', userId)
    if (error) { setDataMsg({ok:false, text:error.message}) }
    else { setDataMsg({ok:true, text:'Daten gespeichert!'}); setTimeout(()=>{setShowDataForm(false);setDataMsg(null)},2000) }
    setDataSaving(false)
  }

  const pwInputRow = (icon: string, ph: string, val: string, setVal: (v:string)=>void, show: boolean, setShow: (v:boolean)=>void) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
      <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{icon}</span>
      <input type={show?'text':'password'} value={val} onChange={e=>setVal(e.target.value)} placeholder={ph} required
        style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
      <button type="button" onClick={()=>setShow(!show)} style={{ background:'none', border:'none', cursor:'pointer', padding:2, color:'var(--txt-muted)', display:'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize:18 }}>{show?'visibility_off':'visibility'}</span>
      </button>
    </div>
  )

  const stats = {
    total: todayAssigns.length,
    done: todayAssigns.filter((a:any)=>a.status==='erledigt').length,
    inProgress: todayAssigns.filter((a:any)=>a.status==='in_arbeit').length,
    problems: todayAssigns.filter((a:any)=>a.status==='problem').length,
  }

  // ── Styles ────────────────────────────────────────────────────────
  const contentPad = isDesktop ? '24px 32px' : isTablet ? '20px 24px' : '14px 16px'
  const maxW = isDesktop ? 900 : isTablet ? 680 : '100%'

  const s = {
    root: { minHeight:'100dvh', background:'var(--bg)', fontFamily:'Inter, system-ui, sans-serif', paddingBottom: isDesktop ? 0 : 76 },
    header: {
      background:'rgba(248,249,250,0.92)', backdropFilter:'blur(20px)',
      borderBottom:'1px solid rgba(191,200,202,0.4)',
      padding:`0 ${isDesktop ? 32 : 16}px`, height: isDesktop ? 64 : 56,
      display:'flex', alignItems:'center', justifyContent:'space-between',
      position:'sticky' as const, top:0, zIndex:100,
    },
    logo: { display:'flex', flexDirection:'column' as const, lineHeight:1.05 },
    logoBold: { fontSize: isDesktop?16:14, fontWeight:800, color:'var(--pri)', fontFamily:'Manrope, sans-serif' },
    logoLight: { fontSize: isDesktop?16:14, fontWeight:300, color:'var(--pri-c)', fontFamily:'Manrope, sans-serif', letterSpacing:'4px' },
    headerRight: { display:'flex', alignItems:'center', gap:12 },
    roleBadge: {
      padding:'4px 10px', borderRadius:20, background:'var(--pri-xl)',
      color:'var(--pri)', fontSize:12, fontWeight:700,
    },
    avatar: {
      width:36, height:36, borderRadius:18,
      background:'linear-gradient(135deg,var(--pri),var(--pri-c))',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer',
    },
    desktopLayout: { display:'flex', minHeight:'calc(100dvh - 64px)' },
    sidebar: {
      width:220, borderRight:'1px solid var(--brd)', padding:'16px 12px',
      display:'flex', flexDirection:'column' as const, gap:4, flexShrink:0,
      position:'sticky' as const, top:64, height:'calc(100dvh - 64px)', overflowY:'auto' as const,
    },
    sideTab: (active:boolean) => ({
      display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
      borderRadius:12, cursor:'pointer', border:'none',
      background:active?'var(--pri-xl)':'transparent',
      color:active?'var(--pri)':'var(--txt-muted)',
      fontSize:14, fontWeight:active?700:500, width:'100%', textAlign:'left' as const,
      transition:'all 0.15s',
    }),
    bottomNav: {
      position:'fixed' as const, bottom:0, left:0, right:0, zIndex:100,
      background:'rgba(248,249,250,0.95)', backdropFilter:'blur(20px)',
      borderTop:'1px solid rgba(191,200,202,0.4)',
      height:72, display:'flex', alignItems:'center', justifyContent:'space-around', padding:'0 4px',
    },
    navItem: (active:boolean) => ({
      flex:1, display:'flex', flexDirection:'column' as const, alignItems:'center', gap:3,
      padding:'8px 0', border:'none', background:'none', cursor:'pointer',
      color:active?'var(--pri)':'var(--txt-muted)',
    }),
    navLabel: (active:boolean) => ({ fontSize:10, fontWeight:active?700:500 }),
    content: { flex:1, padding:contentPad, maxWidth:maxW, margin:'0 auto', width:'100%' },
    kpiGrid: {
      display:'grid',
      gridTemplateColumns: isDesktop||isTablet ? 'repeat(4,1fr)' : 'repeat(2,1fr)',
      gap: isDesktop ? 14 : 10, marginBottom: isDesktop ? 24 : 16,
    },
    kpi: {
      background:'var(--surf)', borderRadius: isDesktop?16:12,
      padding: isDesktop?'18px 16px':'13px 12px',
      border:'1px solid var(--brd)', textAlign:'center' as const,
    },
    kpiVal: (warn:boolean) => ({ fontSize: isDesktop?28:22, fontWeight:800, color: warn?'#dc2626':'var(--pri)' }),
    kpiLabel: { fontSize: isDesktop?13:11, color:'var(--txt-muted)', marginTop:2 },
    sectionLabel: { fontSize:12, fontWeight:700, color:'#9ca3af', textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:10 },
    card: { background:'var(--surf)', borderRadius: isDesktop?14:12, border:'1px solid var(--brd)', marginBottom:8, padding: isDesktop?'14px 16px':'12px 14px' },
    objCard: {
      background:'var(--surf)', borderRadius: isDesktop?14:12, border:'1px solid var(--brd)',
      padding: isDesktop?'16px 18px':'13px 14px', marginBottom:10, cursor:'pointer',
      display:'flex', alignItems:'center', gap:12,
      transition:'box-shadow 0.15s',
    },
    objIcon: {
      width: isDesktop?44:40, height: isDesktop?44:40, borderRadius: isDesktop?14:12,
      background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
    },
    teamCard: {
      background:'var(--surf)', borderRadius: isDesktop?14:12, border:'1px solid var(--brd)',
      padding: isDesktop?'14px 16px':'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12,
    },
    memberAvatar: {
      width:38, height:38, borderRadius:19,
      background:'linear-gradient(135deg,var(--pri),var(--pri-c))',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:14, fontWeight:700, color:'#fff', flexShrink:0,
    },
    statusChip: (status:string) => ({
      padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:600,
      color:STATUS_COLOR[status]||'#6b7280', background:STATUS_BG[status]||'#f3f4f6', flexShrink:0,
    }),
    emptyState: { textAlign:'center' as const, padding:'40px 0', color:'#9ca3af', fontSize:14 },
    backBtn: { display:'flex', alignItems:'center', gap:8, marginBottom:16, cursor:'pointer', background:'none', border:'none', fontSize:14, color:'var(--pri)', fontWeight:600, padding:0 },
    editOverlay: { position:'fixed' as const, inset:0, zIndex:200, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end' },
    editSheet: { width:'100%', maxWidth:540, margin:'0 auto', background:'var(--bg)', borderRadius:'20px 20px 0 0', padding:'20px 20px 32px' },
    inputStyle: { width:'100%', padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--brd)', background:'var(--surf)', fontSize:14, color:'var(--txt)', fontFamily:'inherit', boxSizing:'border-box' as const, marginBottom:12 },
    saveBtn: { width:'100%', padding:13, borderRadius:12, border:'none', background:'var(--pri)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' },
  }

  const NAV_ITEMS: { key:Tab; icon:string; label:string }[] = [
    { key:'uebersicht', icon:'dashboard',  label:'Übersicht' },
    { key:'aufgaben',   icon:'checklist',  label:'Aufgaben' },
    { key:'objekte',    icon:'apartment',  label:'Objekte' },
    { key:'team',       icon:'group',      label:'Team' },
    { key:'profil',     icon:'person',     label:'Profil' },
  ]

  const assigneeLabel = (a:any) =>
    a.status==='vertretung' && a.substitute
      ? `${(a.substitute as any).full_name} (Vertr.)`
      : (a.users as any)?.full_name || 'Unzugewiesen'

  // ── Tab: Übersicht ───────────────────────────────────────────────
  const renderUebersichtTab = () => (
    <>
      {profileLoaded && !editPhone && (
        <div style={{ display:'flex', gap:10, padding:'12px 14px', borderRadius:14, background:'#fff8e1', border:'1px solid #fbbf24', alignItems:'flex-start', marginBottom:14, cursor:'pointer' }}
          onClick={() => setTab('profil')}>
          <span className="material-symbols-outlined" style={{ fontSize:18, color:'#d97706', flexShrink:0, marginTop:1 }}>warning</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e' }}>Kontaktdaten fehlen</div>
            <div style={{ fontSize:12, color:'#b45309', marginTop:1 }}>Bitte hinterlege Telefonnummer und Adresse im Profil.</div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize:16, color:'#d97706', flexShrink:0, marginTop:2 }}>arrow_forward</span>
        </div>
      )}
      <div style={s.kpiGrid}>
        {[
          { label:'Aufgaben heute', val:stats.total, warn:false },
          { label:'In Arbeit', val:stats.inProgress, warn:false },
          { label:'Erledigt', val:stats.done, warn:false },
          { label:'Probleme', val:stats.problems, warn:stats.problems>0 },
        ].map(({ label, val, warn }) => (
          <div key={label} style={s.kpi}>
            <div style={s.kpiVal(warn)}>{val}</div>
            <div style={s.kpiLabel}>{label}</div>
          </div>
        ))}
      </div>

      {stats.problems > 0 && <>
        <div style={s.sectionLabel}>⚠ Probleme heute</div>
        {todayAssigns.filter((a:any)=>a.status==='problem').map((a:any) => (
          <div key={a.id} style={{ ...s.card, borderLeft:'3px solid #dc2626' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>
              {(a.tasks as any)?.categories?.emoji} {(a.tasks as any)?.title}
            </div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>
              {assigneeLabel(a)} · {objects.find((o:any)=>o.id===(a.tasks as any)?.object_id)?.address||''}
            </div>
          </div>
        ))}
        <div style={{ marginBottom:16 }} />
      </>}

      <div style={s.sectionLabel}>Alle Aufgaben heute ({todayAssigns.length})</div>
      {todayAssigns.length === 0
        ? <div style={s.emptyState}>
            <span className="material-symbols-outlined" style={{ fontSize:36, display:'block', marginBottom:8 }}>event_available</span>
            Keine Aufgaben heute
          </div>
        : todayAssigns.map((a:any) => (
          <div key={a.id} style={s.card}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>{(a.tasks as any)?.categories?.emoji||'📋'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>{(a.tasks as any)?.title}</div>
                <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>
                  {assigneeLabel(a)} · {objects.find((o:any)=>o.id===(a.tasks as any)?.object_id)?.address||''}
                </div>
              </div>
              <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status]||a.status}</span>
            </div>
          </div>
        ))
      }
    </>
  )

  // ── Tab: Aufgaben (zuweisen + Vertretung, gruppiert nach Objekt) ──
  const renderAufgabenTab = () => {
    if (objects.length === 0) return (
      <div style={s.emptyState}>
        <span className="material-symbols-outlined" style={{ fontSize:36, display:'block', marginBottom:8 }}>apartment</span>
        Dir wurden noch keine Objekte zugewiesen
      </div>
    )
    return (
      <>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={s.sectionLabel}>Aufgaben ({tasks.length})</div>
          <button onClick={() => { setShowNewTask(true); setNtObj(objects.length===1?objects[0].id:''); setNtDate(localToday()); setNtErr('') }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 3px 10px rgba(9,106,112,0.2)' }}>
            <span className="material-symbols-outlined" style={{ fontSize:17 }}>add</span>Neue Aufgabe
          </button>
        </div>
        {objects.map((obj:any) => {
          const objTasksList = tasks.filter((t:any)=>t.object_id===obj.id)
          if (objTasksList.length === 0) return null
          return (
            <div key={obj.id} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>apartment</span>
                <span style={{ fontSize:14, fontWeight:800, color:'var(--txt)' }}>{obj.name || obj.address}</span>
              </div>
              {objTasksList.map((task:any) => {
                const taskAssigns = upcomingAssigns.filter((a:any)=>a.task_id===task.id)
                return (
                  <div key={task.id} style={{ background:'var(--surf)', borderRadius: isDesktop?14:12, border:'1px solid var(--brd)', marginBottom:10, overflow:'hidden' }}>
                    <div style={{ padding: isDesktop?'14px 16px':'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:20 }}>{task.categories?.emoji||'📋'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{task.title}</div>
                        <div style={{ fontSize:12, color:'#9ca3af' }}>
                          {task.interval}{(task.users as any)?.full_name ? ` · Standard: ${(task.users as any).full_name}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={()=>{ setEditingAssign(task); setAssignUser(''); setAssignDate(localToday()) }}
                        style={{ padding:'7px 12px', borderRadius:8, border:'none', background:'var(--pri-xl)', color:'var(--pri)', fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0 }}>
                        + Einteilen
                      </button>
                    </div>
                    {taskAssigns.length > 0 && (
                      <div style={{ borderTop:'1px solid var(--brd)' }}>
                        {taskAssigns.map((a:any) => (
                          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderBottom:'1px solid var(--brd)', fontSize:12 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:14, color: a.due_date===localToday() ? 'var(--pri)' : '#9ca3af', flexShrink:0 }}>event</span>
                            <span style={{ color: a.due_date===localToday() ? 'var(--pri)' : '#6b7280', fontWeight: a.due_date===localToday() ? 700 : 400, flexShrink:0 }}>
                              {a.due_date===localToday() ? 'Heute' : fmtDate(a.due_date)}
                            </span>
                            <span style={{ flex:1, color:'var(--txt)', fontWeight:600, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{assigneeLabel(a)}</span>
                            <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status]||a.status}</span>
                            {a.user_id && a.status==='offen' && (
                              <button
                                onClick={()=>{ setSubstAssign(a); setSubstUser('') }}
                                title="Vertretung setzen"
                                style={{ padding:'5px 6px', borderRadius:6, border:'1px solid var(--brd)', background:'var(--surf)', color:'#7c3aed', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize:14 }}>swap_horiz</span>
                              </button>
                            )}
                            {a.status==='offen' && (
                              <button
                                onClick={()=>setConfirmUnassign(a)}
                                title="Zuweisung entfernen"
                                style={{ padding:'5px 6px', borderRadius:6, border:'1px solid var(--brd)', background:'var(--surf)', color:'#dc2626', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize:14 }}>close</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </>
    )
  }

  // ── Tab: Objekte (lesend) ────────────────────────────────────────
  const renderObjekteTab = () => (
    selectedObj ? (
      <>
        <button style={s.backBtn} onClick={() => setSelectedObj(null)}>
          <span className="material-symbols-outlined" style={{ fontSize:18 }}>arrow_back</span>
          Zurück
        </button>
        <div style={{ fontSize: isDesktop?22:18, fontWeight:800, color:'var(--txt)', marginBottom:4 }}>
          {selectedObj.name || selectedObj.address}
        </div>
        <div style={{ fontSize:13, color:'#9ca3af', marginBottom:20 }}>{selectedObj.address}, {selectedObj.city}</div>

        <div style={s.sectionLabel}>Leistungen ({objTasks.length})</div>
        {objTasks.length === 0
          ? <div style={s.emptyState}>Keine Leistungen für dieses Objekt</div>
          : objTasks.map((task:any) => {
            const taskAssigns = objAssigns.filter((a:any)=>a.task_id===task.id)
            return (
              <div key={task.id} style={{ background:'var(--surf)', borderRadius: isDesktop?14:12, border:'1px solid var(--brd)', marginBottom:10, overflow:'hidden' }}>
                <div style={{ padding: isDesktop?'14px 16px':'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:20 }}>{task.categories?.emoji||'📋'}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{task.title}</div>
                    <div style={{ fontSize:12, color:'#9ca3af' }}>
                      {task.interval}{(task.users as any)?.full_name ? ` · Standard: ${(task.users as any).full_name}` : ''}
                    </div>
                  </div>
                </div>
                {taskAssigns.length > 0 && (
                  <div style={{ borderTop:'1px solid var(--brd)' }}>
                    {taskAssigns.map((a:any) => (
                      <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'1px solid var(--brd)', fontSize:12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14, color:'#9ca3af' }}>event</span>
                        <span style={{ color:'#6b7280', flexShrink:0 }}>{fmtDate(a.due_date)}</span>
                        <span style={{ flex:1, color:'var(--txt)', fontWeight:600 }}>{assigneeLabel(a)}</span>
                        <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status]||a.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        }
      </>
    ) : (
      <>
        <div style={s.sectionLabel}>Meine Objekte ({objects.length})</div>
        {objects.length === 0
          ? <div style={s.emptyState}>
              <span className="material-symbols-outlined" style={{ fontSize:36, display:'block', marginBottom:8 }}>apartment</span>
              Dir wurden noch keine Objekte zugewiesen
            </div>
          : <div style={{ display: isDesktop||isTablet ? 'grid' : 'block', gridTemplateColumns: isDesktop?'repeat(2,1fr)':'1fr', gap:12 }}>
              {objects.map((obj:any) => {
                const objToday = todayAssigns.filter((a:any)=>(a.tasks as any)?.object_id===obj.id)
                const problems = objToday.filter((a:any)=>a.status==='problem').length
                const done = objToday.filter((a:any)=>a.status==='erledigt').length
                return (
                  <div key={obj.id} style={s.objCard} onClick={()=>loadObjectDetail(obj)}>
                    <div style={s.objIcon}>
                      <span className="material-symbols-outlined" style={{ fontSize:22, color:'var(--pri)' }}>apartment</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {obj.name || obj.address}
                      </div>
                      <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>{obj.address}, {obj.city}</div>
                      <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' as const }}>
                        {problems > 0 && <span style={{ fontSize:11, fontWeight:600, color:'#dc2626', background:'#fef2f2', padding:'2px 8px', borderRadius:6 }}>⚠ {problems} Problem{problems>1?'e':''}</span>}
                        <span style={{ fontSize:11, color:'#9ca3af' }}>{done}/{objToday.length} heute erledigt</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color:'#d1d5db', flexShrink:0 }}>chevron_right</span>
                  </div>
                )
              })}
            </div>
        }
      </>
    )
  )

  // ── Tab: Team (Teamübersicht mit Status-Dots) ────────────────────────
  const renderTeamTab = () => {
    const today = localToday()
    const activeLeaves = leaves.filter((l:any) => l.from_date <= today && l.to_date >= today)
    const upcomingLeaves = leaves.filter((l:any) => l.from_date > today)

    // Leave-Map für Status-Dots
    const leaveMap: Record<string, { type: string; to_date: string }> = {}
    activeLeaves.forEach((l:any) => { leaveMap[l.user_id] = { type: l.request_type, to_date: l.to_date } })

    // Aktive Worker (task in_arbeit heute)
    const activeWorkerSet = new Set(
      todayAssigns.filter((a:any) => a.status === 'in_arbeit').map((a:any) => a.user_id)
    )

    const fmtShort = (d: string) => new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })
    const ini = (name: string) => name.split(' ').map((n:string) => n[0]).join('').slice(0,2).toUpperCase()

    const getStatus = (m: any) => {
      const isWorking = activeWorkerSet.has(m.id)
      const leave = leaveMap[m.id]
      const color = isWorking ? '#22c55e' : leave?.type === 'urlaub' ? '#dc2626' : leave?.type === 'krankmeldung' ? '#3b82f6' : '#f59e0b'
      const leaveTxt = leave ? ((leave.type === 'urlaub' ? 'Urlaub' : 'Krank') + ' bis ' + fmtShort(leave.to_date)) : null
      const leaveColor = leave?.type === 'urlaub' ? '#dc2626' : '#3b82f6'
      return { color, leaveTxt, leaveColor }
    }

    return (
      <>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:20, marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', margin:0, color:'var(--txt)' }}>Mein Team</h2>
            <p style={{ fontSize:13, color:'var(--txt-muted)', margin:'4px 0 0' }}>
              {allUsers.filter((m:any)=>m.is_active).length} aktiv· {allUsers.length} gesamt
            </p>
          </div>
        </div>

        {/* Legende */}
        <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' as const }}>
          {([{color:'#22c55e',label:'Aktiv'},{color:'#f59e0b',label:'Abwesend'},{color:'#3b82f6',label:'Krank'},{color:'#dc2626',label:'Urlaub'}] as const).map(({color,label}) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--txt-muted)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:color, display:'inline-block', flexShrink:0 }}/>
              {label}
            </div>
          ))}
        </div>

        {/* Mitglieder-Grid */}
        {allUsers.length === 0 ? (
          <div style={s.emptyState}>
            <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8, opacity:0.4 }}>group</span>
            Noch keine Mitarbeiter zugeordnet
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:24 }}>
            {allUsers.map((m:any) => {
              const st = getStatus(m)
              return (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--surf-card)', borderRadius:12, border:'1px solid var(--outline)', boxShadow:'0 1px 2px rgba(16,24,29,0.03)', opacity:m.is_active?1:0.5 }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11, fontFamily:'var(--font-head)' }}>{ini(m.full_name)}</div>
                    <span style={{ position:'absolute', bottom:-1, right:-1, width:9, height:9, borderRadius:'50%', background:st.color, border:'2px solid var(--surf-card)', display:'block' }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.full_name}</div>
                    {st.leaveTxt && <div style={{ fontSize:10.5, color:st.leaveColor, opacity:0.8, marginTop:2 }}>{st.leaveTxt}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Abwesenheiten */}
        {(activeLeaves.length > 0 || upcomingLeaves.length > 0) && (
          <>
            <div style={s.sectionLabel}>Abwesenheiten</div>
            {[...activeLeaves, ...upcomingLeaves].map((l:any) => {
              const col = LEAVE_COLOR[l.request_type] || { c:'#6b7280', bg:'#f3f4f6' }
              const running = l.from_date <= today && l.to_date >= today
              return (
                <div key={l.id} style={{ ...s.card, display:'flex', alignItems:'center', gap:10, borderLeft:`3px solid ${col.c}` }}>
                  <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, color:col.c, background:col.bg, flexShrink:0 }}>
                    {LEAVE_LABEL[l.request_type]||l.request_type}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>{(l.users as any)?.full_name||'-'}</div>
                    <div style={{ fontSize:12, color:'#9ca3af', marginTop:1 }}>
                      {fmtDate(l.from_date)} – {fmtDate(l.to_date)}{l.status==='genehmigt' ? '' : ' · ausstehend'}
                    </div>
                  </div>
                  {running && <span style={{ fontSize:11, fontWeight:700, color:col.c }}>läuft</span>}
                </div>
              )
            })}
            <div style={{ marginBottom:16 }} />
          </>
        )}

        {/* Stunden diese Woche */}
        {allUsers.some((m:any) => weekAssigns.some((a:any) => a.user_id === m.id && (a.work_minutes || a.travel_minutes))) && (
          <>
            <div style={s.sectionLabel}>Stunden diese Woche</div>
            <div style={{ display:'flex', flexDirection:'column' as const, gap:6, marginBottom:24 }}>
              {allUsers.map((m:any) => {
                const weekWork = weekAssigns.filter((a:any)=>a.user_id===m.id).reduce((s:number,a:any)=>s+(a.work_minutes||0),0)
                const weekTravel = weekAssigns.filter((a:any)=>a.user_id===m.id).reduce((s:number,a:any)=>s+(a.travel_minutes||0),0)
                if (weekWork === 0 && weekTravel === 0) return null
                return (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--surf-card)', borderRadius:11, border:'1px solid var(--outline)' }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--txt)', flex:1 }}>{m.full_name}</span>
                    {weekWork > 0 && <span style={{ fontSize:12, color:'var(--pri)', fontWeight:600 }}>{Math.round(weekWork/60*10)/10}h</span>}
                    {weekTravel > 0 && <span style={{ fontSize:12, color:'var(--txt-muted)', marginLeft:6 }}>{Math.round(weekTravel/60*10)/10}h Fahrt</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </>
    )
  }

  // ── Tab: Profil ──────────────────────────────────────────────────
  const renderProfilTab = () => (
    <div style={{ paddingBottom:32, maxWidth: isDesktop?540:'100%' }}>
      {/* Profil-Vollständigkeits-Banner */}
      {profileLoaded && !editPhone && (
        <div style={{ display:'flex', gap:10, padding:'12px 14px', borderRadius:14, background:'#fff8e1', border:'1px solid #fbbf24', alignItems:'flex-start', marginBottom:16 }}>
          <span className="material-symbols-outlined" style={{ fontSize:20, color:'#d97706', flexShrink:0, marginTop:1 }}>warning</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e' }}>Kontaktdaten fehlen</div>
            <div style={{ fontSize:12, color:'#b45309', marginTop:2, lineHeight:1.5 }}>Bitte hinterlege deine Telefonnummer, damit der Admin und das Team dich erreichen können.</div>
          </div>
          <button onClick={() => setShowDataForm(true)} style={{ flexShrink:0, padding:'7px 12px', borderRadius:10, border:'none', background:'#d97706', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Eintragen
          </button>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'8px 4px 20px' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,var(--pri),var(--pri-c))',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff', flexShrink:0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)' }}>{userName}</div>
          <div style={{ fontSize:12, color:'var(--pri)', fontWeight:600, marginTop:2, background:'var(--pri-xl)', padding:'2px 8px', borderRadius:6, display:'inline-block' }}>
            Teamleiter
          </div>
        </div>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:8 }}>Konto</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden', border:'1px solid var(--outline)', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', borderBottom:'1px solid var(--outline)' }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>mail</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>E-Mail</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{email||'…'}</div>
          </div>
        </div>

        <div style={{ borderBottom:'1px solid var(--outline)' }}>
          <div onClick={()=>{setShowDataForm(f=>!f);setDataMsg(null)}}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background:showDataForm?'var(--pri-xl)':'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>person_edit</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:showDataForm?'var(--pri)':'var(--txt)' }}>Meine Daten</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Name, Telefon & Adresse</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform:showDataForm?'rotate(90deg)':'none' }}>chevron_right</span>
          </div>
          {showDataForm && (
            <form onSubmit={handleDataSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column' as const, gap:10, borderTop:'1px solid var(--outline)' }}>
              <div style={{ height:4 }} />
              {[
                { icon:'person', val:editName, set:setEditName, ph:'Vor- und Nachname', type:'text' },
                { icon:'phone', val:editPhone, set:setEditPhone, ph:'+49 160 12345678', type:'tel' },
                { icon:'home', val:editStreet, set:setEditStreet, ph:'Straße und Hausnummer', type:'text' },
                { icon:'location_city', val:editCity, set:setEditCity, ph:'Ort', type:'text' },
              ].map(({ icon, val, set, ph, type }) => (
                <div key={icon} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{icon}</span>
                  <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                    style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
                </div>
              ))}
              {dataMsg && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:dataMsg.ok?'var(--ok-bg)':'var(--err-bg)', color:dataMsg.ok?'var(--ok)':'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>{dataMsg.ok?'check_circle':'error'}</span>{dataMsg.text}
              </div>}
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>{setShowDataForm(false);setDataMsg(null)}} style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button type="submit" disabled={dataSaving} style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16 }}>{dataSaving?'hourglass_empty':'save'}</span>{dataSaving?'…':'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div>
          <div onClick={()=>{setShowPwForm(f=>!f);setPwMsg(null)}}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background:showPwForm?'var(--pri-xl)':'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>lock</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:showPwForm?'var(--pri)':'var(--txt)' }}>Passwort ändern</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Neues Passwort festlegen</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform:showPwForm?'rotate(90deg)':'none' }}>chevron_right</span>
          </div>
          {showPwForm && (
            <form onSubmit={handlePwSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column' as const, gap:10, borderTop:'1px solid var(--outline)' }}>
              <div style={{ height:4 }} />
              {pwInputRow('lock','Neues Passwort (mind. 8 Zeichen)',pw1,setPw1,showPw1,setShowPw1)}
              {pwInputRow('lock_reset','Passwort wiederholen',pw2,setPw2,showPw2,setShowPw2)}
              {pwMsg && <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background:pwMsg.ok?'var(--ok-bg)':'var(--err-bg)', color:pwMsg.ok?'var(--ok)':'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>{pwMsg.ok?'check_circle':'error'}</span>{pwMsg.text}
              </div>}
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>{setShowPwForm(false);setPwMsg(null)}} style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button type="submit" disabled={pwSaving} style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16 }}>{pwSaving?'hourglass_empty':'lock_reset'}</span>{pwSaving?'…':'Speichern'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:8 }}>Sonstiges</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden', border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row icon="lightbulb" iconBg="rgba(217,119,6,0.08)" label="Feedback & Ideen"
          sub="Fehler melden, Feature-Wünsche, Vorschläge" chevron onClick={()=>setShowFeedback(true)} />
        <div style={{ borderTop:'1px solid var(--outline)' }}>
          <div onClick={onLogout} style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background:'rgba(186,26,26,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--err-dot)' }}>logout</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--err-dot)' }}>Abmelden</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Sitzung beenden</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderTabContent = () => {
    if (loading) return <div style={s.emptyState}>Lade…</div>
    if (tab === 'uebersicht') return renderUebersichtTab()
    if (tab === 'aufgaben')   return renderAufgabenTab()
    if (tab === 'objekte')    return renderObjekteTab()
    if (tab === 'team')       return renderTeamTab()
    if (tab === 'profil')     return renderProfilTab()
  }

  // Für das Einteilen-Sheet: bereits bestehende Zuweisung am gewählten Tag + sortierte Mitarbeiterliste (Standard zuerst)
  const existingForAssignDate = editingAssign
    ? [...upcomingAssigns, ...objAssigns].find((a:any)=>a.task_id===editingAssign.id && a.due_date===assignDate)
    : null
  const sortedAssignUsers = editingAssign
    ? [...allUsers].sort((a:any,b:any) => {
        const aDef = a.id === editingAssign.default_assignee_id ? 0 : 1
        const bDef = b.id === editingAssign.default_assignee_id ? 0 : 1
        if (aDef !== bDef) return aDef - bDef
        return (a.full_name||'').localeCompare(b.full_name||'')
      })
    : allUsers

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <span style={s.logoBold}>STEUBER</span>
          <span style={s.logoLight}>WORK</span>
        </div>
        <div style={s.headerRight}>
          {!isMobile && <span style={s.roleBadge}>Teamleiter</span>}
          <div style={s.avatar} onClick={()=>setTab('profil')}>{initials}</div>
        </div>
      </div>

      {isDesktop ? (
        <div style={s.desktopLayout}>
          <nav style={s.sidebar}>
            <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
              {NAV_ITEMS.map(({ key, icon, label }) => (
                <button key={key} style={s.sideTab(tab===key)} onClick={()=>{ setTab(key); setSelectedObj(null) }}>
                  <span className="material-symbols-outlined" style={{ fontSize:20 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ borderTop:'1px solid var(--brd)', paddingTop:10, marginTop:8 }}>
              <button onClick={onLogout} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:12, border:'none', background:'transparent', color:'var(--err-dot)', fontSize:14, fontWeight:600, width:'100%', textAlign:'left', cursor:'pointer', transition:'background 0.15s' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(186,26,26,0.08)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <span className="material-symbols-outlined" style={{ fontSize:20 }}>logout</span>
                Abmelden
              </button>
            </div>
          </nav>
          <main style={s.content}>
            {renderTabContent()}
          </main>
        </div>
      ) : (
        <>
          <main style={s.content}>
            {renderTabContent()}
          </main>
          <nav style={s.bottomNav}>
            {NAV_ITEMS.map(({ key, icon, label }) => (
              <button key={key} style={s.navItem(tab===key)} onClick={()=>{ setTab(key); setSelectedObj(null) }}>
                <span className="material-symbols-outlined" style={{ fontSize:24 }}>{icon}</span>
                <span style={s.navLabel(tab===key)}>{label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {/* Neue Aufgabe Sheet */}
      {showNewTask && (
        <div style={s.editOverlay} onClick={e=>{ if(e.target===e.currentTarget) setShowNewTask(false) }}>
          <div style={{ ...s.editSheet, maxHeight:'90dvh', overflowY:'auto' as const }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:17, fontWeight:800, fontFamily:'Manrope, sans-serif', color:'var(--txt)' }}>Neue Aufgabe</div>
              <button onClick={()=>setShowNewTask(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Objekt */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Objekt *</label>
            <div style={{ position:'relative', marginBottom:14 }}>
              <select value={ntObj} onChange={e=>setNtObj(e.target.value)} style={{ ...s.inputStyle, padding:'10px 32px 10px 12px', appearance:'none', WebkitAppearance:'none', marginBottom:0 }}>
                <option value="">Objekt wählen…</option>
                {objects.map((o:any) => <option key={o.id} value={o.id}>{o.name || o.address}</option>)}
              </select>
              <span className="material-symbols-outlined" style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'var(--txt-muted)', pointerEvents:'none' }}>expand_more</span>
            </div>

            {/* Titel */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Titel *</label>
            <input type="text" value={ntTitle} onChange={e=>setNtTitle(e.target.value)} placeholder="z.B. Eingang reinigen"
              style={{ ...s.inputStyle, marginBottom:14 }} />

            {/* Kategorie */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Kategorie</label>
            <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6, marginBottom:14 }}>
              {categories.map((c:any) => (
                <button key={c.id} type="button" onClick={()=>setNtCat(ntCat===c.id?'':c.id)}
                  style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${ntCat===c.id?'var(--pri)':'var(--outline)'}`, background:ntCat===c.id?'var(--pri-xl)':'var(--surf-card)', color:ntCat===c.id?'var(--pri)':'var(--txt)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>

            {/* Intervall */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Intervall</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const, marginBottom:14 }}>
              {(['einmalig','täglich','wöchentlich','monatlich','quartalsweise'] as const).map(iv => (
                <button key={iv} type="button" onClick={()=>setNtInterval(iv)}
                  style={{ padding:'6px 10px', borderRadius:8, border:`1.5px solid ${ntInterval===iv?'var(--pri)':'var(--outline)'}`, background:ntInterval===iv?'var(--pri-xl)':'var(--surf-card)', color:ntInterval===iv?'var(--pri)':'var(--txt)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {iv.charAt(0).toUpperCase()+iv.slice(1)}
                </button>
              ))}
            </div>

            {/* Datum */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Startdatum</label>
            <input type="date" value={ntDate} onChange={e=>setNtDate(e.target.value)} style={{ ...s.inputStyle, marginBottom:14 }} />

            {/* Mitarbeiter */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Mitarbeiter (optional)</label>
            <div style={{ position:'relative', marginBottom:16 }}>
              <select value={ntAssignee} onChange={e=>setNtAssignee(e.target.value)} style={{ ...s.inputStyle, padding:'10px 32px 10px 12px', appearance:'none', WebkitAppearance:'none', marginBottom:0 }}>
                <option value="">Kein Mitarbeiter</option>
                {allUsers.map((u:any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <span className="material-symbols-outlined" style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'var(--txt-muted)', pointerEvents:'none' }}>expand_more</span>
            </div>

            {ntErr && <div style={{ display:'flex', gap:8, padding:'10px 12px', borderRadius:10, background:'var(--err-bg)', color:'var(--err)', fontSize:13, marginBottom:12, alignItems:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:15 }}>error</span>{ntErr}
            </div>}

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setShowNewTask(false)} style={{ flex:1, padding:13, borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:14, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
              <button onClick={handleCreateTask} disabled={ntSaving||!ntObj||!ntTitle.trim()}
                style={{ flex:2, padding:13, borderRadius:12, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:(!ntObj||!ntTitle.trim())?0.5:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span className="material-symbols-outlined" style={{ fontSize:17 }}>{ntSaving?'hourglass_empty':'add_task'}</span>
                {ntSaving?'Wird gespeichert…':'Aufgabe anlegen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Einteilen Sheet */}
      {editingAssign && (
        <div style={s.editOverlay} onClick={e=>{ if(e.target===e.currentTarget) setEditingAssign(null) }}>
          <div style={s.editSheet}>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Mitarbeiter einteilen</div>
            <div style={{ fontSize:13, color:'#9ca3af', marginBottom:16 }}>{editingAssign.title}</div>

            <label style={{ fontSize:12, fontWeight:600, color:'var(--txt)', display:'block', marginBottom:6 }}>Datum</label>
            <div style={{ display:'flex', gap:6, marginBottom:8 }}>
              {[{ label:'Heute', val:localToday() }, { label:'Morgen', val:addDaysISO(1) }].map(q => (
                <button key={q.label} type="button" onClick={()=>setAssignDate(q.val)}
                  style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${assignDate===q.val?'var(--pri)':'var(--brd)'}`, background:assignDate===q.val?'var(--pri-xl)':'var(--surf)', color:assignDate===q.val?'var(--pri)':'var(--txt-muted)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {q.label}
                </button>
              ))}
            </div>
            <input type="date" style={s.inputStyle} value={assignDate} onChange={e=>setAssignDate(e.target.value)} />

            {existingForAssignDate && (
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 12px', borderRadius:10, background:'var(--surf-low)', border:'1px dashed var(--brd)', fontSize:12, color:'var(--txt-muted)', marginBottom:12 }}>
                <span className="material-symbols-outlined" style={{ fontSize:15, flexShrink:0 }}>info</span>
                Bereits zugewiesen: <strong style={{ color:'var(--txt)' }}>{(existingForAssignDate.users as any)?.full_name || '—'}</strong> — wird ersetzt
              </div>
            )}

            <label style={{ fontSize:12, fontWeight:600, color:'var(--txt)', display:'block', marginBottom:6 }}>Mitarbeiter</label>
            {editingAssign.default_assignee_id && allUsers.some((u:any)=>u.id===editingAssign.default_assignee_id) && assignUser!==editingAssign.default_assignee_id && (
              <button type="button" onClick={()=>setAssignUser(editingAssign.default_assignee_id)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1.5px dashed var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:12, fontWeight:600, cursor:'pointer', marginBottom:8 }}>
                <span className="material-symbols-outlined" style={{ fontSize:15 }}>star</span>
                Standard: {(editingAssign.users as any)?.full_name}
              </button>
            )}
            <select style={s.inputStyle} value={assignUser} onChange={e=>setAssignUser(e.target.value)}>
              <option value="">Mitarbeiter wählen…</option>
              {sortedAssignUsers.map((u:any) => (
                <option key={u.id} value={u.id}>{u.full_name}{u.id===editingAssign.default_assignee_id ? ' (Standard)' : ''}</option>
              ))}
            </select>
            <button style={s.saveBtn} onClick={handleSaveAssign} disabled={!assignUser||saving}>
              {saving?'Wird gespeichert…':'Einteilen'}
            </button>
          </div>
        </div>
      )}

      {/* Vertretung Sheet */}
      {substAssign && (
        <div style={s.editOverlay} onClick={e=>{ if(e.target===e.currentTarget) setSubstAssign(null) }}>
          <div style={s.editSheet}>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Vertretung setzen</div>
            <div style={{ fontSize:13, color:'#9ca3af', marginBottom:16 }}>
              {(substAssign.tasks as any)?.title} · {fmtDate(substAssign.due_date)}
              {(substAssign.users as any)?.full_name ? ` · statt ${(substAssign.users as any).full_name}` : ''}
            </div>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--txt)', display:'block', marginBottom:6 }}>Vertretung durch</label>
            <select style={s.inputStyle} value={substUser} onChange={e=>setSubstUser(e.target.value)}>
              <option value="">Mitarbeiter wählen…</option>
              {allUsers.filter((u:any)=>u.id!==substAssign.user_id && u.id!==userId).map((u:any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <button style={{ ...s.saveBtn, background:'#7c3aed' }} onClick={handleSaveSubst} disabled={!substUser||substSaving}>
              {substSaving?'Wird gespeichert…':'Vertretung speichern'}
            </button>
          </div>
        </div>
      )}

      {/* Zuweisung entfernen: Bestätigung */}
      {confirmUnassign && (
        <div style={s.editOverlay} onClick={e=>{ if(e.target===e.currentTarget) setConfirmUnassign(null) }}>
          <div style={s.editSheet}>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Zuweisung entfernen?</div>
            <div style={{ fontSize:13, color:'#9ca3af', marginBottom:20 }}>
              {(confirmUnassign.tasks as any)?.title} · {fmtDate(confirmUnassign.due_date)}
              {(confirmUnassign.users as any)?.full_name ? ` · ${(confirmUnassign.users as any).full_name}` : ''}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setConfirmUnassign(null)}
                style={{ flex:1, padding:'12px 0', borderRadius:12, border:'1.5px solid var(--brd)', background:'var(--surf)', color:'var(--txt)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={()=>handleUnassign(confirmUnassign)} disabled={unassigning}
                style={{ flex:1, padding:'12px 0', borderRadius:12, border:'none', background:'#dc2626', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {unassigning?'Entferne…':'Entfernen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', left:'50%', transform:'translateX(-50%)', bottom: isDesktop ? 24 : 88, zIndex:300, background:'var(--txt)', color:'#fff', padding:'11px 20px', borderRadius:999, fontSize:13, fontWeight:600, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap' as const }}>
          <span className="material-symbols-outlined" style={{ fontSize:16 }}>check_circle</span>{toast}
        </div>
      )}

      {showFeedback && <FeedbackSheet onClose={()=>setShowFeedback(false)} />}
    </div>
  )
}

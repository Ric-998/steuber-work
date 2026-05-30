import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import FeedbackSheet from '../components/FeedbackSheet'

interface Props {
  userId: string
  userName: string
  onLogout: () => void
}

type Tab = 'heute' | 'objekte' | 'team' | 'profil'

const STATUS_COLOR: Record<string, string> = {
  offen:'#6b7280', in_arbeit:'#d97706', erledigt:'#16a34a', problem:'#dc2626', vertretung:'#7c3aed',
}
const STATUS_BG: Record<string, string> = {
  offen:'#f3f4f6', in_arbeit:'#fffbeb', erledigt:'#f0fdf4', problem:'#fef2f2', vertretung:'#f5f3ff',
}
const STATUS_LABEL: Record<string, string> = {
  offen:'Offen', in_arbeit:'In Arbeit', erledigt:'Erledigt', problem:'Problem', vertretung:'Vertretung',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
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

export default function ObjektleiterDashboard({ userId, userName, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('heute')
  const [objects, setObjects] = useState<any[]>([])
  const [todayAssigns, setTodayAssigns] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedObj, setSelectedObj] = useState<any>(null)
  const [objTasks, setObjTasks] = useState<any[]>([])
  const [objAssigns, setObjAssigns] = useState<any[]>([])
  const [editingAssign, setEditingAssign] = useState<any>(null)
  const [assignUser, setAssignUser] = useState('')
  const [assignDate, setAssignDate] = useState(localToday())
  const [saving, setSaving] = useState(false)

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
  const [pushEnabled, setPushEnabled] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)

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
    const [objRes, usersRes] = await Promise.all([
      supabase.from('objects').select('*').eq('objektleiter_id', userId).eq('is_active', true).order('name'),
      supabase.from('users').select('id,full_name,is_active').eq('is_active', true).order('full_name'),
    ])
    const objs = objRes.data || []
    setObjects(objs)
    setAllUsers(usersRes.data || [])

    if (objs.length > 0) {
      const objIds = objs.map((o: any) => o.id)
      const { data: tasksData } = await supabase
        .from('tasks').select('id,object_id').in('object_id', objIds).eq('is_active', true)
      const taskIds = (tasksData || []).map((t: any) => t.id)

      if (taskIds.length > 0) {
        const [todayRes, teamRes] = await Promise.all([
          supabase.from('task_assignments')
            .select('id,task_id,user_id,due_date,status,tasks(title,object_id,categories(emoji)),users!task_assignments_user_id_fkey(id,full_name)')
            .in('task_id', taskIds).eq('due_date', today),
          supabase.from('task_assignments')
            .select('user_id,users!task_assignments_user_id_fkey(id,full_name)')
            .in('task_id', taskIds)
            .gte('due_date', (() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) })()),
        ])
        setTodayAssigns(todayRes.data || [])
        const seen = new Set<string>()
        const uniqueTeam: any[] = []
        ;(teamRes.data || []).forEach((a: any) => {
          if (a.user_id && !seen.has(a.user_id)) { seen.add(a.user_id); uniqueTeam.push(a.users) }
        })
        setTeam(uniqueTeam.filter(Boolean))
      }
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmailState(data.user.email)
    })
    supabase.from('users').select('phone,full_name').eq('id', userId).single().then(({ data }) => {
      if (data?.phone) setEditPhone(data.phone)
      if (data?.full_name) setEditName(data.full_name)
    })
  }, [userId])

  const loadObjectDetail = async (obj: any) => {
    setSelectedObj(obj)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id,title,interval,is_active,category_id,default_assignee,categories(emoji,name),users!tasks_default_assignee_fkey(full_name)')
      .eq('object_id', obj.id).order('title')
    setObjTasks(tasks || [])
    const taskIds = (tasks || []).map((t: any) => t.id)
    if (taskIds.length > 0) {
      const today = localToday()
      const in14 = new Date(); in14.setDate(in14.getDate()+14)
      const { data: assigns } = await supabase
        .from('task_assignments')
        .select('id,task_id,user_id,due_date,status,users!task_assignments_user_id_fkey(id,full_name)')
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
      await supabase.from('task_assignments').update({ user_id: assignUser }).eq('id', existing.id)
    } else {
      await supabase.from('task_assignments').insert({ task_id: editingAssign.id, user_id: assignUser, due_date: assignDate, status: 'offen' })
    }
    setSaving(false); setEditingAssign(null)
    if (selectedObj) loadObjectDetail(selectedObj)
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
    const { error } = await supabase.from('users').update({ full_name: editName.trim(), phone: editPhone.trim() || null }).eq('id', userId)
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
    // Desktop sidebar tabs
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
    // Mobile bottom nav
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
    // Content
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
    { key:'heute',   icon:'today',           label:'Heute' },
    { key:'objekte', icon:'apartment',        label:'Objekte' },
    { key:'team',    icon:'group',            label:'Team' },
    { key:'profil',  icon:'person',           label:'Profil' },
  ]

  // ── Tab Contents ─────────────────────────────────────────────────
  const renderHeuteTab = () => (
    <>
      <div style={s.kpiGrid}>
        {[
          { label:'Aufgaben', val:stats.total, warn:false },
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
              {(a.users as any)?.full_name} · {objects.find((o:any)=>o.id===(a.tasks as any)?.object_id)?.address||''}
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
                  {(a.users as any)?.full_name} · {objects.find((o:any)=>o.id===(a.tasks as any)?.object_id)?.address||''}
                </div>
              </div>
              <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status]||a.status}</span>
            </div>
          </div>
        ))
      }
    </>
  )

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

        <div style={s.sectionLabel}>Leistungen & Einteilung ({objTasks.length})</div>
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
                      {task.interval} {(task.users as any)?.full_name ? `· Standard: ${(task.users as any).full_name}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={()=>{ setEditingAssign(task); setAssignUser(''); setAssignDate(localToday()) }}
                    style={{ padding:'7px 12px', borderRadius:8, border:'none', background:'var(--pri-xl)', color:'var(--pri)', fontSize:12, fontWeight:600, cursor:'pointer', flexShrink:0 }}
                  >
                    + Einteilen
                  </button>
                </div>
                {taskAssigns.length > 0 && (
                  <div style={{ borderTop:'1px solid var(--brd)' }}>
                    {taskAssigns.map((a:any) => (
                      <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'1px solid var(--brd)', fontSize:12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14, color:'#9ca3af' }}>event</span>
                        <span style={{ color:'#6b7280', flexShrink:0 }}>{new Date(a.due_date).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'short'})}</span>
                        <span style={{ flex:1, color:'var(--txt)', fontWeight:600 }}>{(a.users as any)?.full_name||'Unzugewiesen'}</span>
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

  const renderTeamTab = () => (
    <>
      <div style={s.sectionLabel}>Mein Team ({team.length} Mitarbeiter)</div>
      {team.length === 0
        ? <div style={s.emptyState}>
            <span className="material-symbols-outlined" style={{ fontSize:36, display:'block', marginBottom:8 }}>group</span>
            Noch keine Mitarbeiter eingeteilt
          </div>
        : <div style={{ display: isDesktop ? 'grid' : 'block', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
            {team.map((member:any) => {
              if (!member) return null
              const ini = (member.full_name||'?').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
              const mt = todayAssigns.filter((a:any)=>a.user_id===member.id)
              const done = mt.filter((a:any)=>a.status==='erledigt').length
              const hasProb = mt.some((a:any)=>a.status==='problem')
              return (
                <div key={member.id} style={s.teamCard}>
                  <div style={s.memberAvatar}>{ini}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>{member.full_name}</div>
                    <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>
                      {mt.length>0 ? `${done}/${mt.length} heute erledigt` : 'Heute keine Aufgaben'}
                    </div>
                  </div>
                  {hasProb
                    ? <span style={{ fontSize:11, fontWeight:600, color:'#dc2626', background:'#fef2f2', padding:'3px 8px', borderRadius:6 }}>Problem</span>
                    : mt.length>0
                      ? <span style={{ fontSize:11, fontWeight:600, color:done===mt.length?'#16a34a':'#d97706', background:done===mt.length?'#f0fdf4':'#fffbeb', padding:'3px 8px', borderRadius:6 }}>
                          {done===mt.length?'Alles erledigt':'In Arbeit'}
                        </span>
                      : null
                  }
                </div>
              )
            })}
          </div>
      }
    </>
  )

  const renderProfilTab = () => (
    <div style={{ paddingBottom:32, maxWidth: isDesktop?540:'100%' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'8px 4px 20px' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,var(--pri),var(--pri-c))',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#fff', flexShrink:0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)' }}>{userName}</div>
          <div style={{ fontSize:12, color:'var(--pri)', fontWeight:600, marginTop:2, background:'var(--pri-xl)', padding:'2px 8px', borderRadius:6, display:'inline-block' }}>
            Objektleiter
          </div>
        </div>
      </div>

      {/* Konto */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:8 }}>Konto</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden', border:'1px solid var(--outline)', marginBottom:20 }}>
        {/* E-Mail */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', borderBottom:'1px solid var(--outline)' }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>mail</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>E-Mail</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{email||'…'}</div>
          </div>
        </div>

        {/* Meine Daten */}
        <div style={{ borderBottom:'1px solid var(--outline)' }}>
          <div onClick={()=>{setShowDataForm(f=>!f);setDataMsg(null)}}
            style={{ display:'flex', alignItems:'center', gap:14, padding:'13px 16px', cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:10, background:showDataForm?'var(--pri-xl)':'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>person_edit</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:showDataForm?'var(--pri)':'var(--txt)' }}>Meine Daten</div>
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Name und Telefonnummer</div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform:showDataForm?'rotate(90deg)':'none' }}>chevron_right</span>
          </div>
          {showDataForm && (
            <form onSubmit={handleDataSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column' as const, gap:10, borderTop:'1px solid var(--outline)' }}>
              <div style={{ height:4 }} />
              {[
                { icon:'person', val:editName, set:setEditName, ph:'Vor- und Nachname', type:'text' },
                { icon:'phone', val:editPhone, set:setEditPhone, ph:'+49 160 12345678', type:'tel' },
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

        {/* Passwort */}
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

      {/* Sonstiges */}
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:8 }}>Sonstiges</div>
      <div style={{ background:'var(--surf-card)', borderRadius:18, overflow:'hidden', border:'1px solid var(--outline)', marginBottom:20 }}>
        <Row icon="lightbulb" iconBg="rgba(217,119,6,0.08)" label="Feedback & Ideen"
          sub="Fehler melden, Feature-Wünsche, Vorschläge" chevron onClick={()=>setShowFeedback(true)} last />
      </div>

      {/* Abmelden */}
      <button onClick={onLogout} style={{ width:'100%', padding:'14px', borderRadius:16, border:'none',
        background:'rgba(186,26,26,0.08)', color:'var(--err-dot)', fontSize:14, fontWeight:700,
        display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
        <span className="material-symbols-outlined" style={{ fontSize:18 }}>logout</span>Abmelden
      </button>
    </div>
  )

  const renderTabContent = () => {
    if (loading) return <div style={s.emptyState}>Lade…</div>
    if (tab === 'heute')   return renderHeuteTab()
    if (tab === 'objekte') return renderObjekteTab()
    if (tab === 'team')    return renderTeamTab()
    if (tab === 'profil')  return renderProfilTab()
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <span style={s.logoBold}>STEUBER</span>
          <span style={s.logoLight}>WORK</span>
        </div>
        <div style={s.headerRight}>
          {!isMobile && <span style={s.roleBadge}>Objektleiter</span>}
          <div style={s.avatar} onClick={()=>setTab('profil')}>{initials}</div>
        </div>
      </div>

      {isDesktop ? (
        /* Desktop: Sidebar layout */
        <div style={s.desktopLayout}>
          <nav style={s.sidebar}>
            {NAV_ITEMS.map(({ key, icon, label }) => (
              <button key={key} style={s.sideTab(tab===key)} onClick={()=>{ setTab(key); setSelectedObj(null) }}>
                <span className="material-symbols-outlined" style={{ fontSize:20 }}>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
          <main style={s.content}>
            {renderTabContent()}
          </main>
        </div>
      ) : (
        /* Mobile + Tablet: scrollable content + bottom nav */
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

      {/* Assign Sheet */}
      {editingAssign && (
        <div style={s.editOverlay} onClick={e=>{ if(e.target===e.currentTarget) setEditingAssign(null) }}>
          <div style={s.editSheet}>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--txt)', marginBottom:4 }}>Mitarbeiter einteilen</div>
            <div style={{ fontSize:13, color:'#9ca3af', marginBottom:16 }}>{editingAssign.title}</div>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--txt)', display:'block', marginBottom:6 }}>Datum</label>
            <input type="date" style={s.inputStyle} value={assignDate} onChange={e=>setAssignDate(e.target.value)} />
            <label style={{ fontSize:12, fontWeight:600, color:'var(--txt)', display:'block', marginBottom:6 }}>Mitarbeiter</label>
            <select style={s.inputStyle} value={assignUser} onChange={e=>setAssignUser(e.target.value)}>
              <option value="">Mitarbeiter wählen…</option>
              {allUsers.map((u:any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <button style={s.saveBtn} onClick={handleSaveAssign} disabled={!assignUser||saving}>
              {saving?'Wird gespeichert…':'Einteilen'}
            </button>
          </div>
        </div>
      )}

      {showFeedback && <FeedbackSheet onClose={()=>setShowFeedback(false)} />}
    </div>
  )
}

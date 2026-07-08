import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { supabase } from '../lib/supabase'
import { ConfirmDialog } from '../components/ConfirmDialog'
// xlsx loaded dynamically on demand
import BugReport from '../components/BugReport'
import { ChatTab, useChatUnread } from '../components/Chat'
import { PWAInstallBanner } from '../components/PWAInstallBanner'
import { WasIstNeu } from '../components/WasIstNeu'
import QRCode from '../components/QRCode'
import MapView from '../components/MapView'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stats { heute_faellig:number; in_arbeit:number; gesamt_offen:number; diese_woche_done:number; probleme:number; probleme_heute:number; letzte_woche_done:number; letzte_woche_probleme:number }
interface ProblemReport { note:string|null; photo_urls:string[]|null; created_at:string }
interface Problem { id:string; status:string; due_date:string; user_id:string|null; tasks:{ title:string; description:string|null; interval:string|null; objects:{ id:string; address:string; postal_code:string; city:string }|null }|null; users:{ full_name:string; phone:string|null }|null; report:ProblemReport|null }
interface LeaveRequest {
  id: string; user_id: string; request_type: 'urlaub'|'krankmeldung'|'sonstiges'; from_date: string; to_date: string
  note?: string|null; status: 'ausstehend'|'genehmigt'|'abgelehnt'; created_at: string
  users?: { full_name: string; phone?: string|null }|null
}
interface TeamMember {
  id: string; full_name: string; is_active: boolean; role_id: string; role_name?: string
  phone?: string|null; street?: string|null; postal_code?: string|null; city?: string|null
  email?: string|null; created_at?: string; employed_since?: string|null
  work_days?: string[]|null; work_hours_per_week?: number|null
  work_hours_type?: 'fest'|'variabel'; hourly_wage?: number|null
  admin_setup_done?: boolean; is_onboarded?: boolean; vacation_days_per_year?: number
}
interface Category { id:string; name:string; emoji:string }
type ObjectType = 'einfamilienhaus'|'mehrfamilienhaus'|'firmengelaende'|'grundstueck'
interface ObjectItem { id:string; name:string; address:string; city:string; postal_code:string; object_number?:string|null; customer_id?:string|null; is_active:boolean; object_type?:ObjectType|null; address_supplement?:string|null; notes?:string|null; access_note?:string|null; parking_note?:string|null; floor_info?:string|null; objektleiter_id?:string|null; customers:{ id:string; name:string }|null }
type CustomerType = 'privatperson'|'firma'|'weg-verwaltung'|'mietverwaltung'
interface CustomerItem {
  id: string
  customer_type: CustomerType
  name: string                          // display name; computed for privatperson, company/WEG name otherwise
  // Split name fields (privatperson only)
  first_name?: string|null
  last_name?: string|null
  salutation?: string|null
  // Company contact (legacy, kept for compat)
  contact_person?: string|null
  contact_first_name?: string|null
  contact_last_name?: string|null
  email?: string|null
  phone?: string|null
  // Address
  street?: string|null
  street_name?: string|null
  street_number?: string|null
  postal_code?: string|null
  city?: string|null
  address_supplement?: string|null
  notes?: string|null
  lexware_id?: string|null
  contract_type?: 'jahresvertrag'|'einmalig'|null
  // WEG-Verwaltung: Verknüpfung zur Hausverwaltung + c/o-Ansprechpartner
  hausverwaltung_id?: string|null
  hausverwaltung_objekt_id?: string|null
  co_contact_id?: string|null
  is_hausverwaltung?: boolean
  hausverwaltung?: { id:string; name:string; customer_type:CustomerType } | null
  co_contact?: { id:string; name:string; role?:string|null; phone?:string|null; email?:string|null } | null
}
interface ContactPerson {
  id: string
  customer_id: string
  name: string
  role?: string|null
  phone?: string|null
  email?: string|null
  salutation?: string|null          // 'herr'|'frau'|'eheleute'|'firma' (Eigentümer)
  first_name?: string|null
  last_name?: string|null
  second_first_name?: string|null
  second_last_name?: string|null
  created_at: string
}
interface ContractItem { id:string; type:'jahresvertrag'|'einmalig'; start_date:string|null; end_date:string|null; object_id:string|null; customer_id:string|null }
interface TaskItem { id:string; title:string; description:string|null; interval:string; is_active:boolean; due_date:string|null; end_date:string|null; category_id:string|null; object_id:string|null; contract_id:string|null; default_assignee_id:string|null; categories:{ name:string; emoji:string }|null; objects:{ name:string; address:string; city:string }|null; contracts:ContractItem|null; users:{ full_name:string }|null }
interface Props { userName:string; onLogout:()=>void }

const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const INTERVALS = ['täglich','wöchentlich','zweiwöchentlich','monatlich','quartalsweise','einmalig']
const INTERVAL_ICONS: Record<string,string> = { täglich:'today', wöchentlich:'date_range', zweiwöchentlich:'date_range', monatlich:'calendar_month', quartalsweise:'event_repeat', einmalig:'looks_one' }
const ROLE_LABELS: Record<string,string> = { admin:'Admin', mitarbeiter:'Mitarbeiter', objektleiter:'Objektleiter', support:'Support' }
const STATUS_META: Record<string,{label:string;icon:string;bg:string;color:string}> = {
  offen:     { label:'Offen',     icon:'radio_button_unchecked', bg:'#fff8e6', color:'#92400e' },
  in_arbeit: { label:'In Arbeit', icon:'pending',                bg:'#e0f4f6', color:'#096a70' },
  erledigt:  { label:'Erledigt',  icon:'check_circle',           bg:'#dcfce7', color:'#166534' },
  problem:   { label:'Problem',   icon:'error',                  bg:'#ffdad6', color:'#93000a' },
}

// ─── Main Component ───────────────────────────────────────────────────────────
const MOTIVATIONS = [
  "Heute wird ein guter Tag. 💪",
  "Dein Team gibt alles – du auch!",
  "Sauberkeit ist das halbe Leben. ✨",
  "Jeder erledigte Auftrag zählt.",
  "Qualität kommt von innen. 🏆",
  "Ein starkes Team braucht starke Führung.",
  "Der beste Moment ist jetzt.",
  "Schritt für Schritt zum Ziel. 🎯",
  "Vertrauen beginnt mit Verlässlichkeit.",
  "Heute besser als gestern.",
  "Dein Einsatz macht den Unterschied. 🌟",
  "Ordnung schafft Klarheit.",
  "Fokus. Disziplin. Ergebnis. 🔥",
  "Jeder Auftrag ist eine Chance.",
  "Gutes tun und darüber reden. 😄",
  "Mit diesem Tool wirst du reich. 🤑",
]

export default function Dashboard({ userName, onLogout }: Props) {
  const [motivation] = useState(() => MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)])
  const VALID_TABS = ['overview','objekte','kunden','ansprechpartner','team','bericht','chat','profil']
  const [tab, setTab]           = useState<'overview'|'objekte'|'kunden'|'ansprechpartner'|'team'|'bericht'|'chat'|'profil'>(() => {
    const base = window.location.hash.slice(1).split('/')[0]
    return (VALID_TABS.includes(base) ? base : 'overview') as 'overview'|'objekte'|'kunden'|'ansprechpartner'|'team'|'bericht'|'chat'|'profil'
  })
  const [showMoreSheet, setShowMoreSheet] = useState(false)
  const [objSearch, setObjSearch] = useState('')
  const [objGroup, setObjGroup] = useState<'none'|'city'|'kunde'>('city')
  const [objTypeFilter, setObjTypeFilter] = useState<string>('alle')
  const [objSearchResults, setObjSearchResults] = useState<ObjectItem[]|null>(null)
  const [objSearching, setObjSearching] = useState(false)
  const objSearchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [contactPersons, setContactPersons]   = useState<any[]>([])
  const [kundenSubTab, setKundenSubTab]       = useState<'kunden'|'ansprechpartner'>('kunden')
  const [cpSearch, setCpSearch]               = useState('')
  const [selectedObject, setSelectedObject] = useState<ObjectItem|null>(null)
  const [selectedProblem, setSelectedProblem] = useState<Problem|null>(null)
  const [showProblemsSheet, setShowProblemsSheet] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember|null>(null)
  const [showInviteOverlay, setShowInviteOverlay] = useState(false)
  const [showTodayOverlay, setShowTodayOverlay] = useState(false)
  const [showMonthOverlay, setShowMonthOverlay] = useState(false)
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [blackouts, setBlackouts] = useState<any[]>([])
  const [showBlackoutForm, setShowBlackoutForm] = useState(false)
  const [blackoutFrom, setBlackoutFrom] = useState('')
  const [blackoutTo, setBlackoutTo] = useState('')
  const [blackoutReason, setBlackoutReason] = useState('')
  const [blackoutSaving, setBlackoutSaving] = useState(false)
  const [leaveConflictReq, setLeaveConflictReq] = useState<LeaveRequest|null>(null)
  const [leaveConflictAssigns, setLeaveConflictAssigns] = useState<any[]>([])
  const [leaveConflictLoading, setLeaveConflictLoading] = useState(false)
  const [leaveReassignId, setLeaveReassignId] = useState<string>('')
  const [leaveLoading, setLeaveLoading] = useState<string|null>(null)
  const [stats, setStats]       = useState<Stats|null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [team, setTeam]         = useState<TeamMember[]>([])
  const [activeWorkerIds, setActiveWorkerIds] = useState<Set<string>>(new Set())
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem|null>(null)
  const [tasks, setTasks]       = useState<TaskItem[]>([])
  const [objects, setObjects]   = useState<ObjectItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const realtimeDebounce = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [showCreate, setShowCreate] = useState<string|false>(false)  // false | objectId
  // Daily Report State
  const [dailyReport, setDailyReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportSeen, setReportSeen] = useState<number>(() =>
    parseInt(localStorage.getItem('sw_report_seen') || '0')
  )

  // Badge acknowledge: tracks how many new MAs the admin has already seen
  const [acknowledgedMaCount, setAcknowledgedMaCount] = useState<number>(() =>
    parseInt(localStorage.getItem('sw_ack_ma_count') || '0')
  )
  const [toast, setToast] = useState<{msg:string;type:'ok'|'warn'|'info'}|null>(null)
  const showToast = (msg:string, type:'ok'|'warn'|'info'='ok') => {
    setToast({msg,type})
    setTimeout(()=>setToast(null), 3500)
  }
  const [showBugReport, setShowBugReport] = useState(false)
  const [historyObject, setHistoryObject] = useState<ObjectItem|null>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [qrObject, setQrObject] = useState<ObjectItem|null>(null)
  const [showObjCreate, setShowObjCreate] = useState(false)
  const [editTask, setEditTask] = useState<TaskItem|null>(null)
  // Tauschbörse
  const [vertretungAssignments, setVertretungAssignments] = useState<any[]>([])
  const [reassignTarget, setReassignTarget] = useState<string>('')
  const [reassigning, setReassigning] = useState<string|null>(null)
  // Heutige Abschlüsse
  const [todayDoneAssignments, setTodayDoneAssignments] = useState<any[]>([])
  const [photoLightbox, setPhotoLightbox] = useState<string|null>(null)
  // Vorlagen
  const [templates, setTemplates] = useState<TaskItem[]>([])

  // Invite state
  const [inviteMode, setInviteMode]   = useState<'email'|'link'|'manuell'>('email')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('mitarbeiter')
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState<{text:string;ok:boolean}|null>(null)
  const [linkRole, setLinkRole]       = useState('mitarbeiter')
  const [generatedLink, setGeneratedLink] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [copyDone, setCopyDone]       = useState(false)
  // Manual creation state
  const [manualFirstName, setManualFirstName] = useState('')
  const [manualLastName,  setManualLastName]  = useState('')
  const [manualEmail,     setManualEmail]     = useState('')
  const [manualPhone,     setManualPhone]     = useState('')
  const [manualRole,      setManualRole]      = useState('mitarbeiter')
  const [manualLoading,   setManualLoading]   = useState(false)
  const [manualResult,    setManualResult]    = useState<{fullName:string;tempPassword:string}|null>(null)
  const [manualPwCopied,  setManualPwCopied]  = useState(false)
  const [manualErr,       setManualErr]       = useState('')

  // Responsive
  const [winW, setWinW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const handler = () => setWinW(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const isDesktop = winW >= 768

  const today = new Date()
  const initials = userName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
  const [currentUserId, setCurrentUserId] = useState('')
  const chatUnread = useChatUnread(currentUserId)
  useEffect(() => {
    supabase.auth.getUser().then(({data})=>{ if(data.user) setCurrentUserId(data.user.id) })
  }, [])

  useEffect(() => { loadAll(); triggerGenerate(); loadDailyReport() }, [])

  // Sync navigation state → URL hash (enables F5 restore)
  // Guard: während des initialen Ladens Hash nicht überschreiben (würde #kunden/UUID → #kunden kürzen)
  useEffect(() => {
    if (loading) return
    if (selectedObject) {
      window.location.hash = `objekte/${selectedObject.id}`
    } else if (selectedCustomer) {
      window.location.hash = `kunden/${selectedCustomer.id}`
    } else {
      window.location.hash = tab
    }
  }, [tab, selectedObject, selectedCustomer, loading])

  // Restore selectedObject / selectedCustomer from hash after data loads
  useEffect(() => {
    if (objects.length === 0) return
    const [base, id] = window.location.hash.slice(1).split('/')
    if (base === 'objekte' && id && !selectedObject) {
      const found = objects.find(o => o.id === id)
      if (found) { setTab('objekte'); setSelectedObject(found) }
    }
  }, [objects]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (customers.length === 0) return
    const [base, id] = window.location.hash.slice(1).split('/')
    if (base === 'kunden' && id && !selectedCustomer) {
      const found = customers.find(c => c.id === id)
      if (found) { setTab('kunden'); setSelectedCustomer(found) }
    }
  }, [customers]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: Auto-Reload bei Statusänderungen durch Mitarbeiter
  useEffect(() => {
    const debouncedLoadAll = () => {
      if (realtimeDebounce.current) clearTimeout(realtimeDebounce.current)
      realtimeDebounce.current = setTimeout(() => { loadAll() }, 1500)
    }
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignments' }, () => {
        debouncedLoadAll()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, () => {
        debouncedLoadAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leave_requests' }, (payload: any) => {
        debouncedLoadAll()
        showToast('📋 Neuer Urlaubsantrag eingegangen – bitte prüfen', 'info')
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (realtimeDebounce.current) clearTimeout(realtimeDebounce.current)
    }
  }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
    const [stRes, prRes, tmRes, tkRes, obRes, catRes, custRes, lvRes, bkRes, cpRes] = await Promise.all([
      supabase.rpc('get_dashboard_stats'),
      supabase.rpc('get_dashboard_problems'),
      supabase.from('users').select('id,full_name,phone,email,is_active,role_id,street,postal_code,city,created_at,employed_since,work_days,work_hours_per_week,work_hours_type,hourly_wage,admin_setup_done,is_onboarded,vacation_days_per_year').order('full_name'),
      supabase.from('tasks').select('id,title,description,interval,is_active,due_date,end_date,category_id,object_id,contract_id,default_assignee_id,categories(name,emoji),objects(name,address,city),contracts(id,type,start_date,end_date,object_id,customer_id),users!tasks_default_assignee_id_fkey(full_name)').order('created_at',{ascending:false}).limit(300),
      supabase.from('objects').select('id,name,address,city,postal_code,object_number,customer_id,is_active,object_type,access_note,parking_note,floor_info,notes,customers(id,name)').order('address').limit(200),
      supabase.from('categories').select('*').order('name'),
      supabase.from('customers').select('id,customer_type,name,first_name,last_name,salutation,contact_person,contact_first_name,contact_last_name,email,phone,street,street_name,street_number,postal_code,city,address_supplement,notes,lexware_id,hausverwaltung_objekt_id,contract_type,hausverwaltung_id,co_contact_id,is_hausverwaltung,hausverwaltung:hausverwaltung_id(id,name,customer_type),co_contact:co_contact_id(id,name,role,phone,email)').order('name').limit(200),
      supabase.from('leave_requests').select('id,user_id,request_type,from_date,to_date,note,status,created_at,users!leave_requests_user_id_fkey(full_name,phone)').order('created_at',{ascending:false}).limit(50),
      supabase.from('vacation_blackouts').select('*').order('from_date',{ascending:true}),
      supabase.from('contact_persons').select('id,name,first_name,last_name,role,phone,email,customer_id,object_id').order('last_name').order('name').limit(300),
    ])
    if (stRes.data) setStats(stRes.data)
    if (prRes.data) setProblems((prRes.data || []) as unknown as Problem[])
    if (tmRes.data) { const { data: rolesData } = await supabase.from('roles').select('id,name'); const roleMap: Record<string,string> = {}; if (rolesData) rolesData.forEach((r:any) => { roleMap[r.id] = r.name }); const enriched = (tmRes.data as any[]).map(m => ({ ...m, role_name: roleMap[m.role_id] || 'mitarbeiter' })); setTeam(enriched as TeamMember[]) }
    if (tkRes.data) setTasks(tkRes.data as unknown as TaskItem[])
    if (obRes.data) setObjects(obRes.data as unknown as ObjectItem[])
    if (catRes.data) setCategories(catRes.data)
    if (custRes?.data) setCustomers(custRes.data as unknown as CustomerItem[])
    if (lvRes?.data) setLeaveRequests(lvRes.data as unknown as LeaveRequest[])
    if (bkRes?.data) setBlackouts(bkRes.data)
    if (cpRes?.error) console.error('[loadAll] contact_persons error:', cpRes.error)
    if (cpRes?.data) setContactPersons(cpRes.data)

    // Live: Wer ist gerade in_arbeit?
    const todayStr = new Date().toISOString().split('T')[0]
    const { data: liveData } = await supabase
      .from('task_assignments')
      .select('user_id')
      .eq('status', 'in_arbeit')
      .eq('due_date', todayStr)
    if (liveData) setActiveWorkerIds(new Set(liveData.map((r: any) => r.user_id)))

    // Tauschbörse: assignments with status=vertretung
    const { data: vertData } = await supabase
      .from('task_assignments')
      .select('id,due_date,user_id,tasks(id,title,categories(emoji,name),objects(name,address,city)),users(full_name,phone)')
      .eq('status', 'vertretung')
      .gte('due_date', todayStr)
      .order('due_date')
    if (vertData) setVertretungAssignments(vertData)

    // Heutige Abschlüsse mit Fotos
    const { data: doneData } = await supabase
      .from('task_assignments')
      .select('id,due_date,user_id,tasks(title,categories(emoji),objects(name,address)),task_reports(note,photo_urls),users(full_name)')
      .eq('status', 'erledigt')
      .eq('due_date', todayStr)
      .not('task_reports', 'is', null)
      .order('due_date')
    if (doneData) setTodayDoneAssignments((doneData as any[]).filter(a => (a.task_reports as any[]|null)?.some((r:any)=>r.photo_urls?.length>0)))

    // Aufgaben-Vorlagen
    const { data: tplData } = await supabase
      .from('tasks')
      .select('id,title,description,interval,category_id,object_id,categories(name,emoji)')
      .eq('is_template', true)
      .order('title')
    if (tplData) setTemplates(tplData as unknown as TaskItem[])

    } catch (err) {
      console.error('loadAll failed:', err)
      setLoadError(true)
      showToast('⚠ Daten konnten nicht geladen werden. Bitte Seite neu laden.', 'warn')
    } finally {
      setLoading(false)
    }
  }

  const triggerGenerate = () => {
    // Fire-and-forget: Assignments für heute sicherstellen
    supabase.functions.invoke('generate-assignments').catch(() => {})
  }

  const loadDailyReport = async () => {
    setReportLoading(true)
    const todayStr = new Date().toISOString().split('T')[0]
    // All today's assignments with user + task + object info
    const { data: all } = await supabase
      .from('task_assignments')
      .select('id,status,started_at,completed_at,travel_minutes,due_date,user_id,tasks(title,categories(emoji,name),objects(name,address)),users(id,full_name)')
      .eq('due_date', todayStr)
      .order('status')
    // Active leave requests today
    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('id,user_id,request_type,from_date,to_date,status,users(full_name)')
      .lte('from_date', todayStr)
      .gte('to_date', todayStr)
      .in('status', ['genehmigt', 'ausstehend'])
    setDailyReport({ assignments: all ?? [], leaves: leaves ?? [], generatedAt: Date.now() })
    setReportLoading(false)
  }

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setInviting(true); setInviteMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/invite-user', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${session?.access_token}` },
      body: JSON.stringify({ email:inviteEmail, role:inviteRole }),
    })
    const result = await res.json()
    if (result.success) {
      setInviteMsg({ text:`Einladung an ${inviteEmail} gesendet! Der MA erhält eine E-Mail zum Einrichten seines Kontos.`, ok:true })
      setInviteEmail(''); setInviteRole('mitarbeiter')
      loadAll()
    } else {
      setInviteMsg({ text:result.error||'Fehler beim Senden.', ok:false })
    }
    setInviting(false)
  }

  const generateInviteLink = async () => {
    setLinkLoading(true); setGeneratedLink('')
    try {
      const { data: roleData } = await supabase.from('roles').select('id').eq('name', linkRole).single()
      const { data: tokenData, error: tokenErr } = await supabase
        .from('invite_tokens')
        .insert({ role_id: roleData?.id })
        .select('token')
        .single()
      if (tokenErr || !tokenData) throw new Error(tokenErr?.message || 'Fehler')
      const link = `${window.location.origin}/?register=${tokenData.token}`
      setGeneratedLink(link)
    } catch (err: any) {
      setInviteMsg({ text: err.message, ok: false })
    }
    setLinkLoading(false)
  }

  const copyLink = async () => {
    if (!generatedLink) return
    await navigator.clipboard.writeText(generatedLink)
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2500)
  }

  const createUserManual = async (e: React.FormEvent) => {
    e.preventDefault()
    setManualLoading(true); setManualErr(''); setManualResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/create-user-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ firstName: manualFirstName, lastName: manualLastName, email: manualEmail, phone: manualPhone, role: manualRole }),
      })
      const result = await res.json()
      if (result.success) {
        setManualResult({ fullName: result.fullName, tempPassword: result.tempPassword })
        setManualFirstName(''); setManualLastName(''); setManualEmail(''); setManualPhone(''); setManualRole('mitarbeiter')
        loadAll()
      } else {
        setManualErr(result.error || 'Unbekannter Fehler')
      }
    } catch (err: any) {
      setManualErr(err.message)
    }
    setManualLoading(false)
  }

  const copyManualPw = async (pw: string) => {
    await navigator.clipboard.writeText(pw)
    setManualPwCopied(true)
    setTimeout(() => setManualPwCopied(false), 3000)
  }

  const toggleActive = async (id:string, current:boolean) => {
    setTeam(prev=>prev.map(m=>m.id===id?{...m,is_active:!current}:m))
    const { error } = await supabase.from('users').update({ is_active:!current }).eq('id',id)
    if (error) {
      setTeam(prev=>prev.map(m=>m.id===id?{...m,is_active:current}:m))
      showToast('⚠ Status konnte nicht geändert werden', 'warn')
    }
  }

  const loadHistory = async (obj: ObjectItem) => {
    setHistoryObject(obj)
    const { data } = await supabase
      .from('task_assignments')
      .select('id, status, completed_at, due_date, tasks(title, categories(emoji,name)), users(full_name), task_reports(report_type, note, photo_urls)')
      .eq('tasks.object_id', obj.id)
      .not('tasks', 'is', null)
      .order('due_date', { ascending: false })
      .limit(30)
    setHistoryData(data || [])
  }

  const toggleTask = async (id:string, current:boolean) => {
    setTasks(prev=>prev.map(t=>t.id===id?{...t,is_active:!current}:t))
    const { error } = await supabase.from('tasks').update({ is_active:!current }).eq('id',id)
    if (error) {
      setTasks(prev=>prev.map(t=>t.id===id?{...t,is_active:current}:t))
      showToast('⚠ Aufgabe konnte nicht geändert werden', 'warn')
    }
  }

  // ── Computed badge counts (hoisted for use across desktop + mobile nav) ──
  const pendingCount    = leaveRequests.filter(r=>r.status==='ausstehend').length
  const newMaCount      = team.filter(m=>(m as any).is_onboarded && !(m as any).admin_setup_done).length
  const teamBadge       = Math.max(0, newMaCount - acknowledgedMaCount)
  const reportNewCount  = dailyReport
    ? (dailyReport.assignments as any[]).filter((a:any) =>
        (a.status === 'erledigt' || a.status === 'problem') &&
        new Date(a.completed_at ?? a.started_at ?? 0).getTime() > reportSeen
      ).length
    : 0
  const desktopNavItems = [
    { id:'overview', icon:'dashboard',  label:'Übersicht',    badge: reportNewCount },
    { id:'objekte',  icon:'apartment',  label:'Objekte',      badge: 0 },
    { id:'kunden',   icon:'contacts',   label:'Kunden',       badge: 0 },
    { id:'ansprechpartner', icon:'person_search', label:'Ansprechpartner', badge: 0 },
    { id:'bericht',  icon:'summarize',  label:'Tagesbericht', badge: pendingCount + reportNewCount },
    { id:'chat',     icon:'chat_bubble',label:'Nachrichten',  badge: chatUnread },
    { id:'team',     icon:'group',      label:'Team',         badge: teamBadge },
    { id:'profil',   icon:'person',     label:'Profil',       badge: 0 },
  ]

  return (
    <div style={{ ...s.shell, flexDirection: isDesktop ? 'row' : 'column' }}>

      {/* ── Load Error Banner ── */}
      {loadError && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:2000, background:'#b71c1c', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, fontSize:13, fontWeight:600 }}>
          <span className="material-symbols-outlined" style={{ fontSize:18 }}>wifi_off</span>
          <span style={{ flex:1 }}>Daten konnten nicht geladen werden.</span>
          <button onClick={() => loadAll()} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'5px 12px', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:12 }}>Neu laden</button>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      {isDesktop && (
        <aside style={{ width:220, flexShrink:0, background:'var(--surf-card)', borderRight:'1px solid var(--outline)', display:'flex', flexDirection:'column', height:'100dvh', overflowY:'auto' }}>
          {/* Logo */}
          <div onClick={() => { setTab('overview'); setSelectedObject(null); setSelectedCustomer(null) }}
            style={{ padding:'24px 20px 20px', borderBottom:'1px solid var(--outline)', cursor:'pointer' }}>
            <div style={{ fontFamily:'Manrope,sans-serif', fontWeight:800, fontSize:22, color:'var(--pri)', letterSpacing:'-0.3px', lineHeight:1.1, textTransform:'uppercase' }}>STEUBER</div>
            <div style={{ fontFamily:'Manrope,sans-serif', fontWeight:300, fontSize:22, color:'var(--pri-c)', letterSpacing:'5px', lineHeight:1.1, textTransform:'uppercase' }}>WORK</div>
          </div>
          {/* Nav */}
          <nav style={{ padding:'10px 0', flex:1 }}>
            {desktopNavItems.map(t => (
                <div key={t.id} onClick={()=>{ setTab(t.id as any); if(t.id==='team'){ const n=team.filter(m=>m.is_onboarded&&!m.admin_setup_done).length; setAcknowledgedMaCount(n); localStorage.setItem('sw_ack_ma_count',String(n)) } if(t.id==='overview'||t.id==='bericht'){ const now=Date.now(); setReportSeen(now); localStorage.setItem('sw_report_seen',String(now)) } }} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 20px', cursor:'pointer', borderLeft:`3px solid ${tab===t.id?'var(--pri)':'transparent'}`, background:tab===t.id?'var(--pri-xl)':'transparent', color:tab===t.id?'var(--pri)':'var(--txt-sec)', fontWeight:tab===t.id?700:500, fontSize:14, transition:'all 0.15s', userSelect:'none' }}>
                  <span className={`material-symbols-outlined${tab===t.id?' icon-fill':''}`} style={{ fontSize:20 }}>{t.icon}</span>
                  <span style={{ flex:1 }}>{t.label}</span>
                  {t.badge > 0 && (
                    <span style={{ minWidth:18, height:18, borderRadius:999, background:'#e53935', color:'#fff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{t.badge}</span>
                  )}
                </div>
              ))}
          </nav>
          {/* Footer: Avatar + Name + Logout */}
          <div style={{ padding:'12px 14px', borderTop:'1px solid var(--outline)' }}>
            {/* User-Karte */}
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:12, cursor:'pointer', transition:'background 0.15s', marginBottom:4 }}
              onClick={()=>setTab('profil')}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--surf-low)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <div style={s.topAva}>{initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName}</div>
                <div style={{ fontSize:11, color:'var(--txt-muted)' }}>Administrator</div>
              </div>
            </div>
            {/* Logout */}
            <button onClick={onLogout} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:12, border:'none', background:'transparent', fontSize:13, fontWeight:600, cursor:'pointer', transition:'background 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--err-bg)')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <div style={{ width:34, height:34, borderRadius:10, background:'var(--err-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--err-dot)' }}>logout</span>
              </div>
              <span style={{ color:'var(--err-dot)' }}>Abmelden</span>
            </button>
          </div>
        </aside>
      )}

      {/* ── Main area ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

      {/* Mobile Top bar */}
      {!isDesktop && (
        <header style={s.topBar}>
          <div style={s.topBarInner}>
            {/* Logo links */}
            <div style={{ ...s.topLogo, cursor:'pointer' }}
              onClick={() => { setTab('overview'); setSelectedObject(null); setSelectedCustomer(null) }}>
              <span style={s.topLogoBold}>STEUBER</span>
              <span style={s.topLogoLight}>WORK</span>
            </div>
            {/* Profil-Avatar rechts */}
            <div style={s.topAva} onClick={()=>setTab('profil')}>{initials}</div>
          </div>
        </header>
      )}

      {/* Mobile Tab bar */}
      {!isDesktop && (
        <div style={s.tabBar}>
          {([
            { id:'overview', icon:'dashboard',  label:'Übersicht', badge: reportNewCount },
            { id:'objekte',  icon:'apartment',  label:'Objekte',   badge: 0 },
            { id:'kunden',   icon:'contacts',   label:'Kunden',    badge: 0 },
            { id:'team',     icon:'group',      label:'Team',      badge: newMaCount },
          ] as const).map(t=>(
            <div key={t.id} onClick={()=>{ setShowMoreSheet(false); setTab(t.id); if(t.id==='overview'){ const now=Date.now(); setReportSeen(now); localStorage.setItem('sw_report_seen',String(now)) } }} style={{ ...s.tabItem, color:tab===t.id&&!showMoreSheet?'var(--pri)':'var(--txt-muted)', fontWeight:tab===t.id&&!showMoreSheet?700:500, position:'relative' }}>
              <div style={{ width:44, height:30, borderRadius:99, background:tab===t.id&&!showMoreSheet?'var(--pri-xl)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s', position:'relative' }}>
                <span className={`material-symbols-outlined${tab===t.id&&!showMoreSheet?' icon-fill':''}`} style={{ fontSize:22 }}>{t.icon}</span>
                {t.badge > 0 && <span style={{ position:'absolute', top:2, right:4, minWidth:16, height:16, borderRadius:999, background:'#e53935', color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>{t.badge}</span>}
              </div>
              {t.label}
            </div>
          ))}
          {/* Mehr-Tab */}
          <div onClick={() => setShowMoreSheet(v => !v)} style={{ ...s.tabItem, color:showMoreSheet?'var(--pri)':'var(--txt-muted)', fontWeight:showMoreSheet?700:500, position:'relative' }}>
            <div style={{ width:44, height:30, borderRadius:99, background:showMoreSheet?'var(--pri-xl)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}>
              <span className={`material-symbols-outlined${showMoreSheet?' icon-fill':''}`} style={{ fontSize:22 }}>more_horiz</span>
            </div>
            Mehr
          </div>
        </div>
      )}

      {/* Mehr-Sheet */}
      {!isDesktop && showMoreSheet && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:190, display:'flex', alignItems:'flex-end' }}
          onClick={() => setShowMoreSheet(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', paddingBottom:'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }}/>
            </div>
            <div style={{ padding:'8px 16px 16px', display:'flex', flexDirection:'column', gap:6 }}>
              {([
                { id:'ansprechpartner', icon:'person_search', label:'Kontakte',   desc:'Ansprechpartner & Personen' },
                { id:'bericht',         icon:'bar_chart',     label:'Tagesbericht', desc:'Auswertung & Protokoll' },
                { id:'profil',          icon:'person',        label:'Profil',     desc:'Einstellungen & Konto' },
              ] as const).map(item => (
                <div key={item.id} onClick={() => { setTab(item.id); setShowMoreSheet(false); if(item.id==='bericht'){ const now=Date.now(); setReportSeen(now); localStorage.setItem('sw_report_seen',String(now)) } }}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, background: tab===item.id ? 'var(--pri-xl)' : 'var(--surf-card)', border:`1.5px solid ${tab===item.id ? 'var(--pri)' : 'var(--outline)'}`, cursor:'pointer' }}>
                  <div style={{ width:40, height:40, borderRadius:12, background: tab===item.id ? 'var(--pri)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color: tab===item.id ? '#fff' : 'var(--txt-muted)' }}>{item.icon}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color: tab===item.id ? 'var(--pri)' : 'var(--txt)' }}>{item.label}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{item.desc}</div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>chevron_right</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...s.content, padding: isDesktop ? '0 32px 32px' : '0 18px 90px' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', width:'100%' }}>

        {/* ── ÜBERSICHT ── */}
        {tab === 'overview' && (
          <>
            <section style={{ padding:'20px 0 12px' }}>
              {(() => {
                const hr = new Date().getHours()
                const greet = hr < 12 ? 'Guten Morgen' : hr < 18 ? 'Guten Mittag' : 'Guten Abend'
                const firstName = userName.split(' ')[0]
                return (
                  <p style={{ fontSize:13, fontWeight:700, color:'var(--txt-muted)', letterSpacing:0.2, marginBottom:2, marginTop:0 }}>
                    {greet}, {firstName} 👋
                  </p>
                )
              })()}
              <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:12 }}>
                <h1 style={s.h1}>Dashboard</h1>
                <p style={{ fontSize:12, color:'var(--txt-muted)', fontStyle:'italic', marginBottom:6, textAlign:'right', maxWidth:200, lineHeight:1.4 }}>{motivation}</p>
              </div>
              <p style={s.sub}>{today.getDate()}. {MONTHS[today.getMonth()]} {today.getFullYear()}</p>
              <button onClick={() => setShowMonthOverlay(true)} style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:20, border:'1px solid rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.9)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:13 }}>bar_chart</span>Monatsübersicht
              </button>
            </section>
            {loading ? <Loader/> : (
              <>
                <div style={s.bento}>
                  <div style={s.bentoMain}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <div style={s.bentoLabel}>Tagesstatus</div>
                        <h2 style={s.bentoNum}>{(dailyReport?.assignments??[]).length} Aufgaben heute</h2>
                      </div>
                      <span className="material-symbols-outlined" style={{ color:'rgba(255,255,255,0.25)', fontSize:36 }}>assignment</span>
                    </div>
                    <div style={s.bentoPills}>
                      <span style={s.bentoPill}><span style={s.bentoDot}/>{stats?.in_arbeit??0} In Arbeit</span>
                      <span style={{ ...s.bentoPill, background:'rgba(255,255,255,0.1)' }}><span style={{ ...s.bentoDot, background:'#a8ece8' }}/>{(dailyReport?.assignments??[]).filter((a:any)=>a.status==='offen').length} Offen</span>
                    </div>
                  </div>
                  <div style={s.bentoSide}>
                    <div style={s.bentoSideLabel}>Erledigt</div>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <div style={s.bentoSideNum}>{stats?.diese_woche_done??0}</div>
                      {stats && stats.letzte_woche_done > 0 && (() => {
                        const diff = (stats.diese_woche_done ?? 0) - (stats.letzte_woche_done ?? 0)
                        if (diff === 0) return null
                        const up = diff > 0
                        return <span className="material-symbols-outlined icon-fill" style={{ fontSize:16, color: up ? '#4ade80' : '#f87171', marginTop:2 }}>{up ? 'trending_up' : 'trending_down'}</span>
                      })()}
                    </div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>
                      Diese Woche{stats && stats.letzte_woche_done > 0 ? ` · ${stats.letzte_woche_done} letzte` : ''}
                    </div>
                  </div>
                </div>

                <div style={s.statsRow}>
                  {/* Probleme-Kachel: gesamt + heute-Subline */}
                  <div onClick={() => setShowProblemsSheet(true)}
                    style={{ ...s.statChip, background:'#ffdad6', cursor:'pointer', position:'relative' }}
                    onMouseEnter={e=>(e.currentTarget.style.filter='brightness(0.95)')}
                    onMouseLeave={e=>(e.currentTarget.style.filter='none')}
                  >
                    <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'#93000a' }}>warning</span>
                    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                      <span style={{ fontSize:22, fontWeight:800, color:'#93000a', fontFamily:'var(--font-head)' }}>{stats?.probleme??0}</span>
                      {stats && stats.letzte_woche_probleme > 0 && (() => {
                        const diff = (stats.probleme ?? 0) - (stats.letzte_woche_probleme ?? 0)
                        if (diff === 0) return null
                        const up = diff > 0
                        return <span className="material-symbols-outlined icon-fill" style={{ fontSize:14, color: up ? '#b71c1c' : '#388e3c' }}>{up ? 'trending_up' : 'trending_down'}</span>
                      })()}
                    </div>
                    <span style={{ fontSize:10, color:'#93000a', fontWeight:600, opacity:0.8, textAlign:'center' }}>Probleme</span>
                    {(stats?.probleme_heute ?? 0) > 0 && (
                      <span style={{ fontSize:9, color:'#93000a', opacity:0.65, textAlign:'center', marginTop:-2 }}>
                        {stats?.probleme_heute ?? 0} heute neu
                      </span>
                    )}
                  </div>
                  {[
                    { icon:'today',    label:'Heute fällig',  val: stats?.heute_faellig ?? 0, color:'#92400e', bg:'#fff8e6', onClick: () => setTab('bericht') },
                    { icon:'task_alt', label:'Heute erledigt', val: (dailyReport?.assignments??[]).filter((a:any)=>a.status==='erledigt').length, color:'var(--ok)', bg:'var(--ok-bg)', onClick: () => setTab('bericht') },
                  ].map(({icon,label,val,color,bg,onClick})=>(
                    <div key={label} onClick={onClick} style={{ ...s.statChip, background:bg, cursor:'pointer' }}
                      onMouseEnter={e=>(e.currentTarget.style.filter='brightness(0.95)')}
                      onMouseLeave={e=>(e.currentTarget.style.filter='none')}
                    >
                      <span className="material-symbols-outlined icon-sm icon-fill" style={{ color }}>{icon}</span>
                      <span style={{ fontSize:22, fontWeight:800, color, fontFamily:'var(--font-head)' }}>{val}</span>
                      <span style={{ fontSize:10, color, fontWeight:600, opacity:0.8, textAlign:'center' }}>{label}</span>
                    </div>
                  ))}
                </div>



                {/* ── Handlungsbedarf: kompakter Hinweis-Chip für Anträge + neue MA ── */}
                {(() => {
                  const pendingLeaves = leaveRequests.filter(r => r.status === 'ausstehend')
                  const newMaList = team.filter(m => m.is_onboarded && !(m as any).admin_setup_done)
                  const hasItems = pendingLeaves.length > 0 || newMaList.length > 0
                  if (!hasItems) return null
                  return (
                    <div style={{ marginBottom:16, display:'flex', flexDirection:'column', gap:8 }}>
                      {/* Urlaubsanträge-Chip → öffnet Team-Tab */}
                      {pendingLeaves.length > 0 && (
                        <div
                          onClick={() => setTab('team')}
                          style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surf-card)', borderRadius:14, padding:'12px 16px', border:'1px solid var(--outline)', borderLeftWidth:3, borderLeftColor:'#f59e0b', cursor:'pointer', transition:'background 0.15s' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='var(--surf-low)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
                          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#f59e0b', flexShrink:0 }}>event_available</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>
                              {pendingLeaves.length} {pendingLeaves.length === 1 ? 'ausstehender Antrag' : 'ausstehende Anträge'}
                            </div>
                            <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Im Team-Tab genehmigen oder ablehnen</div>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)', flexShrink:0 }}>chevron_right</span>
                        </div>
                      )}
                      {/* Neue MA die Daten brauchen */}
                      {newMaList.map(ma => {
                        const ini2 = ma.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                        return (
                          <div key={ma.id} onClick={() => setSelectedMember(ma)}
                            style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surf-card)', borderRadius:14, padding:'11px 14px', border:'1px solid var(--outline)', borderLeftWidth:3, borderLeftColor:'var(--pri)', cursor:'pointer' }}
                            onMouseEnter={e=>(e.currentTarget.style.background='var(--surf-low)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
                            <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--pri)', fontWeight:800, fontSize:12, fontFamily:'var(--font-head)', flexShrink:0 }}>{ini2}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ma.full_name}</div>
                              <div style={{ fontSize:11, color:'var(--pri)', marginTop:1, display:'flex', alignItems:'center', gap:3 }}>
                                <span className="material-symbols-outlined" style={{ fontSize:13 }}>person_check</span>
                                Onboarding fertig · Daten hinterlegen
                              </div>
                            </div>
                            <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)', flexShrink:0 }}>chevron_right</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}





                {/* ── Tauschbörse ── */}
                {vertretungAssignments.length > 0 && (
                  <>
                    <div style={{ ...s.secHead, marginTop:8 }}>
                      <h3 style={s.secTitle}>Vertretung gesucht</h3>
                      <span style={{ ...s.secCount, background:'#f3e8ff', color:'#7c3aed' }}>{vertretungAssignments.length}</span>
                    </div>
                    {vertretungAssignments.map(a => {
                      const task = (a.tasks as any)
                      const obj  = task?.objects
                      const emp  = (a.users as any)
                      const dateStr = new Date(a.due_date).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'})
                      return (
                        <div key={a.id} style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', marginBottom:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1px solid #e9d5ff' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:12 }}>
                            <div style={{ width:38, height:38, borderRadius:12, background:'#f3e8ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <span className="material-symbols-outlined" style={{ fontSize:20, color:'#7c3aed' }}>swap_horiz</span>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{task?.categories?.emoji||'📋'} {task?.title||'–'}</div>
                              <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{obj?.address}, {obj?.city}</div>
                              <div style={{ fontSize:12, color:'#7c3aed', marginTop:3, fontWeight:600 }}>{dateStr} · Aktuell: {emp?.full_name||'–'}</div>
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                            <select
                              value={reassignTarget}
                              onChange={e => setReassignTarget(e.target.value)}
                              style={{ flex:1, border:'1.5px solid var(--outline)', borderRadius:10, padding:'9px 12px', background:'var(--surf-low)', color:'var(--txt)', fontSize:13, outline:'none', cursor:'pointer' }}
                            >
                              <option value="">Mitarbeiter wählen…</option>
                              {team.filter(m=>m.role_name!=='admin'&&m.is_active&&m.id!==a.user_id).map(m=>(
                                <option key={m.id} value={m.id}>{m.full_name}</option>
                              ))}
                            </select>
                            <button
                              disabled={!reassignTarget || reassigning === a.id}
                              onClick={async () => {
                                if (!reassignTarget) return
                                setReassigning(a.id)
                                await supabase.from('task_assignments').update({ user_id: reassignTarget, status:'offen' }).eq('id', a.id)
                                setVertretungAssignments(prev => prev.filter(x => x.id !== a.id))
                                setReassignTarget('')
                                setReassigning(null)
                              }}
                              style={{ padding:'9px 16px', borderRadius:10, border:'none', background: reassignTarget ? '#7c3aed' : 'var(--outline)', color: reassignTarget ? '#fff' : 'var(--txt-muted)', fontSize:13, fontWeight:700, cursor: reassignTarget ? 'pointer' : 'default', flexShrink:0, display:'flex', alignItems:'center', gap:5 }}
                            >
                              {reassigning === a.id
                                ? <span className="material-symbols-outlined" style={{ fontSize:16, animation:'spin 1s linear infinite' }}>refresh</span>
                                : <span className="material-symbols-outlined" style={{ fontSize:16 }}>person_add</span>
                              }
                              Zuweisen
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}

                {/* ── Heutige Abschlüsse mit Fotos ── */}
                {todayDoneAssignments.length > 0 && (
                  <>
                    <div style={{ ...s.secHead, marginTop:8 }}>
                      <h3 style={s.secTitle}>Heutige Abschlüsse</h3>
                      <span style={{ ...s.secCount, background:'#e8f5e9', color:'#2e7d32' }}>{todayDoneAssignments.length}</span>
                    </div>
                    {todayDoneAssignments.map(a => {
                      const task    = (a.tasks as any)
                      const reports = (a.task_reports as any[])||([] as any[])
                      const photos  = reports.flatMap((r:any) => r.photo_urls||[])
                      const note    = reports[0]?.note
                      const emp     = (a.users as any)
                      return (
                        <div key={a.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1px solid #a5d6a7' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: photos.length>0?10:0 }}>
                            <span style={{ fontSize:20, flexShrink:0 }}>{task?.categories?.emoji||'✅'}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task?.title||'–'}</div>
                              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{emp?.full_name||'–'}{note ? ` · "${note}"` : ''}</div>
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:'#2e7d32', background:'#e8f5e9', borderRadius:20, padding:'3px 8px', flexShrink:0 }}>erledigt</span>
                          </div>
                          {photos.length > 0 && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                              {photos.map((url:string, i:number) => (
                                <img key={i} src={url} alt="Abschlussfoto"
                                  onClick={() => setPhotoLightbox(url)}
                                  style={{ width:64, height:64, borderRadius:10, objectFit:'cover', cursor:'pointer', border:'2px solid #a5d6a7' }}
                                  onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}

              </>
            )}
          </>
        )}

        {/* ── OBJEKTE – Liste ── */}
        {tab === 'objekte' && !selectedObject && (
          <>
            <section style={{ padding:'20px 0 12px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
              <div>
                <h1 style={s.h1}>Objekte</h1>
                <p style={s.sub}>{objects.length} Objekte · {tasks.filter(t=>t.is_active).length} aktive Aufgaben</p>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {isDesktop && (
                  <button style={{ ...s.btnSmall, background:'var(--pri)', border:'none', color:'#fff' }} onClick={()=>setShowCreate('')}>
                    <span className="material-symbols-outlined icon-sm">add_task</span> Aufgabe
                  </button>
                )}
                <button style={s.btnSmall} onClick={()=>setShowObjCreate(true)}>
                  <span className="material-symbols-outlined icon-sm">add_home</span> Objekt
                </button>
              </div>
            </section>

            {/* Suche */}
            <div style={{ ...s.inputWrap, marginBottom:14 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
              <input
                value={objSearch}
                onChange={e => {
                  const v = e.target.value
                  setObjSearch(v)
                  if (objSearchTimer.current) clearTimeout(objSearchTimer.current)
                  if (v.trim().length < 2) { setObjSearchResults(null); setObjSearching(false); return }
                  setObjSearching(true)
                  objSearchTimer.current = setTimeout(async () => {
                    const q = v.trim()
                    const { data } = await supabase
                      .from('objects')
                      .select('id,name,address,city,postal_code,object_number,customer_id,is_active,object_type,access_note,parking_note,floor_info,notes,customers(id,name)')
                      .or(`address.ilike.%${q}%,city.ilike.%${q}%,postal_code.ilike.%${q}%,object_number.ilike.%${q}%,notes.ilike.%${q}%`)
                      .limit(80)
                    setObjSearchResults((data as unknown as ObjectItem[]) || [])
                    setObjSearching(false)
                  }, 350)
                }}
                placeholder="Adresse, Ort, PLZ, Objektnr. …"
                style={{ ...s.input, fontSize:14 }}
              />
              {objSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', animation:'spin 1s linear infinite' }}>progress_activity</span>}
              {objSearch && (
                <button onClick={()=>{ setObjSearch(''); setObjSearchResults(null); setObjSearching(false) }} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--txt-muted)' }}>
                  <span className="material-symbols-outlined icon-sm">close</span>
                </button>
              )}
            </div>

            {/* Typ-Filter Chips */}
            {(() => {
              const TYPES = [
                { key:'alle', label:'Alle', icon:'apps' },
                { key:'mehrfamilienhaus', label:'Mehrfamilienhaus', icon:'apartment' },
                { key:'einfamilienhaus', label:'Einfamilienhaus', icon:'house' },
                { key:'firmengelaende', label:'Gewerbe', icon:'business' },
                { key:'grundstueck', label:'Grundstück', icon:'landscape' },
              ]
              // nur Typen zeigen die tatsächlich vorkommen (+ Alle)
              const usedTypes = new Set(objects.map((o:any) => o.object_type))
              const visible = TYPES.filter(t => t.key === 'alle' || usedTypes.has(t.key))
              if (visible.length <= 1) return null
              return (
                <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:14, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' as any, marginLeft:-18, marginRight:-18, paddingLeft:18, paddingRight:18 }}>
                  {visible.map(t => {
                    const active = objTypeFilter === t.key
                    return (
                      <button key={t.key} onClick={() => setObjTypeFilter(t.key)}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', borderRadius:99, border: active ? 'none' : '0.5px solid var(--outline)', background: active ? 'var(--pri)' : 'var(--surf-card)', color: active ? '#fff' : 'var(--txt-muted)', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, transition:'background 0.12s, color 0.12s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:14 }}>{t.icon}</span>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {loading ? <Loader/> : (() => {
              // Wenn DB-Suche aktiv → DB-Ergebnisse nutzen, sonst lokale Liste (bis 200)
              const preFilter: ObjectItem[] = objSearchResults !== null ? objSearchResults
                : objSearch.trim().length >= 2
                  ? [] // warte auf DB
                  : objects
              const filtered: ObjectItem[] = objTypeFilter === 'alle' ? preFilter : preFilter.filter((o:any) => o.object_type === objTypeFilter)
              if (objects.length === 0) return (
                <div style={s.emptyState}>
                  <span className="material-symbols-outlined" style={{ fontSize:48, color:'var(--txt-muted)', opacity:0.3 }}>apartment</span>
                  <h3 style={{ fontSize:16, fontWeight:700, fontFamily:'var(--font-head)', color:'var(--txt-muted)' }}>Noch keine Objekte</h3>
                  <p style={{ fontSize:13, color:'var(--txt-muted)', textAlign:'center', opacity:0.7, maxWidth:220 }}>Lege dein erstes Objekt anlegen</p>
                </div>
              )
              if (filtered.length === 0) return (
                <div style={s.emptyState}>
                  <span className="material-symbols-outlined" style={{ fontSize:40, color:'var(--txt-muted)', opacity:0.3 }}>search_off</span>
                  <p style={{ fontSize:14, color:'var(--txt-muted)', textAlign:'center' }}>Kein Objekt gefunden</p>
                </div>
              )
              // Grouping
              const grouped: Record<string, typeof filtered> = {}
              if (objGroup === 'city') {
                filtered.forEach(o => { const k = o.city||'Unbekannt'; if(!grouped[k]) grouped[k]=[]; grouped[k].push(o) })
              } else if (objGroup === 'kunde') {
                filtered.forEach(o => { const k = o.customers?.name||'Ohne Kunde'; if(!grouped[k]) grouped[k]=[]; grouped[k].push(o) })
              } else {
                filtered.forEach(o => { const k = (o.address?.[0]||'#').toUpperCase(); if(!grouped[k]) grouped[k]=[]; grouped[k].push(o) })
              }
              const groupKeys = Object.keys(grouped).sort()
              const OBJ_TYPE_ICON: Record<string, string> = { einfamilienhaus:'house', mehrfamilienhaus:'apartment', firmengelaende:'business', grundstueck:'landscape' }
              return (<>{groupKeys.map((groupKey, gi) => (
                <div key={groupKey}>
                  {objGroup !== 'none' && (
                    <div style={{ margin: gi === 0 ? '4px 0 6px' : '16px 0 6px' }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', letterSpacing:'0.1em', textTransform:'uppercase' }}>{groupKey} ({grouped[groupKey].length})</span>
                    </div>
                  )}
                  {grouped[groupKey].map(obj => {
                    const objTasks = tasks.filter(t => t.object_id === obj.id)
                    const activeTasks = objTasks.filter(t => t.is_active).length
                    const typeIcon = OBJ_TYPE_ICON[obj.object_type ?? 'mehrfamilienhaus'] ?? 'apartment'
                    return (
                      <div key={obj.id} onClick={()=>setSelectedObject(obj)}
                        style={{ ...s.taskCard, cursor:'pointer', marginBottom:8, boxShadow:'none', border:'0.5px solid var(--outline)', transition:'background 0.12s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--pri-xl)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
                        <div style={{ width:46, height:46, borderRadius:14, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 10px rgba(9,106,112,0.2)' }}>
                          <span className="material-symbols-outlined" style={{ color:'#fff', fontSize:22 }}>{typeIcon}</span>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          {/* Zeile 1: Adresse + Aufgaben-Pill */}
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                            <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {obj.address}, {obj.postal_code} {obj.city}
                            </div>
                            {activeTasks > 0 && (
                              <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:99, padding:'2px 8px', display:'flex', alignItems:'center', gap:3 }}>
                                <span className="material-symbols-outlined" style={{ fontSize:12 }}>task_alt</span>{activeTasks}
                              </span>
                            )}
                          </div>
                          {/* Zeile 2: OBJ-Nummer – immer feste Position */}
                          <div style={{ fontSize:11, color:'var(--txt-muted)', fontFamily:'monospace', marginBottom:3 }}>
                            {obj.object_number || '–'}{!obj.is_active && <span style={{ marginLeft:6, fontFamily:'var(--font-sans)', fontWeight:600 }}>· Inaktiv</span>}
                          </div>
                          {/* Zeile 3: Kunde */}
                          {obj.customers?.name && (
                            <div style={{ fontSize:11, color:'var(--pri)', fontWeight:600 }}>
                              {obj.customers.name}
                            </div>
                          )}
                        </div>
                        <span className="material-symbols-outlined" style={{ color:'var(--txt-muted)', fontSize:20, flexShrink:0 }}>chevron_right</span>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div style={{ height:80 }}/>
            </>
          )})()}
          </>
        )}

        {/* ── OBJEKTE – Detail ── */}
        {tab === 'objekte' && selectedObject && (
          <ObjectDetail
            obj={selectedObject}
            tasks={tasks.filter(t => t.object_id === selectedObject.id)}
            team={team.filter(m => m.is_active)}
            categories={categories}
            objects={objects}
            onBack={() => setSelectedObject(null)}
            onEditTask={(t) => setEditTask(t)}
            onToggleTask={(id, cur) => toggleTask(id, cur)}
            onNewTask={() => setShowCreate(selectedObject!.id)}
            onHistory={() => loadHistory(selectedObject)}
            onQR={() => setQrObject(selectedObject)}
            onRefresh={() => loadAll()}
            onObjectUpdated={(updated) => {
              setObjects(prev => prev.map(o => o.id === updated.id ? updated : o))
              setSelectedObject(updated)
            }}
            onObjectDeleted={() => { setSelectedObject(null); loadAll() }}
            onNavigateToCustomer={(customerId) => {
              const cust = customers.find(c => c.id === customerId)
              if (cust) { setSelectedCustomer(cust); setTab('kunden') }
            }}
            onToast={(msg, type) => showToast(msg, type)}
            isDesktop={isDesktop}
          />
        )}

        {/* ── KUNDEN ── */}
        {tab === 'kunden' && !selectedCustomer && (
          <KundenList
            customers={customers}
            objects={objects}
            loading={loading}
            onSelect={c => setSelectedCustomer(c)}
          />
        )}
        {tab === 'kunden' && selectedCustomer && (
          <KundeDetail
            customer={selectedCustomer}
            objects={objects.filter(o => {
              if (o.customer_id === selectedCustomer.id) return true
              const oc = customers.find(c => c.id === o.customer_id)
              return oc?.hausverwaltung_id === selectedCustomer.id
            })}
            contacts={contactPersons.filter(cp => cp.customer_id === selectedCustomer.id && !cp.object_id)}
            onBack={() => setSelectedCustomer(null)}
            onUpdated={c => { setCustomers(prev => prev.map(x => x.id===c.id?c:x)); setSelectedCustomer(c); showToast('✔ Kunde gespeichert', 'ok') }}
            onDeleted={() => { setCustomers(prev => prev.filter(x => x.id!==selectedCustomer.id)); setSelectedCustomer(null) }}
            onObjectClick={obj => { setTab('objekte'); setSelectedObject(obj) }}
            onRefreshContacts={loadAll}
            isDesktop={isDesktop}
          />
        )}


        {/* ── ANSPRECHPARTNER ── */}
        {tab === 'ansprechpartner' && (
          <AnsprechpartnerList
            contacts={contactPersons}
            customers={customers}
            objects={objects}
            search={cpSearch}
            onSearchChange={setCpSearch}
            onRefresh={loadAll}
            onNavigateToObject={obj => { setSelectedObject(obj); setTab('objekte') }}
          />
        )}

        {/* ── TEAM ── */}
        {tab === 'team' && (
          <>
            {/* Header mit Einladen-Button */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:20, marginBottom:16 }}>
              <div>
                <h1 style={s.h1}>Team</h1>
                <p style={s.sub}>{team.filter(m=>m.is_active).length} aktiv · {team.length} gesamt</p>
              </div>
              <button onClick={() => setShowInviteOverlay(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(9,106,112,0.25)', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>person_add</span>
                Einladen
              </button>
            </div>

            {/* Team-Liste */}
            {team.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--txt-muted)', fontSize:14 }}>
                <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8, opacity:0.4 }}>group</span>
                Noch keine Mitarbeiter
              </div>
            ) : [...team].sort((a,b)=>a.full_name.localeCompare(b.full_name,'de')).map(m => {
              const role = m.role_name || 'mitarbeiter'
              const ini = m.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
              const roleColor: Record<string,string> = { admin:'#7c3aed', objektleiter:'#0369a1', mitarbeiter:'var(--pri)', support:'#dc2626' }
              const roleBg: Record<string,string> = { admin:'#f3e8ff', objektleiter:'#e0f2fe', mitarbeiter:'var(--pri-xl)', support:'#fef2f2' }
              return (
                <div key={m.id}
                  onClick={() => setSelectedMember(m)}
                  style={{ ...s.taskCard, opacity: m.is_active ? 1 : 0.55, cursor:'pointer', transition:'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow='0 4px 16px rgba(9,106,112,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow=(s.taskCard as any).boxShadow||'0 1px 4px rgba(0,0,0,0.06)')}
                >
                  {/* Avatar + Live-Dot */}
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ width:44, height:44, borderRadius:14, background: m.is_active ? 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)' : 'var(--surf-high)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, fontFamily:'var(--font-head)', boxShadow: m.is_active ? '0 4px 10px rgba(9,106,112,0.25)' : 'none' }}>{ini}</div>
                    {activeWorkerIds.has(m.id) && (
                      <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, borderRadius:'50%', background:'#22c55e', border:'2px solid var(--surf-card)', animation:'livePulse 1.8s ease-in-out infinite' }}/>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, fontFamily:'var(--font-head)', color:'var(--txt)', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.full_name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color: roleColor[role]||'var(--pri)', background: roleBg[role]||'var(--pri-xl)', borderRadius:20, padding:'3px 8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:12 }}>badge</span>{ROLE_LABELS[role]||role}
                      </span>
                      {activeWorkerIds.has(m.id) && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, fontWeight:700, color:'#15803d', background:'#dcfce7', borderRadius:20, padding:'3px 8px' }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'livePulse 1.8s ease-in-out infinite' }}/>
                          In Arbeit
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Status + Chevron */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:700, color: m.is_active ? 'var(--ok)' : 'var(--txt-muted)', background: m.is_active ? 'var(--ok-bg)' : 'var(--surf-high)', borderRadius:20, padding:'3px 8px', display:'flex', alignItems:'center', gap:3 }}>
                      <span className="material-symbols-outlined icon-fill" style={{ fontSize:12 }}>{m.is_active ? 'check_circle' : 'block'}</span>
                      {m.is_active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>chevron_right</span>
                  </div>
                </div>
              )
            })}

            {/* ── Urlaubssperren ── */}
            <div style={{ marginTop:28 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div>
                  <h3 style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', margin:0, color:'var(--txt)' }}>Urlaubssperren</h3>
                  <p style={{ fontSize:12, color:'var(--txt-muted)', margin:'2px 0 0' }}>Zeiträume, in denen kein Urlaub beantragt werden kann</p>
                </div>
                <button onClick={()=>{setBlackoutFrom('');setBlackoutTo('');setBlackoutReason('');setShowBlackoutForm(true)}}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:12, border:'none', background:'#fef2f2', color:'#dc2626', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16 }}>block</span>
                  Sperre
                </button>
              </div>

              {blackouts.length === 0 ? (
                <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'18px 16px', textAlign:'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:28, color:'var(--txt-muted)', display:'block', marginBottom:6, opacity:0.4 }}>event_available</span>
                  <div style={{ fontSize:13, color:'var(--txt-muted)' }}>Keine aktiven Urlaubssperren</div>
                </div>
              ) : (
                <div>
                  {blackouts.map((b:any) => (
                    <div key={b.id} style={{ background:'#fef2f2', borderRadius:14, padding:'12px 16px', marginBottom:8, border:'1.5px solid #fca5a5', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:38, height:38, borderRadius:12, background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#dc2626' }}>block</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'#991b1b' }}>
                          {new Date(b.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})} – {new Date(b.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                        </div>
                        {b.reason && <div style={{ fontSize:12, color:'#dc2626', marginTop:1 }}>{b.reason}</div>}
                      </div>
                      <button onClick={async()=>{
                        if (!confirm('Sperre entfernen?')) return
                        const { error: blErr } = await supabase.from('vacation_blackouts').delete().eq('id', b.id); if (blErr) { showToast('⚠ Löschen fehlgeschlagen', 'warn'); return }
                        setBlackouts(prev => prev.filter((x:any) => x.id !== b.id))
                      }} style={{ width:32, height:32, borderRadius:9, border:'1px solid #fca5a5', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#dc2626', flexShrink:0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16 }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Sperre-Formular */}
              {showBlackoutForm && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:600, display:'flex', alignItems:'flex-end' }} onClick={e=>{if(e.target===e.currentTarget)setShowBlackoutForm(false)}}>
                  <div style={{ background:'var(--bg)', borderRadius:'22px 22px 0 0', width:'100%', padding:'20px 18px 36px', maxWidth:540, margin:'0 auto' }}>
                    <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)', margin:'0 auto 18px' }}/>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                      <h3 style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Urlaubssperre anlegen</h3>
                      <button onClick={()=>setShowBlackoutForm(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                        <span className="material-symbols-outlined">close</span>
                      </button>
                    </div>
                    <div style={{ background:'#fef2f2', borderRadius:12, padding:'11px 14px', marginBottom:16, display:'flex', gap:8 }}>
                      <span className="material-symbols-outlined" style={{ color:'#dc2626', fontSize:16, flexShrink:0, marginTop:1 }}>info</span>
                      <div style={{ fontSize:12, color:'#991b1b', lineHeight:1.5 }}>In diesem Zeitraum können Mitarbeiter keinen Urlaub beantragen. Krankmeldungen sind weiterhin möglich.</div>
                    </div>
                    <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                      <div style={{ flex:1 }}>
                        <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Von</label>
                        <input type="date" value={blackoutFrom} onChange={e=>setBlackoutFrom(e.target.value)}
                          style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Bis</label>
                        <input type="date" value={blackoutTo} onChange={e=>setBlackoutTo(e.target.value)}
                          style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom:16 }}>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Begründung (optional)</label>
                      <input type="text" value={blackoutReason} onChange={e=>setBlackoutReason(e.target.value)} placeholder="z.B. Hochsaison, Messe, Projektwoche"
                        style={{ width:'100%', padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box' }} />
                    </div>
                    <button disabled={blackoutSaving||!blackoutFrom||!blackoutTo||blackoutFrom>blackoutTo}
                      onClick={async()=>{
                        setBlackoutSaving(true)
                        const { data, error } = await supabase.from('vacation_blackouts').insert({ from_date:blackoutFrom, to_date:blackoutTo, reason:blackoutReason||null, created_by:currentUserId }).select().single()
                        if (!error && data) { setBlackouts(prev=>[...prev, data].sort((a:any,b:any)=>a.from_date.localeCompare(b.from_date))); setShowBlackoutForm(false) }
                        setBlackoutSaving(false)
                      }}
                      style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,#dc2626,#ef4444)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:(!blackoutFrom||!blackoutTo||blackoutFrom>blackoutTo)?0.5:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:18 }}>{blackoutSaving?'hourglass_empty':'block'}</span>
                      {blackoutSaving?'Wird gespeichert…':'Urlaubssperre setzen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── TAGESBERICHT ── */}
        {tab === 'bericht' && (() => {
          const todayAssigns: any[] = dailyReport?.assignments ?? []
          const leaves: any[] = dailyReport?.leaves ?? []
          const genAt = dailyReport?.generatedAt
            ? new Date(dailyReport.generatedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})
            : null

          // Group assignments by user
          const byUser: Record<string, any[]> = {}
          todayAssigns.forEach((a: any) => {
            const uid = a.user_id ?? a.users?.id ?? 'unknown'
            if (!byUser[uid]) byUser[uid] = []
            byUser[uid].push(a)
          })

          // Compute per-user totals
          const userStats = Object.entries(byUser).map(([uid, items]) => {
            const name = items[0]?.users?.full_name ?? 'Unbekannt'
            const done  = items.filter((x:any) => x.status === 'erledigt').length
            const prob  = items.filter((x:any) => x.status === 'problem').length
            const open  = items.filter((x:any) => x.status === 'offen' || x.status === 'in_arbeit').length
            // worked minutes
            let workedMin = 0
            items.forEach((x:any) => {
              if (x.started_at && x.completed_at) {
                workedMin += Math.round((new Date(x.completed_at).getTime() - new Date(x.started_at).getTime()) / 60000)
              }
            })
            const travelMin = items.reduce((acc:number, x:any) => acc + (x.travel_minutes ?? 0), 0)
            return { uid, name, items, done, prob, open, workedMin, travelMin }
          }).sort((a,b) => a.name.localeCompare(b.name))

          const totalDone  = todayAssigns.filter((a:any) => a.status === 'erledigt').length
          const totalProb  = todayAssigns.filter((a:any) => a.status === 'problem').length
          const totalOpen  = todayAssigns.filter((a:any) => ['offen','in_arbeit'].includes(a.status)).length

          const fmtMin = (m: number) => m < 60 ? `${m} Min.` : `${Math.floor(m/60)} Std. ${m%60} Min.`
          const statusChip = (status: string) => {
            const map: Record<string,{label:string,bg:string,color:string,icon:string}> = {
              erledigt:  { label:'Erledigt',  bg:'var(--ok-bg)',   color:'var(--ok)',      icon:'check_circle' },
              problem:   { label:'Problem',   bg:'#ffdad6',        color:'var(--err-dot)', icon:'error' },
              in_arbeit: { label:'In Arbeit', bg:'#fff3cd',        color:'#b45309',        icon:'pending' },
              offen:     { label:'Offen',     bg:'var(--surf-high)',color:'var(--txt-muted)',icon:'radio_button_unchecked' },
              vertretung:{ label:'Vertretung',bg:'#e0f2fe',        color:'#0369a1',        icon:'swap_horiz' },
            }
            const c = map[status] ?? { label:status, bg:'var(--surf-high)', color:'var(--txt-muted)', icon:'help' }
            return (
              <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, color:c.color, background:c.bg, borderRadius:20, padding:'2px 7px' }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize:11 }}>{c.icon}</span>{c.label}
              </span>
            )
          }

          return (
            <>
              {/* Header */}
              <div style={{ paddingTop:20, marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div>
                    <h1 style={s.h1}>Tagesbericht</h1>
                    <p style={s.sub}>
                      {new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}
                      {genAt && <> · Stand {genAt}</>}
                    </p>
                  </div>
                  <button
                    onClick={async () => { triggerGenerate(); await new Promise(r => setTimeout(r, 800)); loadDailyReport() }}
                    disabled={reportLoading}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:12, border:'1px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:600, cursor:'pointer', opacity: reportLoading ? 0.6 : 1 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize:17, ...(reportLoading ? {animation:'spin 1s linear infinite'} : {}) }}>refresh</span>
                    {reportLoading ? 'Lädt…' : 'Aktualisieren'}
                  </button>
                </div>
              </div>

              {/* KPI Row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
                {[
                  { label:'Erledigt',  val:totalDone,  icon:'check_circle', color:'var(--ok)',      bg:'var(--ok-bg)' },
                  { label:'Offen',     val:totalOpen,  icon:'pending',      color:'#b45309',        bg:'#fff3cd' },
                  { label:'Probleme',  val:totalProb,  icon:'error',        color:'var(--err-dot)', bg:'#ffdad6' },
                ].map(k => (
                  <div key={k.label} style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 12px', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize:24, color:k.color, display:'block', marginBottom:4 }}>{k.icon}</span>
                    <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:'var(--font-head)', lineHeight:1 }}>{k.val}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:3, fontWeight:600 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Ausstehende Anträge ── */}
              {leaveRequests.filter(r => r.status === 'ausstehend').length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ ...s.secHead, marginBottom:8 }}>
                    <h3 style={s.secTitle}>Ausstehende Anträge</h3>
                    <span style={{ ...s.secCount, background:'#fff3cd', color:'#7c4f00' }}>{leaveRequests.filter(r => r.status === 'ausstehend').length}</span>
                  </div>
                  {leaveRequests.filter(r => r.status === 'ausstehend').map(req => {
                    const isKrank = req.request_type === 'krankmeldung'
                    const fromD = new Date(req.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
                    const toD   = new Date(req.to_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})
                    const dateStr = fromD === toD ? fromD : `${fromD}–${toD}`
                    return (
                      <div key={req.id} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surf-card)', borderRadius:14, padding:'11px 14px', marginBottom:8, border:'1px solid var(--outline)', borderLeftWidth:3, borderLeftColor: isKrank ? 'var(--err-dot)' : '#f59e0b', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                        <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color: isKrank ? 'var(--err-dot)' : '#f59e0b', flexShrink:0 }}>{isKrank ? 'sick' : 'beach_access'}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(req.users as any)?.full_name ?? '–'}</div>
                          <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{isKrank ? 'Krankmeldung' : 'Urlaubsantrag'} · {dateStr}{req.note ? ` · „${req.note}“` : ''}</div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button
                            disabled={leaveLoading === req.id}
                            onClick={async () => {
                              setLeaveConflictLoading(true)
                              const { data: affected } = await supabase
                                .from('task_assignments')
                                .select('id,due_date,status,user_id,tasks(title,categories(emoji),objects(address))')
                                .eq('user_id', req.user_id)
                                .gte('due_date', req.from_date)
                                .lte('due_date', req.to_date)
                                .in('status', ['offen','in_arbeit'])
                                .order('due_date')
                              setLeaveConflictLoading(false)
                              if (affected && affected.length > 0) {
                                setLeaveConflictReq(req)
                                setLeaveConflictAssigns(affected)
                              } else {
                                setLeaveLoading(req.id)
                                const { error: appErr } = await supabase.from('leave_requests').update({ status:'genehmigt' }).eq('id', req.id)
                                setLeaveLoading(null)
                                if (appErr) { showToast('⚠ Fehler beim Genehmigen', 'warn') }
                                else { setLeaveRequests(prev => prev.map(r => r.id === req.id ? {...r, status:'genehmigt'} : r)); showToast('✔ Antrag genehmigt', 'ok') }
                              }
                            }}
                            style={{ padding:'7px 12px', borderRadius:10, border:'none', background:'var(--ok)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:14 }}>check</span>
                            {leaveLoading===req.id ? '…' : 'Ok'}
                          </button>
                          <button
                            disabled={leaveLoading === req.id}
                            onClick={async () => {
                              setLeaveLoading(req.id)
                              const { error: rejErr } = await supabase.from('leave_requests').update({ status:'abgelehnt' }).eq('id', req.id)
                              setLeaveLoading(null)
                              if (rejErr) { showToast('⚠ Fehler beim Ablehnen', 'warn') }
                              else { setLeaveRequests(prev => prev.map(r => r.id === req.id ? {...r, status:'abgelehnt'} : r)); showToast('Antrag abgelehnt', 'warn') }
                            }}
                            style={{ padding:'7px 12px', borderRadius:10, border:'1.5px solid var(--err-dot)', background:'transparent', color:'var(--err-dot)', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize:14 }}>close</span>
                            {leaveLoading===req.id ? '…' : 'Ablehnen'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Abwesenheiten */}
              {leaves.length > 0 && (
                <>
                  <div style={s.secHead}>
                    <h3 style={s.secTitle}>Abwesenheiten heute</h3>
                    <span style={s.secCount}>{leaves.length}</span>
                  </div>
                  {leaves.map((l:any) => {
                    const typeLabel: Record<string,string> = { urlaub:'Urlaub', krankmeldung:'Krankmeldung', sonstiges:'Sonstiges' }
                    const typeIcon:  Record<string,string> = { urlaub:'beach_access', krankmeldung:'sick', sonstiges:'event_busy' }
                    const statusBg:  Record<string,string> = { genehmigt:'var(--ok-bg)', ausstehend:'#fff3cd' }
                    const statusCol: Record<string,string> = { genehmigt:'var(--ok)',    ausstehend:'#b45309' }
                    const t = l.request_type ?? 'sonstig'
                    return (
                      <div key={l.id} style={{ ...s.taskCard, marginBottom:8 }}>
                        <div style={{ width:38, height:38, borderRadius:11, background:'var(--surf-high)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'var(--txt-muted)' }}>{typeIcon[t]||'event_busy'}</span>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', fontFamily:'var(--font-head)' }}>{l.users?.full_name ?? '–'}</div>
                          <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{typeLabel[t]||t} · bis {new Date(l.to_date).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}</div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:statusCol[l.status]||'var(--txt-muted)', background:statusBg[l.status]||'var(--surf-high)', borderRadius:20, padding:'3px 8px', flexShrink:0 }}>
                          {l.status === 'genehmigt' ? 'Genehmigt' : 'Ausstehend'}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ height:8 }} />
                </>
              )}

              {/* Per-Employee Breakdown */}
              {/* Hinweis falls Assignments noch nicht generiert */}
              {!reportLoading && dailyReport && (() => {
                const todayStr = new Date().toISOString().split('T')[0]
                const unassigned = tasks.filter(t => t.is_active && !t.default_assignee_id && (t.due_date??'')<= todayStr && (!t.end_date || t.end_date >= todayStr))
                if (unassigned.length === 0) return null
                return (
                  <div style={{ background:'#fff8e6', border:'1px solid #f59e0b', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom: unassigned.length > 0 ? 10 : 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:20, color:'#b45309', flexShrink:0 }}>warning</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#92400e' }}>
                          {unassigned.length === 1 ? '1 Aufgabe ohne Mitarbeiter' : `${unassigned.length} Aufgaben ohne Mitarbeiter`}
                        </div>
                        <div style={{ fontSize:11, color:'#b45309', marginTop:1 }}>Tippe auf eine Aufgabe um einen Mitarbeiter zuzuweisen</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {unassigned.map((t: any) => (
                        <button key={t.id} onClick={() => setEditTask(t)}
                          style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'1px solid #f59e0b', background:'rgba(255,255,255,0.6)', cursor:'pointer', textAlign:'left' }}>
                          <span className="material-symbols-outlined" style={{ fontSize:17, color:'#b45309', flexShrink:0 }}>{t.categories?.emoji ? undefined : 'task'}</span>
                          {t.categories?.emoji && <span style={{ fontSize:16, flexShrink:0 }}>{t.categories.emoji}</span>}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'#92400e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</div>
                            {t.objects?.address && <div style={{ fontSize:11, color:'#b45309', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.objects.address}</div>}
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize:16, color:'#b45309', flexShrink:0 }}>arrow_forward</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {reportLoading && !dailyReport ? (
                <Loader />
              ) : userStats.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--txt-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8, opacity:0.4 }}>assignment</span>
                  <div style={{ fontSize:14 }}>Keine Aufgaben für heute</div>
                </div>
              ) : (
                <>
                  <div style={s.secHead}>
                    <h3 style={s.secTitle}>Mitarbeiter-Übersicht</h3>
                    <span style={s.secCount}>{userStats.length}</span>
                  </div>
                  {userStats.map(us => {
                    const ini = us.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                    const allDone = us.items.length > 0 && us.done === us.items.length
                    const hasProb = us.prob > 0
                    return (
                      <div key={us.uid} style={{ background:'var(--surf-card)', borderRadius:18, marginBottom:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                        {/* Employee header */}
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--outline)' }}>
                          <div style={{ width:42, height:42, borderRadius:13, background: hasProb ? '#ffdad6' : allDone ? 'var(--ok-bg)' : 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color: hasProb ? 'var(--err-dot)' : allDone ? 'var(--ok)' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, fontFamily:'var(--font-head)', flexShrink:0 }}>{ini}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)' }}>{us.name}</div>
                            <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
                              <span style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600 }}>{us.done}/{us.items.length} erledigt</span>
                              {us.prob > 0 && <span style={{ fontSize:11, color:'var(--err-dot)', fontWeight:700 }}>· {us.prob} Problem{us.prob>1?'e':''}</span>}
                            </div>
                          </div>
                          {/* Time summary */}
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            {us.workedMin > 0 && (
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', fontFamily:'var(--font-head)' }}>{fmtMin(us.workedMin)}</div>
                            )}
                            {us.travelMin > 0 && (
                              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>+ {fmtMin(us.travelMin)} Fahrzeit</div>
                            )}
                            {us.workedMin === 0 && us.travelMin === 0 && (
                              <div style={{ fontSize:11, color:'var(--txt-muted)' }}>Noch keine Zeit</div>
                            )}
                          </div>
                        </div>
                        {/* Task list */}
                        {us.items.map((a:any, idx:number) => (
                          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom: idx < us.items.length-1 ? '1px solid var(--outline)' : 'none', background:'var(--bg)' }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {a.tasks?.categories?.emoji && <span style={{ marginRight:5 }}>{a.tasks.categories.emoji}</span>}
                                {a.tasks?.title ?? '–'}
                              </div>
                              {a.tasks?.objects?.name && (
                                <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize:11, verticalAlign:'middle', marginRight:2 }}>location_on</span>
                                  {a.tasks.objects.name}
                                </div>
                              )}
                            </div>
                            {statusChip(a.status)}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </>
              )}
              <div style={{ height:24 }} />
            </>
          )
        })()}

        {/* ── CHAT ── */}
        {tab === 'chat' && currentUserId && (
          <div style={{ paddingTop: 8 }}>
            <ChatTab currentUserId={currentUserId} />
          </div>
        )}

        {/* ── PROFIL ── */}
        {tab === 'profil' && (
          <>
            {/* Hero-Card */}
            <div style={{ background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:24, padding:'32px 24px 24px', textAlign:'center', marginTop:20, marginBottom:20, boxShadow:'0 8px 32px rgba(9,106,112,0.25)', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
              <div style={{ position:'absolute', bottom:-20, left:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
              <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'2.5px solid rgba(255,255,255,0.35)', color:'#fff', fontSize:26, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontFamily:'var(--font-head)', position:'relative', zIndex:1 }}>{initials}</div>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)', position:'relative', zIndex:1 }}>{userName}</div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:6, background:'rgba(255,255,255,0.15)', borderRadius:20, padding:'4px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize:14, color:'rgba(255,255,255,0.9)' }}>admin_panel_settings</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:600 }}>Administrator</span>
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:6, position:'relative', zIndex:1 }}>Steuber Dienstleistungen GmbH</div>
            </div>

            {/* Schnellübersicht */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {[
                { icon:'group', label:'Mitarbeiter', val: team.filter(m=>m.is_active).length, color:'var(--pri)' },
                { icon:'apartment', label:'Objekte', val: objects.filter(o=>o.is_active).length, color:'#0369a1' },
              ].map(({icon,label,val,color}) => (
                <div key={label} style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color }}>{icon}</span>
                  </div>
                  <div>
                    <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', lineHeight:1 }}>{val}</div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile-Shortcuts für versteckte Tabs */}
            {!isDesktop && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                {([
                  { id:'bericht', icon:'summarize', label:'Tagesbericht', badge: pendingCount + reportNewCount, color:'#0369a1', bg:'#e0f2fe' },
                  { id:'kunden', icon:'business', label:'Kunden', badge: 0, color:'#7c3aed', bg:'#f3e8ff' },
                ] as const).map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id as any)}
                    style={{ padding:'14px 12px', borderRadius:16, border:'1.5px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', display:'flex', alignItems:'center', gap:10, textAlign:'left', position:'relative' }}>
                    <div style={{ width:38, height:38, borderRadius:12, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:20, color:t.color }}>{t.icon}</span>
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:800, color:'var(--txt)' }}>{t.label}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>öffnen</div>
                    </div>
                    {t.badge > 0 && <span style={{ position:'absolute', top:8, right:10, minWidth:18, height:18, borderRadius:999, background:'#e53935', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{t.badge}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Einstellungen */}
            <AdminKontoSection userName={userName} />

            <div style={{ background:'var(--surf-card)', borderRadius:20, overflow:'hidden', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>App</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--outline)' }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>info</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>Version</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>SteuberWork v1.0 · steuberwork.netlify.app</div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>construction</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)' }}>DEV-Modus aktiv</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>Admin/MA-Switcher sichtbar</div>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:'#b45309', background:'#fef3c7', borderRadius:20, padding:'3px 8px' }}>DEV</span>
              </div>
            </div>

            {/* Abmelden */}
            <button onClick={onLogout} style={{ width:'100%', padding:16, borderRadius:16, border:'1.5px solid var(--err-dot)', background:'transparent', color:'var(--err-dot)', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:8 }}>
              <span className="material-symbols-outlined icon-sm">logout</span> Abmelden
            </button>
            <div style={{ height:20 }} />
          </>
        )}

        </div>{/* /maxWidth wrapper */}
      </div>

        {/* QR Code Modal */}
      {qrObject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }} onClick={()=>setQrObject(null)}>
          <div style={{ background:'#fff', borderRadius:24, padding:28, textAlign:'center', maxWidth:320, width:'100%' }} onClick={e=>e.stopPropagation()}>
            <h3 style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:4 }}>{qrObject.name||qrObject.address}</h3>
            <p style={{ fontSize:12, color:'var(--txt-muted)', marginBottom:16 }}>{qrObject.address}, {qrObject.city}</p>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
              <QRCode value={`${window.location.origin}/?object=${qrObject.id}`} size={180} />
            </div>
            <p style={{ fontSize:11, color:'var(--txt-muted)', marginBottom:16, lineHeight:1.5 }}>Mitarbeiter scannen diesen Code um direkt zu den Aufgaben dieses Objekts zu gelangen.</p>
            <button onClick={()=>setQrObject(null)} style={{ width:'100%', padding:12, borderRadius:12, border:'none', background:'var(--pri)', color:'#fff', fontWeight:700, cursor:'pointer' }}>Schließen</button>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyObject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:900, display:'flex', alignItems:'flex-end' }} onClick={()=>setHistoryObject(null)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'80vh', display:'flex', flexDirection:'column', paddingBottom:'env(safe-area-inset-bottom, 0px)' }} onClick={e=>e.stopPropagation()}>
            {/* Drag handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px', flexShrink:0 }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }} />
            </div>
            <div style={{ padding:'8px 18px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, borderBottom:'1px solid var(--outline)' }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Verlauf</h3>
                <p style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{historyObject.address}, {historyObject.city}</p>
              </div>
              <button onClick={()=>setHistoryObject(null)} style={{ background:'var(--surf-low)', border:'none', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>
            </div>
            <div style={{ height:0, flex:1, overflowY:'auto', padding:'14px 18px 18px' }}>
              {historyData.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'var(--txt-muted)' }}>Noch keine Einträge</div>
              ) : historyData.map((a:any) => {
                const isOk = a.status === 'erledigt'
                const isProb = a.status === 'problem'
                const photos = a.task_reports?.[0]?.photo_urls || []
                return (
                  <div key={a.id} style={{ display:'flex', gap:12, paddingBottom:14, marginBottom:14, borderBottom:'1px solid var(--outline)' }}>
                    <div style={{ width:36, height:36, borderRadius:12, background: isOk?'var(--ok-bg)':isProb?'var(--err-bg)':'var(--surf-high)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:isOk?'var(--ok)':isProb?'var(--err-dot)':'var(--txt-muted)' }}>{isOk?'check_circle':isProb?'error':'schedule'}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{a.tasks?.categories?.emoji} {a.tasks?.title||'–'}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>
                        {a.users?.full_name||'–'} · {new Date(a.due_date).toLocaleDateString('de-DE')}
                        {a.task_reports?.[0]?.note && ` · "${a.task_reports[0].note}"`}
                      </div>
                      {photos.length > 0 && (
                        <div style={{ display:'flex', gap:6, marginTop:6 }}>
                          {photos.map((url:string, i:number) => (
                            <img key={i} src={url} alt="Foto" style={{ width:48, height:48, borderRadius:8, objectFit:'cover', border:'1px solid var(--outline)' }}/>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:999, background:isOk?'var(--ok-bg)':isProb?'var(--err-bg)':'var(--surf-high)', color:isOk?'var(--ok)':isProb?'var(--err)':'var(--txt-muted)', height:'fit-content', whiteSpace:'nowrap' }}>
                      {isOk?'✓':isProb?'⚠':'–'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Conflict Resolver ── */}
      {leaveConflictReq && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end' }}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px', flexShrink:0 }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }} />
            </div>
            <div style={{ padding:'8px 18px 14px', borderBottom:'1px solid var(--outline)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:'var(--warn-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ color:'var(--warn)' }}>event_busy</span>
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)' }}>Konflikt – {leaveConflictAssigns.length} betroffene Termine</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>
                    {(leaveConflictReq.users as any)?.full_name} · {new Date(leaveConflictReq.from_date).toLocaleDateString('de-DE')} – {new Date(leaveConflictReq.to_date).toLocaleDateString('de-DE')}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height:0, flex:1, overflowY:'auto', padding:'14px 18px' }}>
              <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:14, lineHeight:1.5 }}>
                Dieser Mitarbeiter hat offene Termine im Abwesenheitszeitraum. Weise jeden Termin einem anderen Mitarbeiter zu, bevor du genehmigst.
              </p>
              {leaveConflictAssigns.map((a:any) => (
                <div key={a.id} style={{ background:'var(--surf-card)', borderRadius:12, padding:'12px 14px', marginBottom:10, border:'1px solid var(--outline)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <span style={{ fontSize:18 }}>{a.tasks?.categories?.emoji || '📋'}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{a.tasks?.title}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)' }}>
                        {a.tasks?.objects?.address} · {new Date(a.due_date).toLocaleDateString('de-DE', {weekday:'short', day:'2-digit', month:'2-digit'})}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', flexShrink:0 }}>person</span>
                    <div style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', position:'relative' }}>
                      <select
                        value={leaveReassignId}
                        onChange={e => setLeaveReassignId(e.target.value)}
                        style={{ width:'100%', border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}
                      >
                        <option value="">Mitarbeiter wählen…</option>
                        {team.filter(m => m.is_active && m.role_name !== 'admin' && m.id !== leaveConflictReq?.user_id).map(m => (
                          <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={async () => {
                        if (!leaveReassignId) return
                        await supabase.from('task_assignments').update({ user_id: leaveReassignId }).eq('id', a.id)
                        setLeaveConflictAssigns(prev => prev.filter(x => x.id !== a.id))
                      }}
                      disabled={!leaveReassignId}
                      style={{ padding:'8px 14px', borderRadius:10, border:'none', background: leaveReassignId ? 'var(--pri)' : 'var(--surf-high)', color: leaveReassignId ? '#fff' : 'var(--txt-muted)', fontSize:12, fontWeight:700, cursor: leaveReassignId ? 'pointer' : 'default', flexShrink:0 }}
                    >
                      Zuweisen
                    </button>
                  </div>
                </div>
              ))}
              {leaveConflictAssigns.length === 0 && (
                <div style={{ textAlign:'center', padding:'20px 0', color:'var(--ok)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span className="material-symbols-outlined">check_circle</span>
                  Alle Termine vergeben!
                </div>
              )}
            </div>
            <div style={{ padding:'14px 18px', borderTop:'1px solid var(--outline)', display:'flex', gap:10, flexShrink:0 }}>
              <button onClick={() => { setLeaveConflictReq(null); setLeaveConflictAssigns([]); setLeaveReassignId('') }}
                style={{ flex:1, padding:'13px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--bg)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button
                onClick={async () => {
                  if (!leaveConflictReq) return
                  await supabase.from('leave_requests').update({ status: 'genehmigt' }).eq('id', leaveConflictReq.id)
                  setLeaveRequests(prev => prev.map(r => r.id === leaveConflictReq.id ? {...r, status:'genehmigt'} : r))
                  setLeaveConflictReq(null); setLeaveConflictAssigns([]); setLeaveReassignId('')
                }}
                style={{ flex:2, padding:'13px', borderRadius:14, border:'none', background:'var(--ok)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
              >
                <span className="material-symbols-outlined icon-sm">check_circle</span>
                Trotzdem genehmigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bug Report */}
      <WasIstNeu role="admin" />
      {showBugReport && <BugReport userId={currentUserId} onClose={()=>setShowBugReport(false)} />}
      <PWAInstallBanner />

    {/* FAB – Neue Aufgabe, nur Mobile, auf relevanten Tabs */}
      {!isDesktop && !selectedObject && ['objekte','overview'].includes(tab) && (
        <button style={{ ...s.fab, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, width:'auto', borderRadius:28, padding:'0 18px', height:52 }} onClick={()=>setShowCreate('')}>
          <span className="material-symbols-outlined" style={{ fontSize:20 }}>add_task</span>
          <span style={{ fontSize:9, fontWeight:800, letterSpacing:'0.04em', lineHeight:1 }}>AUFGABE</span>
        </button>
      )}


      {/* ── MONATSÜBERSICHT OVERLAY ── */}
      {showMonthOverlay && (
        <MonthOverlay
          isDesktop={isDesktop}
          onClose={() => setShowMonthOverlay(false)}
        />
      )}

      {/* ── TODAY TASKS OVERLAY ── */}
      {showTodayOverlay && (
        <TodayTasksOverlay
          tasks={tasks}
          assignments={dailyReport?.assignments ?? []}
          team={team}
          today={localToday()}
          onClose={() => setShowTodayOverlay(false)}
          onEditTask={task => { setShowTodayOverlay(false); setEditTask(task) }}
        />
      )}

      {/* ── INVITE OVERLAY ── */}
      {showInviteOverlay && (
        <InviteOverlay
          inviteMode={inviteMode}
          setInviteMode={setInviteMode}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          inviting={inviting}
          inviteMsg={inviteMsg}
          sendInvite={sendInvite}
          linkRole={linkRole}
          setLinkRole={setLinkRole}
          linkLoading={linkLoading}
          generatedLink={generatedLink}
          setGeneratedLink={setGeneratedLink}
          setInviteMsg={setInviteMsg}
          generateInviteLink={generateInviteLink}
          copyLink={copyLink}
          copyDone={copyDone}
          manualFirstName={manualFirstName} setManualFirstName={setManualFirstName}
          manualLastName={manualLastName}   setManualLastName={setManualLastName}
          manualEmail={manualEmail}         setManualEmail={setManualEmail}
          manualPhone={manualPhone}         setManualPhone={setManualPhone}
          manualRole={manualRole}           setManualRole={setManualRole}
          manualLoading={manualLoading}
          manualResult={manualResult}
          manualPwCopied={manualPwCopied}
          manualErr={manualErr}
          createUserManual={createUserManual}
          copyManualPw={copyManualPw}
          onNewManual={() => { setManualResult(null); setManualErr('') }}
          isDesktop={isDesktop}
          onClose={() => { setShowInviteOverlay(false); setManualResult(null); setManualErr('') }}
        />
      )}

      {/* ── MEMBER DETAIL OVERLAY ── */}
      {selectedMember && (
        <MemberDetailOverlay
          member={selectedMember}
          isDesktop={isDesktop}
          onClose={() => setSelectedMember(null)}
          onUpdated={updated => {
            setTeam(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
            setSelectedMember(prev => prev ? { ...prev, ...updated } : null)
          }}
          onToggleActive={() => {
            toggleActive(selectedMember.id, selectedMember.is_active)
            setSelectedMember(prev => prev ? { ...prev, is_active: !prev.is_active } : null)
          }}
        />
      )}

      {/* ── PROBLEM DETAIL OVERLAY ── */}
      {/* ── Problems Bottom Sheet ── */}
      {showProblemsSheet && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(13,31,34,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={() => setShowProblemsSheet(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:560, background:'var(--surf-card)', borderRadius:24, maxHeight:'80dvh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>
            {/* Spacer statt Handle */}
            <div style={{ height:4 }}/>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 20px 14px' }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>Aktuelle Probleme</div>
                <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{problems.length} {problems.length===1?'offenes Problem':'offene Probleme'}</div>
              </div>
              <button onClick={() => setShowProblemsSheet(false)} style={{ background:'var(--surf-low)', border:'none', borderRadius:10, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>close</span>
              </button>
            </div>
            {/* List */}
            <div style={{ overflowY:'auto', padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:8 }}>
              {problems.length === 0
                ? <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--ok-bg)', borderRadius:14, padding:'14px 16px' }}>
                    <span className="material-symbols-outlined icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'var(--ok)' }}>Keine offenen Probleme</span>
                  </div>
                : problems.map(p => (
                  <div key={p.id} onClick={() => { setSelectedProblem(p); setShowProblemsSheet(false) }}
                    style={{ display:'flex', gap:10, alignItems:'flex-start', background:'#ffdad6', border:'1px solid #fecaca', borderRadius:14, padding:'13px 16px', cursor:'pointer', transition:'filter 0.15s' }}
                    onMouseEnter={e=>(e.currentTarget.style.filter='brightness(0.95)')}
                    onMouseLeave={e=>(e.currentTarget.style.filter='none')}>
                    <span className="material-symbols-outlined icon-fill" style={{ color:'#93000a', flexShrink:0 }}>error</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#93000a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.tasks?.title||'–'}</div>
                      <div style={{ fontSize:11, color:'#ba1a1a', marginTop:2 }}>{p.tasks?.objects?.address}, {p.tasks?.objects?.city} · {p.users?.full_name||'–'}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                      <div style={{ fontSize:11, color:'#93000a' }}>{new Date(p.due_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</div>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'#93000a' }}>chevron_right</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {selectedProblem && (
        <ProblemDetailOverlay
          problem={selectedProblem}
          objects={objects}
          team={team.filter(m => m.is_active && m.role_name !== 'admin')}
          onClose={() => setSelectedProblem(null)}
          onResolved={() => { setSelectedProblem(null); loadAll() }}
          onGoToObject={obj => { setSelectedProblem(null); setTab('objekte'); setSelectedObject(obj) }}
        />
      )}

      {/* ── CREATE TASK OVERLAY ── */}
      {showCreate !== false && (
        <CreateTaskOverlay
          categories={categories}
          objects={objects}
          team={team.filter(m=>m.is_active)}
          templates={templates}
          onClose={()=>setShowCreate(false)}
          onSaved={()=>{ setShowCreate(false); loadAll() }}
          preselectedObjectId={showCreate || undefined}
          isDesktop={isDesktop}
        />
      )}

      {/* Photo Lightbox */}
      {photoLightbox && (
        <div
          onClick={() => setPhotoLightbox(null)}
          style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <img src={photoLightbox} alt="Foto"
            style={{ maxWidth:'100%', maxHeight:'90vh', borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,0.6)', objectFit:'contain' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setPhotoLightbox(null)}
            style={{ position:'absolute', top:20, right:20, background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:40, height:40, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {/* ── EDIT TASK OVERLAY ── */}
      {editTask && (
        <EditTaskOverlay
          task={editTask}
          categories={categories}
          objects={objects}
          team={team.filter(m=>m.is_active && m.role_name!=='admin')}
          onClose={()=>setEditTask(null)}
          onSaved={()=>{ setEditTask(null); loadAll(); showToast('✔ Aufgabe gespeichert', 'ok') }}
          isDesktop={isDesktop}
        />
      )}

      {/* ── CREATE OBJECT OVERLAY ── */}
      {showObjCreate && (
        <CreateObjectOverlay
          onClose={()=>setShowObjCreate(false)}
          onSaved={()=>{ setShowObjCreate(false); loadAll(); showToast('✔ Objekt gespeichert', 'ok') }}
          team={team.filter(m=>m.is_active)}
          isDesktop={isDesktop}
        />
      )}

    </div>

      {/* ── Toast Notification ── */}
      {toast && (
        <div style={{
          position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)',
          zIndex:9999, padding:'12px 20px', borderRadius:16,
          background: toast.type==='ok' ? 'var(--ok)' : toast.type==='warn' ? '#e53935' : 'var(--pri)',
          color:'#fff', fontSize:13, fontWeight:700,
          boxShadow:'0 8px 32px rgba(0,0,0,0.25)',
          display:'flex', alignItems:'center', gap:8,
          maxWidth:'90vw', textAlign:'center',
          pointerEvents:'none', whiteSpace:'nowrap',
        }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, flexShrink:0 }}>
            {toast.type==='ok' ? 'check_circle' : toast.type==='warn' ? 'error' : 'notifications'}
          </span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Object Detail View ──────────────────────────────────────────────────────
function ObjectDetail({ obj, tasks, team, categories, objects, onBack, onEditTask, onToggleTask, onNewTask, onHistory, onQR, onRefresh, onObjectUpdated, onObjectDeleted, onNavigateToCustomer, onToast, isDesktop }: {
  obj: ObjectItem; tasks: TaskItem[]; team: TeamMember[]; categories: Category[]; objects: ObjectItem[]
  onBack: () => void; onEditTask: (t: TaskItem) => void; onToggleTask: (id: string, cur: boolean) => void
  onNewTask: () => void; onHistory: () => void; onQR: () => void; onRefresh: () => void
  onObjectUpdated: (updated: ObjectItem) => void; onObjectDeleted: () => void
  onNavigateToCustomer?: (customerId: string) => void
  onToast?: (msg: string, type: 'ok'|'warn'|'info') => void
  isDesktop?: boolean
}) {
  const [customerLink, setCustomerLink] = useState<string | null>(null)
  const [customerLinkLoading, setCustomerLinkLoading] = useState(false)
  const [customerLinkCopied, setCustomerLinkCopied] = useState(false)
  const [showCustomerLinkModal, setShowCustomerLinkModal] = useState(false)

  const generateCustomerLink = async () => {
    setCustomerLinkLoading(true)
    setShowCustomerLinkModal(true)
    const { data: existing } = await supabase.from('object_tokens').select('token').eq('object_id', obj.id).maybeSingle()
    if (existing?.token) {
      setCustomerLink(`${window.location.origin}?view=${existing.token}`)
      setCustomerLinkLoading(false)
      return
    }
    const { data: inserted } = await supabase.from('object_tokens').insert({ object_id: obj.id }).select('token').single()
    if (inserted?.token) setCustomerLink(`${window.location.origin}?view=${inserted.token}`)
    setCustomerLinkLoading(false)
  }

  const copyCustomerLink = () => {
    if (!customerLink) return
    navigator.clipboard.writeText(customerLink).then(() => {
      setCustomerLinkCopied(true)
      setTimeout(() => setCustomerLinkCopied(false), 2000)
    })
  }

  const [customer, setCustomer]               = useState<any>(null)
  const [upcomingAssigns, setUpcomingAssigns] = useState<any[]>([])
  const [loadingDetail, setLoadingDetail]     = useState(true)
  const [showEdit, setShowEdit]               = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]               = useState(false)
  const [olList, setOlList]                   = useState<{id:string;full_name:string}[]>([])
  const [currentOl, setCurrentOl]             = useState<string|null>(obj.objektleiter_id ?? null)
  const [olSaving, setOlSaving]               = useState(false)
  const [olMsg, setOlMsg]                     = useState<string|null>(null)

  const [objContacts, setObjContacts] = useState<any[]>([])
  const [showAddObjCp, setShowAddObjCp] = useState(false)
  const [objCpSearchQ, setObjCpSearchQ] = useState('')
  const [objCpSearchRes, setObjCpSearchRes] = useState<any[]>([])
  const [objCpSearching, setObjCpSearching] = useState(false)
  const [newObjCpFn, setNewObjCpFn] = useState('')
  const [newObjCpLn, setNewObjCpLn] = useState('')
  const [newObjCpRole, setNewObjCpRole] = useState('')
  const [newObjCpPhone, setNewObjCpPhone] = useState('')
  const [newObjCpEmail, setNewObjCpEmail] = useState('')
  const [objCpSaving, setObjCpSaving] = useState(false)
  const [selectedObjContact, setSelectedObjContact] = useState<any|null>(null)
  const [confirmRemoveCp, setConfirmRemoveCp] = useState<any>(null)
  const [editingObjContact, setEditingObjContact] = useState(false)
  const [editObjCpFn, setEditObjCpFn] = useState('')
  const [editObjCpLn, setEditObjCpLn] = useState('')
  const [editObjCpRole, setEditObjCpRole] = useState('')
  const [editObjCpPhone, setEditObjCpPhone] = useState('')
  const [editObjCpEmail, setEditObjCpEmail] = useState('')
  const [editObjCpSaving, setEditObjCpSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoadingDetail(true)
      const today = localToday()
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
      const to30 = in30.toISOString().slice(0, 10)
      const taskIds = tasks.map(t => t.id)

      const [custRes, assignRes] = await Promise.all([
        obj.customer_id
          ? supabase.from('customers').select('*,hausverwaltung:hausverwaltung_id(id,name,customer_type),co_contact:co_contact_id(id,name,role,phone,email)').eq('id', obj.customer_id).single()
          : Promise.resolve({ data: null }),
        taskIds.length > 0
          ? supabase.from('task_assignments')
              .select('id,task_id,due_date,status,user_id,users!task_assignments_user_id_fkey(full_name)')
              .in('task_id', taskIds)
              .gte('due_date', today)
              .lte('due_date', to30)
              .order('due_date')
          : Promise.resolve({ data: [] })
      ])
      setCustomer(custRes.data)
      setUpcomingAssigns(assignRes.data || [])

      // Load all users with objektleiter role for the dropdown
      const { data: olData } = await supabase
        .from('users')
        .select('id,full_name,role_id,roles(name)')
        .eq('is_active', true)
        .order('full_name')
      const ols = (olData || []).filter((u: any) => u.roles?.name === 'objektleiter')
      setOlList(ols.map((u: any) => ({ id: u.id, full_name: u.full_name })))

      // Contacts laden: object_id-Kontakte + Kundenkontakte (customer_id)
      const contactPromises = [
        supabase.from('contact_persons').select('id,name,first_name,last_name,role,phone,email').eq('object_id', obj.id).order('last_name'),
        ...(obj.customer_id ? [supabase.from('contact_persons').select('id,name,first_name,last_name,role,phone,email').eq('customer_id', obj.customer_id).order('last_name')] : [])
      ]
      Promise.all(contactPromises).then(results => {
        const seen = new Set<string>()
        const merged = results.flatMap(r => (r.data || [])).filter(cp => { if (seen.has(cp.id)) return false; seen.add(cp.id); return true })
        setObjContacts(merged)
      })

      setLoadingDetail(false)
    }
    load()
  }, [obj.id, tasks.length])

  const handleOlChange = async (newId: string | null) => {
    setOlSaving(true)
    const { error } = await supabase.from('objects').update({ objektleiter_id: newId }).eq('id', obj.id)
    if (!error) {
      setCurrentOl(newId)
      onObjectUpdated({ ...obj, objektleiter_id: newId })
      setOlMsg('Objektleiter gespeichert')
      setTimeout(() => setOlMsg(null), 2500)
    }
    setOlSaving(false)
  }

  const searchObjCp = async (q: string) => {
    setObjCpSearchQ(q)
    if (q.trim().length < 2) { setObjCpSearchRes([]); return }
    setObjCpSearching(true)
    const term = q.trim()
    const [{ data: cpData }, { data: custData }] = await Promise.all([
      supabase.from('contact_persons').select('id,name,first_name,last_name,role,phone,email').or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`).limit(5),
      supabase.from('customers').select('id,name,first_name,last_name,email,phone').eq('customer_type','privatperson').or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`).limit(5),
    ])
    const results = [
      ...(cpData||[]).map((r:any)=>({ _id:r.id, first_name:r.first_name||'', last_name:r.last_name||r.name||'', role:r.role||'', phone:r.phone||'', email:r.email||'' })),
      ...(custData||[]).map((r:any)=>({ _id:'cust-'+r.id, first_name:r.first_name||'', last_name:r.last_name||r.name||'', role:'', phone:r.phone||'', email:r.email||'' })),
    ]
    setObjCpSearchRes(results.slice(0, 8))
    setObjCpSearching(false)
  }

  const addObjCp = async (cp: {first_name:string;last_name:string;role:string;phone:string;email:string}) => {
    if (!cp.last_name.trim() && !cp.first_name.trim()) return
    setObjCpSaving(true)
    const { data, error } = await supabase.from('contact_persons').insert({
      object_id: obj.id,
      customer_id: obj.customer_id,
      name: `${cp.first_name} ${cp.last_name}`.trim(),
      first_name: cp.first_name.trim() || null,
      last_name: cp.last_name.trim() || null,
      role: cp.role.trim() || null,
      phone: cp.phone.trim() || null,
      email: cp.email.trim() || null,
    }).select('id,name,first_name,last_name,role,phone,email').single()
    if (error) {
      onToast?.('⚠ Ansprechpartner konnte nicht gespeichert werden', 'warn')
    } else {
      if (data) setObjContacts(prev => [...prev, data].sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||'')))
      setNewObjCpFn(''); setNewObjCpLn(''); setNewObjCpRole(''); setNewObjCpPhone(''); setNewObjCpEmail('')
      setShowAddObjCp(false)
      onRefresh()  // sync global contacts list in Ansprechpartner-Tab
    }
    setObjCpSaving(false)
  }

  const removeObjCp = async (id: string) => {
    setObjContacts(prev => prev.filter(c => c.id !== id))
    const { error } = await supabase.from('contact_persons').delete().eq('id', id)
    if (error) {
      // rollback
      onToast?.('⚠ Ansprechpartner konnte nicht gelöscht werden', 'warn')
      const { data: restored } = await supabase.from('contact_persons').select('id,name,first_name,last_name,role,phone,email,customer_id,customers(id,name,customer_type)').eq('id', id).single()
      if (restored) setObjContacts(prev => [...prev, restored as any].sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||'')))
    }
  }

  return (
    <div style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* ══ HEADER ══ */}
      <div style={{ padding: isDesktop ? '8px 0 20px' : 'calc(env(safe-area-inset-top, 0px) + 16px) 18px 20px', background: isDesktop ? 'transparent' : 'var(--surf-card)', borderBottom: isDesktop ? 'none' : '1px solid var(--outline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={onBack} style={{ background: '#f3f4f5', border: '1px solid #e7e8e9', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 21, color: '#3f484a' }}>arrow_back</span>
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['history', onHistory], ['qr_code', onQR], ['share', generateCustomerLink]] as [string, () => void][]).map(([ic, fn]) => (
              <button key={ic} onClick={fn} style={{ background: '#f3f4f5', border: '1px solid #e7e8e9', borderRadius: 11, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#6f797b' }}>{ic}</span>
              </button>
            ))}
            <button onClick={() => setShowEdit(true)} style={{ background: 'var(--pri)', border: 'none', borderRadius: 11, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 19, color: '#fff' }}>edit</span>
            </button>
          </div>
        </div>
        {obj.object_type && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--pri-xl)', color: 'var(--pri)', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>apartment</span>
            {obj.object_type.charAt(0).toUpperCase() + obj.object_type.slice(1)}
          </div>
        )}
        <h1 style={{ fontSize: isDesktop ? 22 : 25, fontWeight: 800, fontFamily: 'var(--font-head)', margin: 0, lineHeight: 1.12, letterSpacing: '-0.02em' }}>
          {obj.address}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 14.5, color: '#6f797b' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9aa3a5' }}>location_on</span>
          {obj.postal_code} {obj.city}
          {obj.object_number && (<>
            <span style={{ width: 3, height: 3, borderRadius: 2, background: 'var(--outline)' }} />
            <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#9aa3a5' }}>{obj.object_number}</span>
          </>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: '#6f797b' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#9aa3a5' }}>manage_accounts</span>
          <span style={{ fontSize: 11.5, color: '#9aa3a5', fontWeight: 600 }}>Objektleiter:</span>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={currentOl || ''}
              onChange={e => handleOlChange(e.target.value || null)}
              disabled={olSaving}
              style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', border: 'none', background: 'transparent', color: currentOl ? 'var(--pri)' : '#9aa3a5', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-body)', paddingRight: 18, paddingLeft: 0, cursor: 'pointer', outline: 'none' }}
            >
              <option value="">Keiner</option>
              {olList.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#9aa3a5', position: 'absolute', right: 0, pointerEvents: 'none' }}>unfold_more</span>
          </div>
          {olMsg && <span style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 2 }}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>{olMsg}</span>}
        </div>
      </div>

      {loadingDetail ? <Loader/> : (<>

      <div style={{ padding: '0' }}>

        {/* ══ INFO + ANSPRECHPARTNER — 2-col on desktop ══ */}
        <div style={{ display: isDesktop ? 'grid' : 'block', gridTemplateColumns: isDesktop ? '1fr 1fr' : undefined, gap: isDesktop ? 16 : undefined, alignItems: 'stretch', marginTop: 20 }}>
        {/* INFO CARD */}
        <div style={{ background: 'var(--surf-card)', border: '1px solid #e7e8e9', borderRadius: 16, padding: '4px 16px' }}>

          {/* Kunde */}
          {customer && (() => {
            const TYPE_LABEL: Record<string,string> = { privatperson: 'Privatperson', firma: 'Firma', 'weg-verwaltung': 'WEG-Verwaltung', mietverwaltung: 'Mietverwaltung' }
            const isHV = customer.customer_type === 'weg-verwaltung' || customer.customer_type === 'mietverwaltung'
            return (
              <div style={{ padding: '15px 0 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Kunde</span>
                  {customer.lexware_id && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--pri)', background: '#e8f4f5', borderRadius: 999, padding: '3px 9px 3px 7px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>link</span> Lexware
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 800, fontFamily: 'var(--font-head)', color: 'var(--txt)', lineHeight: 1.25, marginTop: 5, letterSpacing: '-0.01em' }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: '#6f797b', marginTop: 3 }}>{TYPE_LABEL[customer.customer_type] || customer.customer_type}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: 'var(--pri)', color: '#fff', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>call</span> Anrufen
                    </a>
                  )}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: '#f3f4f5', color: '#3f484a', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>mail</span> E-Mail
                    </a>
                  )}
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(`${obj.address}, ${obj.postal_code} ${obj.city}`)}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 9, background: '#f3f4f5', color: '#3f484a', textDecoration: 'none', fontSize: 12.5, fontWeight: 700 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>map</span> Karte
                  </a>
                </div>


              </div>
            )
          })()}

        </div>

        {/* ══ ANSPRECHPARTNER + HAUSVERWALTUNG ══ */}
        <div style={{ background: 'var(--surf-card)', border: '1px solid #e7e8e9', borderRadius: 16, padding: 16, marginTop: isDesktop ? 0 : 14 }}>

          {/* Hausverwaltung / Mietverwaltung */}
          {customer && (customer.customer_type === 'weg-verwaltung' || customer.customer_type === 'mietverwaltung') && customer.hausverwaltung && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  {customer.customer_type === 'mietverwaltung' ? 'Mietverwaltung' : 'Hausverwaltung'}
                </div>
                <button onClick={() => onNavigateToCustomer?.(customer.hausverwaltung.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--pri)' }}>apartment</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pri)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.hausverwaltung.name}</div>
                    {customer.hausverwaltung_objekt_id && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#9aa3a5' }}>tag</span>
                        <span style={{ fontSize: 11.5, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{customer.hausverwaltung_objekt_id}</span>
                      </div>
                    )}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#bfc8ca', flexShrink: 0 }}>chevron_right</span>
                </button>
              </div>
              <div style={{ height: 1, background: '#f1f3f4', margin: '0 -16px 14px' }} />
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9aa3a5', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Ansprechpartner{objContacts.length > 0 && <span style={{ marginLeft: 6 }}>· {objContacts.length}</span>}
            </div>
            {!showAddObjCp && (
              <button onClick={() => setShowAddObjCp(true)} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--pri-xl)', border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Neu
              </button>
            )}
          </div>

          {objContacts.length === 0 && !showAddObjCp && (
            <div style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Noch keine Ansprechpartner hinterlegt.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {objContacts.map((c, i) => {
              const ini = ((c.first_name?.[0] || '') + (c.last_name?.[0] || '')).toUpperCase() || '?'
              const dn = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || '–'
              return (
                <div key={c.id} onClick={() => { setSelectedObjContact(c); setEditingObjContact(false) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderTop: i ? '1px solid #eef0f1' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg,var(--pri),var(--pri-c,#0c8f85))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>{ini}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dn}</div>
                    {c.role && <div style={{ fontSize: 11, color: '#6f797b' }}>{c.role}</div>}
                  </div>
                  {c.email && (
                    <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pri)', textDecoration: 'none', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>mail</span>
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pri)', textDecoration: 'none', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>call</span>
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          {showAddObjCp && (
            <div style={{ background: 'var(--surf-low)', borderRadius: 12, padding: 12, border: '1.5px solid var(--pri)', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--outline)', background: 'var(--surf-card)', marginBottom: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--txt-muted)' }}>search</span>
                <input value={objCpSearchQ} onChange={e => searchObjCp(e.target.value)} placeholder="Ansprechpartner suchen …" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--txt)' }}/>
                {objCpSearching && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--txt-muted)' }}>progress_activity</span>}
                {objCpSearchQ && <button onClick={() => { setObjCpSearchQ(''); setObjCpSearchRes([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--txt-muted)' }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span></button>}
              </div>
              {objCpSearchRes.length > 0 && (
                <div style={{ background: 'var(--surf-card)', borderRadius: 10, border: '1px solid var(--outline)', marginBottom: 8, overflow: 'hidden' }}>
                  {objCpSearchRes.map((cp: any) => (
                    <div key={cp._id} onClick={() => { addObjCp({ first_name: cp.first_name, last_name: cp.last_name, role: cp.role, phone: cp.phone, email: cp.email }); setObjCpSearchQ(''); setObjCpSearchRes([]) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--outline)', cursor: 'pointer' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--pri-xl)', color: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>
                        {(cp.first_name?.[0] || cp.last_name?.[0] || '?').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{cp.first_name} {cp.last_name}</div>
                        {cp.role && <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{cp.role}</div>}
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--pri)' }}>add_circle</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pri)', marginBottom: 8 }}>Neuer Ansprechpartner</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start', marginBottom: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Vorname</label>
                  <input value={newObjCpFn} onChange={e => setNewObjCpFn(e.target.value)} placeholder="Max" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', fontSize: 13, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Nachname *</label>
                  <input value={newObjCpLn} onChange={e => setNewObjCpLn(e.target.value)} placeholder="Mustermann" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', fontSize: 13, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}/>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Funktion</label>
                <input value={newObjCpRole} onChange={e => setNewObjCpRole(e.target.value)} placeholder="Hausmeister" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', fontSize: 13, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}/>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start', marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Telefon</label>
                  <input value={newObjCpPhone} onChange={e => setNewObjCpPhone(e.target.value)} placeholder="+49 561 …" inputMode="tel" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', fontSize: 13, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>E-Mail</label>
                  <input value={newObjCpEmail} onChange={e => setNewObjCpEmail(e.target.value)} placeholder="max@beispiel.de" inputMode="email" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', fontSize: 13, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}/>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowAddObjCp(false); setNewObjCpFn(''); setNewObjCpLn(''); setNewObjCpRole(''); setNewObjCpPhone(''); setNewObjCpEmail(''); setObjCpSearchQ(''); setObjCpSearchRes([]) }} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', color: 'var(--txt-sec)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Abbrechen</button>
                <button disabled={(!newObjCpFn.trim() && !newObjCpLn.trim()) || objCpSaving} onClick={() => addObjCp({ first_name: newObjCpFn, last_name: newObjCpLn, role: newObjCpRole, phone: newObjCpPhone, email: newObjCpEmail })}
                  style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', background: (newObjCpFn.trim() || newObjCpLn.trim()) && !objCpSaving ? 'var(--pri)' : 'var(--outline)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (newObjCpFn.trim() || newObjCpLn.trim()) && !objCpSaving ? 'pointer' : 'not-allowed' }}>
                  Hinzufügen
                </button>
              </div>
            </div>
          )}
        </div>

        </div>{/* end 2-col grid */}

        {/* ══ LEISTUNGEN ══ */}
        {(() => {
          const LEISTUNG_LABEL: Record<string,string> = { täglich: 'Täglich', wöchentlich: 'Wöchentlich', zweiwöchentlich: 'Zweiwöchentlich', monatlich: 'Monatlich', quartalsweise: 'Quartalsweise', einmalig: 'Einmalige Aufträge' }
          const LEISTUNG_ORDER = ['täglich', 'wöchentlich', 'zweiwöchentlich', 'monatlich', 'quartalsweise', 'einmalig']
          const isOneTime = (t: TaskItem) => (t as any).contracts?.type === 'einmalig'
          const isExpiredT = (t: TaskItem) => !!(t.end_date && new Date(t.end_date) < new Date())
          const activeCount = tasks.filter(t => isOneTime(t) ? !isExpiredT(t) : t.is_active).length
          const taskGroupMap: Record<string, TaskItem[]> = {}
          tasks.forEach(t => { const k = isOneTime(t) ? 'einmalig' : t.interval; (taskGroupMap[k] = taskGroupMap[k] || []).push(t) })
          const leistungsGroups = LEISTUNG_ORDER.filter(k => taskGroupMap[k]).map(k => ({ key: k, label: LEISTUNG_LABEL[k], items: taskGroupMap[k] }))

          return (<>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '28px 0 14px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <h3 style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-head)', margin: 0, letterSpacing: '-0.01em' }}>Leistungen</h3>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--pri)' }}>{activeCount} aktiv</span>
              </div>
              <button onClick={onNewTask} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--pri)', background: 'var(--pri-xl)', padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Neu
              </button>
            </div>

            {tasks.length === 0 ? (
              <div style={{ background: 'var(--surf-low)', borderRadius: 16, padding: '24px 16px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13, marginBottom: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.35 }}>assignment</span>
                Noch keine Leistungen hinterlegt.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {leistungsGroups.map(g => {
                  const intervalIcon = INTERVAL_ICONS[g.key] || 'repeat'
                  return (
                    <div key={g.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--font-head)', color: '#3f484a', whiteSpace: 'nowrap' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#9aa3a5' }}>{intervalIcon}</span>
                          {g.label}
                        </span>
                        <span style={{ flex: 1, height: 1, background: '#e7e8e9' }} />
                        <span style={{ fontSize: 10.5, color: '#9aa3a5', fontWeight: 600 }}>{g.items.length}</span>
                      </div>
                      <div style={{ background: 'var(--surf-card)', borderRadius: 14, border: '1px solid #e7e8e9', overflow: 'hidden' }}>
                        {g.items.map((t, i) => {
                          const oneTime = isOneTime(t)
                          const isExpired = isExpiredT(t)
                          const on = t.is_active
                          const dim = oneTime ? isExpired : (!on || isExpired)
                          const user = (t as any).users as any
                          const taskUpcoming = upcomingAssigns.filter((a: any) => a.task_id === t.id)
                          return (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid #f1f3f4' : 'none', opacity: dim ? 0.55 : 1, transition: 'opacity .2s' }}>
                              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#f3f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0 }}>
                                {(t as any).categories?.emoji || '📋'}
                              </div>
                              <button onClick={() => onEditTask(t)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                <div style={{ fontSize: 15.5, fontWeight: 800, fontFamily: 'var(--font-head)', lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, fontSize: 11.5, color: '#6f797b' }}>
                                  {user?.full_name && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#9aa3a5' }}>person</span>
                                      {user.full_name.split(' ')[0]}
                                    </span>
                                  )}
                                  {user?.full_name && <span style={{ width: 2, height: 2, borderRadius: 1, background: '#cdd4d5', flexShrink: 0 }} />}
                                  <span style={{ color: taskUpcoming.length ? 'var(--pri)' : '#9aa3a5', fontWeight: 600 }}>
                                    {taskUpcoming.length ? `${taskUpcoming.length} Termin${taskUpcoming.length > 1 ? 'e' : ''}` : 'Keine Termine'}
                                  </span>
                                  {isExpired && <span style={{ fontSize: 10, fontWeight: 700, color: '#93000a', background: '#ffdad6', padding: '1px 6px', borderRadius: 5 }}>Abgelaufen</span>}
                                </div>
                              </button>
                              {oneTime ? (
                                <span style={{ flexShrink: 0, boxSizing: 'border-box' as const, height: 26, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '0 10px', borderRadius: 999, color: isExpired ? 'var(--ok)' : '#3f484a', background: isExpired ? '#dcfce7' : '#f3f4f5' }}>
                                  <span className={`material-symbols-outlined${isExpired ? ' icon-fill' : ''}`} style={{ fontSize: 12 }}>{isExpired ? 'check_circle' : 'looks_one'}</span>
                                  {isExpired ? 'Erledigt' : 'Einmalig'}
                                </span>
                              ) : (
                                <button onClick={() => onToggleTask(t.id, t.is_active)} style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0, position: 'relative' as const, background: on && !isExpired ? 'var(--pri)' : '#cdd4d5', transition: 'background .2s' }}>
                                  <span style={{ position: 'absolute', top: 3, left: on && !isExpired ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .2s' }} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>)
        })()}

        {/* ══ NÄCHSTE TERMINE ══ */}
        {upcomingAssigns.length > 0 && (() => {
          const today = localToday()
          const activeTaskIds = new Set(tasks.filter(t => t.is_active && !(t.end_date && new Date(t.end_date) < new Date())).map(t => t.id))
          const visibleAssigns = upcomingAssigns.filter((a: any) => activeTaskIds.has(a.task_id))
          if (visibleAssigns.length === 0) return null
          const grouped: Record<string, any[]> = {}
          visibleAssigns.forEach((a: any) => { if (!grouped[a.due_date]) grouped[a.due_date] = []; grouped[a.due_date].push(a) })
          const sortedDates = Object.keys(grouped).sort().slice(0, 14)

          const formatDateLabel = (date: string, todayStr: string) => {
            if (date === todayStr) return 'Heute'
            const d = new Date(date + 'T00:00:00')
            return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
          }

          return (<>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '28px 0 14px' }}>
              <h3 style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-head)', margin: 0, letterSpacing: '-0.01em' }}>Nächste Termine</h3>
              <span style={{ fontSize: 12, color: '#9aa3a5', fontWeight: 600 }}>30 Tage</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {sortedDates.map(date => {
                const isToday = date === today
                const assignments = grouped[date]
                return (
                  <div key={date}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--font-head)', color: isToday ? 'var(--pri)' : '#3f484a', textTransform: 'capitalize' as const, whiteSpace: 'nowrap' }}>
                        {formatDateLabel(date, today)}
                      </span>
                      <span style={{ flex: 1, height: 1, background: '#e7e8e9' }} />
                      <span style={{ fontSize: 10.5, color: '#9aa3a5', fontWeight: 600 }}>{assignments.length} Aufg.</span>
                    </div>
                    <div style={{ background: 'var(--surf-card)', borderRadius: 14, border: `1px solid ${isToday ? '#a8ece8' : '#e7e8e9'}`, overflow: 'hidden' }}>
                      {assignments.map((a: any, i: number) => {
                        const task = tasks.find(t => t.id === a.task_id)
                        const st = STATUS_META[a.status] || STATUS_META['offen']
                        return (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderTop: i ? '1px solid #eef0f1' : 'none' }}>
                            <span style={{ fontSize: 19, flexShrink: 0 }}>{(task as any)?.categories?.emoji || '📋'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task?.title}</div>
                              <div style={{ fontSize: 11.5, color: '#6f797b', marginTop: 1 }}>{(a.users as any)?.full_name || '–'}</div>
                            </div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: st.color, background: st.bg, padding: '4px 9px', borderRadius: 999, flexShrink: 0 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{st.icon}</span>
                              {st.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {Object.keys(grouped).length > 14 && (
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--txt-muted)', padding: '4px 0 8px' }}>
                  +{Object.keys(grouped).length - 14} weitere Tage
                </div>
              )}
            </div>
          </>)
        })()}

      </div>

      </>)}

      {/* ── Customer Link Modal ── */}
      {showCustomerLinkModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:800, display:'flex', alignItems:'flex-end' }} onClick={() => setShowCustomerLinkModal(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'24px 24px 0 0', padding:'24px 20px 40px', width:'100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
              <div style={{ width:42, height:42, borderRadius:14, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ color:'var(--pri)', fontSize:22 }}>share</span>
              </div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Kunden-Link</div>
                <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{obj.address}, {obj.city}</div>
              </div>
              <button onClick={() => setShowCustomerLinkModal(false)} style={{ marginLeft:'auto', background:'var(--surf-low)', border:'none', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>
            </div>
            <p style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:14, lineHeight:1.5 }}>
              Teile diesen Link mit dem Kunden. Er kann ohne Login den aktuellen Aufgabenstatus des Objekts einsehen.
            </p>
            {customerLinkLoading ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px', background:'var(--surf-low)', borderRadius:12 }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>hourglass_empty</span>
                <span style={{ fontSize:13, color:'var(--txt-muted)' }}>Wird generiert…</span>
              </div>
            ) : customerLink ? (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', background:'var(--surf-low)', borderRadius:12, border:'1px solid var(--outline)', marginBottom:12 }}>
                  <span style={{ flex:1, fontSize:12, color:'var(--txt)', wordBreak:'break-all', fontFamily:'monospace' }}>{customerLink}</span>
                </div>
                <button onClick={copyCustomerLink} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: customerLinkCopied ? 'var(--ok)' : 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', transition:'background 0.2s' }}>
                  <span className="material-symbols-outlined icon-sm">{customerLinkCopied ? 'check' : 'content_copy'}</span>
                  {customerLinkCopied ? 'Kopiert!' : 'Link kopieren'}
                </button>
                <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:6, padding:'10px 12px', background:'var(--pri-xl)', borderRadius:10 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>info</span>
                  <span style={{ fontSize:12, color:'var(--pri)' }}>Gültig für 1 Jahr. Neuen Link durch erneutes Klicken generieren.</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize:13, color:'var(--err)' }}>Fehler beim Generieren des Links.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Object Overlay ── */}
      {showEdit && (
        <EditObjectOverlay
          obj={obj}
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setShowEdit(false); onObjectUpdated(updated) }}
          onDelete={() => { setShowEdit(false); setShowDeleteConfirm(true) }}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {showDeleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'var(--surf-card)', borderRadius:'24px 24px 0 0', padding:'28px 24px 40px', width:'100%', maxWidth:500 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:52, height:52, borderRadius:16, background:'var(--err-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <span className="material-symbols-outlined" style={{ color:'var(--err)', fontSize:26 }}>delete</span>
              </div>
              <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:6 }}>Objekt löschen?</div>
              <div style={{ fontSize:13, color:'var(--txt-muted)', lineHeight:1.5 }}>
                <strong>{obj.address}, {obj.postal_code} {obj.city}</strong><br/>
                Diese Aktion kann nicht rückgängig gemacht werden.
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex:1, padding:'14px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--bg)', fontSize:14, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
              <button disabled={deleting} onClick={async () => {
                setDeleting(true)
                try {
                  // 1. Tasks ermitteln
                  const { data: objTasks } = await supabase.from('tasks').select('id').eq('object_id', obj.id)
                  if (objTasks && objTasks.length > 0) {
                    const taskIds = objTasks.map((t: any) => t.id)
                    // 2. Assignments ermitteln
                    const { data: objAssigns } = await supabase.from('task_assignments').select('id').in('task_id', taskIds)
                    if (objAssigns && objAssigns.length > 0) {
                      const assignIds = objAssigns.map((a: any) => a.id)
                      // 3. Task-Reports löschen (FK auf assignment_id)
                      const { error: e1 } = await supabase.from('task_reports').delete().in('assignment_id', assignIds)
                      if (e1) throw e1
                      // 4. Task-Assignments löschen
                      const { error: e2 } = await supabase.from('task_assignments').delete().in('id', assignIds)
                      if (e2) throw e2
                    }
                    // 5. Tasks löschen
                    const { error: e3 } = await supabase.from('tasks').delete().in('id', taskIds)
                    if (e3) throw e3
                  }
                  // 5. Ansprechpartner (contact_persons mit object_id) löschen
                  const { error: e4 } = await supabase.from('contact_persons').delete().eq('object_id', obj.id)
                  if (e4) throw e4
                  // 6. Leistungen löschen
                  const { error: e5 } = await supabase.from('object_services').delete().eq('object_id', obj.id)
                  if (e5) throw e5
                  // 7. Objekt löschen
                  const { error: delErr } = await supabase.from('objects').delete().eq('id', obj.id)
                  if (delErr) throw delErr
                  setShowDeleteConfirm(false)
                  onObjectDeleted()
                } catch (err: any) {
                  console.error('Delete error:', err)
                  alert('Fehler beim Löschen: ' + (err?.message || 'Unbekannter Fehler'))
                } finally {
                  setDeleting(false)
                }
              }} style={{ flex:1, padding:'14px', borderRadius:14, border:'none', background:'var(--err)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ansprechpartner entfernen bestätigen ── */}
      {confirmRemoveCp && (
        <ConfirmDialog
          title="Kontakt entfernen?"
          message={<><strong>{[confirmRemoveCp.first_name, confirmRemoveCp.last_name].filter(Boolean).join(' ') || confirmRemoveCp.name}</strong> wird von diesem Objekt entfernt.</>}
          confirmLabel="Entfernen"
          cancelLabel="Abbrechen"
          destructive
          onCancel={() => setConfirmRemoveCp(null)}
          onConfirm={async () => { await removeObjCp(confirmRemoveCp.id); setConfirmRemoveCp(null); setSelectedObjContact(null) }}
        />
      )}

      {/* ── Kontakt-Detail Bottom Sheet ── */}
      {selectedObjContact && (() => {
        const cp = selectedObjContact
        const dn = [cp.first_name, cp.last_name].filter(Boolean).join(' ') || cp.name || '–'
        const ini = ((cp.first_name?.[0]||'')+(cp.last_name?.[0]||'')).toUpperCase() || '?'
        const saveEditCp = async () => {
          if (!editObjCpLn.trim() && !editObjCpFn.trim()) return
          setEditObjCpSaving(true)
          const { data } = await supabase.from('contact_persons').update({
            name: `${editObjCpFn.trim()} ${editObjCpLn.trim()}`.trim(),
            first_name: editObjCpFn.trim() || null,
            last_name: editObjCpLn.trim() || null,
            role: editObjCpRole.trim() || null,
            phone: editObjCpPhone.trim() || null,
            email: editObjCpEmail.trim() || null,
          }).eq('id', cp.id).select().single()
          setEditObjCpSaving(false)
          if (data) {
            setObjContacts(prev => prev.map(c => c.id === cp.id ? data : c))
            setSelectedObjContact(data)
            setEditingObjContact(false)
          }
        }
        return (
          <>
            <div onClick={() => setSelectedObjContact(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:800 }}/>
            <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:801, background:'var(--surf-card)', borderRadius:'20px 20px 0 0', padding:'0 0 env(safe-area-inset-bottom,16px)', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 -4px 32px rgba(0,0,0,0.18)' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:'var(--outline)', margin:'12px auto 0' }}/>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px 12px' }}>
                <div style={{ width:50, height:50, borderRadius:16, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, flexShrink:0 }}>{ini}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>{dn}</div>
                  {cp.role && <div style={{ fontSize:13, color:'var(--txt-muted)', marginTop:2 }}>{cp.role}</div>}
                </div>
                <button onClick={() => setSelectedObjContact(null)} style={{ background:'var(--surf-low)', border:'none', borderRadius:10, padding:8, cursor:'pointer', display:'flex', color:'var(--txt-muted)' }}>
                  <span className="material-symbols-outlined icon-sm">close</span>
                </button>
              </div>
              <div style={{ height:1, background:'var(--outline)', margin:'0 20px' }}/>

              {!editingObjContact ? (
                <div style={{ padding:'16px 20px' }}>
                  {/* Kontaktfelder */}
                  {cp.role && (
                    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--outline)' }}>
                      <div style={{ width:32, height:32, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>badge</span>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:'var(--txt-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Funktion</div>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', marginTop:1 }}>{cp.role}</div>
                      </div>
                    </div>
                  )}
                  {cp.phone && (
                    <a href={'tel:'+cp.phone} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--outline)', textDecoration:'none' }}>
                      <div style={{ width:32, height:32, borderRadius:10, background:'#e8f5e9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'var(--ok)' }}>phone</span>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:'var(--txt-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Telefon</div>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--pri)', marginTop:1 }}>{cp.phone}</div>
                      </div>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', marginLeft:'auto' }}>open_in_new</span>
                    </a>
                  )}
                  {cp.email && (
                    <a href={'mailto:'+cp.email} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--outline)', textDecoration:'none' }}>
                      <div style={{ width:32, height:32, borderRadius:10, background:'#e3f2fd', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'#1976d2' }}>mail</span>
                      </div>
                      <div>
                        <div style={{ fontSize:10, color:'var(--txt-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>E-Mail</div>
                        <div style={{ fontSize:14, fontWeight:600, color:'var(--pri)', marginTop:1 }}>{cp.email}</div>
                      </div>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', marginLeft:'auto' }}>open_in_new</span>
                    </a>
                  )}
                  {!cp.role && !cp.phone && !cp.email && (
                    <div style={{ textAlign:'center', padding:'20px 0', color:'var(--txt-muted)', fontSize:13 }}>Keine Kontaktdaten hinterlegt</div>
                  )}
                  {/* Aktionen */}
                  <div style={{ display:'flex', gap:10, marginTop:16 }}>
                    <button onClick={() => { setEditObjCpFn(cp.first_name||''); setEditObjCpLn(cp.last_name||cp.name||''); setEditObjCpRole(cp.role||''); setEditObjCpPhone(cp.phone||''); setEditObjCpEmail(cp.email||''); setEditingObjContact(true) }}
                      style={{ flex:1, padding:'11px', borderRadius:12, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <span className="material-symbols-outlined icon-sm">edit</span>Bearbeiten
                    </button>
                    <button onClick={() => setConfirmRemoveCp(cp)}
                      style={{ padding:'11px 14px', borderRadius:12, border:'none', background:'#fde8e8', color:'var(--err-dot)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <span className="material-symbols-outlined icon-sm">delete</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding:'16px 20px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--pri)', marginBottom:12 }}>Kontakt bearbeiten</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, alignItems:'start' }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Vorname</div>
                      <input value={editObjCpFn} onChange={e=>setEditObjCpFn(e.target.value)} placeholder="Max" style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:13, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Nachname *</div>
                      <input value={editObjCpLn} onChange={e=>setEditObjCpLn(e.target.value)} placeholder="Mustermann" style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:13, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Funktion</div>
                    <input value={editObjCpRole} onChange={e=>setEditObjCpRole(e.target.value)} placeholder="Verwalter" style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:13, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}/>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Telefon</div>
                      <input value={editObjCpPhone} onChange={e=>setEditObjCpPhone(e.target.value)} placeholder="+49 561 …" inputMode="tel" style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:13, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>E-Mail</div>
                      <input value={editObjCpEmail} onChange={e=>setEditObjCpEmail(e.target.value)} placeholder="max@firma.de" inputMode="email" style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:13, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}/>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={()=>setEditingObjContact(false)} style={{ flex:1, padding:'11px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                    <button onClick={saveEditCp} disabled={editObjCpSaving || (!editObjCpFn.trim() && !editObjCpLn.trim())}
                      style={{ flex:2, padding:'11px', borderRadius:12, border:'none', background:'var(--pri)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, opacity: editObjCpSaving ? 0.7 : 1 }}>
                      <span className="material-symbols-outlined icon-sm">{editObjCpSaving ? 'hourglass_empty' : 'check'}</span>
                      {editObjCpSaving ? 'Speichert…' : 'Speichern'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}

// ─── Edit Object Overlay ──────────────────────────────────────────────────────
function EditObjectOverlay({ obj, customer: initCustomer, onClose, onSaved, onDelete }: {
  obj: ObjectItem
  customer: any | null
  onClose: () => void
  onSaved: (updated: ObjectItem) => void
  onDelete: () => void
}) {
  const OBJ_TYPES = [
    { value: 'einfamilienhaus',  label: 'Einfamilienhaus',  icon: 'house' },
    { value: 'mehrfamilienhaus', label: 'Mehrfamilienhaus', icon: 'apartment' },
    { value: 'firmengelaende',   label: 'Firmengelände',    icon: 'business' },
    { value: 'grundstueck',      label: 'Grundstück',       icon: 'landscape' },
  ] as const

  const [street, setStreet]       = useState(obj.address || '')
  const [postal, setPostal]       = useState(obj.postal_code || '')
  const [city, setCity]           = useState(obj.city || '')
  const [cityLocked, setCityLocked] = useState(false)
  const [addrSup, setAddrSup]     = useState(obj.address_supplement || '')
  const [objType, setObjType]     = useState<ObjectType>((obj.object_type as ObjectType) || 'mehrfamilienhaus')
  const [accessNote, setAccessNote] = useState((obj as any).access_note || '')
  const [parkingNote, setParkingNote] = useState((obj as any).parking_note || '')
  const [floorInfo, setFloorInfo]   = useState((obj as any).floor_info || '')
  const [objNotes, setObjNotes]     = useState(obj.notes || '')
  const [plzLoading, setPlzLoading] = useState(false)

  // Kunde ändern
  const [custQuery, setCustQuery]       = useState('')
  const [custResults, setCustResults]   = useState<any[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [selectedCust, setSelectedCust] = useState<any>(initCustomer)
  const [showCustSearch, setShowCustSearch] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const lookupCity = async (plz: string) => {
    setPostal(plz)
    if (plz.length !== 5) { if (cityLocked) { setCity(''); setCityLocked(false) }; return }
    setPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) {
        const data = await res.json()
        const found = data[0]?.name
        if (found) { setCity(found); setCityLocked(true) }
      }
    } catch { /* ignore */ }
    setPlzLoading(false)
  }

  const searchCustomers = async (q: string) => {
    setCustQuery(q)
    if (q.trim().length < 2) { setCustResults([]); return }
    setCustSearching(true)
    const { data } = await supabase.from('customers').select('id,customer_type,name,contact_person,email,phone').or(`name.ilike.%${q.trim()}%,contact_person.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`).limit(6)
    setCustResults(data || [])
    setCustSearching(false)
  }

  const save = async () => {
    if (!street.trim() || !postal.trim() || !city.trim()) { setError('Straße, PLZ und Ort sind Pflichtfelder.'); return }
    setSaving(true); setError('')
    const updates: any = {
      address:      street.trim(),
      postal_code:  postal.trim(),
      city:         city.trim(),
      address_supplement: addrSup.trim() || null,
      object_type:  objType,
      name:         `${street.trim()}, ${postal.trim()} ${city.trim()}`,
      customer_id:  selectedCust?.id || null,
      access_note:  accessNote.trim() || null,
      parking_note: parkingNote.trim() || null,
      floor_info:   floorInfo.trim() || null,
      notes:        objNotes.trim() || null,
    }
    const { data, error: e } = await supabase.from('objects').update(updates).eq('id', obj.id).select('id,name,address,city,postal_code,object_number,customer_id,is_active,object_type,access_note,parking_note,floor_info,notes,customers(id,name)').single()
    if (e || !data) { setError(e?.message || 'Fehler beim Speichern'); setSaving(false); return }
    onSaved(data as unknown as ObjectItem)
  }

  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 768)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent:'center' }}>
      <div style={{ background:'var(--bg)', borderRadius: isDesktop ? 20 : '24px 24px 0 0', maxHeight: isDesktop ? '90vh' : '92vh', width: isDesktop ? '100%' : undefined, maxWidth: isDesktop ? 680 : undefined, overflowY:'auto', paddingBottom: isDesktop ? 0 : 40 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 16px', position:'sticky', top:0, background:'var(--bg)', borderBottom:'1px solid var(--outline)', zIndex:1 }}>
          <button onClick={onClose} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Objekt bearbeiten</div>
            <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{obj.object_number || obj.id.slice(0,8)}</div>
          </div>
          <button onClick={onDelete} style={{ background:'var(--err-bg)', border:'none', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:6, cursor:'pointer', color:'var(--err)', fontSize:12, fontWeight:700 }}>
            <span className="material-symbols-outlined icon-sm">delete</span> Löschen
          </button>
        </div>

        <div style={{ padding:'20px 20px 0' }}>
          {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}

          {/* Objektart */}
          <label style={s.fieldLabel}>Objektart</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {OBJ_TYPES.map(opt => (
              <div key={opt.value} onClick={() => setObjType(opt.value)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:12, border:`1.5px solid ${objType===opt.value?'var(--pri)':'var(--outline)'}`, background:objType===opt.value?'var(--pri-xl)':'var(--surf-card)', cursor:'pointer', transition:'all 0.15s' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:objType===opt.value?'var(--pri)':'var(--txt-muted)' }}>{opt.icon}</span>
                <span style={{ fontSize:12, fontWeight:700, color:objType===opt.value?'var(--pri)':'var(--txt)', flex:1 }}>{opt.label}</span>
              </div>
            ))}
          </div>

          {/* Adresse */}
          <label style={s.fieldLabel}>Straße + Hausnummer *</label>
          <div style={{ ...s.inputWrap, marginBottom:10 }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>location_on</span>
            <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Bahnhofstraße 14" style={s.input} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10, marginBottom:10, alignItems:'start' }}>
            <div>
              <label style={s.fieldLabel}>PLZ *</label>
              <div className="iw" style={s.inputWrap}>
                <input value={postal} onChange={e => lookupCity(e.target.value)} placeholder="34212" maxLength={5} style={{ ...s.input, width:'100%' }} />
                {plzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', animation:'spin 1s linear infinite' }}>progress_activity</span>}
              </div>
            </div>
            <div>
              <label style={s.fieldLabel}>Ort *</label>
              <div style={{ ...s.inputWrap, background: cityLocked ? 'var(--ok-bg)' : undefined }}>
                <input value={city} onChange={e => { setCity(e.target.value); setCityLocked(false) }} placeholder="Melsungen" style={s.input} />
                {cityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
              </div>
            </div>
          </div>

          <label style={s.fieldLabel}>Adresszusatz</label>
          <div style={{ ...s.inputWrap, marginBottom:16 }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>layers</span>
            <input value={addrSup} onChange={e => setAddrSup(e.target.value)} placeholder="z.B. 2. OG, Hinterhaus" style={s.input} />
          </div>

          {/* Kunde */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <label style={{ ...s.fieldLabel, marginBottom:0 }}>Kunde</label>
            <button onClick={() => setShowCustSearch(s => !s)} style={{ background:'none', border:'none', fontSize:11, fontWeight:700, color:'var(--pri)', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <span className="material-symbols-outlined icon-sm">swap_horiz</span> Ändern
            </button>
          </div>

          {selectedCust ? (
            <div style={{ background:'var(--pri-xl)', borderRadius:12, padding:'12px 14px', marginBottom:showCustSearch?10:16, display:'flex', alignItems:'center', gap:10 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>{selectedCust.customer_type==='firma'?'business':'person'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--pri)' }}>{selectedCust.name}</div>
                {selectedCust.contact_person && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{selectedCust.contact_person}</div>}
              </div>
              <button onClick={() => setSelectedCust(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex' }}>
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>
            </div>
          ) : (
            <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'10px 14px', marginBottom:showCustSearch?10:16, fontSize:13, color:'var(--txt-muted)' }}>Kein Kunde zugewiesen</div>
          )}

          {showCustSearch && (
            <div style={{ marginBottom:16 }}>
              <div className="iw" style={s.inputWrap}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
                <input value={custQuery} onChange={e => searchCustomers(e.target.value)} placeholder="Name, Firma, E-Mail, Telefon …" style={s.input} autoFocus />
                {custSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
              </div>
              {custResults.map(c => (
                <div key={c.id} onClick={() => { setSelectedCust(c); setCustResults([]); setCustQuery(''); setShowCustSearch(false) }}
                  style={{ padding:'10px 14px', borderBottom:'1px solid var(--outline)', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>{CUST_ICON[c.customer_type]}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700 }}>{c.name}</div>
                    {c.contact_person && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{c.contact_person}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Objektinfos für MA-App */}
          <div style={{ marginTop:20, paddingTop:16, borderTop:'1px solid var(--outline)' }}>
            <div style={{ fontSize:13, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>info</span>
              Objektinfos für Mitarbeiter-App
            </div>

            <label style={s.fieldLabel}>Zugang / Zugangscode</label>
            <div style={{ ...s.inputWrap, marginBottom:12 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>vpn_key</span>
              <input value={accessNote} onChange={e => setAccessNote(e.target.value)} placeholder="z.B. Schlüssel beim Hausmeister, Code: 1234" style={s.input} />
            </div>

            <label style={s.fieldLabel}>Parken</label>
            <div style={{ ...s.inputWrap, marginBottom:12 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>local_parking</span>
              <input value={parkingNote} onChange={e => setParkingNote(e.target.value)} placeholder="z.B. Hofeinfahrt links, max. 2 Stunden" style={s.input} />
            </div>

            <label style={s.fieldLabel}>Etagen / Bereiche</label>
            <div style={{ ...s.inputWrap, marginBottom:12 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>layers</span>
              <input value={floorInfo} onChange={e => setFloorInfo(e.target.value)} placeholder="z.B. EG + 3 OG, Keller separat" style={s.input} />
            </div>

            <label style={s.fieldLabel}>Hinweis (wird gelb hervorgehoben)</label>
            <textarea value={objNotes} onChange={e => setObjNotes(e.target.value)} placeholder="z.B. Hund im Haus, bitte klingeln"
              style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, color:'var(--txt)', boxSizing:'border-box', resize:'vertical', minHeight:72, fontFamily:'inherit', marginBottom:16 }} />
          </div>

          {/* Save */}
          <button onClick={save} disabled={saving} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:4 }}>
            <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'save'}</span>
            {saving ? 'Wird gespeichert…' : 'Änderungen speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Task Overlay ──────────────────────────────────────────────────────
function CreateTaskOverlay({ categories, objects, team, templates, onClose, onSaved, preselectedObjectId, isDesktop }:{
  categories:Category[]; objects:ObjectItem[]; team:TeamMember[]; templates:TaskItem[]; onClose:()=>void; onSaved:()=>void; preselectedObjectId?:string; isDesktop:boolean
}) {
  const [step, setStep]           = useState(preselectedObjectId ? 2 : 1)
  const [objectId, setObjectId]   = useState(preselectedObjectId || '')
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle]         = useState('')
  const [description, setDescription] = useState('')
  const [interval, setInterval]   = useState('wöchentlich')
  const [assigneeId, setAssigneeId] = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [showNewObj, setShowNewObj] = useState(false)
  const [dueDate, setDueDate]     = useState(localToday())
  const [endDate, setEndDate]     = useState('')
  const [startDateOverride, setStartDateOverride] = useState('')
  const [selectedWeekday, setSelectedWeekday] = useState<number>(1)  // 1=Mo..6=Sa
  const [dayOfMonth, setDayOfMonth]             = useState<number>(1)
  const [monthlyMode, setMonthlyMode]           = useState<'day'|'weekday'>('weekday')
  const [monthlyWeek, setMonthlyWeek]           = useState<number>(1)  // 1=erste,2=zweite,3=dritte,4=vierte,5=letzte
  const [monthlyWeekday, setMonthlyWeekday]     = useState<number>(1)  // 1=Mo..6=Sa
  const [contractId, setContractId] = useState('')
  const [objectContracts, setObjectContracts] = useState<ContractItem[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [objSearch, setObjSearch] = useState('')

  const loadContractsForObject = async (objId: string) => {
    setContractId('')
    const { data } = await supabase.from('contracts').select('id,type,start_date,end_date,object_id,customer_id').eq('object_id', objId)
    setObjectContracts(data ?? [])
  }

  // Verträge für vorausgewähltes Objekt beim Start laden
  useEffect(() => {
    if (preselectedObjectId) loadContractsForObject(preselectedObjectId)
  }, [])

  const canStep2 = objectId !== ''
  const canStep3 = title.trim() !== ''
  const canSave  = assigneeId !== ''

  const save = async () => {
    setSaving(true); setError('')

    // Startdatum ermitteln
    let startDate = dueDate
    if (interval === 'wöchentlich' || interval === 'zweiwöchentlich') {
      startDate = startDateOverride || getNextWeekdayDate(selectedWeekday)
    } else if (interval === 'monatlich') {
      startDate = startDateOverride || (monthlyMode === 'weekday'
        ? getNextWeekdayInMonth(monthlyWeek, monthlyWeekday)
        : getNextDayOfMonth(dayOfMonth))
    } else if (interval === 'täglich') {
      startDate = startDateOverride || localToday()
    }

    // 1. Task anlegen
    const { data: taskData, error: taskErr } = await supabase.from('tasks').insert({
      object_id:           objectId,
      category_id:         categoryId || null,
      title:               title.trim(),
      description:         description.trim() || null,
      interval,
      default_assignee_id: assigneeId || null,
      due_date:            startDate || null,
      end_date:            endDate || null,
      contract_id:         contractId || null,
      is_active:           true,
    }).select('id').single()

    if (taskErr || !taskData) { setError(taskErr?.message || 'Fehler'); setSaving(false); return }

    // 2. task_assignments generieren
    if (assigneeId && startDate) {
      const dates = generateAssignmentDates(interval, startDate, endDate || null, selectedWeekday, dayOfMonth, monthlyMode, monthlyWeek, monthlyWeekday)
      if (dates.length > 0) {
        const rows = dates.map(d => ({
          task_id:  taskData.id,
          user_id:  assigneeId,
          due_date: d,
          status:   'offen',
        }))
        const { error: aErr } = await supabase.from('task_assignments').insert(rows)
        if (aErr) { setError(aErr.message); setSaving(false); return }
      }
    }

    onSaved()
  }

  const selectedObj = objects.find(o=>o.id===objectId)
  const selectedCat = categories.find(c=>c.id===categoryId)

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose}>
      {/* Header */}
      <div style={s.overlayHead}>
        <button style={s.backBtn} onClick={step===1?onClose:()=>setStep(s=>s-1)}>
          <span className="material-symbols-outlined">{step===1?'close':'arrow_back'}</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, fontFamily:'var(--font-head)' }}>Neue Aufgabe</div>
          <div style={{ fontSize:11, color:'var(--txt-muted)' }}>Schritt {step} von 3</div>
        </div>
        {/* Step dots */}
        <div style={{ display:'flex', gap:6 }}>
          {[1,2,3].map(i=><div key={i} style={{ width:8, height:8, borderRadius:'50%', background:i<=step?'var(--pri)':'var(--outline)' }}/>)}
        </div>
      </div>

      <div style={{ height:0, flex:1, overflowY:'auto', padding:20 }}>

        {/* Step 1 – Objekt */}
        {step === 1 && (
          <>
            <h2 style={{ ...s.h1, fontSize:20, marginBottom:4 }}>Objekt wählen</h2>
            <p style={{ ...s.sub, marginBottom:14 }}>Für welches Gebäude soll die Aufgabe angelegt werden?</p>

            {/* Suchfeld */}
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 13px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', marginBottom:12 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>search</span>
              <input
                value={objSearch}
                onChange={e => setObjSearch(e.target.value)}
                placeholder="Adresse, PLZ, OBJ-Nummer, Kunde …"
                style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}
                autoFocus={objects.length > 4}
              />
              {objSearch && <button onClick={() => setObjSearch('')} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--txt-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>close</span>
              </button>}
            </div>

            {objects.length === 0 ? (
              <div style={s.emptyState}>
                <span className="material-symbols-outlined" style={{ fontSize:40, color:'var(--txt-muted)', opacity:0.3 }}>apartment</span>
                <p style={{ fontSize:13, color:'var(--txt-muted)', textAlign:'center' }}>Noch keine Objekte vorhanden</p>
              </div>
            ) : (() => {
              const q = objSearch.trim().toLowerCase()
              const filtered = q
                ? objects.filter(o => {
                    const hay = [o.address, o.postal_code, o.city, o.object_number, o.customers?.name]
                      .filter(Boolean).join(' ').toLowerCase()
                    return q.split(' ').filter(Boolean).every(w => hay.includes(w))
                  })
                : objects
              return (
                <>
                  {filtered.length === 0 && (
                    <div style={{ textAlign:'center', padding:'24px 0', color:'var(--txt-muted)', fontSize:13 }}>Kein Objekt gefunden</div>
                  )}
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                    {filtered.map(o => {
                      const sel = objectId === o.id
                      return (
                        <div key={o.id} onClick={() => { setObjectId(o.id); loadContractsForObject(o.id) }}
                          style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, border:`1.5px solid ${sel ? 'var(--pri)' : 'var(--outline)'}`, background: sel ? 'var(--pri-xl)' : 'var(--surf-card)', cursor:'pointer', transition:'all 0.12s' }}>
                          <div style={{ width:40, height:40, borderRadius:12, background: sel ? 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow: sel ? '0 3px 8px rgba(9,106,112,0.25)' : 'none' }}>
                            <span className="material-symbols-outlined" style={{ fontSize:20, color: sel ? '#fff' : 'var(--txt-muted)' }}>apartment</span>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:14, fontWeight:700, color: sel ? 'var(--pri)' : 'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {o.address}, {o.postal_code} {o.city}
                            </div>
                            <div style={{ fontSize:11, color:'var(--txt-muted)', fontFamily:'monospace', marginTop:2 }}>{o.object_number || '–'}</div>
                            {o.customers?.name && <div style={{ fontSize:11, color:'var(--pri)', fontWeight:600, marginTop:1 }}>{o.customers.name}</div>}
                          </div>
                          {sel && <span className="material-symbols-outlined" style={{ color:'var(--pri)', flexShrink:0, fontSize:20 }}>check_circle</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </>
        )}

        {/* Step 2 – Kategorie + Details */}
        {step === 2 && (
          <>
            <h2 style={{ ...s.h1, fontSize:20, marginBottom:4 }}>Aufgabe beschreiben</h2>
            <p style={{ ...s.sub, marginBottom:20 }}>Was soll gemacht werden?</p>

            {templates.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <button
                  type="button"
                  onClick={() => setShowTemplatePicker(true)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1.5px dashed var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18 }}>auto_awesome</span>
                  Aus Vorlage übernehmen
                  <span style={{ marginLeft:'auto', fontSize:11, fontWeight:600, color:'var(--pri)', background:'rgba(9,106,112,0.1)', borderRadius:20, padding:'2px 8px' }}>{templates.length} verfügbar</span>
                </button>
                {/* Template Picker Sheet */}
                {showTemplatePicker && (
                  <div style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end' }}
                    onClick={() => setShowTemplatePicker(false)}>
                    <div style={{ width:'100%', maxWidth:520, margin:'0 auto', background:'var(--bg)', borderRadius:'24px 24px 0 0', padding:24, maxHeight:'70vh', display:'flex', flexDirection:'column' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                        <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>Vorlage wählen</div>
                        <button onClick={() => setShowTemplatePicker(false)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt-muted)' }}>
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                      <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                        {templates.map(tpl => (
                          <button key={tpl.id} type="button"
                            onClick={() => {
                              setTitle(tpl.title)
                              setDescription(tpl.description || '')
                              setCategoryId(tpl.category_id || '')
                              setShowTemplatePicker(false)
                            }}
                            style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', cursor:'pointer', textAlign:'left', width:'100%' }}
                            onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--pri)')}
                            onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--outline)')}>
                            <span style={{ fontSize:22, flexShrink:0 }}>{(tpl as any).categories?.emoji||'📋'}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.title}</div>
                              {tpl.description && <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tpl.description}</div>}
                              <div style={{ fontSize:11, color:'var(--pri)', marginTop:3, fontWeight:600 }}>{(tpl as any).categories?.name||''} · {tpl.interval}</div>
                            </div>
                            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)', flexShrink:0 }}>arrow_forward_ios</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom:16 }}>
              <label style={s.fieldLabel}>Kategorie</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {categories.map(c=>(
                  <div key={c.id} onClick={()=>setCategoryId(c.id)} style={{ ...s.selectCard, padding:'12px 14px', borderColor:categoryId===c.id?'var(--pri)':'var(--outline)', background:categoryId===c.id?'var(--pri-xl)':'var(--surf-card)' }}>
                    <span style={{ fontSize:20 }}>{c.emoji}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:categoryId===c.id?'var(--pri)':'var(--txt)', flex:1 }}>{c.name}</span>
                    {categoryId===c.id && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--pri)' }}>check_circle</span>}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={s.fieldLabel}>Titel *</label>
              <div className="iw" style={s.inputWrap}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>edit</span>
                <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="z.B. Treppenhaus reinigen" style={s.input}/>
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={s.fieldLabel}>Beschreibung & Umfang</label>
              <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Was genau soll gemacht werden? Welche Bereiche, welche Materialien..." rows={4} style={{ ...s.input, width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', resize:'vertical', lineHeight:1.6 }}/>
            </div>
          </>
        )}

        {/* Step 3 – Intervall + Zuweisung */}
        {step === 3 && (
          <>
            <h2 style={{ ...s.h1, fontSize:20, marginBottom:4 }}>Rhythmus & Zuweisung</h2>
            <p style={{ ...s.sub, marginBottom:20 }}>Wie oft und wer?</p>

            {/* Summary */}
            <div style={{ background:'var(--pri-xl)', borderRadius:14, padding:'14px 16px', marginBottom:20, display:'flex', gap:10 }}>
              <span style={{ fontSize:22, flexShrink:0 }}>{selectedCat?.emoji||'📋'}</span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--pri)' }}>{title}</div>
                <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{selectedObj?.address}, {selectedObj?.city}</div>
              </div>
            </div>

            {objectContracts.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Vertrag</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>description</span>
                  <select value={contractId} onChange={e=>setContractId(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
                    <option value="">Kein Vertrag zuweisen</option>
                    {objectContracts.map(c=>(
                      <option key={c.id} value={c.id}>
                        {c.type==='jahresvertrag'?'Jahresvertrag':'Einmalig'}
                        {c.start_date ? ` · ab ${new Date(c.start_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}` : ''}
                        {c.end_date ? ` – ${new Date(c.end_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}` : ''}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
                </div>
              </div>
            )}

            <div style={{ marginBottom:20 }}>
              <label style={s.fieldLabel}>Intervall</label>
              <div className="iw" style={s.inputWrap}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>repeat</span>
                <select
                  value={interval}
                  onChange={e=>setInterval(e.target.value)}
                  style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' }}
                >
                  {INTERVALS.map(iv=>(
                    <option key={iv} value={iv} style={{ textTransform:'capitalize' }}>{iv.charAt(0).toUpperCase() + iv.slice(1)}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={s.fieldLabel}>Zuständiger Mitarbeiter</label>
              {team.filter(m=>m.role_name!=='admin').length === 0
                ? <div style={{ fontSize:13, color:'var(--txt-muted)', padding:'12px 0' }}>Noch keine Mitarbeiter vorhanden. Lade zuerst Mitarbeiter ein.</div>
                : <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>person</span>
                    <select
                      value={assigneeId}
                      onChange={e=>setAssigneeId(e.target.value)}
                      style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color: assigneeId ? 'var(--txt)' : 'var(--txt-muted)', cursor:'pointer', appearance:'none' }}
                    >
                      <option value="">Mitarbeiter auswählen...</option>
                      {team
                        .filter(m=>m.is_active && m.role_name!=='admin')
                        .map(m=>(
                          <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))
                      }
                    </select>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
                  </div>
              }
            </div>

            {/* ── Terminplanung je Intervall ── */}

            {/* Einmalig: konkretes Datum */}
            {interval === 'einmalig' && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Fälligkeitsdatum *</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                  <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                </div>
              </div>
            )}

            {/* Täglich: Startdatum */}
            {interval === 'täglich' && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Startdatum</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                  <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                </div>
              </div>
            )}

            {/* Wöchentlich / Zweiwöchentlich: Wochentag-Auswahl */}
            {(interval === 'wöchentlich' || interval === 'zweiwöchentlich') && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Wochentag *</label>
                <div style={{ display:'flex', gap:6 }}>
                  {[['Mo',1],['Di',2],['Mi',3],['Do',4],['Fr',5],['Sa',6]].map(([label, day]) => (
                    <button key={day} type="button"
                      onClick={() => setSelectedWeekday(day as number)}
                      style={{
                        flex:1, padding:'10px 0', borderRadius:12, border:'1.5px solid',
                        borderColor: selectedWeekday===day ? 'var(--pri)' : 'var(--outline)',
                        background: selectedWeekday===day ? 'var(--pri)' : 'var(--surf-card)',
                        color: selectedWeekday===day ? '#fff' : 'var(--txt-muted)',
                        fontSize:13, fontWeight:700, cursor:'pointer',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop:12 }}>
                  <label style={s.fieldLabel}>Startdatum</label>
                  <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                    <input type="date" value={startDateOverride || getNextWeekdayDate(selectedWeekday)}
                      onChange={e => setStartDateOverride(e.target.value)}
                      style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                  </div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:5 }}>
                    Erster Termin: {(() => { const d = startDateOverride || getNextWeekdayDate(selectedWeekday); return d ? new Date(d+'T12:00').toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}) : '–' })()}
                  </div>
                </div>
              </div>
            )}

            {/* Monatlich: Wochentag oder Tag des Monats */}
            {interval === 'monatlich' && (
              <div style={{ marginBottom:20 }}>
                {/* Modus-Toggle */}
                <label style={s.fieldLabel}>Monatlicher Rhythmus *</label>
                <div style={{ display:'flex', gap:8, marginBottom:14, background:'var(--surf-low)', borderRadius:12, padding:3 }}>
                  {([['weekday','Wochentag im Monat'],['day','Fixer Tag']] as const).map(([mode,label])=>(
                    <button key={mode} type="button" onClick={()=>setMonthlyMode(mode)}
                      style={{ flex:1, padding:'9px 0', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all 0.15s',
                        background: monthlyMode===mode ? 'var(--surf-card)' : 'transparent',
                        color:      monthlyMode===mode ? 'var(--pri)'       : 'var(--txt-muted)',
                        boxShadow:  monthlyMode===mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      }}>{label}</button>
                  ))}
                </div>

                {monthlyMode === 'weekday' && (
                  <>
                    {/* Woche im Monat */}
                    <label style={{ ...s.fieldLabel, marginBottom:8 }}>Welche Woche?</label>
                    <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                      {([['1.','1'],['2.','2'],['3.','3'],['4.','4'],['Letzter','5']] as const).map(([label,val])=>(
                        <button key={val} type="button" onClick={()=>setMonthlyWeek(Number(val))}
                          style={{ flex:1, padding:'9px 0', borderRadius:10, border:'1.5px solid', fontSize:11, fontWeight:700, cursor:'pointer',
                            borderColor: monthlyWeek===Number(val) ? 'var(--pri)' : 'var(--outline)',
                            background:  monthlyWeek===Number(val) ? 'var(--pri)' : 'var(--surf-card)',
                            color:       monthlyWeek===Number(val) ? '#fff'       : 'var(--txt-muted)',
                          }}>{label}</button>
                      ))}
                    </div>
                    {/* Wochentag */}
                    <label style={{ ...s.fieldLabel, marginBottom:8 }}>Welcher Wochentag?</label>
                    <div style={{ display:'flex', gap:6 }}>
                      {([['Mo',1],['Di',2],['Mi',3],['Do',4],['Fr',5],['Sa',6]] as const).map(([label,day])=>(
                        <button key={day} type="button" onClick={()=>setMonthlyWeekday(day)}
                          style={{ flex:1, padding:'9px 0', borderRadius:10, border:'1.5px solid', fontSize:12, fontWeight:700, cursor:'pointer',
                            borderColor: monthlyWeekday===day ? 'var(--pri)' : 'var(--outline)',
                            background:  monthlyWeekday===day ? 'var(--pri)' : 'var(--surf-card)',
                            color:       monthlyWeekday===day ? '#fff'       : 'var(--txt-muted)',
                          }}>{label}</button>
                      ))}
                    </div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:8, display:'flex', alignItems:'center', gap:4 }}>
                      <span className="material-symbols-outlined icon-sm">info</span>
                      {getWeekdayInMonthLabel(monthlyWeek, monthlyWeekday)} – Nächster: {new Date(getNextWeekdayInMonth(monthlyWeek, monthlyWeekday) + 'T12:00').toLocaleDateString('de-DE', {day:'2-digit', month:'long', year:'numeric'})}
                    </div>
                  </>
                )}

                {monthlyMode === 'day' && (
                  <>
                    <div className="iw" style={s.inputWrap}>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>calendar_month</span>
                      <select value={dayOfMonth} onChange={e=>setDayOfMonth(Number(e.target.value))} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
                        {Array.from({length:28},(_,i)=>i+1).map(d=>(
                          <option key={d} value={d}>{d}. jeden Monats</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:8, display:'flex', alignItems:'center', gap:4 }}>
                      <span className="material-symbols-outlined icon-sm">info</span>
                      Nächster Termin: {new Date(getNextDayOfMonth(dayOfMonth) + 'T12:00').toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Startdatum für monatlich/täglich */}
            {(interval === 'monatlich' || interval === 'täglich') && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Startdatum</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                  <input type="date"
                    value={startDateOverride || (interval === 'monatlich'
                      ? (monthlyMode === 'weekday' ? getNextWeekdayInMonth(monthlyWeek, monthlyWeekday) : getNextDayOfMonth(dayOfMonth))
                      : localToday())}
                    onChange={e => setStartDateOverride(e.target.value)}
                    style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                </div>
              </div>
            )}

            {/* Quartalsweise: Datum für ersten Termin */}
            {interval === 'quartalsweise' && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Erster Termin *</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
                  <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                </div>
              </div>
            )}

            {/* Enddatum für alle Wiederholungen */}
            {interval !== 'einmalig' && (
              <div style={{ marginBottom:20 }}>
                <label style={s.fieldLabel}>Enddatum (optional)</label>
                <div className="iw" style={s.inputWrap}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event_busy</span>
                  <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                  {endDate && <button onClick={()=>setEndDate('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center' }}>
                    <span className="material-symbols-outlined icon-sm">close</span>
                  </button>}
                </div>
                <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:6 }}>Ohne Enddatum läuft der Auftrag bis zur manuellen Deaktivierung.</div>
              </div>
            )}

            {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:12, padding:'12px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={s.overlayFooter}>
        {step < 3
          ? <button onClick={()=>setStep(s=>s+1)} disabled={step===1?!canStep2:!canStep3} style={{ ...s.btnPri, opacity:(step===1?!canStep2:!canStep3)?0.4:1 }}>
              Weiter <span className="material-symbols-outlined icon-sm">arrow_forward</span>
            </button>
          : <button onClick={save} disabled={!canSave||saving} style={{ ...s.btnPri, opacity:(!canSave||saving)?0.4:1 }}>
              <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'check'}</span>
              {saving?'Wird gespeichert...':'Aufgabe anlegen'}
            </button>
        }
      </div>

      {/* Inline object creation sheet */}
      {showNewObj && (
        <div style={{ position:'absolute', inset:0, zIndex:10 }}>
          <CreateObjectOverlay onClose={()=>setShowNewObj(false)} onSaved={(id)=>{ setObjectId(id ?? ""); setShowNewObj(false) }} team={team} isDesktop={isDesktop}/>
        </div>
      )}
    </PageOverlay>
  )
}


// ─── Edit Task Overlay ────────────────────────────────────────────────────────
function EditTaskOverlay({ task, categories, objects, team, onClose, onSaved, isDesktop }:{
  task:TaskItem; categories:Category[]; objects:ObjectItem[]; team:TeamMember[]; onClose:()=>void; onSaved:()=>void; isDesktop:boolean
}) {
  const [title, setTitle]           = useState(task.title)
  const [description, setDescription] = useState(task.description||'')
  const [categoryId, setCategoryId] = useState(task.category_id||'')
  const [objectId, setObjectId]     = useState(task.object_id||'')
  const [interval, setInterval]     = useState(task.interval)
  const [assigneeId, setAssigneeId] = useState(task.default_assignee_id||'')
  const [dueDate, setDueDate]       = useState(task.due_date||'')
  const [endDate, setEndDate]       = useState(task.end_date||'')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [confirmAction, setConfirmAction] = useState<'cancel'|'delete'|null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const save = async () => {
    if (!title.trim()) { setError('Titel ist Pflicht'); return }
    setSaving(true); setError('')
    const { error } = await supabase.from('tasks').update({
      title: title.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      object_id: objectId || null,
      interval,
      default_assignee_id: assigneeId || null,
      due_date: dueDate || null,
      end_date: endDate || null,
    }).eq('id', task.id)
    if (error) { setError(error.message); setSaving(false); return }
    onSaved()
  }

  // Stornieren: Task deaktivieren + alle offenen zukünftigen Assignments löschen
  const cancelTask = async () => {
    setActionLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error: e1 } = await supabase.from('task_assignments')
        .delete()
        .eq('task_id', task.id)
        .eq('status', 'offen')
        .gte('due_date', today)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('tasks').update({ is_active: false }).eq('id', task.id)
      if (e2) throw e2
    } catch (err: any) {
      alert('Fehler beim Stornieren: ' + (err?.message || 'Unbekannter Fehler'))
      setActionLoading(false)
      return
    }
    setActionLoading(false)
    onSaved()
  }

  // Löschen: alles entfernen inkl. Historie
  const deleteTask = async () => {
    setActionLoading(true)
    try {
      const { data: reports } = await supabase
        .from('task_assignments').select('id').eq('task_id', task.id)
      if (reports && reports.length > 0) {
        const { error: e1 } = await supabase.from('task_reports').delete().in('assignment_id', reports.map((r:any)=>r.id))
        if (e1) throw e1
      }
      const { error: e2 } = await supabase.from('task_assignments').delete().eq('task_id', task.id)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('tasks').delete().eq('id', task.id)
      if (e3) throw e3
    } catch (err: any) {
      alert('Fehler beim Löschen: ' + (err?.message || 'Unbekannter Fehler'))
      setActionLoading(false)
      return
    }
    setActionLoading(false)
    onSaved()
  }

  const isExpired = task.end_date && new Date(task.end_date) < new Date()

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose}>
      <div style={s.overlayHead}>
        <button style={s.backBtn} onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, fontFamily:'var(--font-head)' }}>Aufgabe bearbeiten</div>
          <div style={{ fontSize:11, color:'var(--txt-muted)' }}>Änderungen werden sofort übernommen</div>
        </div>
        {isExpired && <span style={{ fontSize:11, fontWeight:700, color:'var(--err)', background:'var(--err-bg)', padding:'4px 10px', borderRadius:999 }}>Abgelaufen</span>}
      </div>

      <div style={{ height:0, flex:1, overflowY:'auto', padding:20 }}>

        {/* Titel */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Titel *</label>
          <div className="iw" style={s.inputWrap}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>edit</span>
            <input value={title} onChange={e=>setTitle(e.target.value)} style={s.input} placeholder="Aufgabentitel"/>
          </div>
        </div>

        {/* Beschreibung */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Beschreibung</label>
          <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Was genau soll gemacht werden?" style={{ ...s.input, width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', resize:'vertical', lineHeight:1.6 }}/>
        </div>

        {/* Kategorie */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Kategorie</label>
          <div className="iw" style={s.inputWrap}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>category</span>
            <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
              <option value="">Keine Kategorie</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
          </div>
        </div>

        {/* Objekt */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Objekt</label>
          <div className="iw" style={s.inputWrap}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>apartment</span>
            <select value={objectId} onChange={e=>setObjectId(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
              <option value="">Kein Objekt</option>
              {objects.map(o=><option key={o.id} value={o.id}>{o.address}, {o.city}</option>)}
            </select>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
          </div>
        </div>

        {/* Intervall */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Intervall</label>
          <div className="iw" style={s.inputWrap}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>repeat</span>
            <select value={interval} onChange={e=>setInterval(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
              {['täglich','wöchentlich','zweiwöchentlich','monatlich','quartalsweise','einmalig'].map(iv=>(
                <option key={iv} value={iv}>{iv.charAt(0).toUpperCase()+iv.slice(1)}</option>
              ))}
            </select>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
          </div>
        </div>

        {/* Mitarbeiter */}
        <div style={{ marginBottom:16 }}>
          <label style={s.fieldLabel}>Zuständiger Mitarbeiter</label>
          <div className="iw" style={s.inputWrap}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>person</span>
            <select value={assigneeId} onChange={e=>setAssigneeId(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer', appearance:'none' as any }}>
              <option value="">Nicht zugewiesen</option>
              {team.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>expand_more</span>
          </div>
          {assigneeId !== (task.default_assignee_id||'') && (
            <div style={{ fontSize:11, color:'var(--pri)', marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
              <span className="material-symbols-outlined icon-sm">info</span>
              Neue Zuweisung gilt für zukünftige Assignments. Bestehende bleiben unverändert.
            </div>
          )}
        </div>

        {/* Datum */}
        {interval === 'einmalig' ? (
          <div style={{ marginBottom:16 }}>
            <label style={s.fieldLabel}>Fälligkeitsdatum</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>event</span>
              <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom:16 }}>
            <label style={s.fieldLabel}>Vertragsende (optional)</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color: isExpired ? 'var(--err-dot)' : 'var(--txt-muted)' }}>event_busy</span>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color: isExpired ? 'var(--err-dot)' : 'var(--txt)' }}/>
              {endDate && <button onClick={()=>setEndDate('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', display:'flex', alignItems:'center' }}>
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>}
            </div>
            <div style={{ fontSize:11, color: isExpired ? 'var(--err-dot)' : 'var(--txt-muted)', marginTop:6 }}>
              {isExpired ? '⚠ Dieser Auftrag ist abgelaufen und wurde deaktiviert.' : 'Ohne Enddatum läuft der Auftrag bis zur manuellen Deaktivierung.'}
            </div>
          </div>
        )}

        {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:12, padding:'12px 14px', fontSize:13, marginBottom:14, display:'flex', gap:8 }}>
          <span className="material-symbols-outlined icon-sm">error</span>{error}
        </div>}
      </div>

      {/* ── Gefahrenzone ── */}
      <div style={{ padding:'0 20px 16px', borderTop:'1px solid var(--outline)', marginTop:4 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, marginTop:16 }}>
          Aufgabe verwalten
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setConfirmAction('cancel')} disabled={!task.is_active}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px 0', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color: task.is_active ? 'var(--txt-sec)' : 'var(--txt-muted)', fontSize:12, fontWeight:700, cursor: task.is_active ? 'pointer' : 'not-allowed', opacity: task.is_active ? 1 : 0.5 }}>
            <span className="material-symbols-outlined icon-sm">block</span>
            {task.is_active ? 'Stornieren' : 'Bereits inaktiv'}
          </button>
          <button onClick={()=>setConfirmAction('delete')}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px 0', borderRadius:12, border:'1.5px solid var(--err-dot)', background:'var(--err-bg)', color:'var(--err-dot)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">delete</span>
            Löschen
          </button>
        </div>
      </div>

      <div style={{ ...s.overlayFooter, flexDirection:'column', gap:8 }}>
        <button onClick={save} disabled={saving||!title.trim()} style={{ ...s.btnPri, opacity:(!title.trim()||saving)?0.4:1 }}>
          <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'check'}</span>
          {saving?'Wird gespeichert...':'Änderungen speichern'}
        </button>
        <button
          type="button"
          onClick={async () => {
            const { error } = await supabase.from('tasks').update({ is_template: true }).eq('id', task.id)
            if (!error) setError('✅ Als Vorlage gespeichert!')
            else setError(error.message)
          }}
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'10px 0', borderRadius:12, border:'1.5px solid var(--pri)', background:'var(--pri-xl)', color:'var(--pri)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize:16 }}>auto_awesome</span>
          Als Vorlage speichern
        </button>
      </div>

      {/* ── Bestätigungs-Dialog ── */}
      {confirmAction && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10, display:'flex', alignItems:'flex-end', padding:16 }}>
          <div style={{ background:'var(--surf-card)', borderRadius:20, padding:24, width:'100%', boxShadow:'0 -8px 40px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:8 }}>
              {confirmAction === 'cancel' ? '⏹ Aufgabe stornieren?' : '🗑 Aufgabe löschen?'}
            </div>
            <p style={{ fontSize:13, color:'var(--txt-muted)', lineHeight:1.6, marginBottom:20 }}>
              {confirmAction === 'cancel'
                ? 'Die Aufgabe wird deaktiviert. Alle offenen zukünftigen Termine werden entfernt. Abgeschlossene Berichte bleiben erhalten.'
                : 'Die Aufgabe und alle Termine sowie Berichte werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.'}
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setConfirmAction(null)} style={{ flex:1, padding:14, borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', fontSize:14, fontWeight:700, cursor:'pointer', color:'var(--txt)' }}>
                Abbrechen
              </button>
              <button
                onClick={confirmAction === 'cancel' ? cancelTask : deleteTask}
                disabled={actionLoading}
                style={{ flex:1, padding:14, borderRadius:14, border:'none', background: confirmAction==='cancel' ? 'var(--txt-sec)' : 'var(--err-dot)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity: actionLoading ? 0.6 : 1 }}>
                <span className="material-symbols-outlined icon-sm">{actionLoading ? 'hourglass_empty' : confirmAction==='cancel' ? 'block' : 'delete'}</span>
                {actionLoading ? 'Wird ausgeführt...' : confirmAction==='cancel' ? 'Ja, stornieren' : 'Ja, löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageOverlay>
  )
}

// ─── Create Object Overlay ────────────────────────────────────────────────────
function CreateObjectOverlay({ onClose, onSaved, team, isDesktop }: { onClose: () => void; onSaved: (id?: string) => void; team: TeamMember[]; isDesktop: boolean }) {
  const [step, setStep] = useState(1)

  // ── Step 1: Objekt ────────────────────────────────────────────────────────
  const [postal, setPostal]       = useState('')
  const [city, setCity]           = useState('')
  const [cityLocked, setCityLocked] = useState(false)
  const [street, setStreet]       = useState('')
  const [addrSup, setAddrSup]     = useState('')
  const [objType, setObjType]     = useState<ObjectType>('mehrfamilienhaus')
  const [plzLoading, setPlzLoading] = useState(false)

  // ── Step 2: Kunde ─────────────────────────────────────────────────────────
  const [custQuery, setCustQuery]       = useState('')
  const [custResults, setCustResults]   = useState<any[]>([])
  const [custSearching, setCustSearching] = useState(false)
  const [selectedCust, setSelectedCust] = useState<any>(null)
  const [createMode, setCreateMode]     = useState(false)

  // Neukunde-Felder
  const [newCustType, setNewCustType]         = useState<'privatperson'|'firma'|'weg-verwaltung'|'mietverwaltung'|''>('')
  const [newCustName, setNewCustName]         = useState('')
  const [wegObjId, setWegObjId]               = useState('')
  // Privatperson-Felder
  const [newAnrede, setNewAnrede]             = useState<'herr'|'frau'|'eheleute'|''>('')
  const [newVorname, setNewVorname]           = useState('')
  const [newNachname, setNewNachname]         = useState('')
  const [newVorname2, setNewVorname2]         = useState('')
  const [newNachname2, setNewNachname2]       = useState('')
  const [newStreet, setNewStreet]             = useState('')
  const [newAddrSup, setNewAddrSup]           = useState('')
  const [newPostal, setNewPostal]             = useState('')
  const [newCity, setNewCity]                 = useState('')
  const [newCityLocked, setNewCityLocked]     = useState(false)
  const [newPlzLoading, setNewPlzLoading]     = useState(false)
  const [newPhone, setNewPhone]               = useState('')
  const [newEmail, setNewEmail]               = useState('')
  // Firma / Verwaltung: erster Ansprechpartner
  // Multi-Kontakte für Firma
  const [newContacts, setNewContacts]         = useState<{id:string;first_name:string;last_name:string;role:string;phone:string;email:string}[]>([])
  const [showAddCp, setShowAddCp]             = useState(false)
  const [cpSearchQ, setCpSearchQ]             = useState('')
  const [cpSearchRes, setCpSearchRes]         = useState<any[]>([])
  const [cpSearching, setCpSearching]         = useState(false)
  const [cpFn, setCpFn]                       = useState('')
  const [cpLn, setCpLn]                       = useState('')
  const [cpRl, setCpRl]                       = useState('')
  const [cpPh, setCpPh]                       = useState('')
  const [cpEm, setCpEm]                       = useState('')
  const [cpDupeRes, setCpDupeRes]             = useState<any[]>([])
  const [cpDupeTimer, setCpDupeTimer]         = useState<ReturnType<typeof setTimeout>|null>(null)
  // WEG: Hausverwaltung suchen/anlegen
  const [hvQuery, setHvQuery]                 = useState('')
  const [hvResults, setHvResults]             = useState<CustomerItem[]>([])
  const [hvSearching, setHvSearching]         = useState(false)
  const [selectedHv, setSelectedHv]           = useState<CustomerItem|null>(null)
  const [hvCreateMode, setHvCreateMode]       = useState(false)
  const [hvNewName, setHvNewName]             = useState('')
  const [hvNameSuggestions, setHvNameSuggestions] = useState<CustomerItem[]>([])
  const [hvNameSearching, setHvNameSearching] = useState(false)
  const [hvNewStreet, setHvNewStreet]         = useState('')
  const [hvNewPostal, setHvNewPostal]         = useState('')
  const [hvNewCity, setHvNewCity]             = useState('')
  const [hvNewCityLocked, setHvNewCityLocked] = useState(false)
  const [hvNewPlzLoading, setHvNewPlzLoading] = useState(false)
  const [hvNewCpName, setHvNewCpName]         = useState('')
  const [hvNewCpRole, setHvNewCpRole]         = useState('')
  const [hvNewCpPhone, setHvNewCpPhone]       = useState('')
  const [hvNewCpEmail, setHvNewCpEmail]       = useState('')
  // WEG: c/o Ansprechpartner aus HV-Kontakten
  const [hvContacts, setHvContacts]           = useState<ContactPerson[]>([])
  const [selectedCoContact, setSelectedCoContact] = useState<ContactPerson|null>(null)
  // Mietverwaltung: Eigentümer
  const [mvEigTyp, setMvEigTyp]               = useState<'herr'|'frau'|'eheleute'|'firma'|''>('')
  const [mvEigVorname, setMvEigVorname]         = useState('')
  const [mvEigNachname, setMvEigNachname]       = useState('')
  const [mvEigVorname2, setMvEigVorname2]       = useState('')
  const [mvEigNachname2, setMvEigNachname2]     = useState('')
  const [mvEigFirma, setMvEigFirma]             = useState('')
  const [mvEigPhone, setMvEigPhone]             = useState('')
  const [mvEigEmail, setMvEigEmail]             = useState('')
  // Mietverwaltung: Verwaltung suchen/anlegen
  const [mvVerwQuery, setMvVerwQuery]           = useState('')
  const [mvVerwResults, setMvVerwResults]       = useState<CustomerItem[]>([])
  const [mvVerwSearching, setMvVerwSearching]   = useState(false)
  const [selectedMvVerw, setSelectedMvVerw]     = useState<CustomerItem|null>(null)
  const [mvVerwCreateMode, setMvVerwCreateMode] = useState(false)
  const [mvVerwNewName, setMvVerwNewName]       = useState('')
  const [mvVerwNewStreet, setMvVerwNewStreet]   = useState('')
  const [mvVerwNewPostal, setMvVerwNewPostal]   = useState('')
  const [mvVerwNewCity, setMvVerwNewCity]       = useState('')
  const [mvVerwNewCityLocked, setMvVerwNewCityLocked] = useState(false)
  const [mvVerwNewPlzLoading, setMvVerwNewPlzLoading] = useState(false)
  const [mvVerwNewCpName, setMvVerwNewCpName]   = useState('')
  const [mvVerwNewCpPhone, setMvVerwNewCpPhone] = useState('')
  const [mvVerwNewCpEmail, setMvVerwNewCpEmail] = useState('')
  const [mvVerwNameSuggestions, setMvVerwNameSuggestions] = useState<CustomerItem[]>([])
  const [mvVerwNameSearching, setMvVerwNameSearching]     = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Objektleiter-Auswahl
  const [olId, setOlId]         = useState<string>('')
  const [olOptions, setOlOptions] = useState<{id:string;full_name:string}[]>([])
  useEffect(() => {
    supabase
      .from('users')
      .select('id,full_name,roles(name)')
      .eq('is_active', true)
      .then(({ data }) => {
        const ols = (data || []).filter((u:any) => u.roles?.name === 'objektleiter')
        setOlOptions(ols.map((u:any) => ({ id: u.id, full_name: u.full_name })))
      })
  }, [])

  // PLZ → Ort auto-lookup
  const lookupCity = async (plz: string) => {
    setPostal(plz)
    if (plz.length !== 5) { if (cityLocked) { setCity(''); setCityLocked(false) }; return }
    setPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) {
        const data = await res.json()
        const found = data[0]?.name
        if (found) { setCity(found); setCityLocked(true) }
      }
    } catch { /* ignore */ }
    setPlzLoading(false)
  }

  const lookupNewCity = async (plz: string) => {
    setNewPostal(plz)
    if (plz.length !== 5) { if (newCityLocked) { setNewCity(''); setNewCityLocked(false) }; return }
    setNewPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) { const data = await res.json(); const found = data[0]?.name; if (found) { setNewCity(found); setNewCityLocked(true) } }
    } catch { /* ignore */ }
    setNewPlzLoading(false)
  }

  const checkCpDupe = (fn: string, ln: string) => {
    if (cpDupeTimer) clearTimeout(cpDupeTimer)
    if (!fn.trim() && !ln.trim()) { setCpDupeRes([]); return }
    const t = setTimeout(async () => {
      const terms = [fn.trim(), ln.trim()].filter(Boolean)
      let q = supabase.from('contact_persons').select('id,first_name,last_name,name,role,phone,email,customer_id,customers(name,customer_type)').limit(5)
      if (terms.length === 2) q = q.or(`first_name.ilike.%${fn.trim()}%,last_name.ilike.%${ln.trim()}%`)
      else q = q.ilike('name', `%${terms[0]}%`)
      const { data } = await q
      setCpDupeRes(data || [])
    }, 350)
    setCpDupeTimer(t)
  }

  const lookupHvCity = async (plz: string) => {
    setHvNewPostal(plz)
    if (plz.length !== 5) { if (hvNewCityLocked) { setHvNewCity(''); setHvNewCityLocked(false) }; return }
    setHvNewPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) { const data = await res.json(); const found = data[0]?.name; if (found) { setHvNewCity(found); setHvNewCityLocked(true) } }
    } catch { /* ignore */ }
    setHvNewPlzLoading(false)
  }

  const lookupMvVerwCity = async (plz: string) => {
    setMvVerwNewPostal(plz)
    if (plz.length !== 5) { if (mvVerwNewCityLocked) { setMvVerwNewCity(''); setMvVerwNewCityLocked(false) }; return }
    setMvVerwNewPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) { const data = await res.json(); const found = data[0]?.name; if (found) { setMvVerwNewCity(found); setMvVerwNewCityLocked(true) } }
    } catch { /* ignore */ }
    setMvVerwNewPlzLoading(false)
  }

  const searchMvVerw = async (q: string) => {
    setMvVerwQuery(q); setSelectedMvVerw(null); setMvVerwCreateMode(false)
    if (q.trim().length < 2) { setMvVerwResults([]); return }
    setMvVerwSearching(true)
    const { data } = await supabase
      .from('customers')
      .select('id,customer_type,name,contact_person,email,phone,street,postal_code,city')
      .in('customer_type', ['firma','mietverwaltung'])
      .or(`name.ilike.%${q.trim()}%,contact_person.ilike.%${q.trim()}%`)
      .limit(6)
    setMvVerwResults(data || [])
    setMvVerwSearching(false)
  }

  const searchMvVerwName = async (val: string) => {
    setMvVerwNewName(val)
    if (val.trim().length < 2) { setMvVerwNameSuggestions([]); return }
    setMvVerwNameSearching(true)
    const { data } = await supabase.from('customers')
      .select('id,name,customer_type,street,postal_code,city')
      .or("customer_type.eq.firma,customer_type.eq.mietverwaltung")
      .ilike('name', '%' + val.trim() + '%')
      .limit(5)
    setMvVerwNameSuggestions((data || []) as unknown as CustomerItem[])
    setMvVerwNameSearching(false)
  }

  const pickMvVerwSuggestion = (v: CustomerItem) => {
    setSelectedMvVerw(v)
    setMvVerwCreateMode(false)
    setMvVerwNewName('')
    setMvVerwNameSuggestions([])
  }

  const searchHvName = async (val: string) => {
    setHvNewName(val)
    if (val.trim().length < 2) { setHvNameSuggestions([]); return }
    setHvNameSearching(true)
    const { data } = await supabase.from('customers')
      .select('id,name,customer_type,street,postal_code,city')
      .or("customer_type.eq.firma,customer_type.eq.weg-verwaltung")
      .ilike('name', '%' + val.trim() + '%')
      .limit(5)
    setHvNameSuggestions((data || []) as unknown as CustomerItem[])
    setHvNameSearching(false)
  }

  const pickHvSuggestion = (hv: CustomerItem) => {
    // Switch to selecting this existing HV
    selectHv(hv)
    setHvCreateMode(false)
    setHvNewName('')
    setHvNameSuggestions([])
  }

  const searchHv = async (q: string) => {
    setHvQuery(q); setSelectedHv(null); setHvCreateMode(false); setHvContacts([]); setSelectedCoContact(null)
    if (q.trim().length < 2) { setHvResults([]); return }
    setHvSearching(true)
    const { data } = await supabase
      .from('customers')
      .select('id,customer_type,name,contact_person,email,phone,street,postal_code,city,lexware_id,hausverwaltung_id,co_contact_id')
      .in('customer_type', ['firma','mietverwaltung'])
      .or(`name.ilike.%${q.trim()}%,contact_person.ilike.%${q.trim()}%`)
      .limit(6)
    setHvResults(data || [])
    setHvSearching(false)
  }

  const selectHv = async (hv: CustomerItem) => {
    setSelectedHv(hv); setHvQuery(hv.name); setHvResults([]); setHvCreateMode(false)
    // Lade Kontakte der HV
    const { data } = await supabase.from('contact_persons').select('*').eq('customer_id', hv.id).order('created_at')
    setHvContacts(data || [])
    setSelectedCoContact(null)
  }

  // Dynamische Kundensuche
  const searchCustomers = async (q: string) => {
    setCustQuery(q); setSelectedCust(null); setCreateMode(false)
    if (q.trim().length < 2) { setCustResults([]); return }
    setCustSearching(true)
    const { data } = await supabase
      .from('customers')
      .select('id,customer_type,name,contact_person,email,phone,street,postal_code,city,lexware_id')
      .or(`name.ilike.%${q.trim()}%,contact_person.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
      .limit(8)
    setCustResults(data || [])
    setCustSearching(false)
  }

  const save = async () => {
    setSaving(true); setError('')

    let customerId: string
    let pendingContacts: {first_name:string;last_name:string;role:string;phone:string;email:string}[] = []

    if (selectedCust) {
      // Bestehenden Kunden verwenden
      customerId = selectedCust.id
    } else if (createMode && newCustType) {
      // Neuen Kunden anlegen – Name zusammenbauen
      let builtName = newCustName.trim()
      let firstName: string|null = null
      let lastName: string|null  = null
      let firstName2: string|null = null
      let lastName2: string|null  = null
      let custSalutation: string|null = null
      let custPhone: string|null = null
      let custEmail: string|null = null

      if (newCustType === 'privatperson') {
        firstName = newVorname.trim() || null
        lastName  = newNachname.trim() || null
        custSalutation = newAnrede || null
        custPhone = newPhone.trim() || null
        custEmail = newEmail.trim() || null
        if (newAnrede === 'eheleute') {
          firstName2 = newVorname2.trim() || null
          lastName2  = null  // gemeinsamer Nachname ist newNachname
          builtName  = `${newVorname.trim()} + ${newVorname2.trim()} ${newNachname.trim()}`
        } else {
          builtName = `${newVorname.trim()} ${newNachname.trim()}`
        }
      }

      const { data: cust, error: e } = await supabase.from('customers').insert({
        customer_type: newCustType,
        name: builtName,
        salutation: custSalutation,
        first_name: firstName,
        last_name: lastName,
        contact_first_name: firstName2,
        contact_last_name: lastName2,
        street: newStreet.trim() || null,
        address_supplement: newAddrSup.trim() || null,
        postal_code: newPostal.trim() || null,
        city: newCity.trim() || null,
        phone: custPhone,
        email: custEmail,
        hausverwaltung_objekt_id: ((newCustType === 'weg-verwaltung' || newCustType === 'mietverwaltung') && wegObjId.trim()) ? wegObjId.trim() : null,
      }).select('id').single()
      if (e || !cust) { setError(e?.message || 'Kunde konnte nicht angelegt werden'); setSaving(false); return }
      customerId = cust.id
      // Ansprechpartner werden nach Objekt-Insert gespeichert (damit object_id mitgesetzt werden kann)
      pendingContacts = [...newContacts, ...(cpFn.trim() || cpLn.trim() ? [{ first_name: cpFn.trim(), last_name: cpLn.trim(), role: cpRl.trim(), phone: cpPh.trim(), email: cpEm.trim() }] : [])]

      // WEG / MV: Hausverwaltung anlegen oder verwenden, dann co_contact setzen
      if (newCustType === 'weg-verwaltung' || newCustType === 'mietverwaltung') {
        let hvId: string | null = selectedHv?.id || null
        let coContactId: string | null = selectedCoContact?.id || null

        if (hvCreateMode && hvNewName.trim()) {
          // Neue HV anlegen
          const { data: hvData } = await supabase.from('customers').insert({
            customer_type: 'firma',
            name: hvNewName.trim(),
            street: hvNewStreet.trim() || null,
            postal_code: hvNewPostal.trim() || null,
            city: hvNewCity.trim() || null,
            is_hausverwaltung: true,
          }).select('id').single()

          if (hvData) {
            hvId = hvData.id
            // Ansprechpartner anlegen
            if (hvNewCpName.trim()) {
              const { data: cpData } = await supabase.from('contact_persons').insert({
                customer_id: hvData.id,
                name: hvNewCpName.trim(),
                role: hvNewCpRole.trim() || null,
                phone: hvNewCpPhone.trim() || null,
                email: hvNewCpEmail.trim() || null,
              }).select('id').single()
              if (cpData) coContactId = cpData.id
            }
          }
        }

        if (hvId) {
          await supabase.from('customers').update({ hausverwaltung_id: hvId, co_contact_id: coContactId }).eq('id', cust.id)
        }
      }
    } else {
      setError('Bitte einen Kunden auswählen oder neu anlegen.'); setSaving(false); return
    }

    // Geocoding der Adresse (OpenStreetMap Nominatim)
    let geoLat: number | null = null
    let geoLng: number | null = null
    try {
      const q = encodeURIComponent(`${street.trim()}, ${postal.trim()} ${city.trim()}, Deutschland`)
      const gr = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
        headers: { 'User-Agent': 'SteuberWork/1.0' }
      })
      const gj = await gr.json()
      if (gj?.[0]) { geoLat = parseFloat(gj[0].lat); geoLng = parseFloat(gj[0].lon) }
    } catch { /* Geocoding nicht kritisch */ }

    // Objekt anlegen (object_number wird automatisch via Trigger gesetzt)
    const { data: obj, error: objErr } = await supabase.from('objects').insert({
      name: `${street.trim()}, ${postal.trim()} ${city.trim()}`,
      address: street.trim(),
      object_type: objType,
      postal_code: postal.trim(),
      city: city.trim(),
      address_supplement: addrSup.trim() || null,
      customer_id: customerId,
      is_active: true,
      lat: geoLat,
      lng: geoLng,
      objektleiter_id: olId || null,
    }).select('id').single()

    if (objErr) { setError(objErr.message); setSaving(false); return }

    // Jetzt Ansprechpartner mit object_id anlegen
    for (const cp of pendingContacts) {
      await supabase.from('contact_persons').insert({
        customer_id: customerId,
        object_id: obj.id,
        name: `${cp.first_name} ${cp.last_name}`.trim(),
        first_name: cp.first_name || null,
        last_name: cp.last_name || null,
        role: cp.role || null,
        phone: cp.phone || null,
        email: cp.email || null,
      })
    }

    onSaved(obj.id)
  }

  const canStep2 = street.trim() !== '' && postal.trim().length === 5 && city.trim() !== ''

  const searchCp = async (q: string) => {
    setCpSearchQ(q)
    if (q.trim().length < 2) { setCpSearchRes([]); return }
    setCpSearching(true)
    const term = q.trim()
    // Search contact_persons table
    const { data: cpData } = await supabase.from('contact_persons')
      .select('id,name,first_name,last_name,role,phone,email')
      .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      .limit(8)
    // Also search privatperson customers (they ARE contacts)
    const { data: custData } = await supabase.from('customers')
      .select('id,name,first_name,last_name,email,phone')
      .eq('customer_type', 'privatperson')
      .or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
      .limit(8)
    // Merge and deduplicate by name
    const fromCp = (cpData || []).map((r: any) => ({
      id: r.id,
      first_name: r.first_name || '',
      last_name: r.last_name || r.name || '',
      role: r.role || '',
      phone: r.phone || '',
      email: r.email || '',
      _source: 'cp',
    }))
    const fromCust = (custData || []).map((r: any) => ({
      id: 'cust-' + r.id,
      first_name: r.first_name || '',
      last_name: r.last_name || r.name || '',
      role: 'Privatperson',
      phone: r.phone || '',
      email: r.email || '',
      _source: 'cust',
    }))
    // Deduplicate: skip fromCust entries whose full name already exists in fromCp
    const cpNames = new Set(fromCp.map(r => (r.first_name + ' ' + r.last_name).trim().toLowerCase()))
    const dedupedCust = fromCust.filter(r => !cpNames.has((r.first_name + ' ' + r.last_name).trim().toLowerCase()))
    const combined = [...fromCp, ...dedupedCust].slice(0, 8)
    setCpSearchRes(combined)
    setCpSearching(false)
  }

  const pickExistingCp = (cp: any) => {
    const alreadyAdded = newContacts.some(c => c.first_name === (cp.first_name||'') && c.last_name === (cp.last_name||cp.name||''))
    if (alreadyAdded) return
    setNewContacts(prev => [...prev, {
      id: crypto.randomUUID(),
      first_name: cp.first_name || '',
      last_name: cp.last_name || cp.name || '',
      role: cp.role || '',
      phone: cp.phone || '',
      email: cp.email || '',
    }])
    setCpSearchQ('')
    setCpSearchRes([])
  }
  const privatpersonValid = newCustType === 'privatperson'
    && newAnrede !== ''
    && newVorname.trim() !== ''
    && newNachname.trim() !== ''
    && (newAnrede !== 'eheleute' || newVorname2.trim() !== '')
  const mvEigValid = mvEigTyp !== '' && (
    (mvEigTyp === 'firma' && mvEigFirma.trim() !== '') ||
    (mvEigTyp !== 'firma' && mvEigVorname.trim() !== '' && mvEigNachname.trim() !== '')
  )
  const otherTypeValid = newCustType !== '' && newCustType !== 'privatperson' && (
    newCustName.trim() !== ''
  ) && (
    (newCustType !== 'weg-verwaltung' && newCustType !== 'mietverwaltung') || selectedHv !== null || (hvCreateMode && hvNewName.trim() !== '')
  )
  const canSave  = !!selectedCust || (createMode && (privatpersonValid || otherTypeValid))

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose}>
      {/* Header */}
      {(() => {
        // Effektiver Schritt: Typ ausgewählt beim Neukunden → Schritt 3
        const effStep = step === 2 && createMode && newCustType ? 3 : step
        const totalSteps = step === 2 && createMode ? 3 : 2
        const subtitle =
          step === 1 ? 'Objektdaten' :
          (createMode && newCustType) ? 'Neuer Kunde · Daten eingeben' :
          createMode ? 'Neuer Kunde · Typ wählen' :
          'Kunde zuordnen'
        const tl: Record<string,string> = { privatperson:'Privatperson', firma:'Firma', 'weg-verwaltung':'WEG', mietverwaltung:'Mietverwaltung' }
        const ti: Record<string,string> = { privatperson:'person', firma:'business', 'weg-verwaltung':'apartment', mietverwaltung:'home_work' }
        // Zurück-Logik: bei Typ ausgefüllt → zurück zur Typ-Auswahl; bei Typ-Auswahl → zurück zu Schritt 1; sonst Schritt zurück
        const handleBack = () => {
          if (step === 2 && createMode && newCustType) {
            setNewCustType(''); setNewCustName(''); setNewStreet(''); setNewAnrede(''); setNewVorname(''); setNewNachname(''); setNewVorname2(''); setNewNachname2(''); setNewContacts([]); setCpFn(''); setCpLn(''); setWegObjId('')
          } else if (step === 2) {
            setStep(1); setError('')
          } else {
            onClose()
          }
        }
        return (
          <div style={s.overlayHead}>
            <button style={s.backBtn} onClick={handleBack}>
              <span className="material-symbols-outlined">{step === 1 ? 'close' : 'arrow_back'}</span>
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-head)' }}>Neues Objekt</div>
              <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
                {subtitle} · Schritt {effStep} von {totalSteps}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
              <div style={{ display:'flex', gap:5 }}>
                {Array.from({ length: totalSteps }, (_, i) => i + 1).map(i => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= effStep ? 'var(--pri)' : 'var(--outline)', transition:'background 0.2s' }} />
                ))}
              </div>
              {newCustType && (
                <button
                  onClick={() => { setNewCustType(''); setNewCustName(''); setNewStreet(''); setNewAnrede(''); setNewVorname(''); setNewNachname(''); setNewVorname2(''); setNewNachname2(''); setNewContacts([]); setCpFn(''); setCpLn(''); setWegObjId('') }}
                  title="Typ ändern"
                  style={{ display:'flex', alignItems:'center', gap:4, background:'var(--pri-xl)', border:'1.5px solid var(--pri)', borderRadius:20, padding:'3px 9px 3px 6px', cursor:'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:13, color:'var(--pri)' }}>{ti[newCustType]||'person'}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--pri)' }}>{tl[newCustType]||newCustType}</span>
                  <span className="material-symbols-outlined" style={{ fontSize:12, color:'var(--pri)' }}>edit</span>
                </button>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

        {/* ── STEP 1: Objekt ── */}
        {step === 1 && (<>
          <h2 style={{ ...s.h1, fontSize: 18, marginBottom: 4 }}>Wo liegt das Objekt?</h2>
          <p style={{ ...s.sub, marginBottom: 20 }}>Die Objektnummer wird automatisch vergeben.</p>

          {/* PLZ + Ort nebeneinander */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 12, alignItems:'start' }}>
            <div>
              <label style={s.fieldLabel}>PLZ *</label>
              <div style={{ ...s.inputWrap, borderColor: postal.length === 5 ? 'var(--pri)' : 'var(--outline)' }}>
                {plzLoading
                  ? <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>hourglass_empty</span>
                  : <span className="material-symbols-outlined icon-sm" style={{ color: postal.length === 5 ? 'var(--pri)' : 'var(--txt-muted)' }}>markunread_mailbox</span>}
                <input
                  value={postal}
                  onChange={e => lookupCity(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="34212"
                  inputMode="numeric"
                  style={s.input}
                />
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <label style={s.fieldLabel}>Ort *</label>
              <div style={{ ...s.inputWrap, background: cityLocked ? 'var(--ok-bg)' : undefined }}>
                <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>location_city</span>
                <input
                  value={city}
                  onChange={e => { setCity(e.target.value); setCityLocked(false) }}
                  placeholder="Melsungen"
                  style={s.input}
                />
                {cityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)', flexShrink:0 }}>check_circle</span>}
              </div>
            </div>
          </div>

          {/* Straße */}
          <div style={{ marginBottom: 12 }}>
            <label style={s.fieldLabel}>Straße + Hausnummer *</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>location_on</span>
              <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Bahnhofstraße 14" style={s.input} />
            </div>
          </div>

          {/* Adresszusatz */}
          <div style={{ marginBottom: 12 }}>
            <label style={s.fieldLabel}>Adresszusatz (optional)</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>layers</span>
              <input value={addrSup} onChange={e => setAddrSup(e.target.value)} placeholder="z.B. 2. OG, Hinterhaus, c/o ..." style={s.input} />
            </div>
          </div>

          {/* Objektart */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.fieldLabel}>Objektart *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                { value: 'einfamilienhaus',  label: 'Einfamilienhaus',  icon: 'house' },
                { value: 'mehrfamilienhaus', label: 'Mehrfamilienhaus', icon: 'apartment' },
                { value: 'firmengelaende',   label: 'Firmengelände',    icon: 'business' },
                { value: 'grundstueck',      label: 'Grundstück',       icon: 'landscape' },
              ] as const).map(opt => (
                <div key={opt.value} onClick={() => setObjType(opt.value)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:`1.5px solid ${objType === opt.value ? 'var(--pri)' : 'var(--outline)'}`, background: objType === opt.value ? 'var(--pri-xl)' : 'var(--surf-card)', cursor:'pointer', transition:'all 0.15s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:20, color: objType === opt.value ? 'var(--pri)' : 'var(--txt-muted)' }}>{opt.icon}</span>
                  <span style={{ fontSize:12, fontWeight:700, color: objType === opt.value ? 'var(--pri)' : 'var(--txt)', flex:1 }}>{opt.label}</span>
                  {objType === opt.value && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--pri)' }}>check_circle</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Objektleiter (optional) */}
          <div style={{ marginBottom: 16 }}>
            <label style={s.fieldLabel}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>manage_accounts</span>
              Objektleiter (optional)
            </label>
            <div style={{ position:'relative' }}>
              <select
                value={olId}
                onChange={e => setOlId(e.target.value)}
                style={{ ...s.input, appearance:'none', WebkitAppearance:'none', paddingLeft:14, paddingRight:36, height:42, border:'1.5px solid var(--outline)', borderRadius:12, background:'var(--surf-card)', color: olId ? 'var(--txt)' : 'var(--txt-muted)', width:'100%', fontSize:13, cursor:'pointer' }}>
                <option value=''>Keiner zugewiesen</option>
                {olOptions.map(ol => (
                  <option key={ol.id} value={ol.id}>{ol.full_name}</option>
                ))}
              </select>
              <span className="material-symbols-outlined" style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'var(--txt-muted)', pointerEvents:'none' }}>expand_more</span>
            </div>
            {olOptions.length === 0 && (
              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>Noch keine Nutzer mit Objektleiter-Rolle angelegt.</div>
            )}
          </div>

          {/* Vorschau-Karte */}
          {canStep2 && (
            <div style={{ background: 'var(--pri-xl)', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--pri)', fontSize: 28 }}>
                {{'einfamilienhaus':'house','mehrfamilienhaus':'apartment','firmengelaende':'business','grundstueck':'landscape'}[objType]}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pri)' }}>{street}{addrSup ? `, ${addrSup}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{postal} {city}</div>
              </div>
            </div>
          )}
        </>)}

        {/* ── STEP 2: Kunde ── */}
        {step === 2 && (<>
          <h2 style={{ ...s.h1, fontSize: 18, marginBottom: 4 }}>Welchem Kunden gehört das Objekt?</h2>
          <p style={{ ...s.sub, marginBottom: 20 }}>Suche nach Name, Firma, Telefon oder E-Mail.</p>

          {/* Suchfeld */}
          {!selectedCust && !createMode && (<>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div className="iw" style={s.inputWrap}>
                <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>search</span>
                <input
                  value={custQuery}
                  onChange={e => searchCustomers(e.target.value)}
                  placeholder="Name, Firma, Telefon, E-Mail..."
                  style={s.input}
                  autoFocus
                />
                {custSearching && <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--txt-muted)' }}>hourglass_empty</span>}
              </div>

              {/* Ergebnisliste */}
              {custResults.length > 0 && (
                <div style={{ border: '1.5px solid var(--pri)', borderRadius: 14, marginTop: 6, overflow: 'hidden', boxShadow: '0 8px 24px rgba(9,106,112,0.1)' }}>
                  {custResults.map((c, i) => (
                    <div key={c.id} onClick={() => { setSelectedCust(c); setCustResults([]); setCustQuery('') }}
                      style={{ padding: '12px 14px', borderBottom: i < custResults.length - 1 ? '1px solid var(--outline)' : 'none', cursor: 'pointer', background: 'var(--surf-card)', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)' }}>{c.customer_type === 'firma' ? 'business' : 'person'}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        {c.contact_person && <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{c.contact_person}</div>}
                        {(c.phone || c.email) && <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{c.phone || c.email}</div>}
                      </div>
                      <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)', flexShrink: 0 }}>chevron_right</span>
                    </div>
                  ))}
                  {/* "Neu anlegen" immer am Ende der Trefferliste */}
                  <div onClick={() => { setCreateMode(true); setNewCustName(custQuery) }}
                    style={{ padding: '11px 14px', cursor: 'pointer', background: 'var(--surf-low)', display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid var(--outline)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)' }}>person_add</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--pri)' }}>Neuen Kunden anlegen</div>
                      <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>Nicht dabei? Direkt neu erstellen</div>
                    </div>
                    <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--pri)', flexShrink: 0 }}>chevron_right</span>
                  </div>
                </div>
              )}

              {/* Kein Treffer */}
              {custQuery.length >= 2 && !custSearching && custResults.length === 0 && (
                <div style={{ background: 'var(--surf-low)', borderRadius: 12, padding: '14px', textAlign: 'center', marginTop: 6 }}>
                  <div style={{ fontSize: 13, color: 'var(--txt-muted)', marginBottom: 10 }}>Kein Kunde gefunden für „{custQuery}"</div>
                  <button onClick={() => { setCreateMode(true); setNewCustName(custQuery) }}
                    style={{ ...s.btnSmall, width: '100%', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined icon-sm">person_add</span> Neuen Kunden anlegen
                  </button>
                </div>
              )}
            </div>

            {/* Direkt neu anlegen Button */}
            {custQuery.length < 2 && (
              <button onClick={() => setCreateMode(true)}
                style={{ ...s.btnOutline, width: '100%', justifyContent: 'center', marginTop: 4 }}>
                <span className="material-symbols-outlined icon-sm">person_add</span> Neuen Kunden anlegen
              </button>
            )}
          </>)}

          {/* Ausgewählter Kunde */}
          {selectedCust && (
            <div style={{ background: 'var(--ok-bg)', border: '1.5px solid var(--ok)', borderRadius: 16, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="material-symbols-outlined icon-sm" style={{ color: '#fff' }}>check</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-head)', color: 'var(--ok)' }}>{selectedCust.name}</div>
                {selectedCust.contact_person && <div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>{selectedCust.contact_person}</div>}
                {selectedCust.phone && <div style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{selectedCust.phone}</div>}
              </div>
              <button onClick={() => setSelectedCust(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 4 }}>
                <span className="material-symbols-outlined icon-sm">close</span>
              </button>
            </div>
          )}

          {/* Neukunde-Formular */}
          {createMode && (
            <div style={{ background: 'var(--surf-card)', border: '1.5px solid var(--outline)', borderRadius: 16, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Neuen Kunden anlegen</div>

                </div>
                <button onClick={() => { setCreateMode(false); setNewCustType(''); setCustQuery(''); setCustResults([]) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)' }}>
                  <span className="material-symbols-outlined icon-sm">close</span>
                </button>
              </div>

              {/* Typ-Auswahl (4 Kacheln) */}
              {!newCustType && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([
                    { v:'privatperson',  label:'Privatperson',   icon:'person',      desc:'Einzelperson oder Eheleute' },
                    { v:'firma',         label:'Firma',          icon:'business',    desc:'Unternehmen, GmbH, AG …' },
                    { v:'weg-verwaltung',label:'WEG-Verwaltung', icon:'apartment',   desc:'Wohnungseigentümergem.' },
                    { v:'mietverwaltung',label:'Mietverwaltung', icon:'home_work',   desc:'Hausverwaltung, Mieter' },
                  ] as const).map(t => (
                    <div key={t.v} onClick={() => { setNewCustType(t.v); setNewContacts([]); if (t.v === 'weg-verwaltung') { const parts = [street.trim(), [postal.trim(), city.trim()].filter(Boolean).join(' ')].filter(Boolean); setNewCustName('WEG ' + parts.join(', ')) } }}
                      style={{ padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', cursor:'pointer', display:'flex', flexDirection:'column', gap:6, transition:'all 0.15s' }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='var(--pri)';(e.currentTarget as HTMLDivElement).style.background='var(--pri-xl)'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='var(--outline)';(e.currentTarget as HTMLDivElement).style.background='var(--surf-low)'}}>
                      <span className="material-symbols-outlined" style={{ fontSize:24, color:'var(--pri)' }}>{t.icon}</span>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{t.label}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', lineHeight:1.3 }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Privatperson ─────────────────────────────────────────── */}
              {newCustType === 'privatperson' && (<>

                {/* Anrede */}
                <div style={{ marginBottom:12 }}>
                  <label style={s.fieldLabel}>Anrede *</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {([{v:'herr',label:'Herr'},{v:'frau',label:'Frau'},{v:'eheleute',label:'Eheleute'}] as const).map(a => (
                      <button key={a.v} onClick={() => { setNewAnrede(a.v); if(a.v !== 'eheleute'){setNewVorname2('');setNewNachname2('')} }}
                        style={{ flex:1, padding:'8px 4px', borderRadius:10, border:`1.5px solid ${newAnrede===a.v?'var(--pri)':'var(--outline)'}`, background:newAnrede===a.v?'var(--pri-xl)':'var(--surf-low)', color:newAnrede===a.v?'var(--pri)':'var(--txt)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Person 1 + optional Person 2 (Eheleute) */}
                {newAnrede === 'eheleute' ? (<>
                  {/* Zwei Vornamen nebeneinander */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, alignItems:'start' }}>
                    <div>
                      <label style={s.fieldLabel}>Vorname 1 *</label>
                      <div className="iw" style={s.inputWrap}>
                        <input value={newVorname} onChange={e => setNewVorname(e.target.value)} placeholder="Max" style={s.input}/>
                      </div>
                    </div>
                    <div>
                      <label style={s.fieldLabel}>Vorname 2 *</label>
                      <div className="iw" style={s.inputWrap}>
                        <input value={newVorname2} onChange={e => setNewVorname2(e.target.value)} placeholder="Maria" style={s.input}/>
                      </div>
                    </div>
                  </div>
                  {/* Gemeinsamer Nachname – volle Breite */}
                  <div style={{ marginBottom:10 }}>
                    <label style={s.fieldLabel}>Gemeinsamer Nachname *</label>
                    <div className="iw" style={s.inputWrap}>
                      <input value={newNachname} onChange={e => setNewNachname(e.target.value)} placeholder="Mustermann" style={s.input}/>
                    </div>
                  </div>
                </>) : (
                  /* Herr / Frau: Vorname + Nachname nebeneinander */
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10, alignItems:'start' }}>
                    <div>
                      <label style={s.fieldLabel}>Vorname *</label>
                      <div className="iw" style={s.inputWrap}>
                        <input value={newVorname} onChange={e => setNewVorname(e.target.value)} placeholder="Max" style={s.input}/>
                      </div>
                    </div>
                    <div>
                      <label style={s.fieldLabel}>Nachname *</label>
                      <div className="iw" style={s.inputWrap}>
                        <input value={newNachname} onChange={e => setNewNachname(e.target.value)} placeholder="Mustermann" style={s.input}/>
                      </div>
                    </div>
                  </div>
                )}

                {/* Adresse */}
                <div style={{ marginBottom:10 }}>
                  <label style={s.fieldLabel}>Straße + Hausnummer</label>
                  <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>home</span>
                    <input value={newStreet} onChange={e => setNewStreet(e.target.value)} placeholder="Musterstraße 1" style={s.input}/>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:8, marginBottom:10, alignItems:'start' }}>
                  <div>
                    <label style={s.fieldLabel}>PLZ</label>
                    <div className="iw" style={s.inputWrap}>
                      <input value={newPostal} onChange={e => lookupNewCity(e.target.value)} placeholder="34212" maxLength={5} style={s.input}/>
                      {newPlzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                    </div>
                  </div>
                  <div>
                    <label style={s.fieldLabel}>Ort</label>
                    <div style={{ ...s.inputWrap, background: newCityLocked ? 'var(--ok-bg)' : undefined }}>
                      <input value={newCity} onChange={e => { setNewCity(e.target.value); setNewCityLocked(false) }} placeholder="Melsungen" style={s.input}/>
                      {newCityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                    </div>
                  </div>
                </div>

                {/* Kontakt */}
                <div style={{ marginBottom:10 }}>
                  <label style={s.fieldLabel}>Telefon</label>
                  <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>phone</span>
                    <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+49 561 …" style={s.input}/>
                  </div>
                </div>
                <div style={{ marginBottom:10 }}>
                  <label style={s.fieldLabel}>E-Mail</label>
                  <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>mail</span>
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="max@beispiel.de" style={s.input}/>
                  </div>
                </div>
              </>)}

              {/* ── Firma ────────────────────────────────────────────────── */}
              {newCustType === 'firma' && (<>
                {[
                  { label:'Firmenname *', val:newCustName, set:setNewCustName, icon:'business', ph:'Mustermann GmbH' },
                  { label:'Straße + Hausnummer', val:newStreet, set:setNewStreet, icon:'location_on', ph:'Musterstraße 1' },
                  { label:'Adresszusatz', val:newAddrSup, set:setNewAddrSup, icon:'layers', ph:'c/o, Gebäude B, …' },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: 10 }}>
                    <label style={s.fieldLabel}>{f.label}</label>
                    <div className="iw" style={s.inputWrap}>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>{f.icon}</span>
                      <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={s.input}/>
                    </div>
                  </div>
                ))}
                <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:8, marginBottom:10, alignItems:'start' }}>
                  <div>
                    <label style={s.fieldLabel}>PLZ</label>
                    <div className="iw" style={s.inputWrap}>
                      <input value={newPostal} onChange={e => lookupNewCity(e.target.value)} placeholder="34212" maxLength={5} style={s.input}/>
                      {newPlzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                    </div>
                  </div>
                  <div>
                    <label style={s.fieldLabel}>Ort</label>
                    <div style={{ ...s.inputWrap, background: newCityLocked ? 'var(--ok-bg)' : undefined }}>
                      <input value={newCity} onChange={e => { setNewCity(e.target.value); setNewCityLocked(false) }} placeholder="Melsungen" style={s.input}/>
                      {newCityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── WEG-Verwaltung + Mietverwaltung ─────────────── */}
              {(newCustType === 'weg-verwaltung' || newCustType === 'mietverwaltung') && (<>
                {/* WEG-Name oder MV-Name */}
                {newCustType === 'weg-verwaltung' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={s.fieldLabel}>WEG-Name *</label>
                    <div style={{ ...s.inputWrap, background: newCustName.startsWith('WEG ') ? 'var(--ok-bg)' : undefined }}>
                      <span className="material-symbols-outlined icon-sm" style={{ color: newCustName.startsWith('WEG ') ? 'var(--ok)' : 'var(--txt-muted)' }}>apartment</span>
                      <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="WEG Musterstraße 10" style={s.input}/>
                      {newCustName.startsWith('WEG ') && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>Automatisch aus Objektadresse befüllt – bei Bedarf anpassen.</div>
                  </div>
                )}
                {newCustType === 'mietverwaltung' && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={s.fieldLabel}>MV-Name *</label>
                    <div style={{ ...s.inputWrap, background: newCustName.trim() ? 'var(--ok-bg)' : undefined }}>
                      <span className="material-symbols-outlined icon-sm" style={{ color: newCustName.trim() ? 'var(--ok)' : 'var(--txt-muted)' }}>home_work</span>
                      <input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="z.B. Max Müller oder Müller GmbH" style={s.input}/>
                      {newCustName.trim() && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                    </div>
                  </div>
                )}

                {/* Objekt-ID der Hausverwaltung / Verwaltung */}
                <div style={{ marginBottom: 16 }}>
                  <label style={s.fieldLabel}>{newCustType === 'mietverwaltung' ? 'Objekt-ID der Verwaltung (optional)' : 'Objekt-ID der Hausverwaltung (optional)'}</label>
                  <div className="iw" style={s.inputWrap}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>tag</span>
                    <input value={wegObjId} onChange={e => setWegObjId(e.target.value)} placeholder="z.B. 4711 oder OBJ-2024-001" style={s.input}/>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <div style={{ flex:1, height:1, background:'var(--outline)' }}/>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>C/O Hausverwaltung</span>
                  <div style={{ flex:1, height:1, background:'var(--outline)' }}/>
                </div>

                {/* HV Suche / Auswahl */}
                {!selectedHv && !hvCreateMode && (
                  <>
                    <div className="iw" style={s.inputWrap}>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>domain</span>
                      <input
                        value={hvQuery}
                        onChange={e => searchHv(e.target.value)}
                        placeholder="Hausverwaltung suchen …"
                        style={s.input}
                      />
                      {hvSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                    </div>
                    {hvResults.length > 0 && (
                      <div style={{ background:'var(--surf-card)', borderRadius:12, border:'1px solid var(--outline)', marginTop:6, marginBottom:8, overflow:'hidden' }}>
                        {hvResults.map((hv, i) => (
                          <div key={hv.id} onClick={() => selectHv(hv)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i<hvResults.length-1?'1px solid var(--outline)':'none', cursor:'pointer', background:'var(--surf-low)' }}>
                            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>business</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{hv.name}</div>
                              {hv.contact_person && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{hv.contact_person}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {hvQuery.trim().length >= 2 && hvResults.length === 0 && !hvSearching && (
                      <button onClick={() => { setHvCreateMode(true); setHvNewName(hvQuery.trim()) }}
                        style={{ ...s.btnOutline, width:'100%', marginTop:8, marginBottom:8 }}>
                        <span className="material-symbols-outlined icon-sm">add</span>
                        „{hvQuery.trim()}" neu anlegen
                      </button>
                    )}
                    {hvQuery.trim().length < 2 && (
                      <button onClick={() => setHvCreateMode(true)}
                        style={{ ...s.btnOutline, width:'100%', marginTop:8, marginBottom:8, fontSize:12 }}>
                        <span className="material-symbols-outlined icon-sm">add</span>
                        Neue Hausverwaltung anlegen
                      </button>
                    )}
                  </>
                )}

                {/* HV ausgewählt */}
                {selectedHv && !hvCreateMode && (
                  <div style={{ background:'var(--pri-xl)', border:'1.5px solid var(--pri)', borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>domain</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--pri)' }}>{selectedHv.name}</div>
                        {selectedHv.street && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{selectedHv.street}</div>}
                      </div>
                      <button onClick={() => { setSelectedHv(null); setHvQuery(''); setHvContacts([]); setSelectedCoContact(null) }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', padding:4 }}>
                        <span className="material-symbols-outlined icon-sm">close</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* HV neu anlegen */}
                {hvCreateMode && (
                  <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'12px', border:'1px solid var(--outline)', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-sec)', display:'flex', alignItems:'center', gap:5 }}>
                        <span className="material-symbols-outlined icon-sm">domain</span> Neue Hausverwaltung
                      </div>
                      <button onClick={() => { setHvCreateMode(false); setHvQuery('') }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--txt-muted)', padding:2 }}>
                        <span className="material-symbols-outlined icon-sm">close</span>
                      </button>
                    </div>
                    {/* Name mit Live-Suche */}
                    <div style={{ marginBottom:8, position:'relative' }}>
                      <label style={{ ...s.fieldLabel, fontSize:10 }}>Name *</label>
                      <div className="iw" style={s.inputWrap}>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>domain</span>
                        <input
                          value={hvNewName}
                          onChange={e => searchHvName(e.target.value)}
                          placeholder="Muster Hausverwaltung GmbH"
                          style={s.input}
                          autoFocus
                        />
                        {hvNameSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                      </div>
                      {/* Suggestions dropdown */}
                      {hvNameSuggestions.length > 0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:50, background:'var(--surf-card)', borderRadius:10, border:'1px solid var(--pri)', boxShadow:'0 8px 24px rgba(9,106,112,0.15)', marginTop:2, overflow:'hidden' }}>
                          <div style={{ padding:'6px 12px 4px', fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Bereits vorhanden – auswählen?</div>
                          {hvNameSuggestions.map(hv => (
                            <div key={hv.id} onClick={() => pickHvSuggestion(hv)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderTop:'1px solid var(--outline)', cursor:'pointer', background:'var(--surf-low)' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--pri-xl)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--surf-low)'}>
                              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>domain</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{hv.name}</div>
                                {(hv as any).street && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{(hv as any).street}{(hv as any).city ? ', ' + (hv as any).city : ''}</div>}
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:6, padding:'2px 6px', flexShrink:0 }}>Auswählen</span>
                            </div>
                          ))}
                          <div style={{ padding:'6px 12px 8px', fontSize:11, color:'var(--txt-muted)', fontStyle:'italic' }}>
                            Oder weiter unten als neue HV anlegen ↓
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Straße */}
                    <div style={{ marginBottom:8 }}>
                      <label style={{ ...s.fieldLabel, fontSize:10 }}>Straße + Hausnummer</label>
                      <div className="iw" style={s.inputWrap}><input value={hvNewStreet} onChange={e => setHvNewStreet(e.target.value)} placeholder="Beispielweg 5" style={s.input}/></div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:8, marginBottom:8 }}>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>PLZ</label>
                        <div className="iw" style={s.inputWrap}>
                          <input value={hvNewPostal} onChange={e => lookupHvCity(e.target.value)} placeholder="34212" maxLength={5} style={s.input}/>
                          {hvNewPlzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                        </div>
                      </div>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>Ort</label>
                        <div style={{ ...s.inputWrap, background: hvNewCityLocked ? 'var(--ok-bg)' : undefined }}>
                          <input value={hvNewCity} onChange={e => { setHvNewCity(e.target.value); setHvNewCityLocked(false) }} placeholder="Melsungen" style={s.input}/>
                          {hvNewCityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* c/o Ansprechpartner (aus HV-Kontakten) */}
                {(selectedHv || hvCreateMode) && (
                  <>
                    {selectedHv && hvContacts.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
                        {hvContacts.map(cp => (
                          <div key={cp.id} onClick={() => setSelectedCoContact(selectedCoContact?.id===cp.id ? null : cp)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:12, border:`1.5px solid ${selectedCoContact?.id===cp.id?'var(--pri)':'var(--outline)'}`, background:selectedCoContact?.id===cp.id?'var(--pri-xl)':'var(--surf-low)', cursor:'pointer', transition:'all 0.15s' }}>
                            <span className="material-symbols-outlined icon-sm" style={{ color:selectedCoContact?.id===cp.id?'var(--pri)':'var(--txt-muted)' }}>person</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:selectedCoContact?.id===cp.id?'var(--pri)':'var(--txt)' }}>{cp.name}</div>
                              {cp.role && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{cp.role}</div>}
                            </div>
                            {selectedCoContact?.id===cp.id && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--pri)' }}>check_circle</span>}
                          </div>
                        ))}
                        <div style={{ fontSize:11, color:'var(--txt-muted)', textAlign:'center', padding:'4px 0' }}>
                          Kontakt auswählen oder leer lassen
                        </div>
                      </div>
                    ) : selectedHv ? (
                      <div style={{ fontSize:12, color:'var(--txt-muted)', textAlign:'center', padding:'8px 0', marginBottom:8 }}>
                        Keine Kontakte bei dieser HV — im Kundenprofil ergänzen
                      </div>
                    ) : hvCreateMode && hvNewCpName.trim() ? (
                      <div style={{ background:'var(--surf-low)', borderRadius:10, padding:'8px 12px', fontSize:12, color:'var(--txt-sec)', marginBottom:8 }}>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', verticalAlign:'middle', marginRight:4 }}>info</span>
                        Der Ansprechpartner der neuen HV wird automatisch als c/o übernommen.
                      </div>
                    ) : null}
                  </>
                )}
              </>)}

              {/* Ansprechpartner – erst nach Typ-Auswahl */}
              {newCustType && <div style={{ marginTop:16 }}>
                {/* Trennlinie + Label */}
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <div style={{ flex:1, height:1, background:'var(--outline)' }}/>
                  <span style={{ fontSize:11, fontWeight:800, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    Ansprechpartner{newContacts.length > 0 ? ` (${newContacts.length})` : ''}
                  </span>
                  <div style={{ flex:1, height:1, background:'var(--outline)' }}/>
                </div>
                {!showAddCp && (
                  <button onClick={() => setShowAddCp(true)}
                    style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'11px', borderRadius:12, border:'1.5px dashed var(--outline)', background:'var(--surf-low)', color:'var(--txt-muted)', fontSize:13, fontWeight:600, cursor:'pointer', marginBottom: newContacts.length > 0 ? 10 : 0 }}>
                    <span className="material-symbols-outlined icon-sm">person_add</span>
                    Ansprechpartner hinzufügen
                  </button>
                )}

                {/* Bestehende Kontakte */}
                {[...newContacts].sort((a,b)=>(a.last_name||'').localeCompare(b.last_name||'','de')).map(cp => (
                  <div key={cp.id} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surf-low)', borderRadius:10, padding:'8px 10px', marginBottom:6, border:'1px solid var(--outline)' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:'var(--pri-xl)', color:'var(--pri)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, fontFamily:'var(--font-head)', flexShrink:0 }}>
                      {(cp.first_name?.[0]||'')}{(cp.last_name?.[0]||'')}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{cp.first_name} {cp.last_name}</div>
                      {cp.role && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{cp.role}</div>}
                      {(cp.phone||cp.email) && <div style={{ fontSize:11, color:'var(--txt-sec)' }}>{[cp.phone,cp.email].filter(Boolean).join(' · ')}</div>}
                    </div>
                    <button onClick={() => setNewContacts(prev => prev.filter(x => x.id !== cp.id))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--err-dot)', padding:4, display:'flex' }}>
                      <span className="material-symbols-outlined icon-sm">delete</span>
                    </button>
                  </div>
                ))}

                {/* Suche + Inline-Formular */}
                {showAddCp && (
                  <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'12px', border:'1.5px solid var(--pri)', marginBottom:8 }}>
                    {/* Suche */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:10, border:'1px solid var(--outline)', background:'var(--surf-card)', marginBottom:8 }}>
                      <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
                      <input value={cpSearchQ} onChange={e => searchCp(e.target.value)} placeholder="Ansprechpartner suchen …" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--txt)' }}/>
                      {cpSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                      {cpSearchQ && <button onClick={() => { setCpSearchQ(''); setCpSearchRes([]) }} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--txt-muted)' }}><span className="material-symbols-outlined icon-sm">close</span></button>}
                    </div>
                    {cpSearchRes.length > 0 && (
                      <div style={{ background:'var(--surf-card)', borderRadius:10, border:'1px solid var(--outline)', marginBottom:8, overflow:'hidden' }}>
                        {cpSearchRes.map((cp: any) => (
                          <div key={cp.id} onClick={() => pickExistingCp(cp)} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:'1px solid var(--outline)', cursor:'pointer', background:'var(--surf-low)' }}>
                            <div style={{ width:28, height:28, borderRadius:8, background:'var(--pri-xl)', color:'var(--pri)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11, flexShrink:0 }}>
                              {(cp.first_name?.[0]||cp.last_name?.[0]||'?').toUpperCase()}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{cp.first_name} {cp.last_name}</div>
                              {cp.role && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{cp.role}</div>}
                            </div>
                            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>add_circle</span>
                          </div>
                        ))}
                        {cpSearchQ.length >= 2 && <div onClick={() => { setShowAddCp(true); setCpSearchQ(''); setCpSearchRes([]) }} style={{ padding:'9px 12px', fontSize:12, fontWeight:700, color:'var(--pri)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, background:'var(--surf-card)' }}>
                          <span className="material-symbols-outlined icon-sm">add</span> Neu anlegen
                        </div>}
                      </div>
                    )}
                    {cpSearchQ.length >= 2 && cpSearchRes.length === 0 && !cpSearching && (
                      <div onClick={() => { setShowAddCp(true); setCpSearchQ(''); setCpSearchRes([]) }} style={{ padding:'9px 12px', fontSize:12, fontWeight:700, color:'var(--pri)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, background:'var(--surf-card)', borderRadius:10, border:'1px solid var(--outline)', marginBottom:8 }}>
                        <span className="material-symbols-outlined icon-sm">add</span> Neu anlegen: {cpSearchQ}
                      </div>
                    )}
                    {/* Formular */}
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--pri)', marginBottom:10 }}>Neuer Ansprechpartner</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8, alignItems:'start' }}>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>Vorname</label>
                        <div className="iw" style={s.inputWrap}><input value={cpFn} onChange={e=>{ setCpFn(e.target.value); checkCpDupe(e.target.value, cpLn) }} placeholder="Max" style={s.input}/></div>
                      </div>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>Nachname *</label>
                        <div className="iw" style={s.inputWrap}><input value={cpLn} onChange={e=>{ setCpLn(e.target.value); checkCpDupe(cpFn, e.target.value) }} placeholder="Mustermann" style={s.input}/></div>
                      </div>
                    </div>
                    {/* Duplikat-Hinweis */}
                    {cpDupeRes.length > 0 && (
                      <div style={{ marginBottom:8, borderRadius:10, border:'1px solid #f59e0b40', background:'#fffbeb', padding:'6px 10px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#b45309', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                          Bereits vorhanden – direkt verwenden?
                        </div>
                        {cpDupeRes.map((d:any) => {
                          const dn = [d.first_name,d.last_name].filter(Boolean).join(' ')||d.name||'?'
                          return (
                            <div key={d.id} onClick={() => {
                              const already = newContacts.some(x => x.id === d.id)
                              if (already) return
                              setNewContacts(prev => [...prev, { id: d.id, first_name: d.first_name||'', last_name: d.last_name||d.name||'', role: d.role||cpRl.trim()||'', phone: d.phone||cpPh.trim()||'', email: d.email||cpEm.trim()||'' }])
                              setShowAddCp(false); setCpFn(''); setCpLn(''); setCpRl(''); setCpPh(''); setCpEm(''); setCpDupeRes([])
                            }} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', cursor:'pointer', borderBottom:'1px solid #f59e0b30' }}
                              onMouseEnter={e=>(e.currentTarget.style.background='#fef3c7')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                              <div style={{ width:24, height:24, borderRadius:6, background:'#fbbf24', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:10, flexShrink:0 }}>
                                {(d.first_name?.[0]||d.last_name?.[0]||'?').toUpperCase()}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:'#92400e' }}>{dn}</div>
                                {d.role && <div style={{ fontSize:10, color:'#b45309' }}>{d.role}</div>}
                                {d.customers && <div style={{ fontSize:10, color:'#d97706' }}>bei {(d.customers as any).name}</div>}
                              </div>
                              <span style={{ fontSize:10, fontWeight:700, color:'#d97706', flexShrink:0 }}>Übernehmen</span>
                            </div>
                          )
                        })}
                        <div style={{ fontSize:10, color:'#b45309', marginTop:4, fontStyle:'italic' }}>Neue Rolle eingeben und trotzdem anlegen ↓</div>
                      </div>
                    )}
                    <div style={{ marginBottom:8 }}>
                      <label style={{ ...s.fieldLabel, fontSize:10 }}>Funktion / Rolle</label>
                      <div className="iw" style={s.inputWrap}><input value={cpRl} onChange={e=>setCpRl(e.target.value)} placeholder="Verwalter" style={s.input}/></div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10, alignItems:'start' }}>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>Telefon</label>
                        <div className="iw" style={s.inputWrap}><input value={cpPh} onChange={e=>setCpPh(e.target.value)} placeholder="+49 561 …" inputMode="tel" style={s.input}/></div>
                      </div>
                      <div>
                        <label style={{ ...s.fieldLabel, fontSize:10 }}>E-Mail</label>
                        <div className="iw" style={s.inputWrap}><input value={cpEm} onChange={e=>setCpEm(e.target.value)} placeholder="max@firma.de" inputMode="email" style={s.input}/></div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => { setShowAddCp(false); setCpFn(''); setCpLn(''); setCpRl(''); setCpPh(''); setCpEm(''); setCpDupeRes([]) }} style={{ flex:1, padding:'9px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                      <button disabled={!cpLn.trim()} onClick={() => {
                        if (!cpLn.trim()) return
                        setNewContacts(prev => [...prev, { id: crypto.randomUUID(), first_name: cpFn.trim(), last_name: cpLn.trim(), role: cpRl.trim(), phone: cpPh.trim(), email: cpEm.trim() }])
                        setShowAddCp(false); setCpFn(''); setCpLn(''); setCpRl(''); setCpPh(''); setCpEm(''); setCpDupeRes([])
                      }} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', background: cpLn.trim() ? 'var(--pri)' : 'var(--outline)', color:'#fff', fontSize:13, fontWeight:700, cursor: cpLn.trim() ? 'pointer' : 'not-allowed' }}>
                        Hinzufügen
                      </button>
                    </div>
                  </div>
                )}
              </div>}

            </div>
          )}

          {error && <div style={{ background: 'var(--err-bg)', color: 'var(--err)', borderRadius: 12, padding: '12px 14px', fontSize: 13, marginTop: 14 }}>{error}</div>}
        </>)}
      </div>

      {/* Footer */}
      <div style={s.overlayFooter}>
        {step === 1
          ? <button onClick={() => setStep(2)} disabled={!canStep2}
              style={{ ...s.btnPri, opacity: !canStep2 ? 0.4 : 1 }}>
              Weiter <span className="material-symbols-outlined icon-sm">arrow_forward</span>
            </button>
          : <button onClick={save} disabled={!canSave || saving}
              style={{ ...s.btnPri, opacity: (!canSave || saving) ? 0.4 : 1 }}>
              <span className="material-symbols-outlined icon-sm">{saving ? 'hourglass_empty' : 'check'}</span>
              {saving ? 'Wird gespeichert...' : 'Objekt anlegen'}
            </button>
        }
      </div>
    </PageOverlay>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────
function Loader() {
  return <div style={{ textAlign:'center', padding:'40px 0', color:'var(--txt-muted)', fontSize:13 }}>Wird geladen...</div>
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string,React.CSSProperties> = {
  shell:         { display:'flex', flexDirection:'column', height:'100dvh', width:'100%', background:'var(--bg)', overflow:'hidden', position:'relative' },
  topBar:        { background:'rgba(248,249,250,0.88)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(191,200,202,0.4)', flexShrink:0, paddingTop:'env(safe-area-inset-top, 0px)' },
  topBarInner:   { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px' },
  topBarLeft:    { display:'flex', alignItems:'center', gap:10 },
  topAva:        { width:36, height:36, borderRadius:'50%', background:'var(--sec-c)', color:'var(--pri)', fontSize:13, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-head)', cursor:'pointer', flexShrink:0 },
  topLogo:       { display:'flex', flexDirection:'column', gap:0, lineHeight:1.05 },
  topLogoBold:   { fontFamily:'Manrope,sans-serif', fontWeight:800, fontSize:16, color:'var(--pri)', letterSpacing:'-0.3px', textTransform:'uppercase' as const },
  topLogoLight:  { fontFamily:'Manrope,sans-serif', fontWeight:300, fontSize:16, color:'var(--pri-c)', letterSpacing:'4px', textTransform:'uppercase' as const },
  tabBar:        { display:'flex', position:'fixed', bottom:0, left:0, right:0, background:'rgba(248,249,250,0.92)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderTop:'1px solid var(--outline)', paddingBottom:'env(safe-area-inset-bottom, 0px)', zIndex:200 },
  tabItem:       { flex:1, textAlign:'center' as const, padding:'8px 0 10px', fontSize:10, cursor:'pointer', transition:'color 0.15s', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:3 },
  content:       { height:0, flex:1, overflowY:'auto' as const, padding:'0 18px 24px' },
  h1:            { fontSize:26, fontWeight:800, fontFamily:'var(--font-head)', letterSpacing:'-0.03em', marginBottom:4 },
  sub:           { fontSize:14, color:'var(--txt-muted)' },
  bento:         { display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:14 },
  bentoMain:     { background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:20, padding:'20px 18px', minHeight:130, display:'flex', flexDirection:'column', justifyContent:'space-between', boxShadow:'0 8px 24px rgba(9,106,112,0.2)' },
  bentoLabel:    { fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 },
  bentoNum:      { fontSize:17, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)', lineHeight:1.2 },
  bentoPills:    { display:'flex', gap:8, flexWrap:'wrap', marginTop:12 },
  bentoPill:     { display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.18)', padding:'4px 10px', borderRadius:999, fontSize:11, color:'#fff', fontWeight:500 },
  bentoDot:      { width:7, height:7, borderRadius:'50%', background:'#fff', flexShrink:0 },
  bentoSide:     { background:'var(--surf-card)', borderRadius:20, padding:'18px 16px', display:'flex', flexDirection:'column', justifyContent:'center', boxShadow:'0 2px 12px rgba(9,106,112,0.06)' },
  bentoSideLabel:{ fontSize:11, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 },
  bentoSideNum:  { fontSize:38, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)', lineHeight:1 },
  statsRow:      { display:'flex', gap:10, marginBottom:20 },
  statChip:      { flex:1, borderRadius:16, padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:4 },
  secHead:       { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  secTitle:      { fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' },
  secCount:      { fontSize:12, fontWeight:600, color:'var(--txt-muted)' },
  okBanner:      { background:'var(--ok-bg)', borderRadius:16, padding:'14px 18px', display:'flex', alignItems:'center', gap:12, marginBottom:20 },
  probCard:      { background:'#fff0f0', border:'1px solid #fecaca', borderRadius:14, padding:'13px 16px', marginBottom:8, display:'flex', gap:10, alignItems:'flex-start' },
  taskCard:      { background:'var(--surf-card)', borderRadius:16, padding:'14px', marginBottom:10, display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 8px rgba(9,106,112,0.05)' },
  taskIcon:      { width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  chip:          { display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:999 },
  fab:           { position:'fixed', right:24, bottom:88, width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', border:'none', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(9,106,112,0.35)', cursor:'pointer', zIndex:250 },
  emptyState:    { display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 20px', gap:12 },
  overlay:       { position:'absolute', inset:0, background:'var(--bg)', display:'flex', flexDirection:'column', zIndex:100, overflow:'hidden' },
  overlayHead:   { background:'var(--surf-card)', padding:'14px 18px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--outline)', flexShrink:0 },
  overlayFooter: { padding:'14px 18px 24px', borderTop:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 },
  backBtn:       { background:'var(--surf-low)', border:'none', width:36, height:36, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt)', cursor:'pointer', flexShrink:0 },
  selectCard:    { display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:14, border:'1.5px solid var(--outline)', cursor:'pointer', transition:'all 0.15s' },
  formCard:      { background:'var(--surf-card)', borderRadius:20, padding:20, marginBottom:24, boxShadow:'0 2px 16px rgba(9,106,112,0.07)' },
  fieldLabel:    { display:'flex', alignItems:'center', gap:6, fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, minHeight:16, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' } as React.CSSProperties,
  inputWrap:     { display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', overflow:'hidden' },
  input:         { flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' },
  roleOpt:       { display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 8px', borderRadius:12, border:'1.5px solid var(--outline)', cursor:'pointer', flex:1 } as React.CSSProperties,
  btnPri:        { width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(9,106,112,0.25)', cursor:'pointer' } as React.CSSProperties,
  btnOutline:    { padding:'12px 16px', borderRadius:14, border:'1.5px solid var(--pri)', background:'transparent', color:'var(--pri)', fontSize:14, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' } as React.CSSProperties,
  btnSmall:      { padding:'8px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6, cursor:'pointer', flexShrink:0 } as React.CSSProperties,
}

// ─── Kunden List ─────────────────────────────────────────────────────────────
const CUST_ICON: Record<string,string> = {
  privatperson:   'person',
  firma:          'business',
  'weg-verwaltung': 'apartment',
  mietverwaltung: 'home_work',
}
const CUST_LABEL: Record<string,string> = {
  privatperson:   'Privatperson',
  firma:          'Firma',
  'weg-verwaltung': 'WEG-Verwaltung',
  mietverwaltung: 'Mietverwaltung',
}

function KundenList({ customers, objects, loading, onSelect }: {
  customers: CustomerItem[]
  objects: ObjectItem[]
  loading: boolean
  onSelect: (c: CustomerItem) => void
}) {
  const [search, setSearch] = useState('')
  const [filterChip, setFilterChip] = useState<'alle'|'privatperson'|'firma'|'verwaltung'|'hausverwaltung'>('alle')
  const [showExport, setShowExport] = useState(false)
  const [dbResults, setDbResults] = useState<CustomerItem[]|null>(null)
  const [dbSearching, setDbSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const handleSearch = (v: string) => {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (v.trim().length < 2) { setDbResults(null); setDbSearching(false); return }
    setDbSearching(true)
    searchTimer.current = setTimeout(async () => {
      const q = v.trim()
      const { data } = await supabase
        .from('customers')
        .select('id,customer_type,name,first_name,last_name,salutation,contact_person,contact_first_name,contact_last_name,email,phone,street,street_name,street_number,postal_code,city,address_supplement,notes,lexware_id,hausverwaltung_objekt_id,contract_type,hausverwaltung_id,co_contact_id,is_hausverwaltung,hausverwaltung:hausverwaltung_id(id,name,customer_type),co_contact:co_contact_id(id,name,role,phone,email)')
        .or(`name.ilike.%${q}%,contact_person.ilike.%${q}%,city.ilike.%${q}%,email.ilike.%${q}%,postal_code.ilike.%${q}%`)
        .limit(80)
      setDbResults((data as unknown as CustomerItem[]) || [])
      setDbSearching(false)
    }, 350)
  }

  const exportFields = [
    { key:'type',           label:'Kundentyp',       default:true },
    { key:'first_name',     label:'Vorname',          default:true },
    { key:'last_name',      label:'Nachname',         default:true },
    { key:'company',        label:'Firmenname',       default:true },
    { key:'contact',        label:'Ansprechpartner',  default:true },
    { key:'phone',          label:'Telefon',          default:true },
    { key:'email',          label:'E-Mail',           default:true },
    { key:'street_name',    label:'Straße',           default:true },
    { key:'street_number',  label:'Hausnummer',       default:false },
    { key:'postal_code',    label:'PLZ',              default:true },
    { key:'city',           label:'Ort',              default:true },
    { key:'contract_type',  label:'Vertragsart',      default:false },
    { key:'obj_count',      label:'Anzahl Objekte',   default:true },
    { key:'lexware_id',     label:'Lexware-ID',       default:false },
    { key:'notes',          label:'Notizen',          default:false },
  ]
  const [selectedFields, setSelectedFields] = useState<Set<string>>(
    new Set(exportFields.filter(f => f.default).map(f => f.key))
  )

  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const runExport = () => {
    const sf = selectedFields
    const headers: string[] = []
    if (sf.has('type'))          headers.push('Kundentyp')
    if (sf.has('first_name'))    headers.push('Vorname')
    if (sf.has('last_name'))     headers.push('Nachname')
    if (sf.has('company'))       headers.push('Firma')
    if (sf.has('contact'))       headers.push('Ansprechpartner')
    if (sf.has('phone'))         headers.push('Telefon')
    if (sf.has('email'))         headers.push('E-Mail')
    if (sf.has('street_name'))   headers.push('Straße')
    if (sf.has('street_number')) headers.push('Hausnummer')
    if (sf.has('postal_code'))   headers.push('PLZ')
    if (sf.has('city'))          headers.push('Ort')
    if (sf.has('contract_type')) headers.push('Vertragsart')
    if (sf.has('obj_count'))     headers.push('Objekte')
    if (sf.has('lexware_id'))    headers.push('Lexware-ID')
    if (sf.has('notes'))         headers.push('Notizen')

    const esc = (v: any) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const rows = customers.map(c => {
      const objCount = objects.filter(o => {
        if (o.customer_id === c.id) return true
        const oc = customers.find(cu => cu.id === o.customer_id)
        return oc?.hausverwaltung_id === c.id
      }).length
      const contactName = c.customer_type === 'firma'
        ? [c.contact_first_name, c.contact_last_name].filter(Boolean).join(' ') || c.contact_person || ''
        : ''
      const row: string[] = []
      if (sf.has('type'))          row.push(esc(c.customer_type === 'firma' ? 'Firma' : 'Privatperson'))
      if (sf.has('first_name'))    row.push(esc(c.first_name || (c.customer_type === 'privatperson' ? c.name.split(' ')[0] : '')))
      if (sf.has('last_name'))     row.push(esc(c.last_name || (c.customer_type === 'privatperson' ? c.name.split(' ').slice(1).join(' ') : '')))
      if (sf.has('company'))       row.push(esc(c.customer_type === 'firma' ? c.name : ''))
      if (sf.has('contact'))       row.push(esc(contactName))
      if (sf.has('phone'))         row.push(esc(c.phone))
      if (sf.has('email'))         row.push(esc(c.email))
      if (sf.has('street_name'))   row.push(esc(c.street_name || c.street))
      if (sf.has('street_number')) row.push(esc(c.street_number))
      if (sf.has('postal_code'))   row.push(esc(c.postal_code))
      if (sf.has('city'))          row.push(esc(c.city))
      if (sf.has('contract_type')) row.push(esc(c.contract_type === 'jahresvertrag' ? 'Jahresvertrag' : c.contract_type === 'einmalig' ? 'Einmalig' : ''))
      if (sf.has('obj_count'))     row.push(esc(objCount))
      if (sf.has('lexware_id'))    row.push(esc(c.lexware_id))
      if (sf.has('notes'))         row.push(esc(c.notes))
      return row.join(',')
    })

    // UTF-8 BOM for Excel compatibility
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `kunden-export-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    setShowExport(false)
  }

  // DB-Ergebnisse haben Vorrang wenn Suche aktiv
  const baseList = dbResults !== null ? dbResults : customers
  const filtered = baseList.filter(c => {
    if (filterChip === 'privatperson' && c.customer_type !== 'privatperson') return false
    if (filterChip === 'firma' && c.customer_type !== 'firma') return false
    if (filterChip === 'verwaltung' && c.customer_type !== 'weg-verwaltung' && c.customer_type !== 'mietverwaltung') return false
    if (filterChip === 'hausverwaltung' && !c.is_hausverwaltung) return false
    // Für lokale Liste (≤200): auch client-seitig filtern; DB-Ergebnisse sind bereits gefiltert
    if (dbResults !== null) return true
    const q = search.trim().toLowerCase()
    if (!q) return true
    const contactName = [c.contact_first_name, c.contact_last_name].filter(Boolean).join(' ')
    const hay = [
      c.name, c.contact_person, contactName,
      c.email, c.phone, c.city, c.postal_code,
      c.street_name, c.lexware_id,
      c.hausverwaltung?.name,
    ].filter(Boolean).join(' ').toLowerCase()
    return q.split(' ').filter(Boolean).every(word => hay.includes(word))
  })

  // Group alphabetically
  const grouped: Record<string, CustomerItem[]> = {}
  filtered.forEach(c => {
    const letter = c.name[0]?.toUpperCase() || '#'
    if (!grouped[letter]) grouped[letter] = []
    grouped[letter].push(c)
  })
  const letters = Object.keys(grouped).sort()

  return (
    <>
      <section style={{ paddingTop:20, paddingBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <h1 style={s.h1}>Kunden</h1>
            <p style={s.sub}>{customers.length} Kunden</p>
          </div>
          <button onClick={() => setShowExport(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">download</span>
            Export
          </button>
        </div>

        {/* ── Export Modal ── */}
        {showExport && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end' }} onClick={() => setShowExport(false)}>
            <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', paddingBottom:'env(safe-area-inset-bottom, 0px)' }} onClick={e => e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px', flexShrink:0 }}>
                <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }} />
              </div>
              <div style={{ padding:'8px 18px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--outline)', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Kunden exportieren</div>
                  <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>{customers.length} Kunden · CSV für Excel</div>
                </div>
                <button onClick={() => setShowExport(false)} style={{ background:'var(--surf-low)', border:'none', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span className="material-symbols-outlined icon-sm">close</span>
                </button>
              </div>
              <div style={{ height:0, flex:1, overflowY:'auto', padding:'14px 18px' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--txt-sec)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Felder auswählen</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {exportFields.map(f => (
                    <button key={f.key} onClick={() => toggleField(f.key)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:12, border:`1.5px solid ${selectedFields.has(f.key) ? 'var(--pri)' : 'var(--outline)'}`, background: selectedFields.has(f.key) ? 'var(--pri-xl)' : 'var(--surf-card)', cursor:'pointer', textAlign:'left' }}>
                      <span className="material-symbols-outlined icon-sm icon-fill" style={{ color: selectedFields.has(f.key) ? 'var(--pri)' : 'var(--surf-high)', flexShrink:0 }}>
                        {selectedFields.has(f.key) ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span style={{ fontSize:12, fontWeight:600, color: selectedFields.has(f.key) ? 'var(--pri)' : 'var(--txt-muted)' }}>{f.label}</span>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop:14, padding:'10px 12px', background:'var(--pri-xl)', borderRadius:10, display:'flex', gap:8, alignItems:'center' }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', flexShrink:0 }}>info</span>
                  <span style={{ fontSize:12, color:'var(--pri)', lineHeight:1.5 }}>Die CSV-Datei ist UTF-8 kodiert und kann direkt in Excel geöffnet werden.</span>
                </div>
              </div>
              <div style={{ padding:'14px 18px', borderTop:'1px solid var(--outline)', flexShrink:0 }}>
                <button onClick={runExport} disabled={selectedFields.size === 0}
                  style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background: selectedFields.size > 0 ? 'linear-gradient(135deg,var(--pri),var(--pri-c))' : 'var(--surf-high)', color: selectedFields.size > 0 ? '#fff' : 'var(--txt-muted)', fontSize:14, fontWeight:700, cursor: selectedFields.size > 0 ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span className="material-symbols-outlined icon-sm">download</span>
                  {selectedFields.size} Felder exportieren
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Search */}
        <div style={{ ...s.inputWrap, marginBottom:10 }}>
          <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
          <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Name, Firma, Stadt, Hausverwaltung …" style={s.input} />
          {dbSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
          {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', color:'var(--txt-muted)' }}><span className="material-symbols-outlined icon-sm">close</span></button>}
        </div>
        {/* Filter Chips */}
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, marginBottom:12, scrollbarWidth:'none', WebkitOverflowScrolling:'touch' as any, marginLeft:-18, marginRight:-18, paddingLeft:18, paddingRight:18 }}>
          {([
            { id:'alle',          label:'Alle',          count: customers.length },
            { id:'privatperson',  label:'Privatperson',  count: customers.filter(c=>c.customer_type==='privatperson').length },
            { id:'firma',         label:'Firma',         count: customers.filter(c=>c.customer_type==='firma').length },
            { id:'verwaltung',    label:'Verwaltung',    count: customers.filter(c=>c.customer_type==='weg-verwaltung'||c.customer_type==='mietverwaltung').length },
            { id:'hausverwaltung',label:'Hausverwaltung',count: customers.filter(c=>c.is_hausverwaltung).length },
          ] as const).map(chip => (
            <button key={chip.id} onClick={() => setFilterChip(chip.id)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:999, border:'1.5px solid', flexShrink:0, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
                borderColor: filterChip===chip.id ? 'var(--pri)' : 'var(--outline)',
                background:  filterChip===chip.id ? 'var(--pri-xl)' : 'var(--surf-card)',
                color:       filterChip===chip.id ? 'var(--pri)' : 'var(--txt-muted)',
              }}>
              {chip.label}
              {chip.count > 0 && <span style={{ fontSize:10, fontWeight:800, background: filterChip===chip.id ? 'var(--pri)' : 'var(--surf-high)', color: filterChip===chip.id ? '#fff' : 'var(--txt-muted)', borderRadius:999, padding:'1px 5px' }}>{chip.count}</span>}
            </button>
          ))}
        </div>
      </section>

      {loading ? <Loader/> : filtered.length === 0 ? (
        <div style={s.emptyState}>
          <span className="material-symbols-outlined" style={{ fontSize:48, color:'var(--txt-muted)', opacity:0.3 }}>contacts</span>
          <h3 style={{ fontSize:16, fontWeight:700, fontFamily:'var(--font-head)', color:'var(--txt-muted)' }}>{search ? 'Keine Treffer' : 'Noch keine Kunden'}</h3>
          <p style={{ fontSize:13, color:'var(--txt-muted)', textAlign:'center', opacity:0.7 }}>{search ? 'Andere Suchbegriffe versuchen' : 'Lege deinen ersten Kunden an'}</p>
        </div>
      ) : (
        <>
          {letters.map((letter, li) => (
            <div key={letter}>
              <div style={{ margin: li === 0 ? '4px 0 6px' : '16px 0 6px' }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', letterSpacing:'0.1em', textTransform:'uppercase' }}>{letter}</span>
              </div>
              {grouped[letter].map(c => {
                const objCount = objects.filter(o => o.customer_id === c.id).length
                return (
                  <div key={c.id} onClick={() => onSelect(c)}
                    style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', marginBottom:8, border:'0.5px solid var(--outline)', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--pri-xl)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
                    {/* Icon */}
                    <div style={{ width:46, height:46, borderRadius:14, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 10px rgba(9,106,112,0.2)' }}>
                      <span className="material-symbols-outlined" style={{ color:'#fff', fontSize:22 }}>{c.is_hausverwaltung ? 'domain' : CUST_ICON[c.customer_type]}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      {/* Zeile 1: Name + HV-Badge + Objekt-Pill */}
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                        <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>{c.name}</div>
                        {c.is_hausverwaltung && <span style={{ fontSize:10, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:99, padding:'2px 7px', flexShrink:0 }}>HV</span>}
                        {objCount > 0 && <span style={{ fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:99, padding:'2px 8px', display:'flex', alignItems:'center', gap:3, flexShrink:0 }}><span className="material-symbols-outlined" style={{ fontSize:12 }}>apartment</span>{objCount}</span>}
                      </div>
                      {/* Zeile 2: Typ – immer feste Position */}
                      <div style={{ fontSize:11, color:'var(--txt-muted)', fontFamily:'monospace', marginBottom:3 }}>{CUST_LABEL[c.customer_type]}</div>
                      {/* Zeile 3: Hausverwaltung oder Ansprechpartner */}
                      {(c.customer_type==='weg-verwaltung'||c.customer_type==='mietverwaltung') && c.hausverwaltung ? (
                        <div style={{ fontSize:11, color:'var(--pri)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                          <span className="material-symbols-outlined icon-sm">domain</span>{c.hausverwaltung.name}
                        </div>
                      ) : (c.customer_type==='firma'||c.customer_type==='mietverwaltung') && (c.contact_first_name||c.contact_last_name||c.contact_person) ? (
                        <div style={{ fontSize:11, color:'var(--txt-sec)', display:'flex', alignItems:'center', gap:4 }}>
                          <span className="material-symbols-outlined icon-sm">person</span>
                          {[c.contact_first_name, c.contact_last_name].filter(Boolean).join(' ') || c.contact_person}
                        </div>
                      ) : null}
                    </div>
                    <span className="material-symbols-outlined" style={{ color:'var(--txt-muted)', fontSize:20, flexShrink:0 }}>chevron_right</span>
                  </div>
                )
              })}
            </div>
          ))}
          <div style={{ height:80 }}/>
        </>
      )}


    </>
  )
}

// ─── Kunde Detail ─────────────────────────────────────────────────────────────
// ─── KundenContactSheet ───────────────────────────────────────────────────────
function KundenContactSheet({ customerId, existing, onClose, onSaved }: {
  customerId: string
  existing: any | null
  onClose: () => void
  onSaved: () => void
}) {
  const [firstName, setFirstName] = useState(existing?.first_name || '')
  const [lastName,  setLastName]  = useState(existing?.last_name  || existing?.name?.split(' ').slice(1).join(' ') || '')
  const [role,      setRole]      = useState(existing?.role  || '')
  const [phone,     setPhone]     = useState(existing?.phone || '')
  const [email,     setEmail]     = useState(existing?.email || '')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [showDel,   setShowDel]   = useState(false)
  const [error,     setError]     = useState('')

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) { setError('Vor- oder Nachname ist Pflicht.'); return }
    setSaving(true); setError('')
    const payload = {
      first_name:  firstName.trim() || null,
      last_name:   lastName.trim()  || null,
      name:        [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null,
      role:        role.trim()  || null,
      phone:       phone.trim() || null,
      email:       email.trim() || null,
      customer_id: customerId,
    }
    const { error: e } = existing
      ? await supabase.from('contact_persons').update(payload).eq('id', existing.id)
      : await supabase.from('contact_persons').insert(payload)
    setSaving(false)
    if (e) { setError(e.message); return }
    onSaved()
  }

  const del = async () => {
    setDeleting(true)
    await supabase.from('contact_persons').delete().eq('id', existing.id)
    setDeleting(false)
    onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ background:'var(--bg)', borderRadius:'24px 24px 0 0', paddingBottom:40, maxHeight:'92vh', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 16px', borderBottom:'1px solid var(--outline)', position:'sticky', top:0, background:'var(--bg)', zIndex:1 }}>
          <button onClick={onClose} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
          <div style={{ flex:1, fontSize:15, fontWeight:800, fontFamily:'var(--font-head)' }}>
            {existing ? 'Ansprechpartner bearbeiten' : 'Ansprechpartner hinzufügen'}
          </div>
          {existing && (
            <button onClick={() => setShowDel(true)} style={{ background:'var(--err-bg)', border:'none', borderRadius:10, padding:'8px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'var(--err)', fontSize:12, fontWeight:700 }}>
              <span className="material-symbols-outlined icon-sm">delete</span>
            </button>
          )}
        </div>

        {/* Form */}
        <div style={{ padding:'20px' }}>
          {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            <div>
              <label style={s.fieldLabel}>Vorname *</label>
              <div className="iw" style={s.inputWrap}>
                <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Max" style={s.input} autoFocus />
              </div>
            </div>
            <div>
              <label style={s.fieldLabel}>Nachname *</label>
              <div className="iw" style={s.inputWrap}>
                <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Mustermann" style={s.input} />
              </div>
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Funktion / Rolle</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>badge</span>
              <input value={role} onChange={e=>setRole(e.target.value)} placeholder="z.B. Geschäftsführer" style={s.input} />
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Telefon</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>phone</span>
              <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" placeholder="+49 561 …" style={s.input} />
            </div>
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={s.fieldLabel}>E-Mail</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>mail</span>
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="max@firma.de" style={s.input} />
            </div>
          </div>

          <button onClick={save} disabled={saving}
            style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {saving ? 'Wird gespeichert…' : existing ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>

        {/* Delete Confirm */}
        {showDel && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1010, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
            <div style={{ background:'var(--surf-card)', borderRadius:20, padding:24, width:'100%', maxWidth:360, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:8 }}>Ansprechpartner löschen?</div>
              <div style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:20 }}>
                <strong>{[firstName,lastName].filter(Boolean).join(' ')}</strong> wird entfernt.
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowDel(false)} style={{ flex:1, padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--bg)', fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button onClick={del} disabled={deleting} style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:'var(--err)', color:'#fff', fontWeight:700, cursor:'pointer' }}>
                  {deleting ? '…' : 'Löschen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KundeDetail({ customer, objects, contacts, onBack, onUpdated, onDeleted, onObjectClick, onRefreshContacts, isDesktop }: {
  customer: CustomerItem
  objects: ObjectItem[]
  contacts: any[]
  onBack: () => void
  onUpdated: (c: CustomerItem) => void
  onDeleted: () => void
  onObjectClick: (o: ObjectItem) => void
  onRefreshContacts?: () => void
  isDesktop?: boolean
}) {
  const [showEdit, setShowEdit]                   = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]                   = useState(false)
  const [editContact, setEditContact]             = useState<any|null|'new'>(null)

  const OBJ_TYPE_ICON: Record<string,string> = {
    einfamilienhaus:'house', mehrfamilienhaus:'apartment',
    firmengelaende:'business', grundstueck:'landscape',
  }
  const custIcon = customer.is_hausverwaltung ? 'domain' : (CUST_ICON[customer.customer_type] || 'person')

  // Ansprechpartner der Firma (falls hinterlegt)
  const contactName = customer.customer_type === 'firma'
    ? ([customer.contact_first_name, customer.contact_last_name].filter(Boolean).join(' ') || customer.contact_person || null)
    : null

  // Rows die in der Info-Card auftauchen
  const infoRows: { icon: string; content: React.ReactNode; href?: string }[] = []
  if (contactName) infoRows.push({ icon: 'person', content: <span style={{ fontWeight:700 }}>{contactName}</span> })
  if (customer.phone) infoRows.push({ icon: 'phone', content: <a href={`tel:${customer.phone}`} style={{ color:'var(--pri)', textDecoration:'none', fontWeight:700 }}>{customer.phone}</a>, href: `tel:${customer.phone}` })
  if (customer.email) infoRows.push({ icon: 'mail', content: <a href={`mailto:${customer.email}`} style={{ color:'var(--pri)', textDecoration:'none', fontWeight:700 }}>{customer.email}</a>, href: `mailto:${customer.email}` })
  if (customer.street || customer.postal_code) infoRows.push({ icon: 'home', content: <span>{customer.street}{customer.postal_code ? `, ${customer.postal_code} ${customer.city}` : ''}</span> })
  if (customer.hausverwaltung) infoRows.push({ icon: 'domain', content: <><span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:1 }}>{customer.customer_type === 'mietverwaltung' ? 'Verwaltungsgesellschaft' : 'Hausverwaltung'}</span><span style={{ color:'var(--pri)', fontWeight:700 }}>{customer.hausverwaltung.name}</span></> })
  if (customer.co_contact) infoRows.push({ icon: 'contact_phone', content: <><span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:1 }}>c/o Kontakt</span><span style={{ fontWeight:700 }}>{customer.co_contact.name}{customer.co_contact.role ? <span style={{ fontWeight:400, color:'var(--txt-muted)' }}> · {customer.co_contact.role}</span> : ''}</span>{customer.co_contact.phone && <a href={`tel:${customer.co_contact.phone}`} style={{ display:'block', fontSize:12, color:'var(--pri)', textDecoration:'none', marginTop:2 }}>{customer.co_contact.phone}</a>}</> })
  if (customer.hausverwaltung_objekt_id) infoRows.push({ icon: 'tag', content: <><span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:1 }}>Objekt-ID</span><span style={{ fontFamily:'monospace', fontWeight:600 }}>{customer.hausverwaltung_objekt_id}</span></> })
  if (customer.notes) infoRows.push({ icon: 'notes', content: <span style={{ color:'var(--txt-sec)', lineHeight:1.6, fontSize:13 }}>{customer.notes}</span> })

  return (
    <div style={{ paddingBottom:100 }}>

      {/* Navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 0 18px' }}>
        <button onClick={onBack} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:12, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:20, color:'var(--txt-muted)' }}>arrow_back</span>
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>Kunden</div>
          <h1 style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', letterSpacing:'-0.02em', marginBottom:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{customer.name}</h1>
        </div>
        <button onClick={() => setShowEdit(true)} style={{ background:'var(--pri)', border:'none', borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <span className="material-symbols-outlined icon-sm" style={{ color:'#fff' }}>edit</span>
        </button>
      </div>

      {/* Haupt-Info-Card – alles in einer Kachel */}
      <div style={{ background:'var(--surf-card)', borderRadius:18, marginBottom:14, border:'0.5px solid var(--outline)', overflow:'hidden' }}>
        {/* Kopfzeile: Icon + Name + Badges */}
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px' }}>
          <div style={{ width:48, height:48, borderRadius:15, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(9,106,112,0.22)' }}>
            <span className="material-symbols-outlined" style={{ fontSize:24, color:'#fff' }}>{custIcon}</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{customer.name}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600 }}>{CUST_LABEL[customer.customer_type]}</span>
              {customer.contract_type && (
                <span style={{ fontSize:10, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:99, padding:'2px 7px' }}>
                  {customer.contract_type === 'jahresvertrag' ? 'Jahresvertrag' : 'Einmalig'}
                </span>
              )}
              {customer.is_hausverwaltung && (
                <span style={{ fontSize:10, fontWeight:700, color:'#1565c0', background:'#e3f2fd', borderRadius:99, padding:'2px 7px' }}>Hausverwaltung</span>
              )}
            </div>
          </div>
        </div>

        {/* Info-Rows */}
        {infoRows.map((row, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderTop:'0.5px solid var(--outline)' }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{row.icon}</span>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--txt)', flex:1, minWidth:0 }}>{row.content}</div>
          </div>
        ))}

        {/* Leerer Zustand */}
        {infoRows.length === 0 && (
          <div style={{ borderTop:'0.5px solid var(--outline)', padding:'14px 16px', fontSize:13, color:'var(--txt-muted)', textAlign:'center' }}>
            Keine weiteren Stammdaten hinterlegt
          </div>
        )}
      </div>

      {/* Ansprechpartner */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <h3 style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)' }}>Ansprechpartner</h3>
        <button onClick={() => setEditContact('new')}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:10, border:'1px solid var(--outline)', background:'var(--surf-card)', color:'var(--pri)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize:15 }}>add</span>Hinzufügen
        </button>
      </div>
      {contacts.length === 0 ? (
        <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'14px 16px', fontSize:13, color:'var(--txt-muted)', marginBottom:14 }}>Noch kein Ansprechpartner hinterlegt</div>
      ) : (
        <div style={{ background:'var(--surf-card)', borderRadius:16, border:'0.5px solid var(--outline)', overflow:'hidden', marginBottom:14 }}>
          {contacts.map((cp: any, i: number) => {
            const name = [cp.first_name, cp.last_name].filter(Boolean).join(' ') || cp.name || '–'
            return (
              <div key={cp.id} onClick={() => setEditContact(cp)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderTop: i > 0 ? '0.5px solid var(--outline)' : 'none', cursor:'pointer' }}>
                <div style={{ width:36, height:36, borderRadius:11, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:17, color:'#fff' }}>person</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                  {cp.role && <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>{cp.role}</div>}
                  <div style={{ display:'flex', gap:10, marginTop: cp.role ? 3 : 2, flexWrap:'wrap' }}>
                    {cp.phone && <a href={`tel:${cp.phone}`} onClick={e=>e.stopPropagation()} style={{ fontSize:12, color:'var(--pri)', textDecoration:'none', fontWeight:600 }}>{cp.phone}</a>}
                    {cp.email && <a href={`mailto:${cp.email}`} onClick={e=>e.stopPropagation()} style={{ fontSize:12, color:'var(--pri)', textDecoration:'none', fontWeight:600 }}>{cp.email}</a>}
                  </div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)', flexShrink:0 }}>edit</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Objekte */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <h3 style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)' }}>Objekte</h3>
        {objects.length > 0 && <span style={{ fontSize:12, color:'var(--txt-muted)', fontWeight:600 }}>{objects.length}</span>}
      </div>
      {objects.length === 0 ? (
        <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'20px', textAlign:'center', color:'var(--txt-muted)', fontSize:13 }}>Keine Objekte zugeordnet</div>
      ) : objects.map(obj => {
        const typeIcon = OBJ_TYPE_ICON[obj.object_type ?? 'mehrfamilienhaus'] ?? 'apartment'
        return (
          <div key={obj.id} onClick={() => onObjectClick(obj)}
            style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surf-card)', borderRadius:14, padding:'13px 14px', marginBottom:8, border:'0.5px solid var(--outline)', cursor:'pointer', transition:'background 0.12s' }}
            onMouseEnter={e=>(e.currentTarget.style.background='var(--pri-xl)')}
            onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
            <div style={{ width:40, height:40, borderRadius:13, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:20, color:'#fff' }}>{typeIcon}</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{obj.address}, {obj.postal_code} {obj.city}</div>
              {obj.object_number && <div style={{ fontSize:11, color:'var(--txt-muted)', fontFamily:'monospace', marginTop:2 }}>{obj.object_number}</div>}
            </div>
            <span className="material-symbols-outlined" style={{ color:'var(--txt-muted)', fontSize:18, flexShrink:0 }}>chevron_right</span>
          </div>
        )
      })}

      {/* Edit Overlay */}
      {showEdit && (
        <EditCustomerOverlay customer={customer} onClose={() => setShowEdit(false)} onSaved={c => { setShowEdit(false); onUpdated(c) }} onDelete={() => { setShowEdit(false); setShowDeleteConfirm(true) }} isDesktop={isDesktop} />
      )}

      {/* Ansprechpartner Edit/Create */}
      {editContact !== null && (
        <KundenContactSheet
          customerId={customer.id}
          existing={editContact === 'new' ? null : editContact}
          onClose={() => setEditContact(null)}
          onSaved={() => { setEditContact(null); onRefreshContacts?.() }}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'var(--surf-card)', borderRadius:'24px 24px 0 0', padding:'28px 24px 40px', width:'100%', maxWidth:500 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:52, height:52, borderRadius:16, background:'var(--err-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <span className="material-symbols-outlined" style={{ color:'var(--err)', fontSize:26 }}>person_remove</span>
              </div>
              <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:6 }}>Kunden löschen?</div>
              <div style={{ fontSize:13, color:'var(--txt-muted)', lineHeight:1.5 }}>
                <strong>{customer.name}</strong><br/>Diese Aktion kann nicht rückgängig gemacht werden.
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex:1, padding:'14px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--bg)', fontSize:14, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
              <button disabled={deleting} onClick={async () => { setDeleting(true); const { error: delErr } = await supabase.from('customers').delete().eq('id', customer.id); setDeleting(false); if (delErr) { alert('Fehler beim Löschen: ' + delErr.message); return; } setShowDeleteConfirm(false); onDeleted() }}
                style={{ flex:1, padding:'14px', borderRadius:14, border:'none', background:'var(--err)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Contact Person Overlay ───────────────────────────────────────────────────
function ContactPersonOverlay({ customerId, existing, onClose, onSaved }: {
  customerId: string; existing: ContactPerson|null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName]   = useState(existing?.name||'')
  const [role, setRole]   = useState(existing?.role||'')
  const [phone, setPhone] = useState(existing?.phone||'')
  const [email, setEmail] = useState(existing?.email||'')
  const [saving, setSaving]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!name.trim()) { setError('Name ist Pflichtfeld.'); return }
    setSaving(true); setError('')
    if (existing) {
      const { error: e } = await supabase.from('contact_persons').update({ name:name.trim(), role:role.trim()||null, phone:phone.trim()||null, email:email.trim()||null }).eq('id', existing.id)
      if (e) { setError('Fehler: ' + e.message); setSaving(false); return }
    } else {
      const { error: e } = await supabase.from('contact_persons').insert({ customer_id:customerId, name:name.trim(), role:role.trim()||null, phone:phone.trim()||null, email:email.trim()||null })
      if (e) { setError('Fehler: ' + e.message); setSaving(false); return }
    }
    setSaving(false); onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ background:'var(--bg)', borderRadius:'24px 24px 0 0', paddingBottom:40 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 16px', borderBottom:'1px solid var(--outline)' }}>
          <button onClick={onClose} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
          <div style={{ flex:1, fontSize:15, fontWeight:800, fontFamily:'var(--font-head)' }}>{existing ? 'Ansprechpartner bearbeiten' : 'Ansprechpartner hinzufügen'}</div>
          {existing && (
            <button onClick={() => setShowDelete(true)} style={{ background:'var(--err-bg)', border:'none', borderRadius:10, padding:'8px 12px', color:'var(--err)', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
              <span className="material-symbols-outlined icon-sm">delete</span>
            </button>
          )}
        </div>
        <div style={{ padding:'20px' }}>
          {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}
          {[
            { label:'Name *', val:name, set:setName, ph:'Max Mustermann', icon:'person' },
            { label:'Funktion / Rolle', val:role, set:setRole, ph:'z.B. Geschäftsführer', icon:'badge' },
            { label:'Telefon', val:phone, set:setPhone, ph:'+49 561 …', icon:'phone' },
            { label:'E-Mail', val:email, set:setEmail, ph:'max@firma.de', icon:'mail' },
          ].map(f => (
            <div key={f.label} style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>{f.label}</label>
              <div className="iw" style={s.inputWrap}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>{f.icon}</span>
                <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={s.input}/>
              </div>
            </div>
          ))}
          <button onClick={save} disabled={saving} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {saving ? 'Wird gespeichert…' : existing ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>
        {showDelete && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1010, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
            <div style={{ background:'var(--surf-card)', borderRadius:20, padding:'24px', width:'100%', maxWidth:360, textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:8 }}>Ansprechpartner löschen?</div>
              <div style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:20 }}><strong>{existing?.name}</strong> wird entfernt.</div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => setShowDelete(false)} style={{ flex:1, padding:'12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--bg)', fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                <button disabled={deleting} onClick={async () => { setDeleting(true); const { error: delErr } = await supabase.from('contact_persons').delete().eq('id', existing!.id); setDeleting(false); if (delErr) { setError('Löschen fehlgeschlagen: ' + delErr.message); setShowDelete(false); return; } onSaved() }}
                  style={{ flex:1, padding:'12px', borderRadius:12, border:'none', background:'var(--err)', color:'#fff', fontWeight:700, cursor:'pointer' }}>
                  {deleting ? '…' : 'Löschen'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Create Customer Overlay ──────────────────────────────────────────────────
function CreateCustomerOverlay({ onClose, onSaved }: { onClose: () => void; onSaved: (c: CustomerItem) => void }) {
  const [custType, setCustType]       = useState<'firma'|'privatperson'>('firma')
  // Privatperson name
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  // Firma name
  const [companyName, setCompanyName] = useState('')
  // Company contact person
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName]   = useState('')
  const [cpRole, setCpRole]         = useState('')
  const [cpPhone, setCpPhone]       = useState('')
  const [cpEmail, setCpEmail]       = useState('')
  // Contact for private person
  const [phone, setPhone]           = useState('')
  const [email, setEmail]           = useState('')
  // Address (split)
  const [streetName, setStreetName] = useState('')
  const [streetNumber, setStreetNumber] = useState('')
  const [addrSup, setAddrSup]       = useState('')
  const [postal, setPostal]         = useState('')
  const [city, setCity]             = useState('')
  const [cityLocked, setCityLocked] = useState(false)
  const [plzLoading, setPlzLoading] = useState(false)
  const [notes, setNotes]           = useState('')
  const [contractType, setContractType] = useState<'jahresvertrag'|'einmalig'|''>('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const lookupCity = async (plz: string) => {
    setPostal(plz)
    if (plz.length !== 5) { if (cityLocked) { setCity(''); setCityLocked(false) }; return }
    setPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) { const data = await res.json(); const found = data[0]?.name; if (found) { setCity(found); setCityLocked(true) } }
    } catch { /* ignore */ }
    setPlzLoading(false)
  }

  const computedName = custType === 'privatperson'
    ? [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    : companyName.trim()

  const save = async () => {
    if (!computedName) { setError(custType === 'firma' ? 'Firmenname ist ein Pflichtfeld.' : 'Vor- und Nachname sind Pflichtfelder.'); return }
    setSaving(true); setError('')
    const fullStreet = [streetName.trim(), streetNumber.trim()].filter(Boolean).join(' ')
    const contactFullName = [contactFirstName.trim(), contactLastName.trim()].filter(Boolean).join(' ')
    const { data, error: e } = await supabase.from('customers').insert({
      customer_type: custType,
      name: computedName,
      first_name: custType === 'privatperson' ? firstName.trim()||null : null,
      last_name: custType === 'privatperson' ? lastName.trim()||null : null,
      contact_first_name: custType === 'firma' ? contactFirstName.trim()||null : null,
      contact_last_name: custType === 'firma' ? contactLastName.trim()||null : null,
      contact_person: contactFullName || null,
      street: fullStreet||null,
      street_name: streetName.trim()||null,
      street_number: streetNumber.trim()||null,
      address_supplement: addrSup.trim()||null,
      postal_code: postal.trim()||null,
      city: city.trim()||null,
      phone: phone.trim()||null,
      email: email.trim()||null,
      notes: notes.trim()||null,
      contract_type: contractType||null,
    }).select('*').single()
    if (e || !data) { setError(e?.message||'Fehler'); setSaving(false); return }
    // Firma: save first contact person if name given
    if (custType === 'firma' && contactFullName) {
      await supabase.from('contact_persons').insert({ customer_id:data.id, name:contactFullName, role:cpRole.trim()||null, phone:cpPhone.trim()||null, email:cpEmail.trim()||null })
    }
    onSaved(data as CustomerItem)
  }

  const inner = (
    <div style={{ background:'var(--bg)', borderRadius:'24px 24px 0 0', maxHeight:'92vh', overflowY:'auto', paddingBottom:40 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 16px', position:'sticky', top:0, background:'var(--bg)', borderBottom:'1px solid var(--outline)', zIndex:1 }}>
          <button onClick={onClose} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
          <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Neuer Kunde</div>
        </div>
        <div style={{ padding:'20px 20px 0' }}>
          {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}

          {/* Typ-Auswahl */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
            {([{v:'firma',label:'Firma',icon:'business'},{v:'privatperson',label:'Privatperson',icon:'person'}] as const).map(opt=>(
              <div key={opt.v} onClick={()=>setCustType(opt.v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'12px', borderRadius:12, border:`1.5px solid ${custType===opt.v?'var(--pri)':'var(--outline)'}`, background:custType===opt.v?'var(--pri-xl)':'var(--surf-card)', cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:20, color:custType===opt.v?'var(--pri)':'var(--txt-muted)' }}>{opt.icon}</span>
                <span style={{ fontSize:13, fontWeight:700, color:custType===opt.v?'var(--pri)':'var(--txt)', flex:1 }}>{opt.label}</span>
                {custType===opt.v && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--pri)' }}>check_circle</span>}
              </div>
            ))}
          </div>

          {/* ── FIRMA Felder ── */}
          {custType === 'firma' && (<>
            <div style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>Firmenname *</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>business</span><input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Mustermann GmbH" style={s.input}/></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:10, marginBottom:14 }}>
              <div>
                <label style={s.fieldLabel}>Straße *</label>
                <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>location_on</span><input value={streetName} onChange={e=>setStreetName(e.target.value)} placeholder="Musterstraße" style={s.input}/></div>
              </div>
              <div>
                <label style={s.fieldLabel}>Nr.</label>
                <div className="iw" style={s.inputWrap}><input value={streetNumber} onChange={e=>setStreetNumber(e.target.value)} placeholder="12a" style={s.input}/></div>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>Adresszusatz</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>layers</span><input value={addrSup} onChange={e=>setAddrSup(e.target.value)} placeholder="c/o, Gebäude B, …" style={s.input}/></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10, marginBottom:14, alignItems:'start' }}>
              <div>
                <label style={s.fieldLabel}>PLZ</label>
                <div className="iw" style={s.inputWrap}>
                  <input value={postal} onChange={e=>lookupCity(e.target.value)} placeholder="34212" maxLength={5} style={s.input}/>
                  {plzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                </div>
              </div>
              <div>
                <label style={s.fieldLabel}>Ort</label>
                <div style={{ ...s.inputWrap, background:cityLocked?'var(--ok-bg)':undefined }}>
                  <input value={city} onChange={e=>{setCity(e.target.value);setCityLocked(false)}} placeholder="Melsungen" style={s.input}/>
                  {cityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                </div>
              </div>
            </div>

            {/* Ansprechpartner */}
            <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'14px', marginBottom:14, border:'1px solid var(--outline)' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--txt-sec)', marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                <span className="material-symbols-outlined icon-sm">person</span> Ansprechpartner
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ ...s.fieldLabel, marginBottom:4 }}>Vorname</label>
                  <div className="iw" style={s.inputWrap}><input value={contactFirstName} onChange={e=>setContactFirstName(e.target.value)} placeholder="Max" style={s.input}/></div>
                </div>
                <div>
                  <label style={{ ...s.fieldLabel, marginBottom:4 }}>Nachname</label>
                  <div className="iw" style={s.inputWrap}><input value={contactLastName} onChange={e=>setContactLastName(e.target.value)} placeholder="Mustermann" style={s.input}/></div>
                </div>
              </div>
              {[
                { label:'Funktion / Rolle', val:cpRole, set:setCpRole, ph:'Geschäftsführer' },
                { label:'Telefon', val:cpPhone, set:setCpPhone, ph:'+49 561 …' },
                { label:'E-Mail', val:cpEmail, set:setCpEmail, ph:'max@firma.de' },
              ].map(f => (
                <div key={f.label} style={{ marginBottom:10 }}>
                  <label style={{ ...s.fieldLabel, marginBottom:4 }}>{f.label}</label>
                  <div className="iw" style={s.inputWrap}><input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={s.input}/></div>
                </div>
              ))}
            </div>
          </>)}

          {/* ── PRIVATPERSON Felder ── */}
          {custType === 'privatperson' && (<>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={s.fieldLabel}>Vorname *</label>
                <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>person</span><input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Max" style={s.input}/></div>
              </div>
              <div>
                <label style={s.fieldLabel}>Nachname *</label>
                <div className="iw" style={s.inputWrap}><input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Mustermann" style={s.input}/></div>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>Telefon</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>phone</span><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+49 561 …" type="tel" style={s.input}/></div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>E-Mail</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>mail</span><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="max@beispiel.de" type="email" style={s.input}/></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:10, marginBottom:14 }}>
              <div>
                <label style={s.fieldLabel}>Straße</label>
                <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>home</span><input value={streetName} onChange={e=>setStreetName(e.target.value)} placeholder="Musterstraße" style={s.input}/></div>
              </div>
              <div>
                <label style={s.fieldLabel}>Nr.</label>
                <div className="iw" style={s.inputWrap}><input value={streetNumber} onChange={e=>setStreetNumber(e.target.value)} placeholder="1" style={s.input}/></div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10, marginBottom:14, alignItems:'start' }}>
              <div>
                <label style={s.fieldLabel}>PLZ</label>
                <div className="iw" style={s.inputWrap}>
                  <input value={postal} onChange={e=>lookupCity(e.target.value)} placeholder="34212" maxLength={5} style={s.input}/>
                  {plzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                </div>
              </div>
              <div>
                <label style={s.fieldLabel}>Ort</label>
                <div style={{ ...s.inputWrap, background:cityLocked?'var(--ok-bg)':undefined }}>
                  <input value={city} onChange={e=>{setCity(e.target.value);setCityLocked(false)}} placeholder="Melsungen" style={s.input}/>
                  {cityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
                </div>
              </div>
            </div>
          </>)}

          {/* Gemeinsame Felder */}
          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Vertragsart</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>description</span>
              <select value={contractType} onChange={e=>setContractType(e.target.value as any)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer' }}>
                <option value="">Keine Angabe</option>
                <option value="jahresvertrag">Jahresvertrag</option>
                <option value="einmalig">Einmalig</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={s.fieldLabel}>Notizen</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Interne Notizen …" rows={3} style={{ ...s.input, width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', resize:'vertical', lineHeight:1.6 }}/>
          </div>

          <button onClick={save} disabled={saving} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'person_add'}</span>
            {saving?'Wird gespeichert…':'Kunden anlegen'}
          </button>
        </div>
      </div>
  )
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>
        {inner}
      </div>
    </div>
  )
}

// ─── Edit Customer Overlay ────────────────────────────────────────────────────
function EditCustomerOverlay({ customer, onClose, onSaved, onDelete, isDesktop }: {
  customer: CustomerItem; onClose: () => void; onSaved: (c: CustomerItem) => void; onDelete: () => void; isDesktop?: boolean
}) {
  const [custType, setCustType]       = useState<CustomerType>(customer.customer_type)
  const [companyName, setCompanyName] = useState(customer.customer_type === 'firma' ? customer.name : '')
  const [firstName, setFirstName]   = useState(customer.first_name || (customer.customer_type === 'privatperson' ? (customer.name.split(' ')[0] || '') : ''))
  const [lastName, setLastName]     = useState(customer.last_name || (customer.customer_type === 'privatperson' ? (customer.name.split(' ').slice(1).join(' ') || '') : ''))
  const [contactFirstName, setContactFirstName] = useState(customer.contact_first_name || (customer.contact_person ? customer.contact_person.split(' ')[0] : '') || '')
  const [contactLastName, setContactLastName]   = useState(customer.contact_last_name || (customer.contact_person ? customer.contact_person.split(' ').slice(1).join(' ') : '') || '')
  const [streetName, setStreetName] = useState(customer.street_name || customer.street || '')
  const [streetNumber, setStreetNumber] = useState(customer.street_number || '')
  const [addrSup, setAddrSup]       = useState(customer.address_supplement||'')
  const [postal, setPostal]         = useState(customer.postal_code||'')
  const [city, setCity]             = useState(customer.city||'')
  const [cityLocked, setCityLocked] = useState(false)
  const [plzLoading, setPlzLoading] = useState(false)
  const [phone, setPhone]           = useState(customer.phone||'')
  const [email, setEmail]           = useState(customer.email||'')
  const [notes, setNotes]           = useState(customer.notes||'')
  const [contractType, setContractType] = useState<'jahresvertrag'|'einmalig'|''>(customer.contract_type||'')
  const [isHausverwaltung, setIsHausverwaltung] = useState(customer.is_hausverwaltung ?? false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const lookupCity = async (plz: string) => {
    setPostal(plz)
    if (plz.length !== 5) { if (cityLocked) { setCity(''); setCityLocked(false) }; return }
    setPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) { const data = await res.json(); const found = data[0]?.name; if (found) { setCity(found); setCityLocked(true) } }
    } catch { /* ignore */ }
    setPlzLoading(false)
  }

  const computedName = custType === 'privatperson'
    ? [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
    : companyName.trim()

  const save = async () => {
    if (!computedName) { setError(custType === 'firma' ? 'Firmenname ist ein Pflichtfeld.' : 'Vor- und Nachname sind Pflichtfelder.'); return }
    setSaving(true); setError('')
    const fullStreet = [streetName.trim(), streetNumber.trim()].filter(Boolean).join(' ')
    const contactFullName = [contactFirstName.trim(), contactLastName.trim()].filter(Boolean).join(' ')
    const { data, error: e } = await supabase.from('customers').update({
      customer_type: custType,
      name: computedName,
      first_name: custType === 'privatperson' ? firstName.trim()||null : null,
      last_name: custType === 'privatperson' ? lastName.trim()||null : null,
      contact_first_name: custType === 'firma' ? contactFirstName.trim()||null : null,
      contact_last_name: custType === 'firma' ? contactLastName.trim()||null : null,
      contact_person: contactFullName || null,
      street: fullStreet||null,
      street_name: streetName.trim()||null,
      street_number: streetNumber.trim()||null,
      address_supplement: addrSup.trim()||null,
      postal_code: postal.trim()||null,
      city: city.trim()||null,
      phone: phone.trim()||null,
      email: email.trim()||null,
      notes: notes.trim()||null,
      contract_type: contractType||null,
      is_hausverwaltung: isHausverwaltung,
    }).eq('id', customer.id).select('*').single()
    if (e || !data) { setError(e?.message||'Fehler'); setSaving(false); return }
    onSaved(data as CustomerItem)
  }

  const inner = (
    <div style={{ background:'var(--bg)', borderRadius: isDesktop ? 24 : '24px 24px 0 0', maxHeight: isDesktop ? '90dvh' : '92vh', overflowY:'auto', paddingBottom:40 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'20px 20px 16px', position:'sticky', top:0, background:'var(--bg)', borderBottom:'1px solid var(--outline)', zIndex:1 }}>
          <button onClick={onClose} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">close</span>
          </button>
          <div style={{ flex:1, fontSize:16, fontWeight:800, fontFamily:'var(--font-head)' }}>Kunden bearbeiten</div>
          <button onClick={onDelete} style={{ background:'var(--err-bg)', border:'none', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:6, cursor:'pointer', color:'var(--err)', fontSize:12, fontWeight:700 }}>
            <span className="material-symbols-outlined icon-sm">delete</span> Löschen
          </button>
        </div>
        <div style={{ padding:'20px 20px 0' }}>
          {error && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:14 }}>{error}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {([{v:'firma',label:'Firma',icon:'business'},{v:'privatperson',label:'Privatperson',icon:'person'}] as const).map(opt=>(
              <div key={opt.v} onClick={()=>setCustType(opt.v)} style={{ display:'flex', alignItems:'center', gap:8, padding:'12px', borderRadius:12, border:`1.5px solid ${custType===opt.v?'var(--pri)':'var(--outline)'}`, background:custType===opt.v?'var(--pri-xl)':'var(--surf-card)', cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:20, color:custType===opt.v?'var(--pri)':'var(--txt-muted)' }}>{opt.icon}</span>
                <span style={{ fontSize:13, fontWeight:700, color:custType===opt.v?'var(--pri)':'var(--txt)', flex:1 }}>{opt.label}</span>
                {custType===opt.v && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--pri)', marginLeft:'auto' }}>check_circle</span>}
              </div>
            ))}
          </div>

          {/* Hausverwaltung Toggle – nur für Firmen */}
          {custType === 'firma' && (
            <div onClick={() => setIsHausverwaltung(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:`1.5px solid ${isHausverwaltung ? 'var(--pri)' : 'var(--outline)'}`, background: isHausverwaltung ? 'var(--pri-xl)' : 'var(--surf-card)', cursor:'pointer', marginBottom:14 }}>
              <span className="material-symbols-outlined" style={{ fontSize:20, color: isHausverwaltung ? 'var(--pri)' : 'var(--txt-muted)' }}>domain</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isHausverwaltung ? 'var(--pri)' : 'var(--txt)' }}>Ist eine Hausverwaltung</div>
                <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>Erscheint im Filter „Hausverwaltung"</div>
              </div>
              <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${isHausverwaltung ? 'var(--pri)' : 'var(--outline)'}`, background: isHausverwaltung ? 'var(--pri)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {isHausverwaltung && <span className="material-symbols-outlined" style={{ fontSize:14, color:'#fff' }}>check</span>}
              </div>
            </div>
          )}

          {/* Name fields – split by type */}
          {custType === 'firma' ? (
            <div style={{ marginBottom:14 }}>
              <label style={s.fieldLabel}>Firmenname *</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>business</span><input value={companyName} onChange={e=>setCompanyName(e.target.value)} style={s.input}/></div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={s.fieldLabel}>Vorname *</label>
                <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>person</span><input value={firstName} onChange={e=>setFirstName(e.target.value)} style={s.input}/></div>
              </div>
              <div>
                <label style={s.fieldLabel}>Nachname *</label>
                <div className="iw" style={s.inputWrap}><input value={lastName} onChange={e=>setLastName(e.target.value)} style={s.input}/></div>
              </div>
            </div>
          )}
          {/* Firma: Ansprechpartner */}
          {custType === 'firma' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              <div>
                <label style={s.fieldLabel}>Ansprechpartner Vorname</label>
                <div className="iw" style={s.inputWrap}><input value={contactFirstName} onChange={e=>setContactFirstName(e.target.value)} placeholder="Max" style={s.input}/></div>
              </div>
              <div>
                <label style={s.fieldLabel}>Nachname</label>
                <div className="iw" style={s.inputWrap}><input value={contactLastName} onChange={e=>setContactLastName(e.target.value)} placeholder="Mustermann" style={s.input}/></div>
              </div>
            </div>
          )}
          {/* Address */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:10, marginBottom:14 }}>
            <div>
              <label style={s.fieldLabel}>Straße</label>
              <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>location_on</span><input value={streetName} onChange={e=>setStreetName(e.target.value)} style={s.input}/></div>
            </div>
            <div>
              <label style={s.fieldLabel}>Nr.</label>
              <div className="iw" style={s.inputWrap}><input value={streetNumber} onChange={e=>setStreetNumber(e.target.value)} placeholder="12a" style={s.input}/></div>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Adresszusatz</label>
            <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>layers</span><input value={addrSup} onChange={e=>setAddrSup(e.target.value)} placeholder="c/o, Gebäude B, …" style={s.input}/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:10, marginBottom:14, alignItems:'start' }}>
            <div>
              <label style={s.fieldLabel}>PLZ</label>
              <div className="iw" style={s.inputWrap}>
                <input value={postal} onChange={e=>lookupCity(e.target.value)} maxLength={5} style={s.input}/>
                {plzLoading && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
              </div>
            </div>
            <div>
              <label style={s.fieldLabel}>Ort</label>
              <div style={{ ...s.inputWrap, background:cityLocked?'var(--ok-bg)':undefined }}>
                <input value={city} onChange={e=>{setCity(e.target.value);setCityLocked(false)}} style={s.input}/>
                {cityLocked && <span className="material-symbols-outlined icon-sm icon-fill" style={{ color:'var(--ok)' }}>check_circle</span>}
              </div>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Telefon</label>
            <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>phone</span><input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" style={s.input}/></div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>E-Mail</label>
            <div className="iw" style={s.inputWrap}><span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>mail</span><input value={email} onChange={e=>setEmail(e.target.value)} type="email" style={s.input}/></div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={s.fieldLabel}>Vertragsart</label>
            <div className="iw" style={s.inputWrap}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>description</span>
              <select value={contractType} onChange={e=>setContractType(e.target.value as any)} style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', cursor:'pointer' }}>
                <option value="">Keine Angabe</option>
                <option value="jahresvertrag">Jahresvertrag</option>
                <option value="einmalig">Einmalig</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={s.fieldLabel}>Notizen</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} style={{ ...s.input, width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', resize:'vertical', lineHeight:1.6 }}/>
          </div>

          <button onClick={save} disabled={saving} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'save'}</span>
            {saving?'Wird gespeichert…':'Änderungen speichern'}
          </button>
        </div>
    </div>
  )
  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent:'center', padding: isDesktop ? 24 : 0 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width:'100%', maxWidth: isDesktop ? 640 : undefined, borderRadius: isDesktop ? 24 : undefined, overflow:'hidden', boxShadow: isDesktop ? '0 24px 80px rgba(0,0,0,0.3)' : undefined }}>
        {inner}
      </div>
    </div>
  )
}

// ─── Datums-Hilfsfunktionen ──────────────────────────────────────────────────

/** Heutiges Datum als YYYY-MM-DD im lokalen Timezone */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Nächstes Datum für Wochentag (1=Mo, 2=Di, ..., 6=Sa) ab heute */
function getNextWeekdayDate(weekday: number): string {
  const today = new Date()
  const todayDay = today.getDay() // 0=So, 1=Mo, ..., 6=Sa
  let daysUntil = weekday - todayDay
  if (daysUntil < 0) daysUntil += 7
  const result = new Date(today)
  result.setDate(result.getDate() + daysUntil)
  return localDateStr(result)
}

/** Label für Wochentag im Monat, z.B. "1. Montag" */
function getWeekdayInMonthLabel(week: number, weekday: number): string {
  const weekLabels = ['','1.','2.','3.','4.','Letzter']
  const dayLabels  = ['','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
  return `${weekLabels[week]} ${dayLabels[weekday]} im Monat`
}

/** Nächstes Datum für "n-ter Wochentag im Monat" */
function getNextWeekdayInMonth(week: number, weekday: number): string {
  const now   = new Date()
  let   month = now.getMonth()
  let   year  = now.getFullYear()
  for (let i = 0; i < 3; i++) {
    const d = getWeekdayInMonth(year, month, week, weekday)
    if (d >= now) return localDateStr(d)
    month++
    if (month > 11) { month = 0; year++ }
  }
  return localToday()
}

/** Nächstes Datum für Tag des Monats (1-28) */
function getNextDayOfMonth(day: number): string {
  const today = new Date()
  let result = new Date(today.getFullYear(), today.getMonth(), day)
  if (result < today) result = new Date(today.getFullYear(), today.getMonth() + 1, day)
  return localDateStr(result)
}

function generateAssignmentDates(
  interval: string, startDate: string, endDate: string | null,
  _weekday?: number, _dayOfMonth?: number,
  monthlyMode?: string, monthlyWeek?: number, monthlyWeekday?: number
): string[] {
  const dates: string[] = []
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)

  const horizonDays: Record<string, number> = {
    'einmalig':      0,
    'täglich':       90,
    'wöchentlich':   365,
    'zweiwöchentlich':365,
    'monatlich':     730,
    'quartalsweise': 1095,
  }

  if (interval === 'einmalig') return [startDate]

  const horizon = new Date(start)
  horizon.setDate(horizon.getDate() + (horizonDays[interval] ?? 365))

  const limitDate = endDate
    ? (() => { const [ey,em,ed]=endDate.split('-').map(Number); return new Date(Math.min(new Date(ey,em-1,ed).getTime(), horizon.getTime())) })()
    : horizon

  // Monatlich mit Wochentag (z.B. "1. Montag im Monat")
  if (interval === 'monatlich' && monthlyMode === 'weekday' && monthlyWeek && monthlyWeekday) {
    let month = start.getMonth()
    let year  = start.getFullYear()
    while (true) {
      const d = getWeekdayInMonth(year, month, monthlyWeek, monthlyWeekday)
      if (d > limitDate) break
      if (d >= start) dates.push(localDateStr(d))
      month++
      if (month > 11) { month = 0; year++ }
      if (year > start.getFullYear() + 3) break // Safety
    }
    return dates
  }

  let current = new Date(start)
  while (current <= limitDate) {
    dates.push(localDateStr(current))
    if (interval === 'täglich')            current.setDate(current.getDate() + 1)
    else if (interval === 'wöchentlich')   current.setDate(current.getDate() + 7)
    else if (interval === 'zweiwöchentlich') current.setDate(current.getDate() + 14)
    else if (interval === 'monatlich')     current.setMonth(current.getMonth() + 1)
    else if (interval === 'quartalsweise') current.setMonth(current.getMonth() + 3)
    else break
  }

  return dates
}

/** Gibt den n-ten Wochentag eines Monats zurück (week=5 → letzter) */
function getWeekdayInMonth(year: number, month: number, week: number, weekday: number): Date {
  if (week === 5) {
    // Letzter Wochentag im Monat
    const lastDay = new Date(year, month + 1, 0)
    const diff = (weekday - lastDay.getDay() + 7) % 7
    const d = new Date(year, month + 1, 0)
    d.setDate(d.getDate() - (diff === 0 ? 0 : 7 - diff))
    // Sicherstellen dass wir im richtigen Monat sind
    let result = new Date(year, month + 1, 0)
    while (result.getDay() !== weekday) result.setDate(result.getDate() - 1)
    return result
  }
  // n-ter Wochentag
  const first = new Date(year, month, 1)
  let dayOfWeek = first.getDay()
  let offset = (weekday - dayOfWeek + 7) % 7
  const d = new Date(year, month, 1 + offset + (week - 1) * 7)
  return d
}

// ─── ProblemDetailOverlay ─────────────────────────────────────────────────────
function ProblemDetailOverlay({ problem, objects, team, onClose, onResolved, onGoToObject }: {
  problem: Problem
  objects: ObjectItem[]
  team: TeamMember[]
  onClose: () => void
  onResolved: () => void
  onGoToObject: (obj: ObjectItem) => void
}) {
  const [resolving, setResolving] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [newAssignee, setNewAssignee] = useState('')
  const [actionErr, setActionErr] = useState('')

  const obj = objects.find(o => o.id === problem.tasks?.objects?.id) ?? null
  const { tasks, users, report } = problem
  const phone = users?.phone ?? null
  const hasPhotos = (report?.photo_urls?.length ?? 0) > 0

  const intervalLabel: Record<string, string> = {
    täglich: 'Täglich',
    wöchentlich: 'Wöchentlich',
    zweiwöchentlich: 'Zweiwöchentlich',
    monatlich: 'Monatlich',
    quartalsweise: 'Quartalsweise',
    einmalig: 'Einmalig',
  }

  const markResolved = async () => {
    setResolving(true); setActionErr('')
    const { error } = await supabase
      .from('task_assignments')
      .update({ status: 'erledigt' })
      .eq('id', problem.id)
    if (error) { setActionErr(error.message); setResolving(false); return }
    onResolved()
  }

  const doReassign = async () => {
    if (!newAssignee) return
    setReassigning(true); setActionErr('')
    const { error } = await supabase
      .from('task_assignments')
      .update({ user_id: newAssignee, status: 'offen' })
      .eq('id', problem.id)
    if (error) { setActionErr(error.message); setReassigning(false); return }
    onResolved()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', flexDirection:'column', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--err)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Problem</div>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', lineHeight:1.2 }}>{tasks?.title ?? '–'}</div>
        </div>
        <div style={{ fontSize:12, color:'var(--err)', fontWeight:700, background:'#ffdad6', padding:'4px 10px', borderRadius:20 }}>
          {new Date(problem.due_date).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' })}
        </div>
      </div>

      {/* Scrollable Body */}
      <div style={{ height:0, flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:14 }}>

        {/* Objekt */}
        {tasks?.objects && (
          <div style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'var(--pri-bg)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span className="material-symbols-outlined" style={{ fontSize:20, color:'var(--pri)' }}>apartment</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Objekt</div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{tasks.objects.address}</div>
              <div style={{ fontSize:12, color:'var(--txt-sec)' }}>{tasks.objects.postal_code} {tasks.objects.city}</div>
            </div>
            {obj && (
              <button onClick={() => onGoToObject(obj)} style={{ background:'var(--surf-low)', border:'none', borderRadius:10, padding:'8px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'var(--pri)', fontSize:12, fontWeight:700 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>open_in_new</span>
                Objekt
              </button>
            )}
          </div>
        )}

        {/* Aufgaben-Info */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Aufgabe</div>
          {tasks?.description && (
            <div style={{ fontSize:14, color:'var(--txt)', lineHeight:1.5, marginBottom:8 }}>{tasks.description}</div>
          )}
          {tasks?.interval && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'var(--surf-low)', borderRadius:8, padding:'4px 10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:14, color:'var(--txt-muted)' }}>repeat</span>
              <span style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:600 }}>{intervalLabel[tasks.interval] ?? tasks.interval}</span>
            </div>
          )}
        </div>

        {/* Mitarbeiter */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Mitarbeiter</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)' }}>
                {(users?.full_name ?? '?')[0].toUpperCase()}
              </span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--txt)' }}>{users?.full_name ?? '–'}</div>
              {phone
                ? <div style={{ fontSize:13, color:'var(--txt-sec)', marginTop:2 }}>{phone}</div>
                : <div style={{ fontSize:12, color:'var(--txt-muted)', fontStyle:'italic', marginTop:2 }}>Keine Nummer hinterlegt</div>
              }
            </div>
            {phone && (
              <a href={`tel:${phone}`} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'#e6f4f1', border:'none', borderRadius:12, padding:'10px 16px', cursor:'pointer', color:'var(--pri)', fontSize:13, fontWeight:700, textDecoration:'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>call</span>
                Anrufen
              </a>
            )}
          </div>
          {phone && (
            <a href={`sms:${phone}`} style={{ marginTop:10, display:'flex', alignItems:'center', gap:6, background:'var(--surf-low)', borderRadius:10, padding:'10px 14px', textDecoration:'none', color:'var(--txt)' }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>sms</span>
              <span style={{ fontSize:13, fontWeight:600 }}>SMS schreiben</span>
              <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--txt-muted)', marginLeft:'auto' }}>open_in_new</span>
            </a>
          )}
        </div>

        {/* Mitarbeiter-Meldung */}
        {(report?.note || hasPhotos) && (
          <div style={{ background:'#fff8f0', border:'1px solid #ffe0b2', borderRadius:16, padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#e65100', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>assignment_late</span>
              Meldung des Mitarbeiters
            </div>
            {report?.note && (
              <div style={{ fontSize:14, color:'var(--txt)', lineHeight:1.5, marginBottom: hasPhotos ? 12 : 0 }}>"{report.note}"</div>
            )}
            {hasPhotos && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {(report!.photo_urls ?? []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Foto ${i+1}`} style={{ width:80, height:80, objectFit:'cover', borderRadius:10, border:'2px solid #ffe0b2' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Neu zuweisen */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Neu zuweisen</div>
          <div style={{ display:'flex', gap:8 }}>
            <select
              value={newAssignee}
              onChange={e => setNewAssignee(e.target.value)}
              style={{ flex:1, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)' }}
            >
              <option value="">Mitarbeiter wählen…</option>
              {team.map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
            <button
              onClick={doReassign}
              disabled={!newAssignee || reassigning}
              style={{ padding:'10px 16px', borderRadius:10, border:'none', background: newAssignee ? 'var(--pri)' : 'var(--outline)', color: newAssignee ? '#fff' : 'var(--txt-muted)', fontSize:13, fontWeight:700, cursor: newAssignee ? 'pointer' : 'default', display:'flex', alignItems:'center', gap:6 }}
            >
              {reassigning
                ? <span className="material-symbols-outlined" style={{ fontSize:16 }}>hourglass_empty</span>
                : <span className="material-symbols-outlined" style={{ fontSize:16 }}>person_add</span>
              }
              {reassigning ? '…' : 'Zuweisen'}
            </button>
          </div>
        </div>

        {actionErr && (
          <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'10px 14px', fontSize:13, display:'flex', gap:8 }}>
            <span className="material-symbols-outlined icon-sm">error</span>{actionErr}
          </div>
        )}
      </div>

      {/* Footer Action */}
      <div style={{ padding:'16px 20px', borderTop:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button
          onClick={markResolved}
          disabled={resolving}
          style={{ width:'100%', padding:16, borderRadius:16, border:'none', background:'linear-gradient(135deg,#1a6b35 0%,#2d9e55 100%)', color:'#fff', fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, boxShadow:'0 4px 16px rgba(26,107,53,0.3)' }}
        >
          {resolving
            ? <><span className="material-symbols-outlined">hourglass_empty</span> Wird gespeichert…</>
            : <><span className="material-symbols-outlined icon-fill">check_circle</span> Als erledigt markieren</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── PageOverlay helper ──────────────────────────────────────────────────────
// Wraps full-page overlays: full-screen on mobile, centered modal on desktop
// On mobile: swipe from left edge (≤50px) to go back
function PageOverlay({ isDesktop, onClose, wide, children }: { isDesktop: boolean; onClose?: () => void; wide?: boolean; children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const sw = useRef<{ x0: number; y0: number; active: boolean; dx: number } | null>(null)

  if (isDesktop) {
    return (
      <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', padding:24 }} onClick={onClose}>
        <div style={{ width:'100%', maxWidth: wide ? 860 : 680, height:'92dvh', background:'var(--bg)', borderRadius:24, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)', alignSelf:'center' }} onClick={e=>e.stopPropagation()}>
          {children}
        </div>
      </div>
    )
  }

  const onTS = (e: React.TouchEvent) => {
    if (!onClose) return
    const t = e.touches[0]
    if (t.clientX > 50) return
    sw.current = { x0: t.clientX, y0: t.clientY, active: true, dx: 0 }
  }

  const onTM = (e: React.TouchEvent) => {
    if (!sw.current?.active || !overlayRef.current) return
    const t = e.touches[0]
    const dx = t.clientX - sw.current.x0
    const dy = Math.abs(t.clientY - sw.current.y0)
    if (dy > 50 || dx <= 0) { sw.current.active = false; overlayRef.current.style.cssText = ''; return }
    sw.current.dx = dx
    overlayRef.current.style.transform = `translateX(${dx}px)`
    overlayRef.current.style.transition = 'none'
    overlayRef.current.style.boxShadow = `-${dx * 0.03}px 0 ${dx * 0.15}px rgba(0,0,0,0.12)`
  }

  const onTE = () => {
    if (!sw.current?.active || !overlayRef.current) { sw.current = null; return }
    const dx = sw.current.dx
    sw.current = null
    const el = overlayRef.current
    el.style.transition = 'transform 0.26s cubic-bezier(0.4,0,0.2,1)'
    if (dx > window.innerWidth * 0.35) {
      el.style.transform = 'translateX(105%)'
      setTimeout(() => onClose?.(), 240)
    } else {
      el.style.transform = ''
      el.style.boxShadow = ''
    }
  }

  return (
    <div
      ref={overlayRef}
      onTouchStart={onTS}
      onTouchMove={onTM}
      onTouchEnd={onTE}
      onTouchCancel={onTE}
      style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', flexDirection:'column', background:'var(--bg)', willChange:'transform' }}
    >
      {children}
    </div>
  )
}

// ─── InviteOverlay ────────────────────────────────────────────────────────────
function InviteOverlay({ inviteMode, setInviteMode, inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviting, inviteMsg, sendInvite, linkRole, setLinkRole, linkLoading, generatedLink, setGeneratedLink, setInviteMsg, generateInviteLink, copyLink, copyDone, manualFirstName, setManualFirstName, manualLastName, setManualLastName, manualEmail, setManualEmail, manualPhone, setManualPhone, manualRole, setManualRole, manualLoading, manualResult, manualPwCopied, manualErr, createUserManual, copyManualPw, onNewManual, isDesktop, onClose }: {
  inviteMode: 'email'|'link'|'manuell'; setInviteMode: (m:'email'|'link'|'manuell') => void
  inviteEmail: string; setInviteEmail: (v:string) => void
  inviteRole: string; setInviteRole: (v:string) => void
  inviting: boolean; inviteMsg: {ok:boolean;text:string}|null
  sendInvite: (e: React.FormEvent) => void
  linkRole: string; setLinkRole: (v:string) => void
  linkLoading: boolean; generatedLink: string
  setGeneratedLink: (v:string) => void; setInviteMsg: (v:{ok:boolean;text:string}|null) => void
  generateInviteLink: () => void; copyLink: () => void; copyDone: boolean
  manualFirstName: string; setManualFirstName: (v:string) => void
  manualLastName: string;  setManualLastName:  (v:string) => void
  manualEmail: string;     setManualEmail:     (v:string) => void
  manualPhone: string;     setManualPhone:     (v:string) => void
  manualRole: string;      setManualRole:      (v:string) => void
  manualLoading: boolean
  manualResult: {fullName:string;tempPassword:string}|null
  manualPwCopied: boolean
  manualErr: string
  createUserManual: (e: React.FormEvent) => void
  copyManualPw: (pw:string) => void
  onNewManual: () => void
  isDesktop: boolean
  onClose: () => void
}) {
  const STEUBER_DOMAIN = 'steuber-work.de'

  const toEmailPrefix = (first: string, last: string) => {
    const clean = (s: string) => s.toLowerCase()
      .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]/g,'.').replace(/\.+/g,'.').replace(/^\.|\.$/, '')
    const f = clean(first.trim()), l = clean(last.trim())
    return f && l ? `${f}.${l}` : f || l
  }

  const [emailAutoGenerated, setEmailAutoGenerated] = useState(true)
  useEffect(() => { if (!manualFirstName && !manualLastName) setEmailAutoGenerated(true) }, [manualFirstName, manualLastName])

  const emailPrefix = manualEmail.includes('@') ? manualEmail.split('@')[0] : manualEmail
  const setEmailPrefix = (prefix: string) => {
    setEmailAutoGenerated(false)
    setManualEmail(prefix ? `${prefix}@${STEUBER_DOMAIN}` : '')
  }

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Team</div>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>Mitarbeiter einladen</div>
        </div>
      </div>

      <div style={{ height:0, flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
        <p style={{ fontSize:14, color:'var(--txt-sec)', lineHeight:1.5, margin:0 }}>
          {inviteMode === 'manuell'
            ? 'Konto wird direkt angelegt. Das temporäre Passwort bitte sicher übermitteln.'
            : 'Der neue Mitarbeiter richtet sein Konto selbst ein und trägt seine persönlichen Daten ein.'}
        </p>

        {/* Modus-Umschalter */}
        <div style={{ display:'flex', gap:6, background:'var(--surf-low)', borderRadius:14, padding:4 }}>
          {([
            { mode:'email'   as const, icon:'mail',         label:'Per E-Mail' },
            { mode:'link'    as const, icon:'link',         label:'Per Link'   },
            { mode:'manuell' as const, icon:'person_add',   label:'Manuell'    },
          ]).map(({ mode, icon, label }) => (
            <button key={mode} type="button" onClick={() => { setInviteMode(mode); setInviteMsg(null); setGeneratedLink('') }}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'10px 0', borderRadius:11, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all 0.15s',
                background: inviteMode===mode ? 'var(--surf-card)' : 'transparent',
                color:      inviteMode===mode ? 'var(--pri)'       : 'var(--txt-muted)',
                boxShadow:  inviteMode===mode ? '0 1px 6px rgba(0,0,0,0.08)' : 'none',
              }}>
              <span className="material-symbols-outlined icon-sm">{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* E-Mail */}
        {inviteMode === 'email' && (
          <form onSubmit={sendInvite} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>E-Mail-Adresse</label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>mail</span>
                <input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="a.schmidt@beispiel.de" required style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
              </div>
              <p style={{ fontSize:12, color:'var(--txt-muted)', marginTop:6, lineHeight:1.5 }}>MA erhält eine E-Mail mit Einrichtungslink und trägt dann seine Daten selbst ein.</p>
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Rolle</label>
              <div style={{ display:'flex', gap:8 }}>
                {([{val:'mitarbeiter',icon:'person',label:'Mitarbeiter'},{val:'objektleiter',icon:'manage_accounts',label:'Objektleiter'},{val:'admin',icon:'admin_panel_settings',label:'Admin'},{val:'support',icon:'support_agent',label:'Support'}] as const).map(r=>(
                  <div key={r.val} onClick={()=>setInviteRole(r.val)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 6px', borderRadius:12, border:`1.5px solid ${inviteRole===r.val?'var(--pri)':'var(--outline)'}`, background:inviteRole===r.val?'var(--pri-xl)':'var(--surf-low)', cursor:'pointer', transition:'all 0.15s' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color:inviteRole===r.val?'var(--pri)':'var(--txt-muted)' }}>{r.icon}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:inviteRole===r.val?'var(--pri)':'var(--txt-muted)', textAlign:'center' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {inviteMsg && <div style={{ background:inviteMsg.ok?'var(--ok-bg)':'var(--err-bg)', color:inviteMsg.ok?'var(--ok)':'var(--err)', borderRadius:12, padding:'12px 14px', fontSize:13, display:'flex', gap:8 }}>
              <span className="material-symbols-outlined icon-sm icon-fill">{inviteMsg.ok?'check_circle':'error'}</span>{inviteMsg.text}
            </div>}
            <button type="submit" disabled={inviting} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:16, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(9,106,112,0.25)' }}>
              <span className="material-symbols-outlined icon-sm">{inviting?'hourglass_empty':'send'}</span>
              {inviting?'Wird gesendet...':'Einladungs-E-Mail senden'}
            </button>
          </form>
        )}

        {/* Link */}
        {inviteMode === 'link' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'12px 14px', fontSize:13, color:'var(--txt-sec)', lineHeight:1.6 }}>
              <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)', verticalAlign:'middle', marginRight:6 }}>info</span>
              Link ist 7 Tage gültig und kann nur einmal verwendet werden. Teile ihn z.B. per WhatsApp.
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Rolle</label>
              <div style={{ display:'flex', gap:8 }}>
                {([{val:'mitarbeiter',icon:'person',label:'Mitarbeiter'},{val:'objektleiter',icon:'manage_accounts',label:'Objektleiter'},{val:'support',icon:'support_agent',label:'Support'}] as const).map(r=>(
                  <div key={r.val} onClick={()=>setLinkRole(r.val)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 6px', borderRadius:12, border:`1.5px solid ${linkRole===r.val?'var(--pri)':'var(--outline)'}`, background:linkRole===r.val?'var(--pri-xl)':'var(--surf-low)', cursor:'pointer', transition:'all 0.15s' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:20, color:linkRole===r.val?'var(--pri)':'var(--txt-muted)' }}>{r.icon}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:linkRole===r.val?'var(--pri)':'var(--txt-muted)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {inviteMsg && !generatedLink && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:12, padding:'12px 14px', fontSize:13, display:'flex', gap:8 }}>
              <span className="material-symbols-outlined icon-sm icon-fill">error</span>{inviteMsg.text}
            </div>}
            {!generatedLink ? (
              <button type="button" onClick={generateInviteLink} disabled={linkLoading} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:16, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(9,106,112,0.25)' }}>
                <span className="material-symbols-outlined icon-sm">{linkLoading?'hourglass_empty':'add_link'}</span>
                {linkLoading?'Wird generiert...':'Einladungslink generieren'}
              </button>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-start', background:'var(--ok-bg)', border:'1.5px solid var(--ok)', borderRadius:14, padding:'12px 14px' }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--ok)', flexShrink:0, marginTop:1 }}>link</span>
                  <span style={{ flex:1, fontSize:12, color:'var(--txt)', wordBreak:'break-all', lineHeight:1.5 }}>{generatedLink}</span>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={copyLink} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:14, borderRadius:14, border:'none', background: copyDone ? 'var(--ok)' : 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                    <span className="material-symbols-outlined icon-sm">{copyDone?'check':'content_copy'}</span>
                    {copyDone ? 'Kopiert!' : 'Link kopieren'}
                  </button>
                  <button type="button" onClick={() => { setGeneratedLink(''); setInviteMsg(null) }} style={{ padding:'12px 16px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <span className="material-symbols-outlined icon-sm">refresh</span>Neu
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Manuell ── */}
        {inviteMode === 'manuell' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {manualResult ? (
              /* ── Erfolg: Passwort anzeigen ── */
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'20px 16px', background:'var(--ok-bg)', border:'1.5px solid var(--ok)', borderRadius:16 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:36, color:'var(--ok)' }}>check_circle</span>
                  <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>{manualResult.fullName} angelegt!</div>
                  <div style={{ fontSize:12, color:'var(--txt-sec)', textAlign:'center', lineHeight:1.5 }}>Bitte das temporäre Passwort sicher übermitteln. Es wird nur einmal angezeigt.</div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Temporäres Passwort</label>
                  <div style={{ display:'flex', gap:8, alignItems:'center', padding:'14px 16px', background:'var(--surf-low)', borderRadius:14, border:'1.5px solid var(--outline)' }}>
                    <span style={{ flex:1, fontSize:18, fontWeight:800, fontFamily:'monospace', letterSpacing:'0.1em', color:'var(--txt)' }}>{manualResult.tempPassword}</span>
                    <button type="button" onClick={() => copyManualPw(manualResult!.tempPassword)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'none', background: manualPwCopied ? 'var(--ok)' : 'var(--pri)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                      <span className="material-symbols-outlined icon-sm">{manualPwCopied ? 'check' : 'content_copy'}</span>
                      {manualPwCopied ? 'Kopiert' : 'Kopieren'}
                    </button>
                  </div>
                </div>
                <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'10px 14px', fontSize:12, color:'var(--txt-muted)', lineHeight:1.6, display:'flex', gap:8 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--err)', flexShrink:0, marginTop:1 }}>warning</span>
                  Der MA sollte das Passwort nach dem ersten Login sofort ändern.
                </div>
                <button type="button" onClick={onNewManual} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:14, borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  <span className="material-symbols-outlined icon-sm">person_add</span>
                  Weiteren Mitarbeiter anlegen
                </button>
              </div>
            ) : (
              /* ── Formular ── */
              <form onSubmit={createUserManual} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Vorname *</label>
                    <input value={manualFirstName} onChange={e=>{
                        const v=e.target.value; setManualFirstName(v)
                        if(emailAutoGenerated){const p=toEmailPrefix(v,manualLastName);setManualEmail(p?`${p}@${STEUBER_DOMAIN}`:'')}
                      }} placeholder="Anna" required
                      style={{ width:'100%', boxSizing:'border-box', padding:'11px 12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:15, color:'var(--txt)', outline:'none' }}/>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Nachname *</label>
                    <input value={manualLastName} onChange={e=>{
                        const v=e.target.value; setManualLastName(v)
                        if(emailAutoGenerated){const p=toEmailPrefix(manualFirstName,v);setManualEmail(p?`${p}@${STEUBER_DOMAIN}`:'')}
                      }} placeholder="Schmidt" required
                      style={{ width:'100%', boxSizing:'border-box', padding:'11px 12px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:15, color:'var(--txt)', outline:'none' }}/>
                  </div>
                </div>
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>E-Mail *</label>
                    {emailAutoGenerated && emailPrefix && (
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--ok)', background:'var(--ok-bg)', borderRadius:20, padding:'2px 8px', display:'flex', alignItems:'center', gap:3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:12, fontVariationSettings:"'FILL' 1" }}>auto_awesome</span>Auto-generiert
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', overflow:'hidden' }}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)', marginLeft:12, flexShrink:0 }}>mail</span>
                    <input
                      value={emailPrefix}
                      onChange={e=>setEmailPrefix(e.target.value)}
                      placeholder="anna.schmidt"
                      required
                      style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', padding:'12px 8px', minWidth:0 }}
                    />
                    <span style={{ fontSize:13, color:'var(--txt-muted)', fontWeight:600, background:'var(--surf-card)', padding:'0 12px', alignSelf:'stretch', display:'flex', alignItems:'center', borderLeft:'1px solid var(--outline)', flexShrink:0, whiteSpace:'nowrap' }}>
                      @{STEUBER_DOMAIN}
                    </span>
                  </div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Telefon</label>
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
                    <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>phone</span>
                    <input type="tel" value={manualPhone} onChange={e=>setManualPhone(e.target.value)} placeholder="+49 151 12345678"
                      style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }}/>
                  </div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Rolle *</label>
                  <div style={{ display:'flex', gap:8 }}>
                    {([{val:'mitarbeiter',icon:'person',label:'Mitarbeiter'},{val:'objektleiter',icon:'manage_accounts',label:'Objektleiter'},{val:'admin',icon:'admin_panel_settings',label:'Admin'},{val:'support',icon:'support_agent',label:'Support'}] as const).map(r=>(
                      <div key={r.val} onClick={()=>setManualRole(r.val)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 6px', borderRadius:12, border:`1.5px solid ${manualRole===r.val?'var(--pri)':'var(--outline)'}`, background:manualRole===r.val?'var(--pri-xl)':'var(--surf-low)', cursor:'pointer', transition:'all 0.15s' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:20, color:manualRole===r.val?'var(--pri)':'var(--txt-muted)' }}>{r.icon}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:manualRole===r.val?'var(--pri)':'var(--txt-muted)', textAlign:'center' }}>{r.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {manualErr && (
                  <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:12, padding:'12px 14px', fontSize:13, display:'flex', gap:8 }}>
                    <span className="material-symbols-outlined icon-sm icon-fill">error</span>{manualErr}
                  </div>
                )}
                <button type="submit" disabled={manualLoading} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:16, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(9,106,112,0.25)' }}>
                  <span className="material-symbols-outlined icon-sm">{manualLoading?'hourglass_empty':'person_add'}</span>
                  {manualLoading ? 'Wird angelegt…' : 'Mitarbeiter anlegen'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </PageOverlay>
  )
}

// ─── MemberDetailOverlay ──────────────────────────────────────────────────────
const WEEKDAYS = [
  { key:'mo', label:'Mo' }, { key:'di', label:'Di' }, { key:'mi', label:'Mi' },
  { key:'do', label:'Do' }, { key:'fr', label:'Fr' }, { key:'sa', label:'Sa' },
]

function MemberDetailOverlay({ member, onClose, onUpdated, onToggleActive, isDesktop }: {
  member: TeamMember
  onClose: () => void
  onUpdated: (updated: Partial<TeamMember>) => void
  onToggleActive: () => void
  isDesktop: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  // Editable fields
  const [employedSince, setEmployedSince] = useState(member.employed_since ?? '')
  const [workDays, setWorkDays] = useState<string[]>(member.work_days ?? [])
  const [hoursPerWeek, setHoursPerWeek] = useState<string>(member.work_hours_per_week?.toString() ?? '')
  const [hoursType, setHoursType] = useState<'fest'|'variabel'>(member.work_hours_type ?? 'fest')
  const [hourlyWage, setHourlyWage] = useState<string>(member.hourly_wage?.toString() ?? '')
  const [vacationDays, setVacationDays] = useState<string>(member.vacation_days_per_year?.toString() ?? '30')
  const [editMode, setEditMode] = useState(!member.admin_setup_done)
  const [saveErr, setSaveErr] = useState('')

  // XLSX Export
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportMonth, setExportMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    const [year, month] = exportMonth.split('-').map(Number)
    const fromDate = `${year}-${String(month).padStart(2,'0')}-01`
    const toDate   = new Date(year, month, 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('task_assignments')
      .select('id,due_date,status,tasks(title,categories(name,emoji),objects(name,address)),task_reports(note,photo_urls)')
      .eq('user_id', member.id)
      .eq('status', 'erledigt')
      .gte('due_date', fromDate)
      .lte('due_date', toDate)
      .order('due_date')

    const wage = member.hourly_wage ?? 0
    const rows = (data ?? []).map((a: any, i: number) => ({
      'Nr':           i + 1,
      'Datum':        new Date(a.due_date).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'}),
      'Aufgabe':      a.tasks?.title ?? '–',
      'Kategorie':    a.tasks?.categories ? `${a.tasks.categories.emoji} ${a.tasks.categories.name}` : '–',
      'Objekt':       a.tasks?.objects?.name ?? a.tasks?.objects?.address ?? '–',
      'Notiz':        a.task_reports?.[0]?.note ?? '',
      'Status':       'erledigt',
      'Stundenlohn':  wage > 0 ? wage : '–',
    }))

    if (rows.length === 0) {
      alert('Keine erledigten Aufgaben in diesem Monat gefunden.')
      setExporting(false)
      return
    }

    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      {wch:4},{wch:12},{wch:35},{wch:22},{wch:28},{wch:30},{wch:10},{wch:12}
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Arbeitszeitnachweis')

    const monthName = new Date(year, month-1, 1).toLocaleDateString('de-DE',{month:'long',year:'numeric'})
    const safeName  = member.full_name.replace(/\s+/g, '_')
    XLSX.writeFile(wb, `Arbeitszeitnachweis_${safeName}_${monthName}.xlsx`)
    setExporting(false)
    setShowExportModal(false)
  }

  // Role management
  const [currentRole, setCurrentRole] = useState(member.role_name ?? 'mitarbeiter')
  const [roleChanging, setRoleChanging] = useState(false)
  const [roleMsg, setRoleMsg] = useState<{ok:boolean;text:string}|null>(null)

  const handleRoleChange = async (newRole: 'admin'|'mitarbeiter'|'objektleiter'|'support') => {
    if (newRole === currentRole) return
    setRoleChanging(true); setRoleMsg(null)
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', newRole).single()
    if (!roleRow) { setRoleMsg({ok:false,text:'Rolle nicht gefunden'}); setRoleChanging(false); return }
    const { error } = await supabase.from('users').update({ role_id: roleRow.id }).eq('id', member.id)
    if (error) { setRoleMsg({ok:false, text:error.message}); setRoleChanging(false); return }
    setCurrentRole(newRole)
    onUpdated({ role_id: roleRow.id, role_name: newRole } as any)
    setRoleMsg({ok:true, text:`Rolle auf „${newRole === 'admin' ? 'Administrator' : 'Mitarbeiter'}" geändert`})
    setTimeout(() => setRoleMsg(null), 3000)
    setRoleChanging(false)
  }

  const ini = member.full_name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
  const role = member.role_name ?? 'mitarbeiter'
  const roleLabel: Record<string,string> = { admin:'Administrator', objektleiter:'Objektleiter', mitarbeiter:'Mitarbeiter', support:'Support' }
  const roleColor: Record<string,string> = { admin:'#7c3aed', objektleiter:'#0369a1', mitarbeiter:'var(--pri)', support:'#dc2626' }
  const roleBg: Record<string,string>    = { admin:'#f3e8ff', objektleiter:'#e0f2fe', mitarbeiter:'var(--pri-xl)', support:'#fef2f2' }

  const toggleDay = (key: string) =>
    setWorkDays(prev => prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key])

  const handleSave = async () => {
    setSaving(true); setSaveErr('')
    const { error } = await supabase.from('users').update({
      employed_since:       employedSince || null,
      work_days:            workDays.length > 0 ? workDays : null,
      work_hours_per_week:  hoursType === 'fest' && hoursPerWeek ? parseInt(hoursPerWeek) : null,
      work_hours_type:      hoursType,
      hourly_wage:          hourlyWage ? parseFloat(hourlyWage) : null,
      vacation_days_per_year: vacationDays ? parseInt(vacationDays) : 30,
      admin_setup_done:     true,
    }).eq('id', member.id)
    if (error) { setSaveErr(error.message); setSaving(false); return }
    onUpdated({ employed_since: employedSince || null, work_days: workDays.length > 0 ? workDays : null, work_hours_per_week: hoursType === 'fest' && hoursPerWeek ? parseInt(hoursPerWeek) : null, work_hours_type: hoursType, hourly_wage: hourlyWage ? parseFloat(hourlyWage) : null, vacation_days_per_year: vacationDays ? parseInt(vacationDays) : 30, admin_setup_done: true } as any)
    setEditMode(false)
    setSaving(false)
  }

  const memberSince = member.created_at
    ? new Date(member.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' })
    : '–'

  // ── MA-Stats for admin view ──
  const [maLeaves, setMaLeaves] = useState<any[]>([])
  const [maStatsYear, setMaStatsYear] = useState<number>(new Date().getFullYear())
  const [maStatsMonth, setMaStatsMonth] = useState<number|null>(null)
  const [maDoneCount, setMaDoneCount] = useState<number>(0)

  useEffect(() => {
    const fetchMaData = async () => {
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', member.id)
        .order('from_date', { ascending: false })
      setMaLeaves(leaves ?? [])

      const { count } = await supabase
        .from('task_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', member.id)
        .eq('status', 'erledigt')
      setMaDoneCount(count ?? 0)
    }
    fetchMaData()
  }, [member.id])

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Mitarbeiter</div>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>{member.full_name}</div>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          title="Arbeitszeitnachweis exportieren"
          style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, padding:'8px 10px', cursor:'pointer', color:'var(--txt)', display:'flex', alignItems:'center', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:18 }}>download</span>
        </button>
        {member.admin_setup_done && (
          <button onClick={() => { setEditMode(e => !e); setSaveErr('') }}
            style={{ background: editMode ? 'var(--pri)' : 'var(--surf-low)', border:'none', borderRadius:10, padding:'8px 14px', cursor:'pointer', color: editMode ? '#fff' : 'var(--txt)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16 }}>{editMode ? 'close' : 'edit'}</span>
            {editMode ? 'Abbrechen' : 'Bearbeiten'}
          </button>
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'flex-end' }}
          onClick={() => setShowExportModal(false)}>
          <div style={{ width:'100%', maxWidth:520, margin:'0 auto', background:'var(--bg)', borderRadius:'24px 24px 0 0', padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>Arbeitszeitnachweis</div>
                <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:2 }}>{member.full_name}</div>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt-muted)' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Monat</label>
              <input
                type="month"
                value={exportMonth}
                onChange={e => setExportMonth(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:15, color:'var(--txt)', outline:'none', cursor:'pointer' }}
              />
            </div>
            {member.hourly_wage && (
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:20, padding:'10px 14px', borderRadius:12, background:'var(--pri-xl)', border:'1px solid var(--pri)' }}>
                <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--pri)' }}>euro</span>
                <span style={{ fontSize:13, color:'var(--pri)', fontWeight:600 }}>Stundenlohn: {member.hourly_wage} €/Std wird im Export ausgewiesen</span>
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowExportModal(false)}
                style={{ flex:1, padding:14, borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={handleExport} disabled={exporting}
                style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(9,106,112,0.25)', opacity: exporting ? 0.7 : 1 }}>
                <span className="material-symbols-outlined icon-sm">{exporting ? 'hourglass_empty' : 'file_download'}</span>
                {exporting ? 'Wird erstellt…' : 'XLSX exportieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ height:0, flex:1, overflowY:'auto', padding:20 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* Setup-Banner */}
        {!member.admin_setup_done && (
          <div style={{ display:'flex', gap:10, padding:'12px 14px', borderRadius:14, background:'#e8f5e9', border:'1px solid #a5d6a7', alignItems:'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize:20, color:'#2e7d32', flexShrink:0, marginTop:1 }}>person_check</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#2e7d32' }}>Neuer Mitarbeiter · Setup erforderlich</div>
              <div style={{ fontSize:12, color:'#388e3c', marginTop:2, lineHeight:1.5 }}>Bitte hinterlege Beschäftigungsdaten und Stundenlohn, um das Onboarding abzuschließen.</div>
            </div>
          </div>
        )}

        {/* Hero */}
        <div style={{ background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', borderRadius:20, padding:'24px 20px', display:'flex', alignItems:'center', gap:16, boxShadow:'0 8px 24px rgba(9,106,112,0.2)' }}>
          <div style={{ width:60, height:60, borderRadius:18, background:'rgba(255,255,255,0.2)', border:'2px solid rgba(255,255,255,0.35)', color:'#fff', fontSize:22, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-head)', flexShrink:0 }}>{ini}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:'var(--font-head)' }}>{member.full_name}</div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:5, background:'rgba(255,255,255,0.18)', borderRadius:20, padding:'3px 10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:13, color:'rgba(255,255,255,0.9)' }}>badge</span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:700 }}>{roleLabel[role]??role}</span>
            </div>
          </div>
          <span style={{ fontSize:12, fontWeight:700, color: member.is_active ? 'var(--ok)' : '#fff', background: member.is_active ? 'var(--ok-bg)' : 'rgba(255,255,255,0.2)', borderRadius:20, padding:'5px 12px', flexShrink:0 }}>
            {member.is_active ? '● Aktiv' : '○ Inaktiv'}
          </span>
        </div>

        {/* Kontakt */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
          <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>Kontakt</div>
          {member.phone ? (
            <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--outline)' }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>phone</span>
              <span style={{ flex:1, fontSize:14, color:'var(--txt)' }}>{member.phone}</span>
              <div style={{ display:'flex', gap:8 }}>
                <a href={`tel:${member.phone}`} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--pri-xl)', color:'var(--pri)', borderRadius:8, padding:'6px 10px', textDecoration:'none', fontSize:12, fontWeight:700 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:15 }}>call</span>Anrufen
                </a>
                <a href={`sms:${member.phone}`} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--surf-low)', color:'var(--txt)', borderRadius:8, padding:'6px 10px', textDecoration:'none', fontSize:12, fontWeight:700 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:15 }}>sms</span>SMS
                </a>
              </div>
            </div>
          ) : (
            <div style={{ padding:'12px 16px', fontSize:13, color:'var(--txt-muted)', fontStyle:'italic', borderBottom:'1px solid var(--outline)' }}>Keine Telefonnummer hinterlegt</div>
          )}
          {(member.street || member.city) && (
            <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>home</span>
              <span style={{ fontSize:14, color:'var(--txt)' }}>
                {[member.street, member.postal_code && member.city ? `${member.postal_code} ${member.city}` : member.city].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Im Unternehmen */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
          <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>Beschäftigung</span>
            {!editMode && <span style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:400, textTransform:'none' }}>Konto seit {memberSince}</span>}
          </div>

          {editMode ? (
            <div style={{ padding:'20px 18px', display:'flex', flexDirection:'column', gap:20 }}>

              {/* Beschäftigt seit */}
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Beschäftigt seit</label>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>event</span>
                  <input type="date" value={employedSince} onChange={e => setEmployedSince(e.target.value)}
                    style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)', fontFamily:'var(--font-body)', minWidth:0 }} />
                </div>
              </div>

              {/* Arbeitstage */}
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Arbeitstage</label>
                <div style={{ display:'flex', gap:6 }}>
                  {WEEKDAYS.map(({key, label}) => (
                    <button key={key} type="button" onClick={() => toggleDay(key)}
                      style={{ flex:1, padding:'10px 0', borderRadius:12, border:`1.5px solid ${workDays.includes(key)?'var(--pri)':'var(--outline)'}`, background: workDays.includes(key)?'var(--pri)':'var(--surf-card)', color: workDays.includes(key)?'#fff':'var(--txt-muted)', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Arbeitsstunden */}
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Arbeitsstunden</label>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  {(['fest','variabel'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setHoursType(t)}
                      style={{ flex:1, padding:'11px 0', borderRadius:12, border:`1.5px solid ${hoursType===t?'var(--pri)':'var(--outline)'}`, background:hoursType===t?'var(--pri-xl)':'var(--surf-card)', color:hoursType===t?'var(--pri)':'var(--txt-muted)', fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:16 }}>{t === 'fest' ? 'schedule' : 'swap_vert'}</span>
                      {t === 'fest' ? 'Fest' : 'Variabel'}
                    </button>
                  ))}
                </div>
                {hoursType === 'fest' && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>schedule</span>
                    <input type="number" min="1" max="60" value={hoursPerWeek} onChange={e => setHoursPerWeek(e.target.value)}
                      placeholder="40" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, fontWeight:600, color:'var(--txt)', fontFamily:'var(--font-body)', minWidth:0 }} />
                    <span style={{ fontSize:13, color:'var(--txt-muted)', flexShrink:0 }}>Std/Woche</span>
                  </div>
                )}
                {hoursType === 'variabel' && (
                  <div style={{ fontSize:12, color:'var(--txt-muted)', padding:'10px 14px', borderRadius:12, background:'var(--surf-low)', border:'1px solid var(--outline)' }}>
                    Stunden werden flexibel erfasst – kein festes Wochenkontingent.
                  </div>
                )}
              </div>

              {/* Stundenlohn + Urlaubstage nebeneinander */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Stundenlohn</label>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:17, color:'var(--txt-muted)', flexShrink:0 }}>euro</span>
                    <input type="number" min="0" step="0.01" value={hourlyWage} onChange={e => setHourlyWage(e.target.value)}
                      placeholder="13.00" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, fontWeight:600, color:'var(--txt)', fontFamily:'var(--font-body)', minWidth:0, width:'100%' }} />
                  </div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>€/Stunde</div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Urlaubstage</label>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:17, color:'var(--txt-muted)', flexShrink:0 }}>beach_access</span>
                    <input type="number" min="0" max="365" value={vacationDays} onChange={e => setVacationDays(e.target.value)}
                      placeholder="30" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, fontWeight:600, color:'var(--txt)', fontFamily:'var(--font-body)', minWidth:0, width:'100%' }} />
                  </div>
                  <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:4 }}>Tage/Jahr</div>
                </div>
              </div>

              {saveErr && <div style={{ background:'var(--err-bg)', color:'var(--err)', borderRadius:12, padding:'11px 14px', fontSize:13, display:'flex', gap:8, alignItems:'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{saveErr}
              </div>}
              <button onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:15, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(9,106,112,0.25)', opacity:saving?0.7:1 }}>
                <span className="material-symbols-outlined icon-sm">{saving?'hourglass_empty':'save'}</span>
                {saving ? 'Wird gespeichert…' : 'Änderungen speichern'}
              </button>
            </div>
          ) : (
            <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:16 }}>
              {/* Beschäftigt seit – full row */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:'var(--surf-low)' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'var(--surf-card)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:'var(--pri)' }}>event</span>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Beschäftigt seit</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', marginTop:1 }}>
                    {member.employed_since
                      ? new Date(member.employed_since).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})
                      : <span style={{ fontStyle:'italic', color:'var(--txt-muted)', fontWeight:400 }}>Nicht hinterlegt</span>}
                  </div>
                </div>
              </div>

              {/* Arbeitstage */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Arbeitstage</div>
                <div style={{ display:'flex', gap:5 }}>
                  {WEEKDAYS.map(({key,label}) => {
                    const active = member.work_days?.includes(key)
                    return (
                      <div key={key} style={{ flex:1, textAlign:'center', padding:'8px 0', borderRadius:10, fontSize:12, fontWeight:700,
                        background: active ? 'var(--pri)' : 'var(--surf-low)',
                        color: active ? '#fff' : 'var(--txt-muted)' }}>
                        {label}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Stats 2-column grid */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:'var(--pri)', display:'block', marginBottom:4 }}>schedule</span>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)', lineHeight:1 }}>
                    {member.work_hours_type === 'variabel' ? '~' : (member.work_hours_per_week ?? '–')}
                  </div>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:3, fontWeight:600 }}>Std/Woche</div>
                </div>
                <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:'#16a34a', display:'block', marginBottom:4 }}>euro</span>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)', lineHeight:1 }}>
                    {member.hourly_wage ? Number(member.hourly_wage).toFixed(2) : '–'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:3, fontWeight:600 }}>€/Stunde</div>
                </div>
                <div style={{ background:'var(--surf-low)', borderRadius:12, padding:'12px 10px', textAlign:'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:'var(--pri)', display:'block', marginBottom:4 }}>beach_access</span>
                  <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)', lineHeight:1 }}>{member.vacation_days_per_year ?? 30}</div>
                  <div style={{ fontSize:10, color:'var(--txt-muted)', marginTop:3, fontWeight:600 }}>Tage/Jahr</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zeiterfassung & Urlaub */}
        {(() => {
          const MONTH_NAMES_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
          const years = Array.from(new Set([new Date().getFullYear(), new Date().getFullYear()-1].concat(
            maLeaves.map(l => new Date(l.from_date).getFullYear())
          ))).sort((a,b)=>b-a)

          // Filter leaves by year + optional month
          const filtLeaves = maLeaves.filter(l => {
            const yr = new Date(l.from_date).getFullYear()
            if (yr !== maStatsYear) return false
            if (maStatsMonth !== null) {
              const mo = new Date(l.from_date).getMonth()
              return mo === maStatsMonth
            }
            return true
          })

          // Compute KPIs
          const daysBetween = (a: string, b: string) => {
            const ms = new Date(b).getTime() - new Date(a).getTime()
            return Math.round(ms / 86400000) + 1
          }
          const urlaubGenehmigt = filtLeaves.filter(l=>l.type==='urlaub'&&l.status==='genehmigt')
            .reduce((s,l)=>s+daysBetween(l.from_date,l.to_date),0)
          const urlaubPending = filtLeaves.filter(l=>l.type==='urlaub'&&l.status==='ausstehend')
            .reduce((s,l)=>s+daysBetween(l.from_date,l.to_date),0)
          const kranktage = filtLeaves.filter(l=>l.type==='krank'&&l.status==='genehmigt')
            .reduce((s,l)=>s+daysBetween(l.from_date,l.to_date),0)
          const urlaubMax = member.vacation_days_per_year ?? 30
          const urlaubLeft = Math.max(0, urlaubMax - urlaubGenehmigt - urlaubPending)
          const urlaubPct = Math.min(100, Math.round((urlaubGenehmigt / urlaubMax) * 100))

          const statusLabel: Record<string,string> = { ausstehend:'Ausstehend', genehmigt:'Genehmigt', abgelehnt:'Abgelehnt' }
          const statusColor: Record<string,string> = { ausstehend:'#f59e0b', genehmigt:'var(--ok)', abgelehnt:'var(--err)' }
          const statusBg: Record<string,string>    = { ausstehend:'#fffbeb', genehmigt:'var(--ok-bg)', abgelehnt:'var(--err-bg)' }

          return (
            <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
              {/* Header */}
              <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>
                Zeiterfassung & Urlaub
              </div>

              <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>

                {/* Year chips */}
                <div style={{ display:'flex', gap:6 }}>
                  {years.map(y => (
                    <button key={y} onClick={()=>setMaStatsYear(y)}
                      style={{ flex:1, padding:'8px 0', borderRadius:20, border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
                        background: maStatsYear===y ? 'var(--pri)' : 'var(--surf-low)',
                        color: maStatsYear===y ? '#fff' : 'var(--txt-muted)' }}>
                      {y}
                    </button>
                  ))}
                </div>

                {/* Month dropdown */}
                <div style={{ position:'relative' }}>
                  <select value={maStatsMonth ?? 'all'}
                    onChange={e => setMaStatsMonth(e.target.value === 'all' ? null : parseInt(e.target.value))}
                    style={{ width:'100%', padding:'9px 36px 9px 14px', borderRadius:12, border:'1.5px solid var(--outline)',
                      background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700,
                      appearance:'none', WebkitAppearance:'none', cursor:'pointer', outline:'none' }}>
                    <option value="all">Gesamtes Jahr</option>
                    {MONTH_NAMES_SHORT.map((m,i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined" style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'var(--txt-muted)', pointerEvents:'none' }}>expand_more</span>
                </div>

                {/* KPI grid */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { icon:'beach_access', label:'Urlaub genommen', value:`${urlaubGenehmigt}`, unit:'Tage', color:'#0c8f85' },
                    { icon:'hourglass_empty', label:'Ausstehend', value:`${urlaubPending}`, unit:'Tage', color:'#f59e0b' },
                    { icon:'sick', label:'Kranktage', value:`${kranktage}`, unit:'Tage', color:'var(--err)' },
                    { icon:'task_alt', label:'Aufgaben erledigt', value:`${maDoneCount}`, unit:'gesamt', color:'var(--ok)' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background:'var(--surf-low)', borderRadius:14, padding:'14px 12px', display:'flex', flexDirection:'column', gap:6 }}>
                      <div style={{ width:32, height:32, borderRadius:10, background:kpi.color+'22', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color:kpi.color }}>{kpi.icon}</span>
                      </div>
                      <div style={{ fontSize:22, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)', lineHeight:1 }}>{kpi.value}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600 }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Urlaubskonto progress bar */}
                {maStatsMonth === null && (
                  <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'14px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--txt)' }}>Urlaubskonto {maStatsYear}</div>
                      <div style={{ fontSize:12, color:'var(--txt-muted)', fontWeight:600 }}>{urlaubLeft} von {urlaubMax} Tagen frei</div>
                    </div>
                    <div style={{ height:8, borderRadius:8, background:'var(--outline)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${urlaubPct}%`, borderRadius:8,
                        background:`linear-gradient(90deg,var(--pri),var(--pri-c))`, transition:'width 0.4s' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                      <span style={{ fontSize:11, color:'var(--pri)', fontWeight:600 }}>{urlaubGenehmigt} genommen</span>
                      {urlaubPending > 0 && <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600 }}>{urlaubPending} ausstehend</span>}
                    </div>
                  </div>
                )}

                {/* Leave history – only show entries where to_date is within last 30 days or in the future */}
                {(() => {
                  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                  const recentLeaves = filtLeaves.filter(l => new Date(l.to_date) >= thirtyDaysAgo)
                  return recentLeaves.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                      Antragshistorie
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {recentLeaves.map(l => {
                        const from = new Date(l.from_date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
                        const to   = new Date(l.to_date  ).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})
                        const days = daysBetween(l.from_date, l.to_date)
                        return (
                          <div key={l.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:12,
                            background: statusBg[l.status]??'var(--surf-low)', border:`1px solid ${statusColor[l.status]??'var(--outline)'}22` }}>
                            <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color: l.type==='krank'?'var(--err)':'var(--pri)', flexShrink:0 }}>
                              {l.type==='krank'?'sick':'beach_access'}
                            </span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>
                                {l.type==='urlaub'?'Urlaub':'Krankmeldung'} · {days} {days===1?'Tag':'Tage'}
                              </div>
                              <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{from} – {to}</div>
                              {l.note && <div style={{ fontSize:11, color:'var(--txt-sec)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.note}</div>}
                            </div>
                            <span style={{ fontSize:11, fontWeight:700, color: statusColor[l.status], background: statusBg[l.status], borderRadius:20, padding:'3px 10px', flexShrink:0 }}>
                              {statusLabel[l.status]}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  )
                })()}
                {filtLeaves.filter(l => new Date(l.to_date) >= (() => { const d=new Date(); d.setDate(d.getDate()-30); return d; })()).length === 0 && (
                  <div style={{ textAlign:'center', padding:'16px 0', color:'var(--txt-muted)', fontSize:13 }}>
                    Keine Einträge für diesen Zeitraum
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Rolle */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
          <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>Rolle</div>
          <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', gap:8 }}>
              {([
                {val:'mitarbeiter', label:'Mitarbeiter',  icon:'badge'},
                {val:'objektleiter',label:'Objektleiter', icon:'manage_accounts'},
                {val:'admin',       label:'Administrator',icon:'admin_panel_settings'},
                {val:'support',     label:'Support',      icon:'support_agent'},
              ] as const).map(r => {
                const isActive = currentRole === r.val
                return (
                  <button key={r.val} onClick={() => handleRoleChange(r.val)} disabled={roleChanging}
                    style={{ flex:1, padding:'11px 8px', borderRadius:12, border:`1.5px solid ${isActive?'var(--pri)':'var(--outline)'}`,
                      background: isActive?'var(--pri-xl)':'transparent', color: isActive?'var(--pri)':'var(--txt-muted)',
                      fontWeight:700, fontSize:12, cursor:roleChanging?'wait':'pointer',
                      display:'flex', alignItems:'center', justifyContent:'center', gap:4, transition:'all 0.15s' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16 }}>{r.icon}</span>
                    {r.label}
                    {isActive && <span className="material-symbols-outlined" style={{ fontSize:14, marginLeft:2 }}>check</span>}
                  </button>
                )
              })}
            </div>
            {roleMsg && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:10,
                background: roleMsg.ok?'var(--ok-bg)':'var(--err-bg)', color: roleMsg.ok?'var(--ok)':'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm icon-fill">{roleMsg.ok?'check_circle':'error'}</span>
                {roleMsg.text}
              </div>
            )}
            {currentRole === 'admin' && (
              <div style={{ display:'flex', gap:8, padding:'9px 12px', borderRadius:10, background:'#f3e8ff', fontSize:12, color:'#7c3aed', alignItems:'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize:15, flexShrink:0, marginTop:1 }}>info</span>
                Administratoren haben vollen Zugriff auf alle Daten, Teams und Einstellungen.
              </div>
            )}
          </div>
        </div>

        {/* Zugang */}
        <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
          <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>App-Zugang</div>
          <div style={{ padding:'14px 16px' }}>
            <p style={{ fontSize:13, color:'var(--txt-sec)', lineHeight:1.5, marginBottom:12 }}>
              {member.is_active
                ? 'Mitarbeiter hat aktuell Zugang zur App und kann Aufgaben sehen und bearbeiten.'
                : 'Mitarbeiter hat keinen App-Zugang mehr. Alle Daten bleiben erhalten.'}
            </p>
            {!confirmDeactivate ? (
              <button onClick={() => setConfirmDeactivate(true)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:12, border:`1.5px solid ${member.is_active?'var(--err-dot)':'var(--ok)'}`, background:'transparent', color: member.is_active?'var(--err-dot)':'var(--ok)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                <span className="material-symbols-outlined icon-sm">{member.is_active?'block':'check_circle'}</span>
                {member.is_active ? 'Zugang entziehen' : 'Zugang wiederherstellen'}
              </button>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ background: member.is_active ? 'var(--err-bg)' : 'var(--ok-bg)', borderRadius:12, padding:'12px 14px', fontSize:13, color: member.is_active ? 'var(--err)' : 'var(--ok)', display:'flex', gap:8 }}>
                  <span className="material-symbols-outlined icon-sm icon-fill">{member.is_active?'warning':'info'}</span>
                  {member.is_active
                    ? `Wirklich Zugang für ${member.full_name} entziehen? MA kann sich nicht mehr anmelden.`
                    : `Zugang für ${member.full_name} wiederherstellen?`}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setConfirmDeactivate(false)} style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>Abbrechen</button>
                  <button onClick={() => { onToggleActive(); setConfirmDeactivate(false) }}
                    style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background: member.is_active ? 'var(--err-dot)' : 'var(--ok)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    {member.is_active ? 'Entziehen' : 'Wiederherstellen'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ height:12 }} />
      </div>
      </div>
    </PageOverlay>
  )
}

// ─── TodayTasksOverlay ────────────────────────────────────────────────────────
function TodayTasksOverlay({ tasks, assignments, team, today, onClose, onEditTask }: {
  tasks: TaskItem[]; assignments: any[]; team: TeamMember[]; today: string
  onClose: () => void; onEditTask: (t: TaskItem) => void
}) {
  // Use real assignments if available, fall back to task-based view
  const hasAssignments = assignments.length > 0
  const todayAssignments = assignments.filter((a: any) => a.due_date === today || !a.due_date)

  // For task-based fallback
  const todayTasks = tasks.filter(t => t.is_active && (t.due_date ?? '') <= today && (!t.end_date || t.end_date >= today))

  const STATUS_META: Record<string, {label:string;bg:string;color:string;icon:string}> = {
    offen:     { label:'Offen',     bg:'var(--surf-high)', color:'var(--txt-muted)', icon:'radio_button_unchecked' },
    in_arbeit: { label:'In Arbeit', bg:'#fff3cd',          color:'#b45309',          icon:'pending' },
    erledigt:  { label:'Erledigt',  bg:'var(--ok-bg)',     color:'var(--ok)',         icon:'check_circle' },
    problem:   { label:'Problem',   bg:'#ffdad6',          color:'var(--err-dot)',    icon:'error' },
  }

  // Group assignments by object
  const byObject = (hasAssignments ? todayAssignments : todayTasks).reduce<Record<string, { label: string; items: any[] }>>((acc, item) => {
    const key = item.tasks?.objects?.name || item.tasks?.objects?.address
      || (item as any).objects?.name || (item as any).objects?.address || 'Ohne Objekt'
    if (!acc[key]) acc[key] = { label: key, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  const totalItems = hasAssignments ? todayAssignments.length : todayTasks.length
  const doneCount = hasAssignments ? todayAssignments.filter((a:any) => a.status === 'erledigt').length : 0

  const INTERVAL_COLOR: Record<string,string> = { täglich:'var(--pri)', wöchentlich:'#0369a1', zweiwöchentlich:'#0369a1', monatlich:'#7c3aed', quartalsweise:'#0f766e', einmalig:'#92400e' }
  const INTERVAL_BG: Record<string,string>    = { täglich:'var(--pri-xl)', wöchentlich:'#e0f2fe', zweiwöchentlich:'#e0f2fe', monatlich:'#f3e8ff', quartalsweise:'#ccfbf1', einmalig:'#fff8e6' }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', flexDirection:'column', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:'0.08em' }}>Heute fällig</div>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>
            {new Date(today).toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {hasAssignments && doneCount > 0 && <span style={{ fontSize:13, fontWeight:700, color:'var(--ok)', background:'var(--ok-bg)', borderRadius:20, padding:'5px 12px' }}>{doneCount} ✓</span>}
          <div style={{ fontSize:13, fontWeight:700, color:'#92400e', background:'#fff8e6', borderRadius:20, padding:'5px 12px' }}>{totalItems} Aufgaben</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ height:0, flex:1, overflowY:'auto', padding:20 }}>
        {totalItems === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize:48, color:'var(--ok)', display:'block', marginBottom:12 }}>task_alt</span>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--ok)' }}>Keine Aufgaben für heute</div>
          </div>
        ) : Object.values(byObject).map(({ label, items }) => (
          <div key={label} style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:14 }}>apartment</span>{label}
            </div>
            {items.map((item: any) => {
              const isAssignment = hasAssignments
              const title = isAssignment ? (item.tasks?.title ?? '–') : item.title
              const interval = isAssignment ? (item.tasks?.interval ?? 'einmalig') : (item.interval ?? 'einmalig')
              const assignee = team.find(m => m.id === (isAssignment ? item.user_id : item.default_assignee_id))
              const status = isAssignment ? item.status : null
              const st = status ? STATUS_META[status] : null
              const task = isAssignment ? null : item as TaskItem
              return (
                <div key={item.id}
                  onClick={() => { if (task) onEditTask(task) }}
                  style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12, cursor: task ? 'pointer' : 'default', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', opacity: status === 'erledigt' ? 0.7 : 1 }}
                >
                  {st ? (
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:st.color, flexShrink:0 }}>{st.icon}</span>
                  ) : (
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--pri)', flexShrink:0 }} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, flexWrap:'wrap' }}>
                      {st && <span style={{ fontSize:11, fontWeight:700, color:st.color, background:st.bg, borderRadius:20, padding:'2px 7px' }}>{st.label}</span>}
                      {assignee && <span style={{ fontSize:11, color:'var(--txt-muted)' }}>→ {assignee.full_name}</span>}
                    </div>
                  </div>
                  {task && <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>edit</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AdminKontoSection ────────────────────────────────────────────────────────
function AdminKontoSection({ userName }: { userName: string }) {
  const [showPwForm, setShowPwForm] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [show1, setShow1] = useState(false)
  const [show2, setShow2] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ok:boolean;text:string}|null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (pw1.length < 8) { setMsg({ok:false, text:'Mindestens 8 Zeichen erforderlich.'}); return }
    if (pw1 !== pw2)    { setMsg({ok:false, text:'Passwörter stimmen nicht überein.'}); return }
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) {
      setMsg({ok:false, text:error.message})
    } else {
      setMsg({ok:true, text:'Passwort erfolgreich geändert!'})
      setPw1(''); setPw2('')
      setTimeout(() => { setShowPwForm(false); setMsg(null) }, 2000)
    }
    setSaving(false)
  }

  // Get current user email
  const [email, setEmail] = useState('')
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailMsg, setEmailMsg] = useState<{text:string;ok:boolean}|null>(null)
  const [emailSaving, setEmailSaving] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user?.email) setEmail(data.user.email) })
  }, [])

  const handleEmailSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailMsg({ text:'Bitte eine gültige E-Mail eingeben.', ok:false }); return }
    if (newEmail.trim() === email) { setEmailMsg({ text:'Das ist bereits deine aktuelle E-Mail.', ok:false }); return }
    setEmailSaving(true); setEmailMsg(null)
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) { setEmailMsg({ text: error.message || 'Fehler beim Ändern.', ok:false }) }
    else { setEmailMsg({ text:'Bestätigungs-E-Mail wurde gesendet. Bitte beide Adressen bestätigen.', ok:true }); setNewEmail('') }
    setEmailSaving(false)
  }

  const inputRow = (icon: string, placeholder: string, value: string, setValue: (v:string)=>void, show: boolean, setShow: (v:boolean)=>void) => (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
      <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{icon}</span>
      <input type={show ? 'text' : 'password'} value={value} onChange={e => setValue(e.target.value)}
        placeholder={placeholder} required
        style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }} />
      <button type="button" onClick={() => setShow(!show)}
        style={{ background:'none', border:'none', cursor:'pointer', padding:2, color:'var(--txt-muted)', display:'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize:18 }}>{show ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  )

  return (
    <div style={{ background:'var(--surf-card)', borderRadius:20, overflow:'hidden', marginBottom:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', borderBottom:'1px solid var(--outline)' }}>Konto</div>

      {/* E-Mail Row */}
      <div style={{ borderBottom:'1px solid var(--outline)' }}>
        <div onClick={() => { setShowEmailForm(f => !f); setEmailMsg(null); setNewEmail('') }}
          style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer' }}>
          <div style={{ width:34, height:34, borderRadius:10, background: showEmailForm ? 'var(--pri-xl)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color: showEmailForm ? 'var(--pri)' : 'var(--txt-muted)' }}>mail</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color: showEmailForm ? 'var(--pri)' : 'var(--txt)' }}>E-Mail</div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>{email || '…'}</div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform: showEmailForm ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
        </div>
        {showEmailForm && (
          <form onSubmit={handleEmailSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10, borderTop:'1px solid var(--outline)' }}>
            <div style={{ height:4 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }}>
              <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>mail</span>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="Neue E-Mail-Adresse" required
                style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)', fontFamily:'var(--font-body)' }}/>
            </div>
            {emailMsg && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background: emailMsg.ok ? 'var(--ok-bg)' : 'var(--err-bg)', color: emailMsg.ok ? 'var(--ok)' : 'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm icon-fill">{emailMsg.ok ? 'check_circle' : 'error'}</span>
                {emailMsg.text}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => { setShowEmailForm(false); setEmailMsg(null) }}
                style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button type="submit" disabled={emailSaving}
                style={{ flex:1, padding:'11px', borderRadius:12, border:'none', background:'linear-gradient(135deg,var(--pri),var(--pri-c))', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <span className="material-symbols-outlined icon-sm">{emailSaving ? 'hourglass_empty' : 'mail'}</span>
                {emailSaving ? 'Wird gesendet…' : 'Bestätigung senden'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Passwort Row */}
      <div>
        <div
          onClick={() => { setShowPwForm(f => !f); setMsg(null); setPw1(''); setPw2('') }}
          style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer' }}
        >
          <div style={{ width:34, height:34, borderRadius:10, background: showPwForm ? 'var(--pri-xl)' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color: showPwForm ? 'var(--pri)' : 'var(--txt-muted)' }}>lock</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:600, color: showPwForm ? 'var(--pri)' : 'var(--txt)' }}>Passwort ändern</div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>Neues Passwort festlegen</div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', transition:'transform 0.2s', transform: showPwForm ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
        </div>

        {showPwForm && (
          <form onSubmit={handleSave} style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10, borderTop:'1px solid var(--outline)' }}>
            <div style={{ height:4 }} />
            {inputRow('lock', 'Neues Passwort (mind. 8 Zeichen)', pw1, setPw1, show1, setShow1)}
            {inputRow('lock_reset', 'Passwort wiederholen', pw2, setPw2, show2, setShow2)}

            {msg && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, background: msg.ok ? 'var(--ok-bg)' : 'var(--err-bg)', color: msg.ok ? 'var(--ok)' : 'var(--err)', fontSize:13 }}>
                <span className="material-symbols-outlined icon-sm icon-fill">{msg.ok ? 'check_circle' : 'error'}</span>
                {msg.text}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={() => { setShowPwForm(false); setMsg(null) }}
                style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button type="submit" disabled={saving || !pw1 || !pw2}
                style={{ flex:1, padding:'11px 0', borderRadius:12, border:'none', background: (pw1 && pw2 && !saving) ? 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)' : 'var(--outline)', color: (pw1 && pw2) ? '#fff' : 'var(--txt-muted)', fontSize:14, fontWeight:700, cursor: (pw1 && pw2) ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <span className="material-symbols-outlined icon-sm">{saving ? 'hourglass_empty' : 'check'}</span>
                {saving ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── MonthOverlay ─────────────────────────────────────────────────────────────
function MonthOverlay({ onClose, isDesktop }: { onClose: () => void; isDesktop: boolean }) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based

  type ObjRow  = { id:string; name:string; address:string; total:number; done:number; problems:number; open:number }
  type MARow   = { id:string; name:string; done:number; problems:number; workMin:number; travelMin:number }

  const [objRows, setObjRows]   = useState<ObjRow[]>([])
  const [maRows, setMARows]     = useState<MARow[]>([])
  const [dayMap, setDayMap]     = useState<Record<string,{done:number;total:number}>>({})
  const [prevDone, setPrevDone] = useState<number|null>(null)
  const [loading, setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)

  const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`
  const monthEnd   = new Date(year, month+1, 0).toISOString().split('T')[0]

  const load = async () => {
    setLoading(true)
    // Previous month range for trend
    const prevStart = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const prevEnd   = new Date(year, month, 0).toISOString().split('T')[0]

    const [curRes, prevRes] = await Promise.all([
      supabase
        .from('task_assignments')
        .select('id,status,due_date,user_id,started_at,completed_at,travel_minutes,tasks(id,object_id,objects(id,name,address,city)),users(full_name)')
        .gte('due_date', monthStart)
        .lte('due_date', monthEnd),
      supabase
        .from('task_assignments')
        .select('id,status')
        .gte('due_date', prevStart)
        .lte('due_date', prevEnd)
        .eq('status', 'erledigt')
    ])
    setLoading(false)
    if (!curRes.data) return

    const objMap: Record<string, ObjRow> = {}
    const maMap:  Record<string, MARow>  = {}
    const dMap:   Record<string, {done:number;total:number}> = {}

    for (const a of curRes.data as any[]) {
      const obj = a.tasks?.objects
      if (obj) {
        if (!objMap[obj.id]) objMap[obj.id] = { id:obj.id, name:obj.name||obj.address, address:obj.address+', '+obj.city, total:0, done:0, problems:0, open:0 }
        objMap[obj.id].total++
        if (a.status === 'erledigt') objMap[obj.id].done++
        if (a.status === 'problem')  objMap[obj.id].problems++
        if (['offen','in_arbeit'].includes(a.status)) objMap[obj.id].open++
      }
      const u = a.users
      if (u && a.user_id) {
        if (!maMap[a.user_id]) maMap[a.user_id] = { id:a.user_id, name:u.full_name, done:0, problems:0, workMin:0, travelMin:0 }
        if (a.status === 'erledigt') maMap[a.user_id].done++
        if (a.status === 'problem')  maMap[a.user_id].problems++
        if (a.started_at && a.completed_at) {
          const mins = Math.round((new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / 60000)
          if (mins > 0 && mins < 600) maMap[a.user_id].workMin += mins
        }
        if (a.travel_minutes) maMap[a.user_id].travelMin += a.travel_minutes
      }
      // Day map
      const d = a.due_date
      if (!dMap[d]) dMap[d] = { done:0, total:0 }
      dMap[d].total++
      if (a.status === 'erledigt') dMap[d].done++
    }
    setObjRows(Object.values(objMap).sort((a,b) => b.total - a.total))
    setMARows(Object.values(maMap).sort((a,b) => b.done - a.done))
    setDayMap(dMap)
    setPrevDone(prevRes.data?.length ?? null)
  }

  useEffect(() => { load() }, [year, month])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y=>y-1) } else setMonth(m=>m-1) }
  const nextMonth = () => {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    if (isCurrentMonth) return
    if (month === 11) { setMonth(0); setYear(y=>y+1) } else setMonth(m=>m+1)
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

  const totalDone     = objRows.reduce((s,r)=>s+r.done,0)
  const totalProblems = objRows.reduce((s,r)=>s+r.problems,0)
  const totalAll      = objRows.reduce((s,r)=>s+r.total,0)
  const pct = totalAll > 0 ? Math.round((totalDone/totalAll)*100) : 0

  const exportCSV = () => {
    setExporting(true)
    const header = 'Objekt;Adresse;Gesamt;Erledigt;Probleme;Quote\n'
    const rows = objRows.map(r => `${r.name};${r.address};${r.total};${r.done};${r.problems};${r.total>0?Math.round(r.done/r.total*100):0}%`).join('\n')
    const maHeader = '\n\nMitarbeiter;Erledigt;Probleme\n'
    const maRows2 = maRows.map(r => `${r.name};${r.done};${r.problems}`).join('\n')
    const csv = header + rows + maHeader + maRows2
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`SteuberWork_${MONTH_NAMES[month]}_${year}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  return (
    <PageOverlay isDesktop={isDesktop} onClose={onClose} wide>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Bericht</div>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>Monatsübersicht</div>
        </div>
        <button onClick={exportCSV} disabled={exporting || loading} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', color:'var(--txt)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize:16 }}>download</span>
          CSV
        </button>
      </div>

      {/* Monats-Navigator */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid var(--outline)', background:'var(--surf-card)', flexShrink:0 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'none', cursor:'pointer', padding:8, borderRadius:8, display:'flex', color:'var(--txt)' }}>
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button onClick={nextMonth} disabled={isCurrentMonth} style={{ background:'none', border:'none', cursor:'pointer', padding:8, borderRadius:8, display:'flex', color: isCurrentMonth ? 'var(--txt-muted)' : 'var(--txt)', opacity: isCurrentMonth ? 0.3 : 1 }}>
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div style={{ height:0, flex:1, overflowY:'auto', padding:20 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--txt-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize:32, display:'block', marginBottom:8 }}>hourglass_empty</span>Wird geladen…
          </div>
        ) : (
          <>
            {/* KPI-Zusammenfassung */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
              {[
                { label:'Erledigt', val:totalDone, color:'var(--ok)', bg:'var(--ok-bg)', icon:'task_alt' },
                { label:'Probleme', val:totalProblems, color:'#93000a', bg:'#ffdad6', icon:'warning' },
                { label:'Quote', val:`${pct}%`, color:'var(--pri)', bg:'var(--pri-xl)', icon:'percent' },
              ].map(({label,val,color,bg,icon})=>(
                <div key={label} style={{ background:bg, borderRadius:14, padding:'12px 10px', textAlign:'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color, display:'block', marginBottom:4 }}>{icon}</span>
                  <div style={{ fontSize:22, fontWeight:800, color, fontFamily:'var(--font-head)', lineHeight:1 }}>{val}</div>
                  <div style={{ fontSize:10, color, fontWeight:600, marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Trend Vormonat */}
            {prevDone !== null && (() => {
              const diff = totalDone - prevDone
              const isUp = diff >= 0
              return (
                <div style={{ background: isUp ? 'var(--ok-bg)' : '#fff8e6', borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:18, color: isUp ? 'var(--ok)' : '#b45309' }}>
                    {isUp ? 'trending_up' : 'trending_down'}
                  </span>
                  <span style={{ fontSize:13, fontWeight:700, color: isUp ? 'var(--ok)' : '#b45309' }}>
                    {isUp ? '+' : ''}{diff} vs. Vormonat
                  </span>
                  <span style={{ fontSize:11, color:'var(--txt-muted)', marginLeft:2 }}>
                    ({prevDone} erledigt im Vormonat)
                  </span>
                </div>
              )
            })()}

            {/* Tages-Heatmap */}
            {Object.keys(dayMap).length > 0 && (() => {
              const daysInMonth = new Date(year, month+1, 0).getDate()
              const cells = Array.from({length: daysInMonth}, (_, i) => {
                const d = `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`
                const info = dayMap[d]
                const q = info && info.total > 0 ? info.done / info.total : null
                return { day: i+1, d, q, info }
              })
              return (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Aktivität im Monat</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4 }}>
                    {['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => (
                      <div key={d} style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', textAlign:'center', paddingBottom:2 }}>{d}</div>
                    ))}
                    {Array((new Date(year, month, 1).getDay() + 6) % 7).fill(null).map((_,i) => <div key={`pad-${i}`}/>)}
                    {cells.map(({day, q, info}) => {
                      const bg = q === null ? 'var(--surf-low)'
                        : q === 1 ? '#16a34a'
                        : q >= 0.7 ? '#4ade80'
                        : q >= 0.4 ? '#fbbf24'
                        : '#f87171'
                      const isToday = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` === new Date().toISOString().split('T')[0]
                      return (
                        <div key={day} title={info ? `${info.done}/${info.total} erledigt` : undefined}
                          style={{ aspectRatio:'1', borderRadius:6, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color: q !== null ? '#fff' : 'var(--txt-muted)', border: isToday ? '2px solid var(--pri)' : 'none', boxSizing:'border-box' }}>
                          {day}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                    {[['#16a34a','100%'],['#4ade80','≥70%'],['#fbbf24','≥40%'],['#f87171','<40%'],['var(--surf-low)','Kein Termin']].map(([c,l])=>(
                      <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--txt-muted)' }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:c }}/>
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Per Objekt */}
            <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Nach Objekt</div>
            {objRows.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 0', color:'var(--txt-muted)', fontSize:13 }}>Keine Daten für diesen Monat</div>
            ) : objRows.map(r => {
              const q = r.total > 0 ? Math.round(r.done/r.total*100) : 0
              const allDone = r.done === r.total && r.total > 0
              return (
                <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                    <div style={{ width:32, height:32, borderRadius:9, background: allDone ? 'var(--ok-bg)' : r.problems>0 ? '#ffdad6' : 'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:16, color: allDone ? 'var(--ok)' : r.problems>0 ? '#93000a' : 'var(--txt-muted)' }}>
                        {allDone ? 'check_circle' : r.problems>0 ? 'warning' : 'apartment'}
                      </span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</div>
                      <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{r.address}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:800, color: q===100 ? 'var(--ok)' : 'var(--txt)', flexShrink:0 }}>{q}%</div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height:4, borderRadius:4, background:'var(--surf-low)', overflow:'hidden', marginBottom:6 }}>
                    <div style={{ height:'100%', width:`${q}%`, borderRadius:4, background: q===100 ? 'var(--ok)' : 'var(--pri)', transition:'width 0.3s' }} />
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--txt-muted)' }}>
                    <span><span style={{ fontWeight:700, color:'var(--ok)' }}>{r.done}</span> erledigt</span>
                    {r.problems > 0 && <span><span style={{ fontWeight:700, color:'#93000a' }}>{r.problems}</span> {r.problems===1?'Problem':'Probleme'}</span>}
                    <span style={{ marginLeft:'auto' }}>{r.total} gesamt</span>
                  </div>
                </div>
              )
            })}

            {/* Per Mitarbeiter */}
            {maRows.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', margin:'20px 0 8px' }}>Nach Mitarbeiter</div>
                {maRows.map(r => {
                  const wH = Math.floor(r.workMin/60), wM = r.workMin%60
                  const tH = Math.floor(r.travelMin/60), tM = r.travelMin%60
                  return (
                  <div key={r.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'12px 14px', marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: r.workMin > 0 ? 10 : 0 }}>
                      <div style={{ width:36, height:36, borderRadius:11, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, fontFamily:'var(--font-head)', flexShrink:0 }}>
                        {r.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--txt)' }}>{r.name}</div>
                        <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:2 }}>
                          <span style={{ color:'var(--ok)', fontWeight:700 }}>{r.done}</span> erledigt
                          {r.problems > 0 && <> · <span style={{ color:'#93000a', fontWeight:700 }}>{r.problems}</span> {r.problems===1?'Problem':'Probleme'}</>}
                        </div>
                      </div>
                      <div style={{ fontSize:16, fontWeight:800, color:'var(--pri)', fontFamily:'var(--font-head)' }}>{r.done}</div>
                    </div>
                    {(r.workMin > 0 || r.travelMin > 0) && (
                      <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid var(--outline)' }}>
                        {r.workMin > 0 && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--txt-muted)', background:'var(--surf-low)', borderRadius:8, padding:'4px 8px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize:13, color:'var(--pri)' }}>schedule</span>
                            {wH}h {wM > 0 ? `${wM}m` : ''} Arbeit
                          </div>
                        )}
                        {r.travelMin > 0 && (
                          <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--txt-muted)', background:'var(--surf-low)', borderRadius:8, padding:'4px 8px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize:13, color:'#b45309' }}>directions_car</span>
                            {tH > 0 ? `${tH}h ` : ''}{tM > 0 ? `${tM}m` : `${tH}h`} Fahrzeit
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })}
              </>
            )}
            <div style={{ height:20 }} />
          </>
        )}
      </div>
    </PageOverlay>
  )
}

// ─── ObjekteListe (collapsible, used in AP-Detail) ───────────────────────────
function ObjekteListe({ objs, onNav }: { objs: any[], onNav: (o: any) => void }) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 3
  const shown = expanded ? objs : objs.slice(0, LIMIT)
  const rest = objs.length - LIMIT
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>
        {objs.length === 1 ? 'Objekt' : 'Objekte'} ({objs.length})
      </div>
      {shown.map((linkedObj: any) => (
        <button key={linkedObj.id} onClick={() => onNav(linkedObj)}
          style={{ width:'100%', background:'var(--surf-card)', borderRadius:14, border:'0.5px solid var(--outline)', padding:'12px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', textAlign:'left' }}>
          <div style={{ width:36, height:36, borderRadius:11, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:18, color:'#fff' }}>apartment</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--pri)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{linkedObj.address}, {linkedObj.city}</div>
            {linkedObj.object_number && <div style={{ fontSize:11, color:'var(--txt-muted)', fontFamily:'monospace', marginTop:1 }}>{linkedObj.object_number}</div>}
          </div>
          <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>chevron_right</span>
        </button>
      ))}
      {!expanded && rest > 0 && (
        <button onClick={() => setExpanded(true)}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, color:'var(--pri)', padding:'12px 0', textAlign:'left', minHeight:44 }}>
          + {rest} weitere anzeigen
        </button>
      )}
      {expanded && objs.length > LIMIT && (
        <button onClick={() => setExpanded(false)}
          style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, color:'var(--txt-muted)', padding:'12px 0', textAlign:'left', minHeight:44 }}>
          Weniger anzeigen
        </button>
      )}
    </div>
  )
}

// ─── AnsprechpartnerList ──────────────────────────────────────────────────────
function AnsprechpartnerList({ contacts, customers, objects, search, onSearchChange, onRefresh, onNavigateToObject }: {
  contacts: any[]
  customers: any[]
  objects: any[]
  search: string
  onSearchChange: (v: string) => void
  onRefresh?: () => void
  onNavigateToObject?: (obj: any) => void
}) {
  const [showExport, setShowExport] = useState(false)
  const [selectedContact, setSelectedContact] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)
  const [dbResults, setDbResults] = useState<any[]|null>(null)
  const [dbSearching, setDbSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  const handleSearchChange = (v: string) => {
    onSearchChange(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (v.trim().length < 2) { setDbResults(null); setDbSearching(false); return }
    setDbSearching(true)
    searchTimer.current = setTimeout(async () => {
      const q = v.trim()
      const { data } = await supabase
        .from('contact_persons')
        .select('id,name,first_name,last_name,role,phone,email,customer_id,object_id')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,name.ilike.%${q}%,role.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(100)
      setDbResults(data || [])
      setDbSearching(false)
    }, 350)
  }
  const [editData, setEditData] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [toast, setToast] = useState<string|null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const openEdit = (cp: any) => {
    setEditData({ first_name: cp.first_name||'', last_name: cp.last_name||cp.name||'', role: cp.role||'', phone: cp.phone||'', email: cp.email||'' })
    setEditMode(true)
    setShowDeleteConfirm(false)
  }

  const saveEdit = async (cp: any) => {
    if (!editData) return
    setEditSaving(true)
    let error: any = null
    if (cp._isCust) {
      // Privatperson → customers-Tabelle updaten
      const realId = cp.customer_id
      const res = await supabase.from('customers').update({
        first_name: editData.first_name.trim() || null,
        last_name:  editData.last_name.trim()  || null,
        name:       [editData.first_name, editData.last_name].filter(Boolean).join(' ').trim() || editData.last_name.trim(),
        phone:      editData.phone.trim() || null,
        email:      editData.email.trim() || null,
      }).eq('id', realId)
      error = res.error
    } else {
      // Normaler Ansprechpartner → contact_persons
      const res = await supabase.from('contact_persons').update({
        first_name: editData.first_name.trim() || null,
        last_name:  editData.last_name.trim()  || null,
        name:       [editData.first_name, editData.last_name].filter(Boolean).join(' ').trim() || editData.last_name.trim(),
        role:       editData.role.trim()  || null,
        phone:      editData.phone.trim() || null,
        email:      editData.email.trim() || null,
      }).eq('id', cp.id)
      error = res.error
    }
    setEditSaving(false)
    if (error) { showToast('⚠ Fehler beim Speichern'); return }
    showToast('✓ Gespeichert')
    setEditMode(false)
    setSelectedContact(null)
    onRefresh?.()
  }

  const deleteContact = async (cp: any) => {
    const { error } = await supabase.from('contact_persons').delete().eq('id', cp.id)
    if (error) { showToast('⚠ Löschen fehlgeschlagen'); setShowDeleteConfirm(false); return }
    showToast('Ansprechpartner gelöscht')
    setShowDeleteConfirm(false)
    setSelectedContact(null)
    onRefresh?.()
  }

  // Merge: contact_persons + privatperson customers (they ARE persons)
  const privatpersonen = (customers || [])
    .filter((c: any) => c.customer_type === 'privatperson' && (c.first_name || c.last_name || c.name))
    .map((c: any) => ({
      id: 'cust-' + c.id,
      _isCust: true,
      first_name: c.first_name || '',
      last_name: c.last_name || (c.name || ''),
      name: c.name || [c.first_name, c.last_name].filter(Boolean).join(' '),
      role: 'Privatperson',
      phone: c.phone || null,
      email: c.email || null,
      customer_id: c.id,
      customers: { id: c.id, name: c.name, customer_type: 'privatperson' },
    }))
  const allContacts = [...contacts, ...privatpersonen]

  // DB-Ergebnisse haben Vorrang (merged mit privatpersonen aus lokaler Liste)
  const baseContacts = dbResults !== null ? [...dbResults, ...privatpersonen] : allContacts
  const q = search.trim().toLowerCase()
  const filtered = (dbResults !== null)
    ? baseContacts.filter(cp => {
        const custName = customers?.find((c:any) => c.id === cp.customer_id)?.name || cp.customers?.name || ''
      const hay = [cp.first_name, cp.last_name, cp.name, cp.role, cp.phone, cp.email, custName].filter(Boolean).join(' ').toLowerCase()
        return !q || q.split(' ').filter(Boolean).every((w: string) => hay.includes(w))
      })
    : q ? allContacts.filter(cp => {
        const custName = customers?.find((c:any) => c.id === cp.customer_id)?.name || cp.customers?.name || ''
      const hay = [cp.first_name, cp.last_name, cp.name, cp.role, cp.phone, cp.email, custName].filter(Boolean).join(' ').toLowerCase()
        return q.split(' ').filter(Boolean).every((w: string) => hay.includes(w))
      }) : allContacts

  // Sort alphabetically by last_name, then first_name
  const sorted = [...filtered].sort((a, b) => {
    const ln = (a.last_name || a.name || '').localeCompare(b.last_name || b.name || '', 'de')
    if (ln !== 0) return ln
    return (a.first_name || '').localeCompare(b.first_name || '', 'de')
  })

  // Group by first letter of last_name (or name)
  const grouped: Record<string, any[]> = {}
  sorted.forEach(cp => {
    const letter = (cp.last_name || cp.name || '#')[0]?.toUpperCase() || '#'
    if (!grouped[letter]) grouped[letter] = []
    grouped[letter].push(cp)
  })
  const letters = Object.keys(grouped).sort()

  // XLSX Export
  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const rows = sorted.map(cp => ({
      'Vorname': cp.first_name || '',
      'Nachname': cp.last_name || cp.name || '',
      'Funktion/Rolle': cp.role || '',
      'Telefon': cp.phone || '',
      'E-Mail': cp.email || '',
      'Kunde/Firma': cp.customers?.name || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ansprechpartner')
    XLSX.writeFile(wb, `ansprechpartner_${new Date().toISOString().slice(0,10)}.xlsx`)
    setShowExport(false)
  }

  return (
    <>
      {/* Header */}
      <div style={{ paddingTop:20, paddingBottom:12 }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <h1 style={s.h1}>Ansprechpartner</h1>
            <p style={s.sub}>{sorted.length} Kontakte</p>
          </div>
          <button onClick={() => setShowExport(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-sm">download</span> Export
          </button>
        </div>

        {/* Suche */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', overflow:'hidden', marginBottom:4 }}>
          <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
          <input value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Name, Funktion, Telefon, Firma …" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
          {dbSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
          {search && <button onClick={() => { handleSearchChange(''); setDbResults(null) }} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--txt-muted)' }}><span className="material-symbols-outlined icon-sm">close</span></button>}
        </div>
      </div>

      {/* Liste */}
      {sorted.length === 0 ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'60px 20px', gap:12 }}>
          <span className="material-symbols-outlined" style={{ fontSize:48, color:'var(--txt-muted)', opacity:0.3 }}>{search ? 'search_off' : 'contacts'}</span>
          <p style={{ fontSize:14, color:'var(--txt-muted)', textAlign:'center' }}>{search ? 'Keine Treffer' : 'Noch keine Ansprechpartner'}</p>
        </div>
      ) : (
        <>
          {letters.map((letter, li) => (
            <div key={letter}>
              <div style={{ margin: li === 0 ? '4px 0 6px' : '16px 0 6px' }}>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', letterSpacing:'0.1em', textTransform:'uppercase' }}>{letter}</span>
              </div>
              {grouped[letter].map((cp: any) => {
                const initials = ((cp.first_name?.[0]||'') + (cp.last_name?.[0]||cp.name?.[0]||'')).toUpperCase() || '?'
                const displayName = cp.first_name || cp.last_name
                  ? [cp.first_name, cp.last_name].filter(Boolean).join(' ')
                  : cp.name || '–'
                const isPrivat = cp._isCust === true
                const hasRole = cp.role && cp.role !== 'Privatperson'
                return (
                  <div key={cp.id} onClick={() => setSelectedContact(cp)} style={{ display:'flex', alignItems:'center', gap:14, background:'var(--surf-card)', borderRadius:16, padding:'14px 16px', marginBottom:8, border:'0.5px solid var(--outline)', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--pri-xl)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='var(--surf-card)')}>
                    {/* Avatar */}
                    <div style={{ width:44, height:44, borderRadius:14, background: 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color: '#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, fontFamily:'var(--font-head)', flexShrink:0, boxShadow: '0 4px 10px rgba(9,106,112,0.2)' }}>
                      {initials}
                    </div>
                    {/* Content */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom: hasRole || cp.phone || cp.email ? 3 : 0 }}>
                        <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{displayName}</div>

                      </div>
                      {hasRole && (
                        <div style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:600, marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:13 }}>work</span>
                          {cp.role}
                        </div>
                      )}
                      </div>
                    {/* Icon-Buttons phone/mail */}
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {cp.phone && (
                        <a href={'tel:' + cp.phone} onClick={e => e.stopPropagation()} style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--pri)', textDecoration:'none', flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:17 }}>phone</span>
                        </a>
                      )}
                      {cp.email && (
                        <a href={'mailto:' + cp.email} onClick={e => e.stopPropagation()} style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--pri)', textDecoration:'none', flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:17 }}>mail</span>
                        </a>
                      )}
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>chevron_right</span>
                  </div>
                )
              })}
            </div>
          ))}
          <div style={{ height:80 }}/>
        </>
      )}

      {/* Kontaktkarte */}
      {selectedContact && (() => {
        const cp = selectedContact
        const isPrivat = cp._isCust === true
        const displayName = cp.first_name || cp.last_name
          ? [cp.first_name, cp.last_name].filter(Boolean).join(' ')
          : cp.name || '–'
        const initials = ((cp.first_name?.[0]||'') + (cp.last_name?.[0]||cp.name?.[0]||'')).toUpperCase() || '?'
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1100, display:'flex', alignItems: window.innerWidth >= 768 ? 'center' : 'flex-end', justifyContent: window.innerWidth >= 768 ? 'center' : 'stretch' }}
            onClick={() => { setSelectedContact(null); setEditMode(false); setShowDeleteConfirm(false) }}>
            <div style={{ background:'var(--bg)', borderRadius: window.innerWidth >= 768 ? 20 : '24px 24px 0 0', width: window.innerWidth >= 768 ? 420 : '100%', maxHeight:'92vh', overflowY:'auto', paddingBottom: window.innerWidth >= 768 ? 0 : 'env(safe-area-inset-bottom, 20px)', boxShadow: window.innerWidth >= 768 ? '0 8px 40px rgba(0,0,0,0.2)' : 'none' }}
              onClick={e => e.stopPropagation()}>
              {/* Handle + Header-Zeile */}
              <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
                <div style={{ width:36, height:4, borderRadius:2, background:'var(--surf-high)' }}/>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px 0' }}>
                <div style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)' }}>
                  {editMode ? 'Bearbeiten' : 'Ansprechpartner'}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {!editMode && (
                    <button onClick={() => openEdit(cp)} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', padding:'6px 12px', borderRadius:999, border:'none', cursor:'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:14 }}>edit</span> Bearbeiten
                    </button>
                  )}
                  <button onClick={() => { setSelectedContact(null); setEditMode(false); setShowDeleteConfirm(false) }} style={{ background:'var(--surf-low)', border:'none', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)' }}>close</span>
                  </button>
                </div>
              </div>

              {editMode && editData ? (
                /* ── Edit-Formular ── */
                <div style={{ padding:'16px 16px 0' }}>
                  {/* Avatar + Trash-Icon in einer Zeile */}
                  <div style={{ display:'flex', justifyContent:'center', alignItems:'center', marginBottom:18, position:'relative' }}>
                    <div style={{ width:64, height:64, borderRadius:20, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:22, fontFamily:'var(--font-head)' }}>
                      {((editData.first_name?.[0]||'') + (editData.last_name?.[0]||'')).toUpperCase() || initials}
                    </div>
                    {/* Dezenter Papierkorb — nur für echte contact_persons */}
                    {!cp._isCust && (
                      <button onClick={() => setShowDeleteConfirm(true)} title="Löschen" style={{ position:'absolute', right:0, top:0, background:'none', border:'none', cursor:'pointer', padding:6, color:'var(--err)', opacity:0.45, transition:'opacity 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity='1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity='0.45')}>
                        <span className="material-symbols-outlined" style={{ fontSize:20 }}>delete</span>
                      </button>
                    )}
                  </div>
                  {/* Dezenter Hinweis für Privatpersonen */}
                  {cp._isCust && (
                    <div style={{ fontSize:11, color:'var(--txt-muted)', textAlign:'center', marginBottom:14, marginTop:-10 }}>
                      Wird als Kunden-Datensatz gespeichert
                    </div>
                  )}
                  {[
                    { key:'first_name', label:'Vorname', icon:'badge', placeholder:'Max' },
                    { key:'last_name',  label:'Nachname', icon:'badge', placeholder:'Mustermann' },
                    ...(!cp._isCust ? [{ key:'role', label:'Funktion / Rolle', icon:'work', placeholder:'z.B. Hausmeister' }] : []),
                    { key:'phone',      label:'Telefon', icon:'phone', placeholder:'+49 …' },
                    { key:'email',      label:'E-Mail', icon:'mail', placeholder:'max@beispiel.de' },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--txt-muted)', marginBottom:5, display:'flex', alignItems:'center', gap:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:13 }}>{f.icon}</span>{f.label}
                      </div>
                      <input
                        value={(editData as any)[f.key]}
                        onChange={e => setEditData((prev: any) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        style={{ width:'100%', padding:'11px 13px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)', fontSize:14, color:'var(--txt)', outline:'none', boxSizing:'border-box' }}
                      />
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                    <button onClick={() => { setEditMode(false); setShowDeleteConfirm(false) }} style={{ flex:1, padding:'13px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                      Abbrechen
                    </button>
                    <button onClick={() => saveEdit(cp)} disabled={editSaving} style={{ flex:2, padding:'13px', borderRadius:14, border:'none', background: editSaving ? 'var(--surf-high)' : 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color: editSaving ? 'var(--txt-muted)' : '#fff', fontSize:14, fontWeight:700, cursor: editSaving ? 'default' : 'pointer' }}>
                      {editSaving ? 'Speichern …' : 'Speichern'}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Lese-Ansicht ── */
                <>
                  {/* Avatar + Name */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 20px 16px', gap:10 }}>
                    <div style={{ width:72, height:72, borderRadius:22, background: isPrivat ? 'var(--pri-xl)' : 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color: isPrivat ? 'var(--pri)' : '#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:24, fontFamily:'var(--font-head)', boxShadow: isPrivat ? 'none' : '0 6px 20px rgba(9,106,112,0.3)' }}>
                      {initials}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', marginBottom:4 }}>{displayName}</div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                        {cp.role && cp.role !== 'Privatperson' && (
                          <span style={{ fontSize:12, color:'var(--txt-sec)', fontWeight:600 }}>{cp.role}</span>
                        )}
                        {isPrivat && <span style={{ fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', borderRadius:6, padding:'2px 8px' }}>Privatperson</span>}
                      </div>
                    </div>
                  </div>
                  {/* Infos */}
                  <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10 }}>
                    {(cp.phone || cp.email) && (
                      <div style={{ background:'var(--surf-card)', borderRadius:16, overflow:'hidden', border:'1px solid var(--outline)' }}>
                        {cp.phone && (
                          <a href={'tel:' + cp.phone} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', textDecoration:'none', borderBottom: cp.email ? '1px solid var(--outline)' : 'none' }}>
                            <div style={{ width:38, height:38, borderRadius:12, background:'#e8f5e9', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <span className="material-symbols-outlined" style={{ fontSize:20, color:'#2e7d32' }}>phone</span>
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Telefon</div>
                              <div style={{ fontSize:15, fontWeight:700, color:'var(--pri)', marginTop:1 }}>{cp.phone}</div>
                            </div>
                          </a>
                        )}
                        {cp.email && (
                          <a href={'mailto:' + cp.email} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', textDecoration:'none' }}>
                            <div style={{ width:38, height:38, borderRadius:12, background:'#e3f2fd', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              <span className="material-symbols-outlined" style={{ fontSize:20, color:'#1565c0' }}>mail</span>
                            </div>
                            <div>
                              <div style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>E-Mail</div>
                              <div style={{ fontSize:15, fontWeight:700, color:'var(--pri)', marginTop:1 }}>{cp.email}</div>
                            </div>
                          </a>
                        )}
                      </div>
                    )}
                    {cp.customers?.name && (
                      <div style={{ background:'var(--surf-card)', borderRadius:16, border:'1px solid var(--outline)', padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:38, height:38, borderRadius:12, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:20, color:'var(--pri)' }}>
                            {cp.customers.customer_type === 'privatperson' ? 'person' : cp.customers.customer_type === 'firma' ? 'business' : 'apartment'}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:'var(--txt-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Kunde</div>
                          <div style={{ fontSize:15, fontWeight:700, color:'var(--txt)', marginTop:1 }}>{cp.customers.name}</div>
                        </div>
                      </div>
                    )}
                    {/* Alle verknüpften Objekte mit Collapse */}
                    {(() => {
                      if (cp._isCust) return null
                      const matchIds = new Set<string>()
                      contacts.forEach((c: any) => {
                        if (c.object_id && c.first_name === cp.first_name && c.last_name === (cp.last_name || cp.name))
                          matchIds.add(c.object_id)
                      })
                      if (cp.object_id) matchIds.add(cp.object_id)
                      const linkedObjs = objects.filter((o: any) => matchIds.has(o.id))
                      if (linkedObjs.length === 0) return null
                      return <ObjekteListe objs={linkedObjs} onNav={(o:any) => { setSelectedContact(null); onNavigateToObject?.(o) }} />
                    })()}
                  </div>
                  {/* Schließen */}
                  <div style={{ padding:'0 16px 16px' }}>
                    <button onClick={() => setSelectedContact(null)} style={{ width:'100%', padding:'13px', borderRadius:14, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                      Schließen
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Lösch-Bestätigungs-Popup (separates Mini-Modal) */}
      {showDeleteConfirm && selectedContact && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 32px' }}
          onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background:'var(--bg)', borderRadius:20, padding:'24px 20px', width:'100%', maxWidth:340, boxShadow:'0 8px 40px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:44, height:44, borderRadius:14, background:'var(--err-bg)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <span className="material-symbols-outlined" style={{ fontSize:22, color:'var(--err)' }}>delete</span>
            </div>
            <div style={{ fontSize:15, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', textAlign:'center', marginBottom:6 }}>Löschen?</div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', textAlign:'center', lineHeight:1.5, marginBottom:20 }}>
              Wird von allen Objekten entfernt.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex:1, padding:'12px', borderRadius:13, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={() => deleteContact(selectedContact)} style={{ flex:1, padding:'12px', borderRadius:13, border:'none', background:'var(--err)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.8)', color:'#fff', padding:'10px 20px', borderRadius:999, fontSize:13, fontWeight:600, zIndex:1300, whiteSpace:'nowrap', pointerEvents:'none' }}>
          {toast}
        </div>
      )}

      {/* Export-Modal */}
      {showExport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-end' }} onClick={() => setShowExport(false)}>
          <div style={{ background:'var(--bg)', borderRadius:'20px 20px 0 0', width:'100%', padding:'20px 20px 32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:4 }}>Ansprechpartner exportieren</div>
            <div style={{ fontSize:13, color:'var(--txt-muted)', marginBottom:20 }}>{sorted.length} Einträge · XLSX für Excel</div>
            <button onClick={exportXlsx} style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <span className="material-symbols-outlined">download</span> Als XLSX herunterladen
            </button>
          </div>
        </div>
      )}
    </>
  )
}

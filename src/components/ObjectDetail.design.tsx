// @ts-nocheck
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  DESIGN REFERENCE — NICHT IMPORTIERT, BRICHT NICHTS                ║
 * ║  Diese Datei existiert nur zur Analyse durch Claude Design.         ║
 * ║  Der echte Code liegt in: src/pages/Dashboard.tsx (ab Zeile 1947)  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * TECH STACK:
 *   React 18 + TypeScript + Vite
 *   Styling: 100% Inline-Styles mit CSS-Variablen (kein CSS-Framework)
 *   Icons: Material Symbols Outlined (Google Fonts)
 *   Schriften: Manrope (Headlines / --font-head), Inter (Fließtext / --font-body)
 *
 * CSS DESIGN TOKENS (aus global.css):
 *   --pri:       #096a70   (Teal — Primärfarbe)
 *   --pri-c:     #0c8f85   (Teal-Gradient-Ende)
 *   --pri-l:     #a8ece8   (Teal-Hell — Border-Akzent)
 *   --pri-xl:    #d4f5f2   (Teal-Hauch — Hintergrund-Akzent)
 *   --sec:       #4a6b68
 *   --sec-c:     #c2e8e4
 *   --bg:        #f8f9fa   (Seiten-Hintergrund)
 *   --surf-low:  #f3f4f5
 *   --surf-card: #ffffff   (Karten-Hintergrund)
 *   --surf-high: #e7e8e9
 *   --txt:       #191c1d   (Fließtext)
 *   --txt-sec:   #3f484a
 *   --txt-muted: #6f797b
 *   --outline:   #bfc8ca   (Border)
 *   --ok:        #166534   (Grün)
 *   --ok-bg:     #dcfce7
 *   --err:       #93000a   (Rot)
 *   --err-bg:    #ffdad6
 *   --warn:      #92400e
 *   --warn-bg:   #fef3c7
 *   --font-head: 'Manrope', sans-serif
 *   --font-body: 'Inter', sans-serif
 *
 * ICON-KLASSEN:
 *   className="material-symbols-outlined"           (24px, Outlined)
 *   className="material-symbols-outlined icon-fill" (24px, Filled)
 *   className="material-symbols-outlined icon-sm"   (18px)
 *   className="material-symbols-outlined icon-lg"   (28px)
 *
 * STATUS-DEFINITIONEN:
 *   offen     → bg:#fff8e6   color:#92400e  icon:radio_button_unchecked
 *   in_arbeit → bg:#e0f4f6   color:#096a70  icon:pending
 *   erledigt  → bg:#dcfce7   color:#166534  icon:check_circle
 *   problem   → bg:#ffdad6   color:#93000a  icon:error
 *
 * AUFGABEN-INTERVALLE & ICONS:
 *   täglich → today | wöchentlich → date_range | monatlich → calendar_month
 *   quartalsweise → event_repeat | einmalig → looks_one
 *
 * OBJEKTDETAIL-STRUKTUR (was diese Seite zeigt):
 *   1. Header: Zurück-Button, Objekt-Name, Adresse, Aktions-Buttons (QR, Verlauf, Karte)
 *   2. Info-Block: Kunde · Ansprechpartner-Chips · Standort · Objektleiter
 *   3. Leistungen: Liste der wiederkehrenden Aufgaben (Tasks) mit Toggle + Bearbeiten
 *   4. Nächste Termine: Nach Datum gruppierte Aufgaben der nächsten 30 Tage
 *
 * PROPS:
 *   obj                 – Objekt-Datensatz (id, name, address, city, customer_id, …)
 *   tasks               – Tasks dieses Objekts (mit categories, users, contracts)
 *   team                – Alle Mitarbeiter
 *   categories          – Alle Kategorien
 *   objects             – Alle Objekte (für Dropdown)
 *   onBack              – Zurück zur Liste
 *   onEditTask(t)       – Task-Edit-Overlay öffnen
 *   onToggleTask(id, active) – Task aktivieren/pausieren
 *   onNewTask()         – Neue Aufgabe anlegen
 *   onHistory()         – Verlauf-Overlay
 *   onQR()              – QR-Code-Overlay
 *   onRefresh()         – Daten neu laden
 *   onObjectUpdated(o)  – Objekt-Daten aktualisiert
 *   onObjectDeleted()   – Objekt gelöscht
 *   onNavigateToCustomer(id) – Zum Kunden navigieren
 *   onToast(msg, type)  – Toast-Nachricht anzeigen
 */

// ─── Konstanten ───────────────────────────────────────────────────────────────

const INTERVAL_ICONS: Record<string, string> = {
  täglich: 'today',
  wöchentlich: 'date_range',
  monatlich: 'calendar_month',
  quartalsweise: 'event_repeat',
  einmalig: 'looks_one',
}

const STATUS_META: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  offen:     { label: 'Offen',     icon: 'radio_button_unchecked', bg: '#fff8e6', color: '#92400e' },
  in_arbeit: { label: 'In Arbeit', icon: 'pending',                bg: '#e0f4f6', color: '#096a70' },
  erledigt:  { label: 'Erledigt',  icon: 'check_circle',           bg: '#dcfce7', color: '#166534' },
  problem:   { label: 'Problem',   icon: 'error',                  bg: '#ffdad6', color: '#93000a' },
}

function ObjectDetail({ obj, tasks, team, categories, objects, onBack, onEditTask, onToggleTask, onNewTask, onHistory, onQR, onRefresh, onObjectUpdated, onObjectDeleted, onNavigateToCustomer, onToast }: {
  obj: ObjectItem; tasks: TaskItem[]; team: TeamMember[]; categories: Category[]; objects: ObjectItem[]
  onBack: () => void; onEditTask: (t: TaskItem) => void; onToggleTask: (id: string, cur: boolean) => void
  onNewTask: () => void; onHistory: () => void; onQR: () => void; onRefresh: () => void
  onObjectUpdated: (updated: ObjectItem) => void; onObjectDeleted: () => void
  onNavigateToCustomer?: (customerId: string) => void
  onToast?: (msg: string, type: 'ok'|'warn'|'info') => void
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
    <div style={{ paddingBottom: 100, maxWidth:860, margin:'0 auto', width:'100%' }}>
      {/* Back header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 0 12px' }}>
        <button onClick={onBack} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:12, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:20, color:'var(--txt-muted)' }}>arrow_back</span>
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <h1 style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {obj.address}, {obj.postal_code} {obj.city}
          </h1>
          {obj.object_number && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{obj.object_number}</div>}
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={onHistory} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>history</span>
          </button>
          <button onClick={onQR} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>qr_code</span>
          </button>
          <button onClick={generateCustomerLink} title="Kunden-Link" style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>share</span>
          </button>
          <button onClick={() => setShowEdit(true)} style={{ background:'var(--pri)', border:'none', borderRadius:10, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm" style={{ color:'#fff' }}>edit</span>
          </button>
        </div>
      </div>

      {loadingDetail ? <Loader/> : (<>

        {/* ══ INFO-BLOCK: Kunde · Ansprechpartner · Standort · Objektleiter ══ */}
        <div style={{ background:'var(--surf-card)', border:'1px solid var(--outline)', borderRadius:16, marginBottom:16, overflow:'hidden' }}>

          {/* ── Kunde ── */}
          {customer && (() => {
            const typeLabel: Record<string,string> = { privatperson:'Privatperson', firma:'Firma', 'weg-verwaltung':'WEG-Verwaltung', mietverwaltung:'Mietverwaltung' }
            const typeIcon: Record<string,string>  = { privatperson:'person', firma:'business', 'weg-verwaltung':'apartment', mietverwaltung:'home_work' }
            const isHV = customer.customer_type==='weg-verwaltung'||customer.customer_type==='mietverwaltung'
            const rows: {label:string;value:React.ReactNode}[] = []
            if (customer.phone) rows.push({ label:'Tel', value:<a href={`tel:${customer.phone}`} style={{ color:'var(--pri)', textDecoration:'none' }}>{customer.phone}</a> })
            if (customer.email) rows.push({ label:'Mail', value:<a href={`mailto:${customer.email}`} style={{ color:'var(--pri)', textDecoration:'none' }}>{customer.email}</a> })
            if (customer.street) rows.push({ label:'Adresse', value:`${customer.street}, ${customer.postal_code||''} ${customer.city||''}`.trim() })
            if (isHV && customer.hausverwaltung) rows.push({ label:customer.customer_type==='mietverwaltung'?'Verwaltung':'Hausverwaltung', value:
              onNavigateToCustomer
                ? <button onClick={() => onNavigateToCustomer((customer.hausverwaltung as any).id)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:4, color:'var(--pri)', fontWeight:700, fontSize:'inherit' }}>
                    {customer.hausverwaltung.name}
                    <span className="material-symbols-outlined" style={{ fontSize:13 }}>open_in_new</span>
                  </button>
                : <span style={{ color:'var(--pri)', fontWeight:700 }}>{customer.hausverwaltung.name}</span>
            })
            if (isHV && customer.co_contact) rows.push({ label:'c/o', value:`${customer.co_contact.name}${customer.co_contact.role?' · '+customer.co_contact.role:''}` })
            if (isHV && customer.hausverwaltung_objekt_id) rows.push({ label:'Objekt-ID', value:<span style={{ fontFamily:'monospace', fontWeight:700 }}>{customer.hausverwaltung_objekt_id}</span> })
            return (<>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Kunde</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: rows.length > 0 ? 10 : 0 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:17, color:'var(--pri)' }}>{typeIcon[customer.customer_type]||'person'}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{customer.name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                      <span style={{ fontSize:10, color:'var(--txt-muted)', background:'var(--surf-low)', borderRadius:20, padding:'1px 7px', border:'1px solid var(--outline)' }}>{typeLabel[customer.customer_type]||customer.customer_type}</span>
                      {customer.lexware_id && <span style={{ fontSize:10, color:'var(--pri)', background:'#e8f4f5', borderRadius:20, padding:'1px 7px', fontWeight:700 }}>LX</span>}
                    </div>
                  </div>
                </div>
                {rows.length > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', columnGap:14, rowGap:6 }}>
                    {rows.map((r,i) => (
                      <div key={i} style={{ display:'contents' }}>
                        <span style={{ fontSize:11, color:'var(--txt-muted)', alignSelf:'center', whiteSpace:'nowrap' }}>{r.label}</span>
                        <span style={{ fontSize:13, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ height:1, background:'var(--outline)' }}/>
            </>)
          })()}

          {/* ── Ansprechpartner ── */}
          <div style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: objContacts.length > 0 || showAddObjCp ? 12 : 0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Ansprechpartner{objContacts.length > 0 && <span style={{ marginLeft:6, background:'var(--pri-xl)', color:'var(--pri)', borderRadius:999, padding:'1px 6px', fontSize:10 }}>{objContacts.length}</span>}
              </div>
              {!showAddObjCp && (
                <button onClick={() => setShowAddObjCp(true)} style={{ background:'var(--pri-xl)', border:'none', color:'var(--pri)', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}>
                  <span className="material-symbols-outlined icon-sm">add</span> Hinzufügen
                </button>
              )}
            </div>

            {objContacts.length === 0 && !showAddObjCp && (
              <div style={{ fontSize:12, color:'var(--txt-muted)', paddingTop:2 }}>Noch keine Ansprechpartner hinterlegt.</div>
            )}

            {objContacts.map((cp, idx) => {
              const dn = [cp.first_name, cp.last_name].filter(Boolean).join(' ') || cp.name || '–'
              const ini = ((cp.first_name?.[0]||'')+(cp.last_name?.[0]||'')).toUpperCase() || '?'
              return (
                <div key={cp.id} onClick={() => { setSelectedObjContact(cp); setEditingObjContact(false) }}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop: idx > 0 ? '1px solid var(--outline)' : 'none', cursor:'pointer', transition:'opacity 0.15s' }}
                  onMouseEnter={e=>(e.currentTarget.style.opacity='0.7')} onMouseLeave={e=>(e.currentTarget.style.opacity='1')}>
                  <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:12, flexShrink:0 }}>{ini}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)' }}>{dn}</div>
                    {(cp.phone || cp.email) && <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{cp.phone || cp.email}</div>}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize:15, color:'var(--txt-muted)' }}>chevron_right</span>
                </div>
              )
            })}

            {showAddObjCp && (
              <div style={{ background:'var(--surf-low)', borderRadius:12, padding:12, border:'1.5px solid var(--pri)', marginTop:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:10, border:'1px solid var(--outline)', background:'var(--surf-card)', marginBottom:8 }}>
                  <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>search</span>
                  <input value={objCpSearchQ} onChange={e=>searchObjCp(e.target.value)} placeholder="Ansprechpartner suchen …" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--txt)' }}/>
                  {objCpSearching && <span className="material-symbols-outlined icon-sm" style={{ color:'var(--txt-muted)' }}>progress_activity</span>}
                  {objCpSearchQ && <button onClick={()=>{setObjCpSearchQ('');setObjCpSearchRes([])}} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', color:'var(--txt-muted)' }}><span className="material-symbols-outlined icon-sm">close</span></button>}
                </div>
                {objCpSearchRes.length > 0 && (
                  <div style={{ background:'var(--surf-card)', borderRadius:10, border:'1px solid var(--outline)', marginBottom:8, overflow:'hidden' }}>
                    {objCpSearchRes.map((cp:any) => (
                      <div key={cp._id} onClick={()=>{ addObjCp({first_name:cp.first_name,last_name:cp.last_name,role:cp.role,phone:cp.phone,email:cp.email}); setObjCpSearchQ(''); setObjCpSearchRes([]) }}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderBottom:'1px solid var(--outline)', cursor:'pointer' }}>
                        <div style={{ width:28, height:28, borderRadius:8, background:'var(--pri-xl)', color:'var(--pri)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:11 }}>
                          {(cp.first_name?.[0]||cp.last_name?.[0]||'?').toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>{cp.first_name} {cp.last_name}</div>
                          {cp.role && <div style={{ fontSize:11, color:'var(--txt-muted)' }}>{cp.role}</div>}
                        </div>
                        <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>add_circle</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:11, fontWeight:700, color:'var(--pri)', marginBottom:8 }}>Neuer Ansprechpartner</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, alignItems:'start', marginBottom:8 }}>
                  <div><label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Vorname</label>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                      <input value={newObjCpFn} onChange={e=>setNewObjCpFn(e.target.value)} placeholder="Max" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
                    </div>
                  </div>
                  <div><label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Nachname *</label>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                      <input value={newObjCpLn} onChange={e=>setNewObjCpLn(e.target.value)} placeholder="Mustermann" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom:8 }}><label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Funktion</label>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                    <input value={newObjCpRole} onChange={e=>setNewObjCpRole(e.target.value)} placeholder="Hausmeister" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, alignItems:'start', marginBottom:10 }}>
                  <div><label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Telefon</label>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                      <input value={newObjCpPhone} onChange={e=>setNewObjCpPhone(e.target.value)} placeholder="+49 561 …" inputMode="tel" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
                    </div>
                  </div>
                  <div><label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>E-Mail</label>
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)' }}>
                      <input value={newObjCpEmail} onChange={e=>setNewObjCpEmail(e.target.value)} placeholder="max@beispiel.de" inputMode="email" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:14, color:'var(--txt)' }}/>
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{setShowAddObjCp(false);setNewObjCpFn('');setNewObjCpLn('');setNewObjCpRole('');setNewObjCpPhone('');setNewObjCpEmail('');setObjCpSearchQ('');setObjCpSearchRes([])}} style={{ flex:1, padding:'9px', borderRadius:10, border:'1.5px solid var(--outline)', background:'var(--surf-card)', color:'var(--txt-sec)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Abbrechen</button>
                  <button disabled={(!newObjCpFn.trim() && !newObjCpLn.trim()) || objCpSaving} onClick={()=>addObjCp({first_name:newObjCpFn,last_name:newObjCpLn,role:newObjCpRole,phone:newObjCpPhone,email:newObjCpEmail})} style={{ flex:1, padding:'9px', borderRadius:10, border:'none', background:(newObjCpFn.trim()||newObjCpLn.trim())&&!objCpSaving?'var(--pri)':'var(--outline)', color:'#fff', fontSize:13, fontWeight:700, cursor:(newObjCpFn.trim()||newObjCpLn.trim())&&!objCpSaving?'pointer':'not-allowed' }}>Hinzufügen</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ height:1, background:'var(--outline)' }}/>

          {/* ── Standort ── */}
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Standort</div>
            <MapView address={obj.address} city={obj.city} postalCode={obj.postal_code}/>
          </div>

          <div style={{ height:1, background:'var(--outline)' }}/>

          {/* ── Objektleiter ── */}
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Objektleiter</div>
            {olList.length === 0 ? (
              <div style={{ fontSize:13, color:'var(--txt-muted)' }}>Noch keine Mitarbeiter mit Objektleiter-Rolle.</div>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                <div onClick={() => handleOlChange(null)}
                  style={{ padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:600, cursor:'pointer',
                    border:`1.5px solid ${currentOl===null?'var(--pri)':'var(--outline)'}`,
                    background:currentOl===null?'var(--pri-xl)':'transparent',
                    color:currentOl===null?'var(--pri)':'var(--txt-muted)' }}>Keiner</div>
                {olList.map(ol => (
                  <div key={ol.id} onClick={() => !olSaving && handleOlChange(ol.id)}
                    style={{ padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:600, cursor:olSaving?'wait':'pointer',
                      border:`1.5px solid ${currentOl===ol.id?'var(--pri)':'var(--outline)'}`,
                      background:currentOl===ol.id?'var(--pri-xl)':'transparent',
                      color:currentOl===ol.id?'var(--pri)':'var(--txt-muted)' }}>
                    {currentOl===ol.id && <span className="material-symbols-outlined" style={{ fontSize:13, verticalAlign:'middle', marginRight:3 }}>check</span>}
                    {ol.full_name}
                  </div>
                ))}
              </div>
            )}
            {olMsg && <div style={{ marginTop:8, fontSize:12, color:'var(--ok)', display:'flex', alignItems:'center', gap:4 }}><span className="material-symbols-outlined" style={{ fontSize:14 }}>check_circle</span>{olMsg}</div>}
          </div>
        </div>

        {/* ── Leistungen ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h3 style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Leistungen</h3>
            {tasks.filter(t=>t.is_active).length > 0 && (
              <span style={{ fontSize:11, fontWeight:700, color:'var(--ok)', background:'var(--ok-bg)', borderRadius:999, padding:'2px 8px' }}>
                {tasks.filter(t=>t.is_active).length} aktiv
              </span>
            )}
          </div>
          <button onClick={onNewTask} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', padding:'7px 14px', borderRadius:999, border:'none', cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:15 }}>add</span> Neue Leistung
          </button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ background:'var(--surf-low)', borderRadius:16, padding:'24px 16px', textAlign:'center', color:'var(--txt-muted)', fontSize:13, marginBottom:14 }}>
            <span className="material-symbols-outlined" style={{ fontSize:32, display:'block', marginBottom:8, opacity:0.35 }}>assignment</span>
            Noch keine Leistungen hinterlegt.
            <div style={{ fontSize:12, marginTop:4 }}>Lege die erste Leistung über den Button oben an.</div>
          </div>
        ) : tasks.map(t => {
          const cat = t.categories
          const user = t.users as any
          const taskUpcoming = upcomingAssigns.filter(a => a.task_id === t.id)
          const isExpired = t.end_date && new Date(t.end_date) < new Date()
          return (
            <div key={t.id} style={{ background:'var(--surf-card)', borderRadius:16, padding:'16px', marginBottom:10, border:'1px solid var(--outline)', opacity:t.is_active && !isExpired ? 1 : 0.5 }}>
              {/* Zeile 1: Emoji + Titel + Toggle */}
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                  {cat?.emoji || '📋'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', lineHeight:1.25, marginBottom:4 }}>
                    {t.title}
                  </div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', background:'var(--surf-high)', padding:'2px 7px', borderRadius:999, display:'flex', alignItems:'center', gap:3 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:11 }}>{INTERVAL_ICONS[t.interval]||'repeat'}</span>{t.interval}
                    </span>
                    {user?.full_name && (
                      <span style={{ fontSize:10, fontWeight:600, color:'var(--pri)', background:'var(--pri-xl)', padding:'2px 7px', borderRadius:999, display:'flex', alignItems:'center', gap:3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:11 }}>person</span>{user.full_name.split(' ')[0]}
                      </span>
                    )}
                    {t.contracts && (
                      <span style={{ fontSize:10, fontWeight:600, color:'var(--sec)', background:'var(--sec-c)', padding:'2px 7px', borderRadius:999 }}>
                        {t.contracts.type === 'jahresvertrag' ? 'Jahresvertrag' : 'Einmalig'}
                      </span>
                    )}
                    {!t.is_active && <span style={{ fontSize:10, fontWeight:700, color:'var(--txt-muted)', background:'var(--surf-high)', padding:'2px 7px', borderRadius:999 }}>Pausiert</span>}
                    {isExpired && <span style={{ fontSize:10, fontWeight:700, color:'var(--err)', background:'var(--err-bg)', padding:'2px 7px', borderRadius:999 }}>Abgelaufen</span>}
                    {t.end_date && !isExpired && (
                      <span style={{ fontSize:10, color:'var(--txt-muted)', padding:'2px 4px' }}>
                        bis {new Date(t.end_date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'2-digit'})}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={()=>onToggleTask(t.id, t.is_active)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:t.is_active && !isExpired?'var(--ok)':'var(--txt-muted)', flexShrink:0 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:28 }}>{t.is_active?'toggle_on':'toggle_off'}</span>
                </button>
              </div>
              {/* Zeile 2: Trennlinie + Aktionen */}
              <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--outline)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                  {taskUpcoming.length > 0 ? (
                    <span style={{ color:'var(--pri)', display:'flex', alignItems:'center', gap:4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:13 }}>event</span>
                      {taskUpcoming.length} Termin{taskUpcoming.length > 1 ? 'e' : ''} in 30 Tagen
                    </span>
                  ) : (
                    <span style={{ color:'var(--txt-muted)' }}>Keine Termine geplant</span>
                  )}
                </div>
                <button onClick={()=>onEditTask(t)} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--txt-muted)', background:'var(--surf-low)', padding:'5px 10px', borderRadius:999, border:'none', cursor:'pointer' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:13 }}>edit</span> Bearbeiten
                </button>
              </div>
            </div>
          )
        })}

        {/* ── Nächste Termine ── */}
        {upcomingAssigns.length > 0 && (() => {
          const grouped: Record<string, any[]> = {}
          upcomingAssigns.forEach((a: any) => {
            if (!grouped[a.due_date]) grouped[a.due_date] = []
            grouped[a.due_date].push(a)
          })
          const sortedDates = Object.keys(grouped).sort().slice(0, 14)
          const today = localToday()
          return (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:24, marginBottom:12 }}>
                <h3 style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', margin:0 }}>Nächste Termine</h3>
                <span style={{ fontSize:11, color:'var(--txt-muted)' }}>nächste 30 Tage</span>
              </div>
              {sortedDates.map(date => {
                const isToday = date === today
                const dateLabel = isToday ? 'Heute' : new Date(date).toLocaleDateString('de-DE', {weekday:'long', day:'2-digit', month:'2-digit'})
                const assignments = grouped[date]
                return (
                  <div key={date} style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ fontSize:12, fontWeight:700, color: isToday ? 'var(--pri)' : 'var(--txt-sec)', fontFamily:'var(--font-head)', whiteSpace:'nowrap' }}>
                        {dateLabel}
                      </div>
                      <div style={{ flex:1, height:1, background:'var(--outline)' }} />
                      <div style={{ fontSize:10, color:'var(--txt-muted)', whiteSpace:'nowrap' }}>{assignments.length} Aufgabe{assignments.length !== 1 ? 'n' : ''}</div>
                    </div>
                    <div style={{ background:'var(--surf-card)', borderRadius:14, border:`1px solid ${isToday ? 'var(--pri-l)' : 'var(--outline)'}`, overflow:'hidden' }}>
                      {assignments.map((a: any, idx: number) => {
                        const task = tasks.find(t => t.id === a.task_id)
                        const stMeta = STATUS_META[a.status] || STATUS_META['offen']
                        return (
                          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderTop: idx > 0 ? '1px solid var(--outline)' : 'none', background: isToday ? 'var(--pri-xl)' : 'transparent' }}>
                            <div style={{ fontSize:18, flexShrink:0, lineHeight:1 }}>{task?.categories?.emoji || '📋'}</div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {task?.title}
                              </div>
                              <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{(a.users as any)?.full_name || '–'}</div>
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color:stMeta.color, background:stMeta.bg, padding:'3px 8px', borderRadius:999, flexShrink:0 }}>
                              {stMeta.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {Object.keys(grouped).length > 14 && (
                <div style={{ textAlign:'center', fontSize:12, color:'var(--txt-muted)', padding:'4px 0 8px' }}>
                  +{Object.keys(grouped).length - 14} weitere Tage
                </div>
              )}
            </>
          )
        })()}

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
                      await supabase.from('task_reports').delete().in('assignment_id', assignIds)
                      // 4. Task-Assignments löschen
                      await supabase.from('task_assignments').delete().in('id', assignIds)
                    }
                    // 5. Tasks löschen
                    await supabase.from('tasks').delete().in('id', taskIds)
                  }
                  // 5. Ansprechpartner (contact_persons mit object_id) löschen
                  await supabase.from('contact_persons').delete().eq('object_id', obj.id)
                  // 6. Leistungen löschen
                  await supabase.from('object_services').delete().eq('object_id', obj.id)
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
                    <button onClick={async()=>{ if(!window.confirm(`${dn} wirklich entfernen?`)) return; await removeObjCp(cp.id); setSelectedObjContact(null) }}
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


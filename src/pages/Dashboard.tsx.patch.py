with open('src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

start = content.find("function ObjectDetail(")
old_section_start = content.find("  const [customerLink,", start)
old_section_end = content.find("\n// ─── Edit Object Overlay", start)

old_section = content[old_section_start:old_section_end]

new_section = r'''  const [customerLink, setCustomerLink] = useState<string | null>(null)
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

  useEffect(() => {
    const load = async () => {
      setLoadingDetail(true)
      const today = localToday()
      const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
      const to30 = in30.toISOString().slice(0, 10)
      const taskIds = tasks.map(t => t.id)

      const [custRes, assignRes] = await Promise.all([
        obj.customer_id
          ? supabase.from('customers').select('*').eq('id', obj.customer_id).single()
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
      setLoadingDetail(false)
    }
    load()
  }, [obj.id, tasks.length])

  return (
    <div style={{ paddingBottom: 100 }}>
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

        {/* ── Kundenkarte ── */}
        {customer && (
          <div style={{ background:'var(--surf-card)', borderRadius:16, padding:'16px', marginBottom:14, border:'1px solid var(--outline)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:36, height:36, borderRadius:12, background:'var(--pri-xl)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span className="material-symbols-outlined icon-sm" style={{ color:'var(--pri)' }}>{customer.customer_type==='firma'?'business':'person'}</span>
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)' }}>{customer.name}</div>
                <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>
                  {customer.customer_type==='firma'?'Firma':'Privatperson'}
                  {customer.lexware_id && <span style={{ marginLeft:8, background:'#e8f4f5', color:'var(--pri)', borderRadius:999, padding:'1px 6px', fontSize:10, fontWeight:700 }}>LX</span>}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {customer.contact_person && <div style={{ fontSize:12, color:'var(--txt-sec)', display:'flex', gap:8 }}><span style={{ color:'var(--txt-muted)', minWidth:80 }}>Ansprechp.</span>{customer.contact_person}</div>}
              {customer.phone && <div style={{ fontSize:12, color:'var(--txt-sec)', display:'flex', gap:8 }}><span style={{ color:'var(--txt-muted)', minWidth:80 }}>Telefon</span><a href={`tel:${customer.phone}`} style={{ color:'var(--pri)', textDecoration:'none' }}>{customer.phone}</a></div>}
              {customer.email && <div style={{ fontSize:12, color:'var(--txt-sec)', display:'flex', gap:8 }}><span style={{ color:'var(--txt-muted)', minWidth:80 }}>E-Mail</span><a href={`mailto:${customer.email}`} style={{ color:'var(--pri)', textDecoration:'none' }}>{customer.email}</a></div>}
              {customer.street && <div style={{ fontSize:12, color:'var(--txt-sec)', display:'flex', gap:8 }}><span style={{ color:'var(--txt-muted)', minWidth:80 }}>Adresse</span>{customer.street}, {customer.postal_code} {customer.city}</div>}
            </div>
          </div>
        )}

        {/* ── Leistungen ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h3 style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)' }}>
            Leistungen
            <span style={{ marginLeft:8, fontSize:11, fontWeight:600, color:'var(--txt-muted)', background:'var(--surf-high)', borderRadius:999, padding:'2px 8px' }}>
              {tasks.filter(t=>t.is_active).length} aktiv
            </span>
          </h3>
          <button onClick={onNewTask} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:'var(--pri)', background:'var(--pri-xl)', padding:'6px 12px', borderRadius:999, border:'none', cursor:'pointer' }}>
            <span className="material-symbols-outlined icon-sm">add</span> Neue Leistung
          </button>
        </div>

        {tasks.length === 0 ? (
          <div style={{ background:'var(--surf-low)', borderRadius:14, padding:'20px 16px', textAlign:'center', color:'var(--txt-muted)', fontSize:13, marginBottom:14 }}>
            <span className="material-symbols-outlined" style={{ fontSize:28, display:'block', marginBottom:6, opacity:0.4 }}>assignment</span>
            Noch keine Leistungen hinterlegt.<br/>
            <span style={{ fontSize:12 }}>Lege die erste Leistung über den Button oben an.</span>
          </div>
        ) : tasks.map(t => {
          const cat = t.categories
          const user = t.users as any
          const taskUpcoming = upcomingAssigns.filter(a => a.task_id === t.id)
          const isExpired = t.end_date && new Date(t.end_date) < new Date()
          return (
            <div key={t.id} style={{ background:'var(--surf-card)', borderRadius:14, padding:'14px', marginBottom:8, border:'1px solid var(--outline)', opacity:t.is_active && !isExpired ? 1 : 0.55 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:'var(--surf-low)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {cat?.emoji || '📋'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, fontFamily:'var(--font-head)', marginBottom:5, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    {t.title}
                    {!t.is_active && <span style={{ fontSize:9, fontWeight:700, color:'var(--txt-muted)', background:'var(--surf-high)', padding:'2px 6px', borderRadius:999 }}>Pausiert</span>}
                    {isExpired && <span style={{ fontSize:9, fontWeight:700, color:'var(--err)', background:'var(--err-bg)', padding:'2px 6px', borderRadius:999 }}>Abgelaufen</span>}
                  </div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom: taskUpcoming.length > 0 ? 6 : 0 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:'var(--txt-muted)', background:'var(--surf-high)', padding:'2px 8px', borderRadius:999, display:'flex', alignItems:'center', gap:3 }}>
                      <span className="material-symbols-outlined icon-sm">{INTERVAL_ICONS[t.interval]||'repeat'}</span>{t.interval}
                    </span>
                    {user?.full_name && (
                      <span style={{ fontSize:10, fontWeight:600, color:'var(--pri)', background:'var(--pri-xl)', padding:'2px 8px', borderRadius:999, display:'flex', alignItems:'center', gap:3 }}>
                        <span className="material-symbols-outlined icon-sm">person</span>{user.full_name.split(' ')[0]}
                      </span>
                    )}
                    {t.contracts && (
                      <span style={{ fontSize:10, fontWeight:600, color:'var(--sec)', background:'var(--sec-c)', padding:'2px 8px', borderRadius:999 }}>
                        {t.contracts.type === 'jahresvertrag' ? 'Jahresvertrag' : 'Einmalig'}
                      </span>
                    )}
                    {t.end_date && !isExpired && (
                      <span style={{ fontSize:10, color:'var(--txt-muted)', padding:'2px 4px' }}>
                        bis {new Date(t.end_date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'2-digit'})}
                      </span>
                    )}
                  </div>
                  {taskUpcoming.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--pri)' }}>
                      <span className="material-symbols-outlined icon-sm">event</span>
                      {taskUpcoming.length} Termin{taskUpcoming.length > 1 ? 'e' : ''} in 30 Tagen
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={()=>onEditTask(t)} style={{ background:'var(--surf-low)', border:'1px solid var(--outline)', borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--txt-muted)' }}>
                    <span className="material-symbols-outlined icon-sm">edit</span>
                  </button>
                  <button onClick={()=>onToggleTask(t.id, t.is_active)} style={{ background:'none', border:'none', padding:4, cursor:'pointer', color:t.is_active?'var(--ok)':'var(--txt-muted)' }}>
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize:24 }}>{t.is_active?'toggle_on':'toggle_off'}</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* ── Nächste Termine ── */}
        {upcomingAssigns.length > 0 && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:22, marginBottom:10 }}>
              <h3 style={{ fontSize:14, fontWeight:800, fontFamily:'var(--font-head)' }}>Nächste Termine</h3>
              <span style={{ fontSize:11, color:'var(--txt-muted)' }}>nächste 30 Tage</span>
            </div>
            {upcomingAssigns.slice(0, 10).map((a:any) => {
              const task = tasks.find(t => t.id === a.task_id)
              const stMeta = STATUS_META[a.status] || STATUS_META['offen']
              const isToday = a.due_date === localToday()
              return (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background: isToday ? 'var(--pri-xl)' : 'var(--surf-card)', borderRadius:12, marginBottom:6, border: isToday ? '1px solid var(--pri-l)' : '1px solid var(--outline)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:stMeta.color, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {task?.categories?.emoji} {task?.title}
                    </div>
                    <div style={{ fontSize:11, color:'var(--txt-muted)', marginTop:1 }}>{(a.users as any)?.full_name || '–'}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: isToday ? 'var(--pri)' : 'var(--txt-sec)' }}>
                      {isToday ? 'Heute' : new Date(a.due_date).toLocaleDateString('de-DE', {weekday:'short', day:'2-digit', month:'2-digit'})}
                    </div>
                    <div style={{ fontSize:10, color:stMeta.color, fontWeight:600 }}>{stMeta.label}</div>
                  </div>
                </div>
              )
            })}
            {upcomingAssigns.length > 10 && (
              <div style={{ textAlign:'center', fontSize:12, color:'var(--txt-muted)', padding:'6px 0 4px' }}>
                +{upcomingAssigns.length - 10} weitere Termine
              </div>
            )}
          </>
        )}

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
                const { data: objTasks } = await supabase.from('tasks').select('id').eq('object_id', obj.id)
                if (objTasks && objTasks.length > 0) {
                  const taskIds = objTasks.map((t: any) => t.id)
                  await supabase.from('task_assignments').delete().in('task_id', taskIds)
                  await supabase.from('tasks').delete().eq('object_id', obj.id)
                }
                await supabase.from('object_services').delete().eq('object_id', obj.id)
                await supabase.from('objects').delete().eq('id', obj.id)
                setDeleting(false); setShowDeleteConfirm(false); onObjectDeleted()
              }} style={{ flex:1, padding:'14px', borderRadius:14, border:'none', background:'var(--err)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
'''

new_content = content[:old_section_start] + new_section + content[old_section_end:]
with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(new_content)
print("SUCCESS: ObjectDetail rewritten")
print(f"New section length: {len(new_section)}")

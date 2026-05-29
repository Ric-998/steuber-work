import { useEffect, useState } from 'react'

interface ObjectData {
  id: string
  name: string
  address: string
  city: string
  postal_code: string
  customers: { name: string } | null
}

interface TaskRow {
  title: string
  due_date: string
  status: string
}

interface Props {
  token: string
}

const STATUS_DISPLAY: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  erledigt:   { icon: '✓',  label: 'Erledigt',  color: '#166534', bg: '#dcfce7' },
  offen:      { icon: '⏳', label: 'Ausstehend', color: '#92400e', bg: '#fff8e6' },
  in_arbeit:  { icon: '⏳', label: 'In Arbeit',  color: '#096a70', bg: '#e0f4f6' },
  problem:    { icon: '⚠',  label: 'Problem',    color: '#93000a', bg: '#ffdad6' },
  vertretung: { icon: '⏳', label: 'Ausstehend', color: '#92400e', bg: '#fff8e6' },
}

const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`
}

export default function CustomerStatusPage({ token }: Props) {
  const [object, setObject] = useState<ObjectData | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/get-object-status?token=${encodeURIComponent(token)}`
        )
        if (res.status === 404) { setError('Dieser Link ist ungültig oder wurde widerrufen.'); setLoading(false); return }
        if (res.status === 410) { setError('Dieser Link ist abgelaufen. Bitte wenden Sie sich an Steuber Dienstleistungen.'); setLoading(false); return }
        if (!res.ok) { setError('Fehler beim Laden der Daten.'); setLoading(false); return }
        const json = await res.json()
        setObject(json.object)
        setTasks(json.tasks)
      } catch {
        setError('Verbindung fehlgeschlagen. Bitte versuchen Sie es später erneut.')
      }
      setLoading(false)
    }
    load()
  }, [token])

  const today = new Date()
  today.setHours(0,0,0,0)

  const pastTasks   = tasks.filter(t => new Date(t.due_date) < today)
  const futureTasks = tasks.filter(t => new Date(t.due_date) >= today)

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#f8fafb', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,#085f69,#0c8f85)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 24px rgba(9,106,112,0.22)' }}>
        <span style={{ color:'#fff', fontSize:24, fontWeight:800, fontFamily:'Manrope,sans-serif' }}>S</span>
      </div>
      <div style={{ fontSize:14, color:'#6b7a7b' }}>Wird geladen…</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'#f8fafb', fontFamily:'Inter,system-ui,sans-serif', padding:24, textAlign:'center' }}>
      <div style={{ fontSize:40 }}>🔒</div>
      <div style={{ fontSize:18, fontWeight:700, fontFamily:'Manrope,sans-serif', color:'#1a2020' }}>Kein Zugriff</div>
      <div style={{ fontSize:14, color:'#6b7a7b', maxWidth:340, lineHeight:1.6 }}>{error}</div>
      <div style={{ fontSize:12, color:'#9ba8a9', marginTop:8 }}>SteuberWork · Steuber Dienstleistungen GmbH</div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#f0f6f7', fontFamily:'Inter,system-ui,sans-serif', color:'#1a2020' }}>

      {/* Header bar */}
      <div style={{ background:'linear-gradient(135deg,#085f69,#0c8f85)', padding:'24px 20px 28px', boxShadow:'0 4px 20px rgba(9,106,112,0.18)' }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'#fff', fontSize:20, fontWeight:800, fontFamily:'Manrope,sans-serif' }}>S</span>
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:500 }}>Steuber Dienstleistungen GmbH</div>
          </div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#fff', fontFamily:'Manrope,sans-serif', letterSpacing:'-0.02em', marginBottom:4 }}>
            Aufgabenstatus
          </h1>
          {object && (
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.8)', lineHeight:1.5 }}>
              {object.address}, {object.postal_code} {object.city}
              {object.customers && (
                <span style={{ display:'block', fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
                  Kunde: {object.customers.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'20px 16px 60px' }}>

        {/* Stats summary */}
        {tasks.length > 0 && (
          <div style={{ display:'flex', gap:10, marginBottom:20 }}>
            {[
              { label:'Erledigt',    count: tasks.filter(t=>t.status==='erledigt').length,  color:'#166534', bg:'#dcfce7' },
              { label:'Ausstehend',  count: tasks.filter(t=>t.status!=='erledigt'&&t.status!=='problem').length, color:'#096a70', bg:'#e0f4f6' },
              { label:'Probleme',    count: tasks.filter(t=>t.status==='problem').length,   color:'#93000a', bg:'#ffdad6' },
            ].map(s => (
              <div key={s.label} style={{ flex:1, background:'#fff', borderRadius:16, padding:'14px 12px', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', border:'1px solid #edf1f2' }}>
                <div style={{ fontSize:26, fontWeight:800, fontFamily:'Manrope,sans-serif', color:s.count>0?s.color:'#c8d0d1', lineHeight:1 }}>{s.count}</div>
                <div style={{ fontSize:10, fontWeight:700, color:'#9ba8a9', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'#9ba8a9', background:'#fff', borderRadius:16, boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>✓</div>
            <div style={{ fontSize:15, fontWeight:700, fontFamily:'Manrope,sans-serif' }}>Keine Aufgaben im Zeitraum</div>
            <div style={{ fontSize:13, marginTop:4 }}>Letzte 30 Tage + nächste 7 Tage</div>
          </div>
        )}

        {/* Upcoming tasks */}
        {futureTasks.length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#9ba8a9', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, paddingLeft:2 }}>
              Bevorstehend
            </div>
            <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', border:'1px solid #edf1f2', marginBottom:20 }}>
              {futureTasks.map((t, i) => {
                const s = STATUS_DISPLAY[t.status] ?? STATUS_DISPLAY['offen']
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom: i < futureTasks.length-1 ? '1px solid #edf1f2' : 'none' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#1a2020', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize:11, color:'#9ba8a9', marginTop:2 }}>{formatDate(t.due_date)}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:s.bg, color:s.color, whiteSpace:'nowrap', flexShrink:0 }}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Past tasks */}
        {pastTasks.length > 0 && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#9ba8a9', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, paddingLeft:2 }}>
              Letzte 30 Tage
            </div>
            <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', border:'1px solid #edf1f2', marginBottom:20 }}>
              {pastTasks.map((t, i) => {
                const s = STATUS_DISPLAY[t.status] ?? STATUS_DISPLAY['offen']
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom: i < pastTasks.length-1 ? '1px solid #edf1f2' : 'none' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:14 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'#1a2020', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</div>
                      <div style={{ fontSize:11, color:'#9ba8a9', marginTop:2 }}>{formatDate(t.due_date)}</div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:s.bg, color:s.color, whiteSpace:'nowrap', flexShrink:0 }}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign:'center', padding:'20px 16px 36px', borderTop:'1px solid #e2e8ea', background:'#fff', color:'#9ba8a9', fontSize:12 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <div style={{ width:20, height:20, borderRadius:6, background:'linear-gradient(135deg,#085f69,#0c8f85)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'#fff', fontSize:11, fontWeight:800, fontFamily:'Manrope,sans-serif' }}>S</span>
          </div>
          <span style={{ fontWeight:700, color:'#6b7a7b' }}>SteuberWork</span>
        </div>
        <div style={{ marginTop:2 }}>Steuber Dienstleistungen GmbH · Auftragsmanagement</div>
        <div style={{ marginTop:2, fontSize:11 }}>Dieser Link wurde automatisch generiert und ist nur für autorisierte Empfänger bestimmt.</div>
      </div>
    </div>
  )
}

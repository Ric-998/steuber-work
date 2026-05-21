import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import TaskList from './pages/TaskList'
import Dashboard from './pages/Dashboard'
import RegisterPage from './pages/RegisterPage'
import './styles/global.css'
import CustomerStatusPage from './pages/CustomerStatusPage'
import { ErrorBoundary } from './components/ErrorBoundary'

interface UserProfile {
  id: string
  full_name: string
  role_id: string
  role_name: string
  is_onboarded: boolean
}

// ─── DEV ONLY: View switcher ──────────────────────────────────────────────────
const DEV_MODE = false
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession]   = useState<any>(null)
  const [profile, setProfile]   = useState<UserProfile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [devViewOverride, setDevViewOverride] = useState<'admin'|'mitarbeiter'|null>(null)

  // Einladungs-Token aus URL lesen
  const registerToken = new URLSearchParams(window.location.search).get('register')
  // Kunden-Statusseite Token
  const viewToken = new URLSearchParams(window.location.search).get('view')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile()
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile()
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async () => {
    const { data, error } = await supabase.rpc('get_my_profile')
    if (error || !data) { console.warn('Kein Profil:', error?.message); setLoading(false); return }
    setProfile(data as UserProfile)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setDevViewOverride(null)
  }

  // ── Kunden-Statusseite (kein Login nötig) ───────────────────────────────────
  if (viewToken) return <CustomerStatusPage token={viewToken} />

  // ── Lade-Screen ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, background:'var(--surf)' }}>
      <div style={{ width:48, height:48, borderRadius:14, background:'var(--pri)', color:'#fff', fontSize:22, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-head)' }}>S</div>
      <div style={{ fontSize:13, color:'var(--muted)' }}>SteuberWork wird geladen...</div>
    </div>
  )

  // ── Einladungs-Link-Registrierung ────────────────────────────────────────────
  if (registerToken && !session) {
    return <RegisterPage token={registerToken} onSuccess={loadProfile} />
  }

  // ── Nicht eingeloggt ─────────────────────────────────────────────────────────
  if (!session) return <Login />

  // ── Kein Profil gefunden ─────────────────────────────────────────────────────
  if (!profile) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:24, background:'var(--surf)', textAlign:'center' }}>
      <div style={{ fontSize:44 }}>👤</div>
      <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--font-head)' }}>Kein Profil gefunden</div>
      <div style={{ fontSize:14, color:'var(--muted)', maxWidth:300, lineHeight:1.6 }}>
        Dein Account ist eingeloggt, aber es wurde noch kein Mitarbeiterprofil angelegt. Bitte Till kontaktieren.
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', background:'var(--bg)', padding:'8px 14px', borderRadius:8, border:'1px solid var(--outline)' }}>
        {session.user.email}
      </div>
      <button onClick={handleLogout} style={{ padding:'12px 24px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--bg)', fontSize:14, fontWeight:600, cursor:'pointer' }}>
        Abmelden
      </button>
    </div>
  )

  // ── Profil noch nicht vervollständigt (E-Mail-Einladung) ─────────────────────
  if (!profile.is_onboarded) {
    return <SetupProfileOverlay session={session} onComplete={loadProfile} onLogout={handleLogout} />
  }

  const effectiveRole = devViewOverride || profile.role_name
  const isAdmin = effectiveRole === 'admin'

  return (
    <div style={{ position:'relative' }}>
      {/* ── DEV SWITCHER ── */}
      {DEV_MODE && (
        <div style={{ position:'fixed', bottom:80, right:16, zIndex:9999, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#fff', background:'#FF6B35', padding:'2px 8px', borderRadius:999, letterSpacing:'0.08em' }}>DEV</div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setDevViewOverride('admin')} style={{ padding:'7px 12px', borderRadius:12, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:isAdmin?'#FF6B35':'rgba(255,107,53,0.15)', color:isAdmin?'#fff':'#FF6B35', boxShadow:isAdmin?'0 2px 8px rgba(255,107,53,0.4)':'none', transition:'all 0.15s' }}>
              👔 Admin
            </button>
            <button onClick={() => setDevViewOverride('mitarbeiter')} style={{ padding:'7px 12px', borderRadius:12, border:'none', fontSize:11, fontWeight:700, cursor:'pointer', background:!isAdmin?'#FF6B35':'rgba(255,107,53,0.15)', color:!isAdmin?'#fff':'#FF6B35', boxShadow:!isAdmin?'0 2px 8px rgba(255,107,53,0.4)':'none', transition:'all 0.15s' }}>
              👷 Mitarbeiter
            </button>
          </div>
        </div>
      )}

      {isAdmin
        ? <Dashboard userName={profile.full_name} onLogout={handleLogout} />
        : <TaskList userId={profile.id} userName={profile.full_name} onLogout={handleLogout} />
      }
    </div>
  )
}

// ─── SetupProfileOverlay ──────────────────────────────────────────────────────
// Erscheint wenn MA per E-Mail eingeladen wurde und noch keine Daten hinterlegt hat

function SetupProfileOverlay({ session, onComplete, onLogout }: {
  session: any
  onComplete: () => void
  onLogout: () => void
}) {
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [streetName, setStreetName] = useState('')
  const [streetNr,   setStreetNr]   = useState('')
  const [postal, setPostal]         = useState('')
  const [city, setCity]             = useState('')
  const [cityLocked, setCityLocked] = useState(false)
  const [plzLoading, setPlzLoading] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const lookupCity = async (plz: string) => {
    if (plz.length !== 5) return
    setPlzLoading(true)
    try {
      const res = await fetch(`https://openplzapi.org/de/Localities?postalCode=${plz}`)
      if (res.ok) {
        const json = await res.json()
        const place = json[0]?.name
        if (place) { setCity(place); setCityLocked(true) }
      }
    } catch { /* ignore */ }
    setPlzLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) { setError('Vor- und Nachname sind Pflichtfelder.'); return }
    if (!phone.trim()) { setError('Handynummer ist ein Pflichtfeld.'); return }
    setLoading(true)
    setError('')
    const { error: rpcErr } = await supabase.rpc('complete_my_profile', {
      p_full_name: `${firstName.trim()} ${lastName.trim()}`,
      p_street:    streetName.trim() ? `${streetName.trim()} ${streetNr.trim()}`.trim() : null,
      p_postal:    postal.trim()  || null,
      p_city:      city.trim()    || null,
      p_phone:     phone.trim()   || null,
    })
    if (rpcErr) { setError(rpcErr.message); setLoading(false); return }
    onComplete()
  }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 20px', overflowY:'auto' }}>
      <div style={{ background:'var(--surf-card)', borderRadius:24, padding:'36px 28px 28px', width:'100%', maxWidth:420, boxShadow:'0 4px 32px rgba(8,93,104,0.08)', margin:'auto 0' }}>

        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', boxShadow:'0 8px 24px rgba(8,93,104,0.25)' }}>
            <span style={{ fontFamily:'Manrope', fontWeight:800, fontSize:26, color:'#fff' }}>S</span>
          </div>
          <h2 style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', margin:'0 0 6px' }}>Willkommen bei SteuberWork!</h2>
          <p style={{ fontSize:14, color:'var(--txt-muted)', lineHeight:1.5, margin:0 }}>
            Bitte ergänze deine Daten, um loszulegen.
          </p>
          <div style={{ fontSize:12, color:'var(--txt-muted)', background:'var(--surf-low)', padding:'6px 12px', borderRadius:8, marginTop:10, display:'inline-block' }}>
            {session.user.email}
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}>
              <label style={labelStyle}>Vorname *</label>
              <div style={wrapStyle}>
                <span className="material-symbols-outlined" style={iconStyle}>person</span>
                <input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Max" required />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <label style={labelStyle}>Nachname *</label>
              <div style={wrapStyle}>
                <span className="material-symbols-outlined" style={iconStyle}>person</span>
                <input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Muster" required />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Handynummer *</label>
            <div style={wrapStyle}>
              <span className="material-symbols-outlined" style={iconStyle}>phone</span>
              <input style={inputStyle} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49 160 12345678" required />
            </div>
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:3 }}>
              <label style={labelStyle}>Straße *</label>
              <div style={wrapStyle}>
                <span className="material-symbols-outlined" style={iconStyle}>home</span>
                <input style={inputStyle} value={streetName} onChange={e => setStreetName(e.target.value)} placeholder="Musterstraße" required />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <label style={labelStyle}>Nr. *</label>
              <div style={wrapStyle}>
                <input style={inputStyle} value={streetNr} onChange={e => setStreetNr(e.target.value)} placeholder="12" required />
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <div style={{ width:110 }}>
              <label style={labelStyle}>PLZ *</label>
              <div style={wrapStyle}>
                {plzLoading
                  ? <span className="material-symbols-outlined" style={iconStyle}>progress_activity</span>
                  : <span className="material-symbols-outlined" style={iconStyle}>pin_drop</span>}
                <input style={inputStyle} value={postal} maxLength={5}
                  onChange={e => { setPostal(e.target.value); setCityLocked(false); lookupCity(e.target.value) }}
                  placeholder="34212" required />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <label style={labelStyle}>Wohnort *</label>
              <div style={{ ...wrapStyle, background: cityLocked ? 'var(--ok-bg)' : 'var(--surf-low)' }}>
                <span className="material-symbols-outlined" style={iconStyle}>location_city</span>
                <input style={inputStyle} value={city}
                  onChange={e => { setCity(e.target.value); setCityLocked(false) }}
                  placeholder="Melsungen" readOnly={cityLocked} required />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ display:'flex', gap:8, background:'var(--err-bg)', color:'var(--err)', borderRadius:10, padding:'12px 14px', fontSize:13 }}>
              <span className="material-symbols-outlined icon-sm">error</span>{error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', boxShadow:'0 4px 16px rgba(8,93,104,0.25)', cursor:'pointer' }}>
            {loading
              ? <><span className="material-symbols-outlined icon-sm">hourglass_empty</span> Speichern...</>
              : <><span className="material-symbols-outlined icon-sm">check_circle</span> Profil speichern &amp; starten</>}
          </button>

          <button type="button" onClick={onLogout} style={{ background:'none', border:'none', color:'var(--txt-muted)', fontSize:13, cursor:'pointer', textDecoration:'underline', padding:'4px 0' }}>
            Abmelden
          </button>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display:'block', fontSize:11, fontWeight:600, color:'var(--txt-sec)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }
const wrapStyle:  React.CSSProperties = { display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:12, border:'1.5px solid var(--outline)', background:'var(--surf-low)' }
const iconStyle:  React.CSSProperties = { color:'var(--txt-muted)', fontSize:18, flexShrink:0 }
const inputStyle: React.CSSProperties = { flex:1, border:'none', outline:'none', background:'transparent', fontSize:15, color:'var(--txt)' }

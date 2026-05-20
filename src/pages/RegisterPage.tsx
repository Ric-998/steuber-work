import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  token: string
  onSuccess: () => void
}

export default function RegisterPage({ token, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2>(1)

  // Schritt 1
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')

  // Schritt 2
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [phone, setPhone]           = useState('')
  const [streetName, setStreetName] = useState('')
  const [streetNr,   setStreetNr]   = useState('')
  const [postal, setPostal]         = useState('')
  const [city, setCity]             = useState('')
  const [cityLocked, setCityLocked] = useState(false)
  const [plzLoading, setPlzLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

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

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Passwort muss mindestens 8 Zeichen haben.'); return }
    if (password !== password2) { setError('Passwörter stimmen nicht überein.'); return }
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!firstName.trim() || !lastName.trim()) { setError('Vor- und Nachname sind Pflichtfelder.'); return }
    if (!phone.trim()) { setError('Handynummer ist ein Pflichtfeld.'); return }

    setLoading(true)
    try {
      const full_name = `${firstName.trim()} ${lastName.trim()}`

      const res = await fetch('https://hdemkyonurqfcohhfbgj.supabase.co/functions/v1/register-with-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email:       email.trim(),
          password,
          full_name,
          street:      streetName.trim() ? `${streetName.trim()} ${streetNr.trim()}`.trim() : null,
          postal_code: postal.trim()  || null,
          city:        city.trim()    || null,
          phone:       phone.trim()   || null,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Registrierung fehlgeschlagen.')

      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInErr) throw new Error('Konto erstellt, aber Login fehlgeschlagen: ' + signInErr.message)

      window.history.replaceState({}, '', '/')
      onSuccess()
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={s.root}>
      <div style={s.card}>

        <div style={s.logoWrap}>
          <div style={s.logoGrad}>
            <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 26, color: '#fff' }}>S</span>
          </div>
          <h1 style={s.logoText}>SteuberWork</h1>
          <p style={s.logoSub}>Konto einrichten</p>
        </div>

        {/* Schritt-Anzeige */}
        <div style={s.steps}>
          {([1, 2] as const).map((n, i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: step >= n ? 'var(--pri)' : 'var(--outline)',
                color: step >= n ? '#fff' : 'var(--txt-muted)',
              }}>{step > n ? '✓' : n}</div>
              <span style={{ fontSize: 12, color: step >= n ? 'var(--pri)' : 'var(--txt-muted)', fontWeight: 600 }}>
                {n === 1 ? 'Zugangsdaten' : 'Persönliche Daten'}
              </span>
              {i < 1 && <div style={{ flex: 1, height: 1, background: step > n ? 'var(--pri)' : 'var(--outline)', marginLeft: 4 }} />}
            </div>
          ))}
        </div>

        {/* ── Schritt 1 ── */}
        {step === 1 && (
          <form onSubmit={handleStep1} style={s.form}>
            <InputField icon="mail"  label="E-Mail-Adresse"       type="email"    value={email}     onChange={setEmail}     placeholder="max.muster@beispiel.de"  required />
            <InputField icon="lock"  label="Passwort"             type="password" value={password}  onChange={setPassword}  placeholder="Mindestens 8 Zeichen"    required />
            <InputField icon="lock"  label="Passwort wiederholen" type="password" value={password2} onChange={setPassword2} placeholder="••••••••"                required />
            {error && <ErrorBox msg={error} />}
            <button type="submit" style={s.btn}>
              <span className="material-symbols-outlined icon-sm">arrow_forward</span> Weiter
            </button>
          </form>
        )}

        {/* ── Schritt 2 ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} style={s.form}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Vorname *</label>
                <div style={s.inputWrap}>
                  <span className="material-symbols-outlined" style={s.icon}>person</span>
                  <input style={s.input} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Max" required />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Nachname *</label>
                <div style={s.inputWrap}>
                  <span className="material-symbols-outlined" style={s.icon}>person</span>
                  <input style={s.input} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Muster" required />
                </div>
              </div>
            </div>

            <InputField icon="phone" label="Handynummer *" type="tel"  value={phone}  onChange={setPhone}  placeholder="+49 160 12345678" required />
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ flex:3 }}>
                <label style={s.label}>Straße *</label>
                <div style={s.inputWrap}>
                  <span className="material-symbols-outlined" style={s.icon}>home</span>
                  <input style={s.input} value={streetName} onChange={e=>setStreetName(e.target.value)} placeholder="Musterstraße" required />
                </div>
              </div>
              <div style={{ flex:1 }}>
                <label style={s.label}>Nr. *</label>
                <div style={s.inputWrap}>
                  <input style={s.input} value={streetNr} onChange={e=>setStreetNr(e.target.value)} placeholder="12" required />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 110 }}>
                <label style={s.label}>PLZ *</label>
                <div style={s.inputWrap}>
                  {plzLoading
                    ? <span className="material-symbols-outlined" style={s.icon}>progress_activity</span>
                    : <span className="material-symbols-outlined" style={s.icon}>pin_drop</span>}
                  <input style={s.input} value={postal} maxLength={5}
                    onChange={e => { setPostal(e.target.value); setCityLocked(false); lookupCity(e.target.value) }}
                    placeholder="34212" required />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={s.label}>Wohnort *</label>
                <div style={{ ...s.inputWrap, background: cityLocked ? 'var(--ok-bg)' : 'var(--surf-low)' }}>
                  <span className="material-symbols-outlined" style={s.icon}>location_city</span>
                  <input style={s.input} value={city}
                    onChange={e => { setCity(e.target.value); setCityLocked(false) }}
                    placeholder="Melsungen" readOnly={cityLocked} required />
                </div>
              </div>
            </div>

            {error && <ErrorBox msg={error} />}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => { setStep(1); setError('') }} style={s.btnBack}>
                <span className="material-symbols-outlined icon-sm">arrow_back</span> Zurück
              </button>
              <button type="submit" disabled={loading} style={{ ...s.btn, flex: 1 }}>
                {loading
                  ? <><span className="material-symbols-outlined icon-sm">hourglass_empty</span> Wird registriert...</>
                  : <><span className="material-symbols-outlined icon-sm">check_circle</span> Konto erstellen</>}
              </button>
            </div>
          </form>
        )}

        <p style={s.footer}>Steuber Dienstleistungen GmbH · Melsungen</p>
      </div>
    </div>
  )
}

function InputField({ icon, label, type, value, onChange, placeholder, required }: {
  icon: string; label: string; type: string; value: string
  onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <div style={s.inputWrap}>
        <span className="material-symbols-outlined" style={s.icon}>{icon}</span>
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} required={required} style={s.input} />
      </div>
    </div>
  )
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--err-bg)',
      color: 'var(--err)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
      <span className="material-symbols-outlined icon-sm" style={{ flexShrink: 0, marginTop: 1 }}>error</span>
      {msg}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:     { minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', boxSizing: 'border-box' },
  card:     { background: 'var(--surf-card)', borderRadius: 24, padding: '36px 28px 28px', width: '100%', maxWidth: 420, boxShadow: '0 4px 32px rgba(8,93,104,0.08)' },
  logoWrap: { textAlign: 'center', marginBottom: 24 },
  logoGrad: { width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', boxShadow: '0 8px 24px rgba(8,93,104,0.25)' },
  logoText: { fontSize: 22, fontWeight: 800, color: 'var(--txt)', marginBottom: 2, fontFamily: 'var(--font-head)' },
  logoSub:  { fontSize: 13, color: 'var(--txt-muted)' },
  steps:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, padding: '12px 16px', background: 'var(--surf-low)', borderRadius: 14 },
  form:     { display: 'flex', flexDirection: 'column', gap: 14 },
  label:    { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 } as React.CSSProperties,
  inputWrap:{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: '1.5px solid var(--outline)', background: 'var(--surf-low)' },
  icon:     { color: 'var(--txt-muted)', fontSize: 18, flexShrink: 0 },
  input:    { flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--txt)' },
  btn:      { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-head)', boxShadow: '0 4px 16px rgba(8,93,104,0.25)', cursor: 'pointer' },
  btnBack:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 16px', borderRadius: 14, border: '1.5px solid var(--outline)', background: 'var(--surf-card)', color: 'var(--txt)', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  footer:   { textAlign: 'center', fontSize: 11, color: 'var(--txt-muted)', marginTop: 20 },
}

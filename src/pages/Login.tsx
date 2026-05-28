import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── DEV ONLY ────────────────────────────────────────────────────────────────
const DEV_MODE = false
const DEV_ACCOUNTS = [
  { label: '👔 Admin (Till)', email: 'till@steuber-dienstleistungen.de', password: 'Steuber2024' },
]
// ─────────────────────────────────────────────────────────────────────────────

export default function Login({ onDevBypass: _onDevBypass }: { onDevBypass?: () => void }) {
  const [view, setView] = useState<'login' | 'reset'>('login')

  // Login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset state
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-Mail oder Passwort falsch. Bitte erneut versuchen.')
    setLoading(false)
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetLoading(true); setResetMsg(null)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/`,
    })
    if (error) {
      setResetMsg({ ok: false, text: error.message })
    } else {
      setResetMsg({ ok: true, text: 'Wir haben dir einen Reset-Link geschickt. Bitte prüfe dein Postfach.' })
    }
    setResetLoading(false)
  }

  const devLogin = async (devEmail: string, devPassword: string) => {
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPassword })
    if (error) setError(`DEV-Login fehlgeschlagen: ${error.message}`)
    setLoading(false)
  }

  return (
    <div style={s.root}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <div style={s.logoGrad}>
            <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 26, color: '#fff' }}>S</span>
          </div>
          <h1 style={s.logoText}>SteuberWork</h1>
          <p style={s.logoSub}>{view === 'reset' ? 'Passwort zurücksetzen' : 'Auftragsmanagement'}</p>
        </div>

        {/* ── Login ── */}
        {view === 'login' && (
          <form onSubmit={handleLogin} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>E-Mail</label>
              <div style={s.inputWrap}>
                <span className="material-symbols-outlined" style={s.inputIcon}>mail</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="name@steuber-dienstleistungen.de" required style={s.input} autoComplete="email" />
              </div>
            </div>
            <div style={s.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={s.label}>Passwort</label>
                <button type="button" onClick={() => { setView('reset'); setResetEmail(email); setResetMsg(null) }}
                  style={{ fontSize: 12, color: 'var(--pri)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                  Passwort vergessen?
                </button>
              </div>
              <div style={s.inputWrap}>
                <span className="material-symbols-outlined" style={s.inputIcon}>lock</span>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required style={s.input} autoComplete="current-password" />
              </div>
            </div>
            {error && (
              <div style={s.errorBox}>
                <span className="material-symbols-outlined icon-sm" style={{ color: 'var(--err)', flexShrink: 0 }}>error</span>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} style={s.btn}>
              {loading
                ? <><span className="material-symbols-outlined icon-sm">hourglass_empty</span> Wird angemeldet...</>
                : <><span className="material-symbols-outlined icon-sm">login</span> Anmelden</>}
            </button>
          </form>
        )}

        {/* ── Passwort Reset ── */}
        {view === 'reset' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!resetMsg?.ok ? (
              <form onSubmit={handleReset} style={s.form}>
                <p style={{ fontSize: 14, color: 'var(--txt-muted)', lineHeight: 1.6, margin: 0 }}>
                  Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link zum Zurücksetzen deines Passworts.
                </p>
                <div style={s.field}>
                  <label style={s.label}>E-Mail-Adresse</label>
                  <div style={s.inputWrap}>
                    <span className="material-symbols-outlined" style={s.inputIcon}>mail</span>
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                      placeholder="name@steuber-dienstleistungen.de" required style={s.input} autoFocus />
                  </div>
                </div>
                {resetMsg && !resetMsg.ok && (
                  <div style={s.errorBox}>
                    <span className="material-symbols-outlined icon-sm" style={{ flexShrink: 0 }}>error</span>
                    {resetMsg.text}
                  </div>
                )}
                <button type="submit" disabled={resetLoading} style={s.btn}>
                  {resetLoading
                    ? <><span className="material-symbols-outlined icon-sm">hourglass_empty</span> Wird gesendet...</>
                    : <><span className="material-symbols-outlined icon-sm">send</span> Reset-Link senden</>}
                </button>
                <button type="button" onClick={() => setView('login')}
                  style={{ ...s.btn, background: 'var(--surf-low)', color: 'var(--txt)', boxShadow: 'none', border: '1.5px solid var(--outline)' }}>
                  <span className="material-symbols-outlined icon-sm">arrow_back</span> Zurück zum Login
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--ok-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize: 28, color: 'var(--ok)' }}>mark_email_read</span>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>E-Mail verschickt!</div>
                  <div style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>{resetMsg.text}</div>
                </div>
                <button type="button" onClick={() => { setView('login'); setResetMsg(null) }} style={{ ...s.btn, width: '100%' }}>
                  <span className="material-symbols-outlined icon-sm">arrow_back</span> Zurück zum Login
                </button>
              </div>
            )}
          </div>
        )}

        {DEV_MODE && view === 'login' && (
          <div style={s.devSection}>
            <div style={s.devLabel}>🛠 DEV – Schnellanmeldung</div>
            <div style={s.devBtns}>
              {DEV_ACCOUNTS.map(acc => (
                <button key={acc.email} type="button" disabled={loading}
                  onClick={() => devLogin(acc.email, acc.password)} style={s.devBtn}>
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={s.footer}>Steuber Dienstleistungen GmbH · Melsungen</p>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:      { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { background: 'var(--surf-card)', borderRadius: 24, padding: '40px 28px 28px', width: '100%', maxWidth: 380, boxShadow: '0 4px 32px rgba(8,93,104,0.08)' },
  logoWrap:  { textAlign: 'center', marginBottom: 32 },
  logoGrad:  { width: 60, height: 60, borderRadius: 18, background: 'linear-gradient(135deg, var(--pri) 0%, var(--pri-c) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 8px 24px rgba(8,93,104,0.25)' },
  logoText:  { fontSize: 24, fontWeight: 800, color: 'var(--txt)', marginBottom: 4, fontFamily: 'var(--font-head)' },
  logoSub:   { fontSize: 13, color: 'var(--txt-muted)' },
  form:      { display: 'flex', flexDirection: 'column', gap: 16 },
  field:     { display: 'flex', flexDirection: 'column', gap: 6 },
  label:     { fontSize: 11, fontWeight: 600, color: 'var(--txt-sec)', textTransform: 'uppercase', letterSpacing: '0.08em' } as React.CSSProperties,
  inputWrap: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--outline)', background: 'var(--surf-low)' },
  inputIcon: { color: 'var(--txt-muted)', fontSize: 18, flexShrink: 0 },
  input:     { flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--txt)' },
  errorBox:  { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--err-bg)', color: 'var(--err)', borderRadius: 10, padding: '12px 14px', fontSize: 13 },
  btn:       { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--pri) 0%, var(--pri-c) 100%)', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-head)', boxShadow: '0 4px 16px rgba(8,93,104,0.25)', cursor: 'pointer' },
  devSection:{ marginTop: 20, padding: '14px', borderRadius: 14, border: '1.5px dashed #FF6B35', background: 'rgba(255,107,53,0.05)' },
  devLabel:  { fontSize: 11, fontWeight: 700, color: '#FF6B35', marginBottom: 10, textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' },
  devBtns:   { display: 'flex', gap: 8 },
  devBtn:    { flex: 1, padding: '10px 8px', borderRadius: 10, border: '1.5px solid #FF6B35', background: 'transparent', color: '#FF6B35', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  footer:    { textAlign: 'center', fontSize: 11, color: 'var(--txt-muted)', marginTop: 24 },
}

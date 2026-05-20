import { useState, useEffect } from 'react'

// ─── Platform detection helpers ───────────────────────────────────────────────
function getOS(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

const DISMISSED_KEY = 'pwa_install_banner_dismissed'

// ─── PWAInstallBanner ─────────────────────────────────────────────────────────
export function PWAInstallBanner() {
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [os, setOs] = useState<'ios' | 'android' | 'other'>('other')
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Don't show if already running as PWA
    if (isStandaloneMode()) return
    // Don't show on desktop
    const platform = getOS()
    if (platform === 'other') return
    // Don't show if user dismissed before
    if (localStorage.getItem(DISMISSED_KEY)) return

    setOs(platform)
    setVisible(true)

    // Capture Android native install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide banner if installed via native prompt
    window.addEventListener('appinstalled', () => {
      setInstalled(true)
      setTimeout(() => setVisible(false), 2000)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  const triggerAndroidInstall = async () => {
    if (!deferredPrompt) { setExpanded(true); return }
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
      setDeferredPrompt(null)
    }
  }

  if (!visible) return null

  // ── Installed success state ──
  if (installed) {
    return (
      <div style={s.sheet}>
        <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center', padding:'8px 0' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:28, color:'var(--ok)' }}>check_circle</span>
          <span style={{ fontSize:15, fontWeight:700, color:'var(--ok)' }}>App installiert! 🎉</span>
        </div>
      </div>
    )
  }

  const iosSteps = [
    { icon: 'ios_share', text: 'Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil)' },
    { icon: 'add_box',   text: 'Scrolle und tippe auf „Zum Home-Bildschirm"' },
    { icon: 'touch_app', text: 'Bestätige mit „Hinzufügen"' },
  ]

  const androidSteps = [
    { icon: 'more_vert',  text: 'Tippe auf die ⋮ drei Punkte oben rechts in Chrome' },
    { icon: 'install_mobile', text: 'Wähle „App installieren" oder „Zum Startbildschirm"' },
    { icon: 'touch_app',  text: 'Bestätige – fertig!' },
  ]

  const steps = os === 'ios' ? iosSteps : androidSteps

  return (
    <div style={s.overlay}>
      <div style={s.sheet}>

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* App icon */}
          <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
            background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 12px rgba(8,93,104,0.25)' }}>
            <span style={{ fontFamily:'Manrope,sans-serif', fontWeight:800, fontSize:18, color:'#fff' }}>S</span>
          </div>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--txt)', fontFamily:'var(--font-head)' }}>
              App installieren
            </div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:1 }}>
              {os === 'ios'
                ? 'Füge SteuberWork zum Home-Bildschirm hinzu'
                : 'Installiere SteuberWork auf deinem Gerät'}
            </div>
          </div>

          <button onClick={dismiss} style={{ background:'none', border:'none', cursor:'pointer',
            padding:6, color:'var(--txt-muted)', display:'flex', borderRadius:8, flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{ fontSize:20 }}>close</span>
          </button>
        </div>

        {/* Collapsed CTA buttons */}
        {!expanded && (
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={dismiss}
              style={{ flex:1, padding:'10px 0', borderRadius:12, border:'1.5px solid var(--outline)',
                background:'transparent', color:'var(--txt-muted)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              Später
            </button>

            {os === 'android' && deferredPrompt ? (
              <button onClick={triggerAndroidInstall}
                style={{ flex:2, padding:'10px 0', borderRadius:12, border:'none',
                  background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)',
                  color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  boxShadow:'0 4px 14px rgba(8,93,104,0.3)' }}>
                <span className="material-symbols-outlined icon-sm">install_mobile</span>
                Jetzt installieren
              </button>
            ) : (
              <button onClick={() => setExpanded(true)}
                style={{ flex:2, padding:'10px 0', borderRadius:12, border:'none',
                  background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)',
                  color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  boxShadow:'0 4px 14px rgba(8,93,104,0.3)' }}>
                <span className="material-symbols-outlined icon-sm">help_outline</span>
                Wie geht das?
              </button>
            )}
          </div>
        )}

        {/* Expanded step-by-step guide */}
        {expanded && (
          <div style={{ marginTop:16 }}>
            {/* OS badge */}
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
              <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--pri)' }}>
                {os === 'ios' ? 'phone_iphone' : 'android'}
              </span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--pri)' }}>
                {os === 'ios' ? 'iPhone / iPad – Safari' : 'Android – Chrome'}
              </span>
            </div>

            {steps.map((step, i) => (
              <div key={i} style={{ display:'flex', gap:12, marginBottom: i < steps.length - 1 ? 14 : 0, alignItems:'flex-start' }}>
                {/* Step number + connector */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%',
                    background:'var(--pri)', color:'#fff', fontSize:13, fontWeight:800,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:'var(--font-head)' }}>{i + 1}</div>
                  {i < steps.length - 1 && (
                    <div style={{ width:2, height:18, background:'var(--outline)', marginTop:4 }} />
                  )}
                </div>

                {/* Icon + text */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:10, paddingTop:4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:18, color:'var(--txt-muted)', flexShrink:0 }}>{step.icon}</span>
                  <span style={{ fontSize:13, color:'var(--txt)', lineHeight:1.55 }}>{step.text}</span>
                </div>
              </div>
            ))}

            {/* Platform hint */}
            <div style={{ marginTop:14, padding:'10px 12px', borderRadius:10,
              background: os === 'ios' ? 'var(--warn-bg)' : 'var(--ok-bg)',
              display:'flex', gap:8, alignItems:'flex-start' }}>
              <span className="material-symbols-outlined icon-sm icon-fill"
                style={{ color: os === 'ios' ? 'var(--warn)' : 'var(--ok)', flexShrink:0, marginTop:1 }}>
                {os === 'ios' ? 'info' : 'check_circle'}
              </span>
              <span style={{ fontSize:12, color: os === 'ios' ? 'var(--warn)' : 'var(--ok)', lineHeight:1.55 }}>
                {os === 'ios'
                  ? 'Nutze Safari – nur dort funktioniert der Homescreen-Export. Push-Mitteilungen gehen erst nach der Installation.'
                  : 'Nach der Installation erhältst du automatisch Push-Benachrichtigungen über neue Aufgaben.'}
              </span>
            </div>

            <button onClick={dismiss}
              style={{ width:'100%', marginTop:12, padding:'11px 0', borderRadius:12,
                border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)',
                color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined icon-sm">check</span>
              Verstanden
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 900,
    padding: '0 12px 12px',
    pointerEvents: 'none',
  },
  sheet: {
    background: 'var(--surf-card)',
    borderRadius: 20,
    padding: '16px 16px',
    boxShadow: '0 -4px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
    border: '1px solid var(--outline)',
    pointerEvents: 'all',
    maxWidth: 500,
    margin: '0 auto',
  },
}

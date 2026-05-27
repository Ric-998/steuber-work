import { useState, useEffect } from 'react'

const TOUR_KEY = 'steuberwork_tour_done'

const STEPS = [
  {
    icon: 'task_alt',
    color: '#085d68',
    bg: '#E6F3F4',
    title: 'Deine Aufgaben',
    desc: 'Auf dem Aufgaben-Tab siehst du sofort was heute zu tun ist – sortiert nach Objekt. Tippe auf eine Aufgabe für alle Details.',
    hint: 'Tipp: Die Wochenkacheln oben zeigen direkt wie viele Aufgaben pro Tag offen sind.',
  },
  {
    icon: 'play_circle',
    color: '#166534',
    bg: '#dcfce7',
    title: 'Aufgabe starten & abschließen',
    desc: 'Tippe auf "Starten" wenn du anfängst – Till sieht dann dass du vor Ort bist. Danach mit "Abschließen" fertigstellen.',
    hint: 'Du kannst auch direkt den Kreis links antippen zum Abhaken.',
  },
  {
    icon: 'warning',
    color: '#92400e',
    bg: '#FEF3C7',
    title: 'Problem melden',
    desc: 'Kein Zugang? Schaden entdeckt? Tippe auf die Aufgabe → "Problem" → Grund auswählen. Till wird sofort informiert.',
    hint: 'Probleme erscheinen rot im Dashboard von Till.',
  },
  {
    icon: 'calendar_month',
    color: '#5b21b6',
    bg: '#F3F0FF',
    title: 'Zeitplan & Urlaub',
    desc: 'Unter "Zeitplan" kannst du Urlaub beantragen, Krankmeldungen übermitteln und deine Abwesenheiten verwalten.',
    hint: 'Till genehmigt deinen Antrag und du bekommst eine Benachrichtigung.',
  },
  {
    icon: 'notifications_active',
    color: '#085d68',
    bg: '#E6F3F4',
    title: 'Benachrichtigungen',
    desc: 'Aktiviere Push-Benachrichtigungen unter Profil damit du keine Aufgaben und Statusänderungen verpasst.',
    hint: 'iPhone: Die App muss dafür zum Homescreen hinzugefügt werden.',
  },
]

interface Props {
  onClose: () => void
}

export function OnboardingTour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const next = () => {
    if (isLast) { finish(); return }
    setLeaving(true)
    setTimeout(() => { setStep(s => s + 1); setLeaving(false) }, 200)
  }

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1')
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:10000, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}>
      <div style={{ width:'100%', maxWidth:480, background:'#fff', borderRadius:'24px 24px 0 0', padding:'28px 24px 40px', boxShadow:'0 -8px 40px rgba(0,0,0,0.2)', transition:'transform 0.3s ease' }}>

        {/* Handle */}
        <div style={{ width:36, height:4, borderRadius:2, background:'#DDE8E9', margin:'0 auto 24px' }}/>

        {/* Step dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:6, marginBottom:28 }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={()=>setStep(i)} style={{ width: i===step?24:8, height:8, borderRadius:999, background:i===step?'#085d68':i<step?'#9FE1CB':'#DDE8E9', transition:'all 0.3s', cursor:'pointer' }}/>
          ))}
        </div>

        {/* Content */}
        <div style={{ textAlign:'center', opacity:leaving?0:1, transform:leaving?'translateY(10px)':'translateY(0)', transition:'all 0.2s' }}>
          {/* Icon */}
          <div style={{ width:80, height:80, borderRadius:24, background:current.bg, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:current.color }}>{current.icon}</span>
          </div>

          {/* Title */}
          <h2 style={{ fontSize:22, fontWeight:800, fontFamily:'Manrope, sans-serif', color:'#17201F', marginBottom:12, letterSpacing:'-0.03em' }}>
            {current.title}
          </h2>

          {/* Description */}
          <p style={{ fontSize:15, color:'#3f484a', lineHeight:1.7, marginBottom:16, maxWidth:320, margin:'0 auto 16px' }}>
            {current.desc}
          </p>

          {/* Hint */}
          <div style={{ background:'#F0F8F9', borderRadius:12, padding:'10px 16px', display:'inline-flex', alignItems:'center', gap:8, marginBottom:32 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#085d68', flexShrink:0 }}>lightbulb</span>
            <span style={{ fontSize:12, color:'#085d68', fontWeight:500 }}>{current.hint}</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={finish} style={{ flex:1, padding:14, borderRadius:14, border:'1.5px solid #DDE8E9', background:'transparent', color:'#6B7A7B', fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Überspringen
          </button>
          <button onClick={next} style={{ flex:2, padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,#085d68,#2f7681)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(8,93,104,0.3)', fontFamily:'Manrope,sans-serif' }}>
            {isLast ? (
              <><span className="material-symbols-outlined" style={{ fontSize:18 }}>rocket_launch</span>Los geht's!</>
            ) : (
              <>Weiter<span className="material-symbols-outlined" style={{ fontSize:18 }}>arrow_forward</span></>
            )}
          </button>
        </div>

        {/* Step counter */}
        <p style={{ textAlign:'center', fontSize:11, color:'#6B7A7B', marginTop:14 }}>
          {step + 1} von {STEPS.length}
        </p>
      </div>
    </div>
  )
}

export function useOnboarding() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY)
    if (!done) {
      // Small delay so the app loads first
      setTimeout(() => setShow(true), 800)
    }
  }, [])

  return { show, setShow }
}

export function resetTour() {
  localStorage.removeItem(TOUR_KEY)
}

// ─── Install Guide with both iOS + Android tabs ───────────────────────────────
export function InstallGuide() {
  const [os, setOs] = useState<'ios'|'android'>(() =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android'
  )

  const steps = {
    ios: [
      { step:'1', text:'Öffne die App in Safari (nicht Chrome oder Firefox!)' },
      { step:'2', text:'Tippe auf das Teilen-Symbol unten (Quadrat mit Pfeil nach oben)' },
      { step:'3', text:'Scrolle und tippe auf „Zum Home-Bildschirm"' },
      { step:'4', text:'Tippe auf „Hinzufügen" – fertig!' },
    ],
    android: [
      { step:'1', text:'Öffne die App in Chrome' },
      { step:'2', text:'Tippe auf die drei Punkte oben rechts' },
      { step:'3', text:'Tippe auf „App installieren" oder „Zum Startbildschirm hinzufügen"' },
      { step:'4', text:'Bestätige mit „Installieren" – fertig!' },
    ],
  }

  return (
    <div>
      {/* OS Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {([
          { id:'ios',     icon:'phone_iphone', label:'iPhone / iPad' },
          { id:'android', icon:'android',      label:'Android' },
        ] as const).map(t=>(
          <button key={t.id} onClick={()=>setOs(t.id)} style={{ flex:1, padding:'9px 12px', borderRadius:12, border:`1.5px solid ${os===t.id?'var(--pri)':'var(--outline)'}`, background:os===t.id?'var(--pri-xl)':'transparent', color:os===t.id?'var(--pri)':'var(--txt-muted)', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <span className="material-symbols-outlined icon-sm">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Steps */}
      {steps[os].map(s=>(
        <div key={s.step} style={{ display:'flex', gap:12, marginBottom:12 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--pri)', color:'#fff', fontSize:12, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'Manrope,sans-serif' }}>{s.step}</div>
          <div style={{ fontSize:13, color:'var(--txt-muted)', lineHeight:1.6, paddingTop:4 }}>{s.text}</div>
        </div>
      ))}

      {/* iOS warning */}
      {os === 'ios' && (
        <div style={{ background:'var(--warn-bg)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'var(--warn)', marginTop:8, display:'flex', gap:8, alignItems:'flex-start' }}>
          <span className="material-symbols-outlined icon-sm" style={{ color:'var(--warn)', flexShrink:0, marginTop:1 }}>info</span>
          Push-Benachrichtigungen funktionieren auf iPhone nur wenn die App über den Homescreen geöffnet wird!
        </div>
      )}
      {os === 'android' && (
        <div style={{ background:'var(--ok-bg)', borderRadius:10, padding:'10px 14px', fontSize:12, color:'var(--ok)', marginTop:8, display:'flex', gap:8, alignItems:'flex-start' }}>
          <span className="material-symbols-outlined icon-sm" style={{ color:'var(--ok)', flexShrink:0, marginTop:1 }}>check_circle</span>
          Nach der Installation funktionieren Push-Benachrichtigungen sofort!
        </div>
      )}
    </div>
  )
}

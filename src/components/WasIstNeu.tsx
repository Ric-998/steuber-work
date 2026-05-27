import { useState, useEffect } from 'react'

// ─── Version hier hochzählen wenn neue Features live gehen ───────────────────
export const APP_VERSION = '1.0.0'
const SEEN_KEY = 'steuberwork_whatsnew_seen'

// ─── Changelog: pro Version, getrennt für Admin und Mitarbeiter ───────────────
const CHANGELOG: Record<string, { admin: string[]; mitarbeiter: string[] }> = {
  '1.0.0': {
    admin: [
      '📋 Vollständiges Auftragsmanagement – Objekte, Kunden, Leistungen',
      '👥 Team-Verwaltung mit Einladungen per E-Mail oder Link',
      '📊 Tagesbericht & Monatsübersicht auf einen Blick',
      '⚠️ Echtzeit-Benachrichtigung bei Problem-Meldungen deiner Mitarbeiter',
      '🗓️ Urlaubsanträge direkt genehmigen oder ablehnen',
      '🗺️ Routenoptimierung für Tagesplanung',
    ],
    mitarbeiter: [
      '📋 Deine Aufgaben täglich übersichtlich – nach Objekt sortiert',
      '✅ Status-Updates in Echtzeit: Starten, Abschließen, Problem melden',
      '🗓️ Urlaub beantragen und Krankmeldungen direkt in der App',
      '🔔 Push-Benachrichtigungen wenn sich etwas ändert',
      '📅 Kalender-Abo für deine Aufgaben im eigenen Kalender',
    ],
  },
  // Zukünftige Versionen hier ergänzen, z.B.:
  // '1.1.0': {
  //   admin: ['🔑 Schlüssel-Verwaltung pro Objekt'],
  //   mitarbeiter: ['🔄 Tauschbörse: Aufgaben mit Kollegen tauschen'],
  // },
}

interface Props {
  role: 'admin' | 'mitarbeiter'
}

export function WasIstNeu({ role }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const lastSeen = localStorage.getItem(SEEN_KEY)
    // Zeigen wenn diese Version noch nicht gesehen wurde
    if (lastSeen !== APP_VERSION && CHANGELOG[APP_VERSION]) {
      setTimeout(() => setShow(true), 1200) // kurze Verzögerung nach App-Load
    }
  }, [])

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
    setShow(false)
  }

  if (!show) return null

  const items = CHANGELOG[APP_VERSION]?.[role] ?? []
  if (items.length === 0) { dismiss(); return null }

  const isFirstTime = !localStorage.getItem('steuberwork_tour_done')
  const headline = isFirstTime ? `Willkommen bei SteuberWork!` : `Neu in Version ${APP_VERSION}`
  const subline  = isFirstTime
    ? 'Hier ist ein Überblick was alles drin ist:'
    : 'Das ist neu in diesem Update:'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9998, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(3px)', padding:'0 0 0 0' }}
      onClick={dismiss}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:'var(--surf-card)', borderRadius:'24px 24px 0 0', padding:'28px 22px 36px', width:'100%', maxWidth:480, maxHeight:'80dvh', overflowY:'auto', boxShadow:'0 -8px 40px rgba(0,0,0,0.2)' }}>

        {/* Handle */}
        <div style={{ width:36, height:4, borderRadius:99, background:'var(--outline)', margin:'0 auto 20px' }}/>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'#fff' }}>
              {isFirstTime ? 'celebration' : 'new_releases'}
            </span>
          </div>
          <div>
            <div style={{ fontSize:17, fontWeight:800, fontFamily:'var(--font-head)', color:'var(--txt)', lineHeight:1.2 }}>{headline}</div>
            <div style={{ fontSize:12, color:'var(--txt-muted)', marginTop:3 }}>{subline}</div>
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, background:'var(--surf-low)', borderRadius:14, padding:'11px 14px', border:'1px solid var(--outline)' }}>
              <span style={{ fontSize:18, lineHeight:1.4, flexShrink:0 }}>{item.split(' ')[0]}</span>
              <span style={{ fontSize:13, color:'var(--txt)', lineHeight:1.5 }}>{item.split(' ').slice(1).join(' ')}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button onClick={dismiss} style={{ width:'100%', padding:'14px', borderRadius:16, border:'none', background:'linear-gradient(135deg,var(--pri) 0%,var(--pri-c) 100%)', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font-head)', cursor:'pointer', boxShadow:'0 4px 16px rgba(8,93,104,0.3)' }}>
          {isFirstTime ? 'Los geht\'s 🚀' : 'Alles klar!'}
        </button>
      </div>
    </div>
  )
}

// Hook zum manuellen Zurücksetzen (z.B. für Testing)
export function resetWasIstNeu() {
  localStorage.removeItem(SEEN_KEY)
}

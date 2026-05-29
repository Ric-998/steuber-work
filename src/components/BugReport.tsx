import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props { userId: string; onClose: () => void }

export default function BugReport({ userId, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    const { error } = await supabase.from('bug_reports').insert({
      user_id: userId,
      title: title.trim(),
      description: desc.trim(),
      url: window.location.href,
      user_agent: navigator.userAgent,
    })
    if (!error) {
      setSent(true)
    } else {
      // Fallback mailto
      const subject = encodeURIComponent(`[SteuberWork] ${title}`)
      const body = encodeURIComponent(`${desc}\n\nURL: ${window.location.href}`)
      window.open(`mailto:info@steuber-dienstleistungen.de?subject=${subject}&body=${body}`)
    }
    setSending(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:10000, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div style={{ width:'100%', maxWidth:480, background:'#fff', borderRadius:'24px 24px 0 0', padding:'20px 20px 36px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ width:36, height:4, borderRadius:2, background:'#DDE8E9', margin:'0 auto 20px' }}/>

        {!sent ? (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{ fontSize:24 }}>🐛</span>
              <h2 style={{ fontSize:18, fontWeight:800, fontFamily:'Manrope,sans-serif' }}>Problem melden</h2>
            </div>
            <p style={{ fontSize:13, color:'#6B7A7B', marginBottom:18, lineHeight:1.5 }}>
              Beschreibe kurz was nicht funktioniert hat. Deine Meldung hilft mir die App zu verbessern.
            </p>
            <form onSubmit={send} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#3f484a', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Was ist passiert? *</label>
                <input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="z.B. App zeigt keine Aufgaben" style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1.5px solid #DDE8E9', fontSize:14, boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#3f484a', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Beschreibung (optional)</label>
                <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Was habe ich gemacht bevor der Fehler auftrat..." rows={3} style={{ width:'100%', padding:'11px 14px', borderRadius:12, border:'1.5px solid #DDE8E9', fontSize:14, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}/>
              </div>
              <button type="submit" disabled={sending || !title.trim()} style={{ padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:(!title.trim()||sending)?0.5:1, fontFamily:'Manrope,sans-serif' }}>
                {sending ? 'Wird gesendet...' : '📨 Absenden'}
              </button>
              <button type="button" onClick={onClose} style={{ padding:12, borderRadius:14, border:'none', background:'#F0F4F4', color:'#6B7A7B', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                Abbrechen
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:'16px 0 8px' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <h2 style={{ fontSize:18, fontWeight:800, fontFamily:'Manrope,sans-serif', marginBottom:8 }}>Danke für dein Feedback!</h2>
            <p style={{ fontSize:14, color:'#6B7A7B', marginBottom:20, lineHeight:1.6 }}>Der Bericht wurde übermittelt und wird so schnell wie möglich behoben.</p>
            <button onClick={onClose} style={{ width:'100%', padding:13, borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
              Schließen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

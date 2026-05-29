import { Component, ErrorInfo, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

interface Props { children: ReactNode; userId?: string; userName?: string }
interface State { hasError: boolean; error?: Error; sending: boolean; sent: boolean; desc: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, sending: false, sent: false, desc: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info)
  }

  sendReport = async () => {
    this.setState({ sending: true })
    const { error: dbError } = await supabase.from('bug_reports').insert({
      user_id: this.props.userId || null,
      title: this.state.error?.message || 'Unbekannter Fehler',
      description: `${this.state.desc}\n\nStack: ${this.state.error?.stack || '–'}`,
      url: window.location.href,
      user_agent: navigator.userAgent,
    })
    if (!dbError) {
      this.setState({ sent: true, sending: false })
    } else {
      // Fallback: mailto
      const subject = encodeURIComponent(`[SteuberWork Bug] ${this.state.error?.message}`)
      const body = encodeURIComponent(`Fehler: ${this.state.error?.message}\n\nBeschreibung: ${this.state.desc}\n\nURL: ${window.location.href}\n\nStack: ${this.state.error?.stack}`)
      window.location.href = `mailto:info@steuber-dienstleistungen.de?subject=${subject}&body=${body}`
      this.setState({ sending: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, background:'#f8f9fa', textAlign:'center' }}>
        <div style={{ width:64, height:64, borderRadius:20, background:'#ffdad6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <span style={{ fontSize:32 }}>⚠️</span>
        </div>
        <h1 style={{ fontSize:22, fontWeight:800, fontFamily:'Manrope,sans-serif', color:'#17201F', marginBottom:8 }}>
          Oops – die App ist abgestürzt
        </h1>
        <p style={{ fontSize:14, color:'#6B7A7B', marginBottom:24, maxWidth:300, lineHeight:1.6 }}>
          Das sollte nicht passieren. Bitte beschreibe kurz was du gemacht hast bevor der Fehler aufgetreten ist.
        </p>

        {!this.state.sent ? (
          <div style={{ width:'100%', maxWidth:360 }}>
            <textarea
              value={this.state.desc}
              onChange={e => this.setState({ desc: e.target.value })}
              placeholder="z.B. Ich habe eine Aufgabe abgeschlossen und dann..."
              rows={4}
              style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #DDE8E9', fontSize:14, marginBottom:12, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }}
            />
            <button
              onClick={this.sendReport}
              disabled={this.state.sending}
              style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10, fontFamily:'Manrope,sans-serif' }}
            >
              {this.state.sending ? 'Wird gesendet...' : '📨 Fehlerbericht senden'}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ width:'100%', padding:13, borderRadius:14, border:'1.5px solid #DDE8E9', background:'transparent', color:'#6B7A7B', fontSize:14, fontWeight:600, cursor:'pointer' }}
            >
              App neu laden
            </button>
            <details style={{ marginTop:16, textAlign:'left' }}>
              <summary style={{ fontSize:11, color:'#6B7A7B', cursor:'pointer' }}>Technische Details</summary>
              <pre style={{ fontSize:10, color:'#6B7A7B', marginTop:8, whiteSpace:'pre-wrap', wordBreak:'break-all', background:'#f0f4f4', padding:10, borderRadius:8 }}>
                {this.state.error?.message}{'\n'}{this.state.error?.stack?.slice(0, 300)}...
              </pre>
            </details>
          </div>
        ) : (
          <div style={{ width:'100%', maxWidth:360 }}>
            <div style={{ background:'#dcfce7', borderRadius:16, padding:'20px', marginBottom:16 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#166534' }}>Fehlerbericht gesendet!</div>
              <div style={{ fontSize:13, color:'#166534', marginTop:4, opacity:0.8 }}>Danke – der Fehler wird so schnell wie möglich behoben.</div>
            </div>
            <button onClick={() => window.location.reload()} style={{ width:'100%', padding:14, borderRadius:14, border:'none', background:'linear-gradient(135deg,#085f69,#0c8f85)', color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer' }}>
              App neu laden
            </button>
          </div>
        )}
      </div>
    )
  }
}

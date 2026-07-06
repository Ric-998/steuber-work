import { useEffect } from 'react'

interface ConfirmDialogProps {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // ESC-Taste schließt den Dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{ background:'var(--surf-card)', borderRadius:20, padding:'24px 24px 20px', width:'100%', maxWidth:360, boxShadow:'0 8px 32px rgba(0,0,0,0.18)' }}>
        {/* Icon */}
        <div style={{ width:48, height:48, borderRadius:14, background: destructive ? 'var(--err-bg,#fde8e8)' : 'var(--pri-xl,#d4f5f2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <span className="material-symbols-outlined" style={{ fontSize:24, color: destructive ? 'var(--err,#93000a)' : 'var(--pri,#096a70)' }}>
            {destructive ? 'warning' : 'help'}
          </span>
        </div>

        {/* Text */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:800, fontFamily:'var(--font-head)', marginBottom:6 }}>{title}</div>
          <div style={{ fontSize:13, color:'var(--txt-muted,#6f797b)', lineHeight:1.5 }}>{message}</div>
        </div>

        {/* Buttons */}
        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={onCancel}
            style={{ flex:1, padding:'13px', borderRadius:13, border:'1.5px solid var(--outline,#bfc8ca)', background:'var(--bg)', fontSize:14, fontWeight:700, cursor:'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{ flex:1, padding:'13px', borderRadius:13, border:'none', background: destructive ? 'var(--err,#93000a)' : 'var(--pri,#096a70)', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { FeedbackItem, FeedbackType } from '../types'

interface Props {
  onClose: () => void
}

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: string; color: string; bg: string }> = {
  bug:         { label: 'Fehler melden',          icon: 'bug_report',  color: '#dc2626', bg: '#fef2f2' },
  feature:     { label: 'Feature-Wunsch',         icon: 'lightbulb',   color: '#d97706', bg: '#fffbeb' },
  improvement: { label: 'Verbesserung',           icon: 'trending_up', color: '#0891b2', bg: '#ecfeff' },
  other:       { label: 'Sonstiges',              icon: 'chat_bubble', color: '#6b7280', bg: '#f9fafb' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: 'Offen',          color: '#6b7280', bg: '#f3f4f6' },
  in_progress: { label: 'In Bearbeitung', color: '#0891b2', bg: '#ecfeff' },
  planned:     { label: 'Geplant',        color: '#7c3aed', bg: '#f5f3ff' },
  done:        { label: 'Erledigt',       color: '#16a34a', bg: '#f0fdf4' },
  rejected:    { label: 'Abgelehnt',      color: '#dc2626', bg: '#fef2f2' },
}

export default function FeedbackSheet({ onClose }: Props) {
  const [view, setView] = useState<'list' | 'form'>('list')
  const [selectedType, setSelectedType] = useState<FeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { loadMyFeedback() }, [])

  async function loadMyFeedback() {
    setLoading(true)
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
    setMyFeedback((data as FeedbackItem[]) || [])
    setLoading(false)
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim()) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('feedback').insert({
      user_id: user?.id,
      type: selectedType,
      title: title.trim(),
      description: description.trim(),
    })
    setSubmitting(false)
    setSubmitted(true)
    setTitle('')
    setDescription('')
    await loadMyFeedback()
    setTimeout(() => { setSubmitted(false); setView('list') }, 1800)
  }

  const s = {
    overlay: {
      position: 'fixed' as const, inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end',
    },
    sheet: {
      width: '100%', maxWidth: 540, margin: '0 auto',
      background: 'var(--bg)', borderRadius: '20px 20px 0 0',
      maxHeight: '90dvh', display: 'flex', flexDirection: 'column' as const,
    },
    handle: { width: 40, height: 4, borderRadius: 2, background: '#d1d5db', margin: '12px auto 0' },
    header: {
      padding: '16px 20px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--brd)',
    },
    titleText: { fontSize: 17, fontWeight: 700, color: 'var(--txt)' },
    iconBtn: {
      width: 32, height: 32, borderRadius: 16, border: 'none',
      background: '#f3f4f6', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    body: { flex: 1, overflowY: 'auto' as const, padding: '16px 20px 32px' },
    newBtn: {
      width: '100%', padding: 13, borderRadius: 12,
      border: '2px dashed var(--pri)', background: 'var(--pri-xl)',
      color: 'var(--pri)', fontSize: 15, fontWeight: 600,
      cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 8, marginBottom: 20,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: 600, color: '#9ca3af',
      textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10,
    },
    emptyState: { textAlign: 'center' as const, padding: '32px 0', color: '#9ca3af', fontSize: 14 },
    card: {
      background: 'var(--surf)', borderRadius: 12,
      border: '1px solid var(--brd)', marginBottom: 10,
      overflow: 'hidden', cursor: 'pointer',
    },
    cardRow: { padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 },
    cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--txt)', flex: 1 },
    statusBadge: (s: string) => ({
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      color: STATUS_CONFIG[s]?.color || '#6b7280',
      background: STATUS_CONFIG[s]?.bg || '#f3f4f6', flexShrink: 0,
    }),
    cardExpanded: { padding: '0 14px 14px', borderTop: '1px solid var(--brd)' },
    cardDesc: { fontSize: 13, color: '#6b7280', lineHeight: 1.55, marginTop: 10 },
    responseBox: {
      marginTop: 10, padding: '10px 12px', borderRadius: 8,
      background: 'var(--pri-xl)', border: '1px solid var(--pri-l)',
    },
    responseLabel: { fontSize: 11, fontWeight: 700, color: 'var(--pri)', marginBottom: 4 },
    responseText: { fontSize: 13, color: 'var(--txt)', lineHeight: 1.5 },
    cardDate: { fontSize: 11, color: '#9ca3af', marginTop: 8 },
    typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 },
    typeCard: (type: FeedbackType, sel: boolean) => ({
      padding: '14px 12px', borderRadius: 12, cursor: 'pointer',
      border: `2px solid ${sel ? TYPE_CONFIG[type].color : 'var(--brd)'}`,
      background: sel ? TYPE_CONFIG[type].bg : 'var(--surf)',
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6,
    }),
    fieldLabel: { fontSize: 13, fontWeight: 600, color: 'var(--txt)', marginBottom: 6, display: 'block' },
    input: {
      width: '100%', padding: '11px 14px', borderRadius: 10,
      border: '1.5px solid var(--brd)', background: 'var(--surf)',
      fontSize: 14, color: 'var(--txt)', outline: 'none',
      fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 16,
    },
    textarea: {
      width: '100%', padding: '11px 14px', borderRadius: 10,
      border: '1.5px solid var(--brd)', background: 'var(--surf)',
      fontSize: 14, color: 'var(--txt)', outline: 'none', resize: 'vertical' as const,
      fontFamily: 'inherit', boxSizing: 'border-box' as const, minHeight: 100, marginBottom: 20,
    },
    submitBtn: (dis: boolean) => ({
      width: '100%', padding: 14, borderRadius: 12, border: 'none',
      cursor: dis ? 'not-allowed' : 'pointer',
      background: dis ? '#d1d5db' : 'var(--pri)',
      color: dis ? '#9ca3af' : '#fff', fontSize: 15, fontWeight: 700,
    }),
    successBox: { textAlign: 'center' as const, padding: '40px 0' },
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.sheet}>
        <div style={s.handle} />
        <div style={s.header}>
          {view === 'form'
            ? <button onClick={() => setView('list')} style={{ ...s.iconBtn, background: 'transparent' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--txt)' }}>arrow_back</span>
              </button>
            : <span style={{ width: 32 }} />
          }
          <span style={s.titleText}>{view === 'list' ? 'Feedback & Ideen' : 'Neues Feedback'}</span>
          <button style={s.iconBtn} onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6b7280' }}>close</span>
          </button>
        </div>

        <div style={s.body}>
          {view === 'list' ? <>
            <button style={s.newBtn} onClick={() => setView('form')}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
              Feedback oder Idee einreichen
            </button>
            <div style={s.sectionLabel}>Meine Einreichungen ({myFeedback.length})</div>
            {loading
              ? <div style={s.emptyState}>Lade…</div>
              : myFeedback.length === 0
                ? <div style={s.emptyState}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>inbox</span>
                    Noch nichts eingereicht
                  </div>
                : myFeedback.map(item => (
                    <div key={item.id} style={s.card} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                      <div style={s.cardRow}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: TYPE_CONFIG[item.type].color, marginTop: 1 }}>
                          {TYPE_CONFIG[item.type].icon}
                        </span>
                        <span style={s.cardTitle}>{item.title}</span>
                        <span style={s.statusBadge(item.status)}>{STATUS_CONFIG[item.status]?.label}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>
                          {expanded === item.id ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                      {expanded === item.id && (
                        <div style={s.cardExpanded}>
                          <p style={s.cardDesc}>{item.description}</p>
                          {item.admin_response && (
                            <div style={s.responseBox}>
                              <div style={s.responseLabel}>💬 Antwort vom Support</div>
                              <div style={s.responseText}>{item.admin_response}</div>
                            </div>
                          )}
                          <div style={s.cardDate}>
                            {new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
            }
          </> : submitted ? (
            <div style={s.successBox}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#16a34a', display: 'block', marginBottom: 12 }}>check_circle</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)' }}>Vielen Dank!</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Dein Feedback wurde eingereicht.</div>
            </div>
          ) : <>
            <div style={{ marginBottom: 20 }}>
              <label style={s.fieldLabel}>Art des Feedbacks</label>
              <div style={s.typeGrid}>
                {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map(type => (
                  <div key={type} style={s.typeCard(type, selectedType === type)} onClick={() => setSelectedType(type)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: selectedType === type ? TYPE_CONFIG[type].color : '#9ca3af' }}>
                      {TYPE_CONFIG[type].icon}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center', color: selectedType === type ? TYPE_CONFIG[type].color : '#6b7280' }}>
                      {TYPE_CONFIG[type].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <label style={s.fieldLabel}>Kurze Überschrift</label>
            <input
              style={s.input}
              placeholder={selectedType === 'bug' ? 'z. B. App stürzt beim Foto-Upload ab' : selectedType === 'feature' ? 'z. B. Dunkelmodus' : 'Kurze Beschreibung…'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={100}
            />
            <label style={s.fieldLabel}>Beschreibung</label>
            <textarea
              style={s.textarea}
              placeholder={selectedType === 'bug' ? 'Was genau ist passiert? Wann tritt der Fehler auf?' : 'Beschreibe deine Idee oder Vorschlag…'}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <button
              style={s.submitBtn(!title.trim() || !description.trim() || submitting)}
              disabled={!title.trim() || !description.trim() || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Wird gesendet…' : 'Einreichen'}
            </button>
          </>}
        </div>
      </div>
    </div>
  )
}

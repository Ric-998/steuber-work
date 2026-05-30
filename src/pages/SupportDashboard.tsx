import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { FeedbackItem, FeedbackType, FeedbackStatus, FeedbackPriority } from '../types'

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: string; color: string; bg: string }> = {
  bug:         { label: 'Bug',          icon: 'bug_report',  color: '#dc2626', bg: '#fef2f2' },
  feature:     { label: 'Feature',      icon: 'lightbulb',   color: '#d97706', bg: '#fffbeb' },
  improvement: { label: 'Verbesserung', icon: 'trending_up', color: '#0891b2', bg: '#ecfeff' },
  other:       { label: 'Sonstiges',    icon: 'chat_bubble', color: '#6b7280', bg: '#f9fafb' },
}

const STATUS_OPTIONS: { value: FeedbackStatus; label: string; color: string; bg: string }[] = [
  { value: 'open',        label: 'Offen',          color: '#6b7280', bg: '#f3f4f6' },
  { value: 'in_progress', label: 'In Bearbeitung', color: '#0891b2', bg: '#ecfeff' },
  { value: 'planned',     label: 'Geplant',        color: '#7c3aed', bg: '#f5f3ff' },
  { value: 'done',        label: 'Erledigt',       color: '#16a34a', bg: '#f0fdf4' },
  { value: 'rejected',    label: 'Abgelehnt',      color: '#dc2626', bg: '#fef2f2' },
]

const PRIORITY_OPTIONS: { value: FeedbackPriority; label: string; color: string }[] = [
  { value: 'low',      label: 'Niedrig',   color: '#6b7280' },
  { value: 'medium',   label: 'Mittel',    color: '#d97706' },
  { value: 'high',     label: 'Hoch',      color: '#dc2626' },
  { value: 'critical', label: 'Kritisch',  color: '#7c2d12' },
]

const isMobile = () => window.innerWidth < 768

export default function SupportDashboard() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<FeedbackType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'all'>('all')
  const [selected, setSelected] = useState<FeedbackItem | null>(null)
  const [response, setResponse] = useState('')
  const [saving, setSaving] = useState(false)
  const [mobile, setMobile] = useState(isMobile())

  useEffect(() => {
    const handler = () => setMobile(isMobile())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('feedback')
      .select('*, users(full_name)')
      .order('created_at', { ascending: false })
    setItems((data as FeedbackItem[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(i =>
    (filterType === 'all' || i.type === filterType) &&
    (filterStatus === 'all' || i.status === filterStatus)
  )

  const stats = {
    total: items.length,
    open: items.filter(i => i.status === 'open').length,
    bugs: items.filter(i => i.type === 'bug').length,
    features: items.filter(i => i.type === 'feature').length,
  }

  async function saveTicket(id: string, patch: Partial<FeedbackItem>) {
    setSaving(true)
    await supabase.from('feedback').update(patch).eq('id', id)
    await load()
    if (selected?.id === id) {
      setSelected(prev => prev ? { ...prev, ...patch } : null)
    }
    setSaving(false)
  }

  async function handleResponseSave() {
    if (!selected) return
    await saveTicket(selected.id, { admin_response: response || null })
    setResponse('')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const statusOf = (s: string) => STATUS_OPTIONS.find(o => o.value === s)
  const priorityOf = (p: string) => PRIORITY_OPTIONS.find(o => o.value === p)

  const s = {
    root: {
      minHeight: '100dvh', background: '#f8f9fa',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
    topbar: {
      background: '#085d68', padding: '0 24px',
      height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky' as const, top: 0, zIndex: 100,
    },
    logo: { display: 'flex', flexDirection: 'column' as const, lineHeight: 1.05 },
    logoBold: { fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: 'Manrope, sans-serif', letterSpacing: '-0.3px' },
    logoLight: { fontSize: 15, fontWeight: 300, color: 'rgba(255,255,255,0.75)', fontFamily: 'Manrope, sans-serif', letterSpacing: '4px' },
    topbarRight: { display: 'flex', alignItems: 'center', gap: 12 },
    supportBadge: {
      padding: '4px 10px', borderRadius: 20,
      background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600,
    },
    signOutBtn: {
      padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
      background: 'transparent', color: '#fff', fontSize: 13, cursor: 'pointer',
    },
    main: {
      maxWidth: 1100, margin: '0 auto', padding: mobile ? '16px 12px' : '24px 24px',
    },
    statsRow: {
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
    },
    statCard: {
      background: '#fff', borderRadius: 14, padding: '16px 18px',
      border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    },
    statValue: { fontSize: 28, fontWeight: 800, color: '#085d68' },
    statLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 500, marginTop: 2 },
    filterRow: {
      display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16,
    },
    filterChip: (active: boolean) => ({
      padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
      border: active ? '1.5px solid #085d68' : '1.5px solid #e5e7eb',
      background: active ? '#085d68' : '#fff',
      color: active ? '#fff' : '#374151', cursor: 'pointer',
    }),
    layout: {
      display: 'grid',
      gridTemplateColumns: selected && !mobile ? '1fr 420px' : '1fr',
      gap: 16, alignItems: 'start',
    },
    ticketList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
    ticket: (sel: boolean) => ({
      background: '#fff', borderRadius: 12, padding: '14px 16px',
      border: sel ? '2px solid #085d68' : '1px solid #e5e7eb',
      cursor: 'pointer', transition: 'border 0.15s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }),
    ticketHeader: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
    ticketTitle: { fontSize: 14, fontWeight: 600, color: '#111827', flex: 1 },
    chip: (color: string, bg: string) => ({
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color, background: bg, flexShrink: 0,
    }),
    ticketMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const },
    metaText: { fontSize: 12, color: '#9ca3af' },
    priorityDot: (p: string) => ({
      width: 8, height: 8, borderRadius: 4,
      background: priorityOf(p)?.color || '#6b7280', flexShrink: 0,
    }),
    noResults: { textAlign: 'center' as const, padding: '48px 0', color: '#9ca3af' },

    // Detail panel
    detail: {
      background: '#fff', border: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      position: mobile ? 'fixed' as const : 'sticky' as const,
      ...(mobile
        ? { inset: 0, zIndex: 200, borderRadius: 0, overflow: 'auto' }
        : { borderRadius: 16, top: 76, maxHeight: 'calc(100dvh - 92px)', overflow: 'auto' }),
    },
    detailHeader: {
      padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
      display: 'flex', alignItems: 'center', gap: 10,
      position: 'sticky' as const, top: 0, background: '#fff', zIndex: 1,
    },
    detailBody: { padding: '20px' },
    detailTitle: { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 },
    detailDesc: { fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 },
    sectionLabel: {
      fontSize: 11, fontWeight: 700, color: '#9ca3af',
      textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8,
    },
    selectRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16 },
    optionBtn: (active: boolean, color: string, bg: string) => ({
      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
      border: active ? `2px solid ${color}` : '2px solid #e5e7eb',
      background: active ? bg : '#fff', color: active ? color : '#6b7280',
      cursor: 'pointer',
    }),
    textareaWrap: { marginTop: 4 },
    textarea: {
      width: '100%', padding: '10px 12px', borderRadius: 10,
      border: '1.5px solid #e5e7eb', fontSize: 13, color: '#111827',
      fontFamily: 'inherit', resize: 'vertical' as const, minHeight: 80,
      outline: 'none', boxSizing: 'border-box' as const,
    },
    saveBtn: (dis: boolean) => ({
      marginTop: 10, padding: '10px 18px', borderRadius: 10, border: 'none',
      background: dis ? '#e5e7eb' : '#085d68', color: dis ? '#9ca3af' : '#fff',
      fontSize: 13, fontWeight: 600, cursor: dis ? 'not-allowed' : 'pointer',
    }),
    submitterBox: {
      padding: '12px 14px', borderRadius: 10, background: '#f8f9fa',
      border: '1px solid #e5e7eb', marginBottom: 16,
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16, border: 'none',
      background: '#f3f4f6', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
  }

  return (
    <div style={s.root}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={s.logo}>
          <span style={s.logoBold}>STEUBER</span>
          <span style={s.logoLight}>WORK</span>
        </div>
        <div style={s.topbarRight}>
          <span style={s.supportBadge}>Support</span>
          <button style={s.signOutBtn} onClick={handleSignOut}>Abmelden</button>
        </div>
      </div>

      <div style={s.main}>
        {/* Stats */}
        <div style={{ ...s.statsRow, gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)' }}>
          {[
            { label: 'Gesamt', value: stats.total },
            { label: 'Offen', value: stats.open },
            { label: 'Bugs', value: stats.bugs },
            { label: 'Feature-Wünsche', value: stats.features },
          ].map(({ label, value }) => (
            <div key={label} style={s.statCard}>
              <div style={s.statValue}>{value}</div>
              <div style={s.statLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={s.filterRow}>
          <button style={s.filterChip(filterType === 'all')} onClick={() => setFilterType('all')}>Alle Typen</button>
          {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map(t => (
            <button key={t} style={s.filterChip(filterType === t)} onClick={() => setFilterType(t)}>
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>
        <div style={{ ...s.filterRow, marginBottom: 20 }}>
          <button style={s.filterChip(filterStatus === 'all')} onClick={() => setFilterStatus('all')}>Alle Status</button>
          {STATUS_OPTIONS.map(o => (
            <button key={o.value} style={s.filterChip(filterStatus === o.value)} onClick={() => setFilterStatus(o.value as FeedbackStatus)}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Layout */}
        <div style={s.layout}>
          {/* Ticket List */}
          <div style={s.ticketList}>
            {loading ? (
              <div style={s.noResults}>Lade…</div>
            ) : filtered.length === 0 ? (
              <div style={s.noResults}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>inbox</span>
                Keine Einträge
              </div>
            ) : (
              filtered.map(item => {
                const st = statusOf(item.status)
                const ty = TYPE_CONFIG[item.type]
                return (
                  <div key={item.id} style={s.ticket(selected?.id === item.id)} onClick={() => { setSelected(item); setResponse(item.admin_response || '') }}>
                    <div style={s.ticketHeader}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: ty.color, marginTop: 1 }}>
                        {ty.icon}
                      </span>
                      <span style={s.ticketTitle}>{item.title}</span>
                      <span style={s.chip(st?.color || '#6b7280', st?.bg || '#f3f4f6')}>{st?.label}</span>
                    </div>
                    <div style={s.ticketMeta}>
                      <div style={s.priorityDot(item.priority)} />
                      <span style={s.chip(ty.color, ty.bg)}>{ty.label}</span>
                      <span style={s.metaText}>{(item.users as any)?.full_name || '—'}</span>
                      <span style={s.metaText}>
                        {new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                      </span>
                      {item.admin_response && (
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#085d68' }}>chat</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div style={s.detail}>
              <div style={s.detailHeader}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: TYPE_CONFIG[selected.type].color }}>
                  {TYPE_CONFIG[selected.type].icon}
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#111827' }}>Ticket</span>
                <button style={s.closeBtn} onClick={() => setSelected(null)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6b7280' }}>close</span>
                </button>
              </div>

              <div style={s.detailBody}>
                {/* Submitter */}
                <div style={s.submitterBox}>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>Eingereicht von</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                    {(selected.users as any)?.full_name || 'Unbekannt'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(selected.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div style={s.detailTitle}>{selected.title}</div>
                <div style={s.detailDesc}>{selected.description}</div>

                {/* Status */}
                <div style={s.sectionLabel}>Status</div>
                <div style={s.selectRow}>
                  {STATUS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      style={s.optionBtn(selected.status === o.value, o.color, o.bg)}
                      onClick={() => { saveTicket(selected.id, { status: o.value }); setSelected(prev => prev ? { ...prev, status: o.value } : null) }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* Priority */}
                <div style={s.sectionLabel}>Priorität</div>
                <div style={{ ...s.selectRow, marginBottom: 20 }}>
                  {PRIORITY_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      style={s.optionBtn(selected.priority === o.value, o.color, `${o.color}18`)}
                      onClick={() => { saveTicket(selected.id, { priority: o.value }); setSelected(prev => prev ? { ...prev, priority: o.value } : null) }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* Response */}
                <div style={s.sectionLabel}>Antwort an Nutzer</div>
                <div style={s.textareaWrap}>
                  <textarea
                    style={s.textarea}
                    placeholder="Schreib eine Antwort… (wird dem Nutzer angezeigt)"
                    value={response}
                    onChange={e => setResponse(e.target.value)}
                  />
                  <button style={s.saveBtn(saving)} onClick={handleResponseSave} disabled={saving}>
                    {saving ? 'Wird gespeichert…' : 'Antwort speichern'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

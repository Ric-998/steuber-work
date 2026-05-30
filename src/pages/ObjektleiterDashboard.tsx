import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  userId: string
  userName: string
  onLogout: () => void
}

type Tab = 'heute' | 'objekte' | 'team'

const STATUS_COLOR: Record<string, string> = {
  offen: '#6b7280', in_arbeit: '#d97706', erledigt: '#16a34a', problem: '#dc2626', vertretung: '#7c3aed',
}
const STATUS_BG: Record<string, string> = {
  offen: '#f3f4f6', in_arbeit: '#fffbeb', erledigt: '#f0fdf4', problem: '#fef2f2', vertretung: '#f5f3ff',
}
const STATUS_LABEL: Record<string, string> = {
  offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', problem: 'Problem', vertretung: 'Vertretung',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ObjektleiterDashboard({ userId, userName, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('heute')
  const [objects, setObjects] = useState<any[]>([])
  const [todayAssigns, setTodayAssigns] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedObj, setSelectedObj] = useState<any>(null)
  const [objTasks, setObjTasks] = useState<any[]>([])
  const [objAssigns, setObjAssigns] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [editingAssign, setEditingAssign] = useState<any>(null)
  const [assignUser, setAssignUser] = useState('')
  const [assignDate, setAssignDate] = useState(localToday())
  const [saving, setSaving] = useState(false)

  const initials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const isMobile = window.innerWidth < 768

  const load = useCallback(async () => {
    setLoading(true)
    const today = localToday()
    const [objRes, catRes, usersRes] = await Promise.all([
      supabase.from('objects').select('*').eq('objektleiter_id', userId).eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('users').select('id,full_name,is_active').eq('is_active', true).order('full_name'),
    ])
    const objs = objRes.data || []
    setObjects(objs)
    setCategories(catRes.data || [])
    setAllUsers(usersRes.data || [])

    if (objs.length > 0) {
      const objIds = objs.map((o: any) => o.id)
      // Get tasks for these objects
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id,title,object_id,category_id,interval,is_active,categories(emoji,name)')
        .in('object_id', objIds)
        .eq('is_active', true)
      const taskIds = (tasksData || []).map((t: any) => t.id)

      // Today's assignments
      if (taskIds.length > 0) {
        const { data: todayData } = await supabase
          .from('task_assignments')
          .select('id,task_id,user_id,due_date,status,tasks(title,object_id,categories(emoji)),users!task_assignments_user_id_fkey(full_name)')
          .in('task_id', taskIds)
          .eq('due_date', today)
        setTodayAssigns(todayData || [])

        // Team: unique users from assignments in the last 30 days
        const from30 = new Date(); from30.setDate(from30.getDate() - 30)
        const from30Str = from30.toISOString().slice(0, 10)
        const { data: teamData } = await supabase
          .from('task_assignments')
          .select('user_id,users!task_assignments_user_id_fkey(id,full_name)')
          .in('task_id', taskIds)
          .gte('due_date', from30Str)
        const seen = new Set<string>()
        const uniqueTeam: any[] = []
        ;(teamData || []).forEach((a: any) => {
          if (a.user_id && !seen.has(a.user_id)) {
            seen.add(a.user_id)
            uniqueTeam.push(a.users)
          }
        })
        setTeam(uniqueTeam.filter(Boolean))
      }
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const loadObjectDetail = async (obj: any) => {
    setSelectedObj(obj)
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id,title,interval,is_active,category_id,default_assignee,categories(emoji,name),users!tasks_default_assignee_fkey(full_name)')
      .eq('object_id', obj.id)
      .order('title')
    setObjTasks(tasks || [])

    const taskIds = (tasks || []).map((t: any) => t.id)
    if (taskIds.length > 0) {
      const today = localToday()
      const in14 = new Date(); in14.setDate(in14.getDate() + 14)
      const { data: assigns } = await supabase
        .from('task_assignments')
        .select('id,task_id,user_id,due_date,status,users!task_assignments_user_id_fkey(id,full_name)')
        .in('task_id', taskIds)
        .gte('due_date', today)
        .order('due_date')
      setObjAssigns(assigns || [])
    } else {
      setObjAssigns([])
    }
  }

  const handleSaveAssign = async () => {
    if (!editingAssign || !assignUser || !assignDate) return
    setSaving(true)
    // Check if assignment already exists for this task+date
    const { data: existing } = await supabase
      .from('task_assignments')
      .select('id')
      .eq('task_id', editingAssign.id)
      .eq('due_date', assignDate)
      .maybeSingle()

    if (existing) {
      await supabase.from('task_assignments').update({ user_id: assignUser }).eq('id', existing.id)
    } else {
      await supabase.from('task_assignments').insert({ task_id: editingAssign.id, user_id: assignUser, due_date: assignDate, status: 'offen' })
    }
    setSaving(false)
    setEditingAssign(null)
    if (selectedObj) loadObjectDetail(selectedObj)
  }

  // Stats for Heute tab
  const stats = {
    total: todayAssigns.length,
    done: todayAssigns.filter((a: any) => a.status === 'erledigt').length,
    inProgress: todayAssigns.filter((a: any) => a.status === 'in_arbeit').length,
    problems: todayAssigns.filter((a: any) => a.status === 'problem').length,
  }

  const s = {
    root: { minHeight: '100dvh', background: 'var(--bg)', fontFamily: 'Inter, system-ui, sans-serif' },
    header: {
      background: 'rgba(248,249,250,0.92)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(191,200,202,0.4)',
      padding: '0 16px', height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky' as const, top: 0, zIndex: 100,
    },
    logo: { display: 'flex', flexDirection: 'column' as const, lineHeight: 1.05 },
    logoBold: { fontSize: 14, fontWeight: 800, color: 'var(--pri)', fontFamily: 'Manrope, sans-serif' },
    logoLight: { fontSize: 14, fontWeight: 300, color: 'var(--pri-c)', fontFamily: 'Manrope, sans-serif', letterSpacing: '4px' },
    avatar: {
      width: 34, height: 34, borderRadius: 17,
      background: 'linear-gradient(135deg,var(--pri),var(--pri-c))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff',
    },
    tabs: {
      display: 'flex', background: 'var(--surf)', borderBottom: '1px solid var(--brd)',
      position: 'sticky' as const, top: 56, zIndex: 99,
    },
    tabBtn: (active: boolean) => ({
      flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
      fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? 'var(--pri)' : 'var(--txt-muted)',
      borderBottom: active ? '2px solid var(--pri)' : '2px solid transparent',
      cursor: 'pointer', transition: 'all 0.15s',
    }),
    body: { padding: '16px 16px 100px', maxWidth: 680, margin: '0 auto' },
    kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 },
    kpi: {
      background: 'var(--surf)', borderRadius: 12, padding: '12px 10px',
      border: '1px solid var(--brd)', textAlign: 'center' as const,
    },
    kpiVal: { fontSize: 22, fontWeight: 800, color: 'var(--pri)' },
    kpiLabel: { fontSize: 11, color: 'var(--txt-muted)', marginTop: 2 },
    sectionLabel: {
      fontSize: 12, fontWeight: 700, color: '#9ca3af',
      textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10,
    },
    card: {
      background: 'var(--surf)', borderRadius: 12,
      border: '1px solid var(--brd)', marginBottom: 8, padding: '12px 14px',
    },
    assignRow: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderBottom: '1px solid var(--brd)',
    },
    statusChip: (status: string) => ({
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      color: STATUS_COLOR[status] || '#6b7280',
      background: STATUS_BG[status] || '#f3f4f6', flexShrink: 0,
    }),
    objCard: {
      background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--brd)',
      padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 12,
    },
    objIcon: {
      width: 40, height: 40, borderRadius: 12,
      background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    teamCard: {
      background: 'var(--surf)', borderRadius: 12, border: '1px solid var(--brd)',
      padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
    },
    memberAvatar: {
      width: 36, height: 36, borderRadius: 18,
      background: 'linear-gradient(135deg,var(--pri),var(--pri-c))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
    },
    editOverlay: {
      position: 'fixed' as const, inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end',
    },
    editSheet: {
      width: '100%', maxWidth: 540, margin: '0 auto',
      background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px',
    },
    input: {
      width: '100%', padding: '10px 12px', borderRadius: 10,
      border: '1.5px solid var(--brd)', background: 'var(--surf)',
      fontSize: 14, color: 'var(--txt)', fontFamily: 'inherit',
      boxSizing: 'border-box' as const, marginBottom: 12,
    },
    saveBtn: {
      width: '100%', padding: 13, borderRadius: 12, border: 'none',
      background: 'var(--pri)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },
    emptyState: { textAlign: 'center' as const, padding: '40px 0', color: '#9ca3af', fontSize: 14 },
    backBtn: {
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer',
      background: 'none', border: 'none', fontSize: 14, color: 'var(--pri)', fontWeight: 600, padding: 0,
    },
  }

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>
          <span style={s.logoBold}>STEUBER</span>
          <span style={s.logoLight}>WORK</span>
        </div>
        <div style={s.avatar}>{initials}</div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(['heute','objekte','team'] as Tab[]).map(t => (
          <button key={t} style={s.tabBtn(tab === t)} onClick={() => { setTab(t); setSelectedObj(null) }}>
            {t === 'heute' ? 'Heute' : t === 'objekte' ? 'Meine Objekte' : 'Mein Team'}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {loading ? (
          <div style={s.emptyState}>Lade…</div>
        ) : tab === 'heute' ? (
          <>
            {/* KPIs */}
            <div style={s.kpiRow}>
              {[
                { label: 'Gesamt', val: stats.total },
                { label: 'In Arbeit', val: stats.inProgress },
                { label: 'Erledigt', val: stats.done },
                { label: 'Probleme', val: stats.problems },
              ].map(({ label, val }) => (
                <div key={label} style={s.kpi}>
                  <div style={{ ...s.kpiVal, color: label === 'Probleme' && val > 0 ? '#dc2626' : 'var(--pri)' }}>{val}</div>
                  <div style={s.kpiLabel}>{label}</div>
                </div>
              ))}
            </div>

            {/* Problem-Karten */}
            {stats.problems > 0 && (
              <>
                <div style={s.sectionLabel}>⚠ Probleme heute</div>
                {todayAssigns.filter((a: any) => a.status === 'problem').map((a: any) => (
                  <div key={a.id} style={{ ...s.card, borderLeft: '3px solid #dc2626' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>
                      {(a.tasks as any)?.categories?.emoji} {(a.tasks as any)?.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {(a.users as any)?.full_name} · {objects.find((o: any) => o.id === (a.tasks as any)?.object_id)?.name || ''}
                    </div>
                  </div>
                ))}
              </>
            )}

            <div style={s.sectionLabel}>Alle Aufgaben heute ({todayAssigns.length})</div>
            {todayAssigns.length === 0 ? (
              <div style={s.emptyState}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>event_available</span>
                Keine Aufgaben heute
              </div>
            ) : todayAssigns.map((a: any) => (
              <div key={a.id} style={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{(a.tasks as any)?.categories?.emoji || '📋'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{(a.tasks as any)?.title}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {(a.users as any)?.full_name} · {objects.find((o: any) => o.id === (a.tasks as any)?.object_id)?.name || ''}
                    </div>
                  </div>
                  <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status] || a.status}</span>
                </div>
              </div>
            ))}
          </>
        ) : tab === 'objekte' ? (
          selectedObj ? (
            <>
              <button style={s.backBtn} onClick={() => setSelectedObj(null)}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                Zurück zu Objekten
              </button>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>{selectedObj.name || selectedObj.address}</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>{selectedObj.address}, {selectedObj.city}</div>

              <div style={s.sectionLabel}>Leistungen & Einteilung</div>
              {objTasks.length === 0 ? (
                <div style={s.emptyState}>Keine Leistungen für dieses Objekt</div>
              ) : objTasks.map((task: any) => {
                const taskAssigns = objAssigns.filter((a: any) => a.task_id === task.id)
                return (
                  <div key={task.id} style={{ background: 'var(--surf)', borderRadius: 12, border: '1px solid var(--brd)', marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{task.categories?.emoji || '📋'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{task.title}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{task.interval} · {(task.users as any)?.full_name ? `Standard: ${(task.users as any).full_name}` : 'Kein Standard-MA'}</div>
                      </div>
                      <button
                        onClick={() => { setEditingAssign(task); setAssignUser(''); setAssignDate(localToday()) }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--pri-xl)', color: 'var(--pri)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        + Einteilen
                      </button>
                    </div>
                    {taskAssigns.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--brd)' }}>
                        {taskAssigns.map((a: any) => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--brd)', fontSize: 12 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#9ca3af' }}>event</span>
                            <span style={{ color: '#6b7280' }}>{new Date(a.due_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                            <span style={{ flex: 1, color: 'var(--txt)', fontWeight: 600 }}>{(a.users as any)?.full_name || 'Unzugewiesen'}</span>
                            <span style={s.statusChip(a.status)}>{STATUS_LABEL[a.status] || a.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <>
              <div style={s.sectionLabel}>Meine Objekte ({objects.length})</div>
              {objects.length === 0 ? (
                <div style={s.emptyState}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>apartment</span>
                  Dir wurden noch keine Objekte zugewiesen
                </div>
              ) : objects.map((obj: any) => {
                const objToday = todayAssigns.filter((a: any) => (a.tasks as any)?.object_id === obj.id)
                const problems = objToday.filter((a: any) => a.status === 'problem').length
                const done = objToday.filter((a: any) => a.status === 'erledigt').length
                return (
                  <div key={obj.id} style={s.objCard} onClick={() => loadObjectDetail(obj)}>
                    <div style={s.objIcon}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--pri)' }}>apartment</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {obj.name || obj.address}
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{obj.address}, {obj.city}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        {problems > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 4 }}>⚠ {problems} Problem{problems > 1 ? 'e' : ''}</span>}
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{done}/{objToday.length} heute erledigt</span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#d1d5db' }}>chevron_right</span>
                  </div>
                )
              })}
            </>
          )
        ) : (
          <>
            <div style={s.sectionLabel}>Mein Team ({team.length} Mitarbeiter)</div>
            {team.length === 0 ? (
              <div style={s.emptyState}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>group</span>
                Noch keine Mitarbeiter in deinen Objekten eingeteilt
              </div>
            ) : team.map((member: any) => {
              if (!member) return null
              const ini = (member.full_name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              const memberToday = todayAssigns.filter((a: any) => a.user_id === member.id)
              const todayDone = memberToday.filter((a: any) => a.status === 'erledigt').length
              return (
                <div key={member.id} style={s.teamCard}>
                  <div style={s.memberAvatar}>{ini}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>{member.full_name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {memberToday.length > 0
                        ? `${todayDone}/${memberToday.length} Aufgaben heute erledigt`
                        : 'Heute keine Aufgaben'}
                    </div>
                  </div>
                  {memberToday.some((a: any) => a.status === 'problem') && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '3px 8px', borderRadius: 6 }}>Problem</span>
                  )}
                  {memberToday.length > 0 && !memberToday.some((a: any) => a.status === 'problem') && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: todayDone === memberToday.length ? '#16a34a' : '#d97706', background: todayDone === memberToday.length ? '#f0fdf4' : '#fffbeb', padding: '3px 8px', borderRadius: 6 }}>
                      {todayDone === memberToday.length ? 'Alles erledigt' : 'In Arbeit'}
                    </span>
                  )}
                </div>
              )
            })}

            <button onClick={onLogout} style={{ width: '100%', marginTop: 24, padding: '13px', borderRadius: 12, border: 'none', background: 'rgba(186,26,26,0.08)', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
              Abmelden
            </button>
          </>
        )}
      </div>

      {/* Assign Edit Sheet */}
      {editingAssign && (
        <div style={s.editOverlay} onClick={e => { if (e.target === e.currentTarget) setEditingAssign(null) }}>
          <div style={s.editSheet}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>Mitarbeiter einteilen</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>{editingAssign.title}</div>

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', display: 'block', marginBottom: 6 }}>Datum</label>
            <input type="date" style={s.input} value={assignDate} onChange={e => setAssignDate(e.target.value)} />

            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', display: 'block', marginBottom: 6 }}>Mitarbeiter</label>
            <select style={s.input} value={assignUser} onChange={e => setAssignUser(e.target.value)}>
              <option value="">Mitarbeiter wählen…</option>
              {allUsers.map((u: any) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>

            <button style={s.saveBtn} onClick={handleSaveAssign} disabled={!assignUser || saving}>
              {saving ? 'Wird gespeichert…' : 'Einteilen'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

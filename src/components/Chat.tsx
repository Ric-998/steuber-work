import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DbUser {
  id: string
  full_name: string
  role?: { name: string }
  is_active: boolean
}

export interface DbMessage {
  id: string
  sender_id: string
  receiver_id: string
  text: string
  read_at: string | null
  created_at: string
  task_ref?: { id: string; title: string; objects?: { name: string; address: string } } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getInitials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function fmtMsgTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Gestern'
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  if (diffDays < 7) return days[d.getDay()]
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function fmtDateDivider(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Heute'
  if (diffDays === 1) return 'Gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
}

function roleLabel(user: DbUser) {
  const r = (user.role as any)?.name
  if (r === 'admin') return 'Admin'
  if (r === 'mitarbeiter') return 'Mitarbeiter/in'
  return 'Mitarbeiter/in'
}

// ─── ChatConversation ─────────────────────────────────────────────────────────
export function ChatConversation({ contact, currentUserId, onBack }: {
  contact: DbUser
  currentUserId: string
  onBack: () => void
}) {
  const [messages, setMessages] = useState<DbMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, text, read_at, created_at, task_ref:tasks(id, title, objects(name, address))')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${contact.id}),and(sender_id.eq.${contact.id},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as unknown as DbMessage[])
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', contact.id)
      .eq('receiver_id', currentUserId)
      .is('read_at', null)
  }

  useEffect(() => {
    loadMessages()
    const channel = supabase.channel(`chat-conv-${contact.id}-${currentUserId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUserId}` }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [contact.id, currentUserId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages])

  const send = async () => {
    const text = input.trim(); if (!text || sending) return
    setSending(true); setInput('')
    await supabase.from('messages').insert({ sender_id: currentUserId, receiver_id: contact.id, text })
    // Push notification to receiver
    supabase.functions.invoke('send-push', {
      body: {
        user_id: contact.id,
        title: '💬 Neue Nachricht',
        body: text.length > 80 ? text.slice(0, 80) + '…' : text,
        url: '/',
        tag: `chat-${currentUserId}`,
      }
    }).catch(() => {}) // fire-and-forget
    await loadMessages()
    setSending(false)
  }

  let lastDateDiv = ''

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', background: 'var(--surf-card)', borderBottom: '1px solid var(--outline)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center', color: 'var(--pri)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--pri)' }}>
          {getInitials(contact.full_name)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{contact.full_name}</div>
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', fontWeight: 600 }}>{roleLabel(contact)}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 0 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--txt-muted)', fontSize: 13 }}>Noch keine Nachrichten</div>
        )}
        {messages.map((m) => {
          const isMe = m.sender_id === currentUserId
          const dateDiv = fmtDateDivider(m.created_at)
          const showDateDiv = dateDiv !== lastDateDiv
          lastDateDiv = dateDiv
          return (
            <div key={m.id}>
              {showDateDiv && (
                <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', background: 'var(--surf-low)', padding: '3px 10px', borderRadius: 99 }}>{dateDiv}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                <div style={{ maxWidth: '78%', background: isMe ? 'var(--pri)' : 'var(--surf-card)', color: isMe ? '#fff' : 'var(--txt)', borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '10px 12px', border: isMe ? 'none' : '1px solid var(--outline)', boxShadow: isMe ? '0 2px 8px rgba(8,93,104,0.2)' : 'none' }}>
                  {m.task_ref && (
                    <div style={{ background: isMe ? 'rgba(255,255,255,0.18)' : 'var(--pri-xl)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.5)' : 'var(--pri)'}`, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: isMe ? '#fff' : 'var(--pri)' }}>{(m.task_ref as any).title}</div>
                      <div style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--txt-muted)', fontSize: 10, marginTop: 1 }}>{(m.task_ref as any).objects?.name || (m.task_ref as any).objects?.address || ''}</div>
                    </div>
                  )}
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>{m.text}</div>
                  <div style={{ fontSize: 10, marginTop: 5, fontWeight: 600, textAlign: 'right', color: isMe ? 'rgba(255,255,255,0.65)' : 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    {new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    {isMe && <span className="material-symbols-outlined" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1", color: m.read_at ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)' }}>done_all</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 0 14px', background: 'var(--surf-card)', borderTop: '1px solid var(--outline)', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--surf-low)', borderRadius: 20, border: '1px solid var(--outline)', padding: '9px 14px', minHeight: 42 }}>
          <textarea value={input}
            onChange={e => { setInput(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px' }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={`Nachricht an ${contact.full_name.split(' ')[0]}…`}
            rows={1}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--txt)', resize: 'none', maxHeight: 100, fontFamily: 'inherit', lineHeight: 1.4, overflowY: 'auto' }} />
        </div>
        <button onClick={send} disabled={!input.trim() || sending}
          style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: input.trim() ? 'var(--pri)' : 'var(--outline)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', transition: 'background 0.15s', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff', fontVariationSettings: "'FILL' 1" }}>send</span>
        </button>
      </div>
    </div>
  )
}

// ─── ChatTab ──────────────────────────────────────────────────────────────────
export function ChatTab({ currentUserId }: { currentUserName?: string; currentUserId: string }) {
  const [users, setUsers] = useState<DbUser[]>([])
  const [lastMessages, setLastMessages] = useState<Record<string, DbMessage>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const { data: usersData } = await supabase
      .from('users')
      .select('id, full_name, is_active, role:roles(name)')
      .eq('is_active', true)
      .neq('id', currentUserId)
      .order('full_name')
    if (usersData) setUsers(usersData as unknown as DbUser[])

    const { data: sent } = await supabase
      .from('messages').select('id, sender_id, receiver_id, text, read_at, created_at')
      .eq('sender_id', currentUserId).order('created_at', { ascending: false })
    const { data: received } = await supabase
      .from('messages').select('id, sender_id, receiver_id, text, read_at, created_at')
      .eq('receiver_id', currentUserId).order('created_at', { ascending: false })

    const all = [...(sent || []), ...(received || [])] as DbMessage[]
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const latestPerUser: Record<string, DbMessage> = {}
    const unread: Record<string, number> = {}
    for (const msg of all) {
      const partnerId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
      if (!latestPerUser[partnerId]) latestPerUser[partnerId] = msg
      if (!msg.read_at && msg.receiver_id === currentUserId) {
        unread[partnerId] = (unread[partnerId] || 0) + 1
      }
    }
    setLastMessages(latestPerUser)
    setUnreadCounts(unread)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    const channel = supabase.channel(`chat-list-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadData)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  if (openUserId) {
    const contact = users.find(u => u.id === openUserId)
    if (!contact) return null
    return <ChatConversation contact={contact} currentUserId={currentUserId} onBack={() => { setOpenUserId(null); loadData() }} />
  }

  const usersWithMsg = users.filter(u => lastMessages[u.id])
    .sort((a, b) => new Date(lastMessages[b.id].created_at).getTime() - new Date(lastMessages[a.id].created_at).getTime())
  const filtered = usersWithMsg.filter(u => u.full_name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 90, position: 'relative' }}>
      <div style={{ padding: '10px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--surf-card)', border: '1px solid var(--outline)', borderRadius: 14 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--txt-muted)' }}>search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--txt)', fontFamily: 'inherit' }} />
        </div>
        <button onClick={() => setShowNewChat(true)}
          style={{ width: 42, height: 42, borderRadius: 13, background: 'var(--pri-xl)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--pri)', fontVariationSettings: "'FILL' 1" }}>add</span>
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--txt-muted)', fontSize: 13 }}>Lade…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--txt-muted)', display: 'block', marginBottom: 10 }}>chat_bubble</span>
          <div style={{ fontSize: 14, color: 'var(--txt-muted)' }}>{search ? 'Keine Ergebnisse' : 'Noch keine Nachrichten'}</div>
          {!search && <div style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 4 }}>Tippe auf + neben der Suche, um eine Unterhaltung zu starten</div>}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, marginTop: 6 }}>Chats</div>
          {filtered.map(user => {
            const lastMsg = lastMessages[user.id]
            const unread = unreadCounts[user.id] || 0
            return (
              <button key={user.id} onClick={() => setOpenUserId(user.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surf-card)', border: '1px solid var(--outline)', borderRadius: 16, marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--pri)', flexShrink: 0 }}>
                  {getInitials(user.full_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{user.full_name}</span>
                    {lastMsg && <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{fmtMsgTime(lastMsg.created_at)}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--txt-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                      {lastMsg ? (lastMsg.sender_id === currentUserId ? `Du: ${lastMsg.text}` : lastMsg.text) : ''}
                    </span>
                    {unread > 0 && (
                      <span style={{ minWidth: 20, height: 20, borderRadius: 99, background: 'var(--pri)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', marginLeft: 8, flexShrink: 0 }}>{unread}</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </>
      )}



      {showNewChat && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div onClick={() => setShowNewChat(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px 40px', maxHeight: '75vh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--outline)', margin: '0 auto 18px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 14 }}>Neue Unterhaltung</div>
            {users.map(user => (
              <button key={user.id} onClick={() => { setShowNewChat(false); setOpenUserId(user.id) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--outline)', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--pri-xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--pri)', flexShrink: 0 }}>
                  {getInitials(user.full_name)}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>{user.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{roleLabel(user)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Hook: unread count for badge ────────────────────────────────────────────
export function useChatUnread(currentUserId: string) {
  const [unread, setUnread] = useState(0)

  const load = async () => {
    if (!currentUserId) return
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('receiver_id', currentUserId)
      .is('read_at', null)
    setUnread(data?.length || 0)
  }

  useEffect(() => {
    if (!currentUserId) return
    load()
    const ch = supabase.channel(`unread-badge-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [currentUserId])

  return unread
}

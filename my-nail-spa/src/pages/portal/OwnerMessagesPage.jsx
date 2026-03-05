import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, SendHorizonal, Sparkles, User } from 'lucide-react'

import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { api } from '../../lib/api'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function OwnerMessagesPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const salonId = auth.user?.salonId

  const [activeThreadId, setActiveThreadId] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState({ threads: false, messages: false })
  const [error, setError] = useState('')
  const [salon, setSalon] = useState(null)
  const [threads, setThreads] = useState([])
  const [messages, setMessages] = useState([])

  useEffect(() => {
    let alive = true
    if (!salonId) return undefined

    setLoading((p) => ({ ...p, threads: true }))
    setError('')

    Promise.all([
      api.getSalon(salonId).catch(() => null),
      api.listThreads(salonId).catch(() => ({ items: [] })),
    ])
      .then(([salonRes, threadsRes]) => {
        if (!alive) return
        setSalon(salonRes?.item || salonRes || null)
        const list = Array.isArray(threadsRes?.items) ? threadsRes.items : []
        setThreads(list)
        if (!activeThreadId && list.length) setActiveThreadId(list[0].id)
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
      })
      .finally(() => {
        if (!alive) return
        setLoading((p) => ({ ...p, threads: false }))
      })

    return () => {
      alive = false
    }
  }, [activeThreadId, salonId])

  const activeThread = useMemo(() => {
    if (!threads.length) return null
    const found = threads.find((t) => t.id === activeThreadId)
    return found || threads[0]
  }, [activeThreadId, threads])

  useEffect(() => {
    let alive = true
    if (!activeThread?.id) {
      setMessages([])
      return undefined
    }

    setLoading((p) => ({ ...p, messages: true }))
    setError('')

    api
      .listMessages(activeThread.id)
      .then((res) => {
        if (!alive) return
        setMessages(Array.isArray(res?.items) ? res.items : [])
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || t('portal.common.error', 'Error'))
      })
      .finally(() => {
        if (!alive) return
        setLoading((p) => ({ ...p, messages: false }))
      })

    return () => {
      alive = false
    }
  }, [activeThread?.id])

  async function send() {
    const clean = String(text || '').trim()
    if (!clean || !activeThread) return

    setError('')

    try {
      await api.sendMessage(activeThread.id, {
        fromRole: 'salon',
        fromName: salon?.name || auth.user?.name || 'Salon',
        text: clean,
      })

      setText('')

      const [threadsRes, msgsRes] = await Promise.all([
        api.listThreads(salonId).catch(() => ({ items: [] })),
        api.listMessages(activeThread.id).catch(() => ({ items: [] })),
      ])
      setThreads(Array.isArray(threadsRes?.items) ? threadsRes.items : [])
      setMessages(Array.isArray(msgsRes?.items) ? msgsRes.items : [])
    } catch (e) {
      setError(e?.message || t('portal.common.error', 'Error'))
    }
  }

  if (!salonId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900 }}>{t('portal.common.noSalon', 'No salon assigned')}</div>
        <div className="muted" style={{ marginTop: 8 }}>
          {t('portal.common.noSalonHint', "This account doesn't have a salonId.")}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="sectionHeader" style={{ marginBottom: 14 }}>
        <h2>{t('portal.ownerMessages.title', 'Messages')}</h2>
        <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={16} />
          {t('portal.ownerMessages.subtitle', 'Reply to customer chats (SQL Server)')}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12, border: '1px solid rgba(255,59,122,0.35)' }}>
          <div style={{ fontWeight: 900, color: 'rgba(255,150,170,1)' }}>{t('portal.common.error', 'Error')}</div>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="grid twoCol" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontWeight: 900, marginBottom: 10 }}>
            <MessageCircle size={16} /> {t('portal.ownerMessages.inbox', 'Inbox')}
          </div>

          {salon ? (
            <div className="card" style={{ padding: 12, boxShadow: 'none', marginBottom: 12 }}>
              <div style={{ fontWeight: 900 }}>{salon.name}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{salon.address}</div>
            </div>
          ) : null}

          {!threads.length ? (
            <div className="muted">{t('portal.ownerMessages.noThreads', 'No message threads yet. A customer can start one from Consumer → Messages.')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {threads.map((t) => {
                const active = activeThread?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={active ? 'chip chipActive' : 'chip'}
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => setActiveThreadId(t.id)}
                  >
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <User size={14} />
                      {t.customerName || t.customerEmail || t('portal.ownerMessages.customer', 'Customer')}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>{formatTime(t.lastMessageAt || t.createdAt)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 520 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{t('portal.ownerMessages.conversation', 'Conversation')}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {activeThread
                ? `${t('portal.ownerMessages.customer', 'Customer')}: ${activeThread.customerName || activeThread.customerEmail || t('portal.common.none', '—')}`
                : t('portal.common.none', '—')}
            </div>
          </div>

          <div className="chatLog" style={{ marginTop: 12, flex: 1 }}>
            {messages.length ? (
              messages.map((m) => {
                const mine = m.fromRole !== 'customer'
                return (
                  <div key={m.id} className={mine ? 'chatRow chatMine' : 'chatRow'}>
                    <div className={mine ? 'chatBubble chatBubbleMine' : 'chatBubble'}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{m.fromName}</div>
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{formatTime(m.createdAt)}</div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="muted">{loading.messages ? t('portal.common.loading', 'Loading…') : t('portal.ownerMessages.inputSelect', 'Select a thread…')}</div>
            )}
          </div>

          <div className="chatComposer" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder={activeThread ? t('portal.ownerMessages.inputPlaceholder', 'Type a reply…') : t('portal.ownerMessages.inputSelect', 'Select a thread…')}
              value={text}
              disabled={!activeThread}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void send()}
              disabled={!activeThread || !String(text || '').trim()}
            >
              <SendHorizonal size={16} style={{ marginRight: 8 }} />
              {t('portal.ownerMessages.send', 'Send')}
            </button>
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {t('portal.ownerMessages.replyingAs', 'Replying as')}: <strong style={{ color: 'rgba(255,255,255,0.9)' }}>{salon?.name || t('portal.ownerSalon.title', 'Salon')}</strong>
          </div>
        </div>
      </div>
    </>
  )
}

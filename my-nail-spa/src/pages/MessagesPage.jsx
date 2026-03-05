import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, SendHorizonal, MessageSquare } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext.jsx'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../lib/api'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MessagesPage() {
  const auth = useAuth()
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()

  const [salons, setSalons] = useState([])
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  const [salonId, setSalonId] = useState(params.get('salon') || '')
  const [text, setText] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .listSalons()
      .then((r) => {
        if (!alive) return
        const items = Array.isArray(r?.items) ? r.items : []
        setSalons(items)
        const desired = params.get('salon') || ''
        const nextSalonId = desired || items[0]?.id || ''
        setSalonId(nextSalonId)
      })
      .catch(() => {
        if (!alive) return
        setSalons([])
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!salonId) {
      setThread(null)
      setMessages([])
      return
    }

    let alive = true
    api
      .getOrCreateThread({
        salonId,
        customerId: auth.user?.id || null,
        customerName: auth.user?.name || t('site.messages.customer', 'Customer'),
        customerEmail: auth.user?.email || undefined,
      })
      .then((r) => {
        if (!alive) return
        const t = r?.item || null
        setThread(t)
        if (!t?.id) {
          setMessages([])
          return
        }
        return api.listMessages(t.id)
      })
      .then((r) => {
        if (!alive) return
        if (!r) return
        setMessages(Array.isArray(r?.items) ? r.items : [])
      })
      .catch(() => {
        if (!alive) return
        setThread(null)
        setMessages([])
      })

    return () => {
      alive = false
    }
  }, [auth.user?.email, auth.user?.id, auth.user?.name, salonId])

  useEffect(() => {
    if (!salonId) return
    const next = new URLSearchParams(params)
    next.set('salon', salonId)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId])

  async function send() {
    const clean = String(text || '').trim()
    if (!clean || !thread) return

    try {
      const created = await api.sendMessage(thread.id, {
        fromRole: 'customer',
        fromName: auth.user?.name || 'Customer',
        text: clean,
      })

      const msg = created?.item
      if (msg) setMessages((prev) => [...prev, msg])
      setText('')
    } catch (err) {
      alert(err?.message || t('site.messages.errorSend', 'Failed to send message'))
    }
  }

  const salon = useMemo(() => salons.find((s) => s.id === salonId) || null, [salonId, salons])

  return (
    <section className="section">
      <div className="container">
        <div className="sectionHeader">
          <h2>{t('site.messages.title', 'Messages')}</h2>
          <div className="muted" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <MessageSquare size={16} />
            {t('site.messages.subtitle', 'Chat with a salon')}
          </div>
        </div>

        <div className="grid twoCol" style={{ gap: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <MessageCircle size={16} /> {t('site.messages.chooseSalon', 'Choose salon')}
            </div>

            <select className="input" value={salonId} onChange={(e) => setSalonId(e.target.value)} disabled={loading || !salons.length}>
              {salons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {salon ? (
              <div className="card" style={{ padding: 12, boxShadow: 'none', marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>{salon.name}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{salon.address}</div>
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 900 }}>{t('site.messages.conversation', 'Conversation')}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                  {thread ? t('site.messages.threadLabel', 'Thread: {{id}}').replace('{{id}}', thread.id.slice(0, 8)) : t('site.common.none', '—')}
              </div>
            </div>

            <div className="chatLog" style={{ marginTop: 12, flex: 1 }}>
              {messages.length ? (
                messages.map((m) => {
                  const mine = m.fromRole === 'customer'
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
                  <div className="muted">{t('site.messages.empty', 'Say hi to start the chat.')}</div>
              )}
            </div>

            <div className="chatComposer" style={{ marginTop: 12 }}>
              <input
                className="input"
                  placeholder={t('site.messages.placeholder', 'Type a message...')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button className="btn btn-primary" type="button" onClick={send} disabled={!String(text || '').trim()}>
                <SendHorizonal size={16} style={{ marginRight: 8 }} />
                  {t('site.messages.send', 'Send')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

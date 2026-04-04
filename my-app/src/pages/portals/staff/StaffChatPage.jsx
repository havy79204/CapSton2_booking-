import React from 'react'
import { io } from 'socket.io-client'
import { api } from '../../../lib/api.js'
import { getToken } from '../../../lib/auth.js'
import '../../../styles/chat.css'

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
const SOCKET_BASE = String(RAW_BASE || '').replace(/\/+$/, '')

function normalizeThreadTitle(threadId, fallbackName) {
  if (fallbackName) return fallbackName
  const safeId = String(threadId || '').replace(/^customer-/, '').trim()
  if (!safeId) return 'Customer'
  return `Customer ${safeId.slice(0, 6)}`
}

function isNearBottom(element) {
  if (!element) return true
  const delta = element.scrollHeight - element.scrollTop - element.clientHeight
  return delta <= 64
}

function mergeMessageList(prev, incoming) {
  if (!incoming?.id) return prev
  const exists = prev.some((item) => item.id === incoming.id)
  if (exists) return prev
  return [...prev, incoming]
}

function sortMessages(items) {
  const list = Array.isArray(items) ? items.slice() : []
  list.sort((a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime()
    const tb = new Date(b?.createdAt || 0).getTime()
    if (ta !== tb) return ta - tb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
  return list
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initials(name) {
  const safe = String(name || '').trim()
  return safe ? safe[0].toUpperCase() : '?'
}

export default function StaffChatPage() {
  const [threads, setThreads] = React.useState([])
  const [activeThreadId, setActiveThreadId] = React.useState('')
  const [messages, setMessages] = React.useState([])
  const [search, setSearch] = React.useState('')
  const [input, setInput] = React.useState('')
  const [loadingThreads, setLoadingThreads] = React.useState(true)
  const [loadingMessages, setLoadingMessages] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState('')
  const [unreadByThread, setUnreadByThread] = React.useState({})
  const [showScrollToLatest, setShowScrollToLatest] = React.useState(false)
  const [CNewInActive, setCNewInActive] = React.useState(0)
  const [firstNewMessageId, setFirstNewMessageId] = React.useState('')
  const messageEndRef = React.useRef(null)
  const messagesWrapRef = React.useRef(null)
  const activeThreadIdRef = React.useRef('')
  const audioContextRef = React.useRef(null)
  const lastSoundAtRef = React.useRef(0)

  React.useEffect(() => {
    activeThreadIdRef.current = activeThreadId
  }, [activeThreadId])

  const filteredThreads = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return threads
    return threads.filter((item) => {
      const hay = `${item.title || ''} ${item.subtitle || ''} ${item.lastMessage || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [search, threads])

  const activeThread = React.useMemo(
    () => threads.find((item) => item.id === activeThreadId) || null,
    [threads, activeThreadId],
  )

  const canPlaySound = typeof window !== 'undefined'

  const playIncomingSound = React.useCallback(() => {
    if (!canPlaySound) return
    const now = Date.now()
    if (now - lastSoundAtRef.current < 550) return
    lastSoundAtRef.current = now

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      if (!audioContextRef.current) {
        audioContextRef.current = new Ctx()
      }

      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.17)
    } catch {
      // Silent fallback
    }
  }, [canPlaySound])

  const loadThreads = React.useCallback(async (silent = false) => {
    try {
      if (!silent) setLoadingThreads(true)
      setError('')
      const data = await api.get('/api/staff/chat/threads')
      const list = Array.isArray(data) ? data : []
      setThreads(list)
      setActiveThreadId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev
        return list[0]?.id || ''
      })
    } catch (err) {
      setError(err?.message || 'Unable to load conversation list')
    } finally {
      if (!silent) setLoadingThreads(false)
    }
  }, [])

  const loadMessages = React.useCallback(async (threadId, silent = false) => {
    if (!threadId) {
      setMessages([])
      return
    }

    try {
      if (!silent) setLoadingMessages(true)
      setError('')
      const data = await api.get(`/api/staff/chat/threads/${encodeURIComponent(threadId)}/messages`)
      const normalized = sortMessages(Array.isArray(data) ? data : [])
      setMessages(normalized)
    } catch (err) {
      setError(err?.message || 'Unable to load messages')
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }, [])

  React.useEffect(() => {
    loadThreads()
  }, [loadThreads])

  React.useEffect(() => {
    loadMessages(activeThreadId)
  }, [activeThreadId, loadMessages])

  React.useEffect(() => {
    if (!activeThreadId) return
    setUnreadByThread((prev) => {
      if (!prev[activeThreadId]) return prev
      const next = { ...prev }
      delete next[activeThreadId]
      return next
    })
    setCNewInActive(0)
    setShowScrollToLatest(false)
    setFirstNewMessageId('')
  }, [activeThreadId])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      loadThreads(true)
    }, 30000)

    return () => window.clearInterval(timer)
  }, [loadThreads])

  React.useEffect(() => {
    const token = getToken()
    if (!token) return

    const socket = io(SOCKET_BASE, {
      auth: { token },
      transports: ['polling', 'websocket'],
    })

    function onCatMessage(payload) {
      if (payload?.scope !== 'staff') return
      const threadId = String(payload?.threadId || '').trim()
      const message = payload?.message || null
      if (!threadId || !message || !message.id) return

      const safeText = String(message.text || '')
      const safeCreatedAt = message.createdAt || new Date().toISOString()

      setThreads((prev) => {
        const index = prev.findIndex((item) => item.id === threadId)
        if (index < 0) {
          const created = {
            id: threadId,
            kind: 'customer',
            customerUserId: threadId.replace(/^customer-/, ''),
            conversationId: payload?.conversationId || '',
            title: normalizeThreadTitle(threadId, message.senderName),
            subtitle: '',
            lastMessage: safeText,
            lastMessageAt: safeCreatedAt,
          }
          return [created, ...prev]
        }

        const current = prev[index]
        const updated = {
          ...current,
          lastMessage: safeText,
          lastMessageAt: safeCreatedAt,
        }
        const next = prev.slice()
        next.splice(index, 1)
        next.unshift(updated)
        return next
      })

      const activeNow = activeThreadIdRef.current
      if (activeNow === threadId) {
        const stickToBottom = isNearBottom(messagesWrapRef.current)
        setMessages((prev) => sortMessages(mergeMessageList(prev, message)))
        if (stickToBottom) {
          window.requestAnimationFrame(() => {
            messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
          })
          setCNewInActive(0)
          setShowScrollToLatest(false)
          setFirstNewMessageId('')
        } else if (message.from === 'customer') {
          if (!firstNewMessageId) {
            setFirstNewMessageId(String(message.id || ''))
          }
          setCNewInActive((prev) => prev + 1)
          setShowScrollToLatest(true)
        }
      } else if (message.from === 'customer') {
        setUnreadByThread((prev) => ({
          ...prev,
          [threadId]: Number(prev[threadId] || 0) + 1,
        }))
      }

      if (message.from === 'customer') {
        playIncomingSound()
      }
    }

    socket.on('chat:message', onCatMessage)
    return () => {
      socket.off('chat:message', onCatMessage)
      socket.disconnect()
    }
  }, [firstNewMessageId, playIncomingSound])

  React.useEffect(() => {
    window.requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
  }, [activeThreadId])

  function handleMessagesScroll() {
    const nearBottom = isNearBottom(messagesWrapRef.current)
    if (nearBottom) {
      setShowScrollToLatest(false)
      setCNewInActive(0)
      return
    }
    if (CNewInActive > 0) {
      setShowScrollToLatest(true)
    }
  }

  function jumpToLatest() {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setCNewInActive(0)
    setShowScrollToLatest(false)
    setFirstNewMessageId('')
  }

  async function handleSend(event) {
    event.preventDefault()
    if (!activeThreadId || sending) return

    const text = input.trim()
    if (!text) return

    try {
      setSending(true)
      setError('')
      const data = await api.post(`/api/staff/chat/threads/${encodeURIComponent(activeThreadId)}/messages`, { text })
      if (data && typeof data === 'object') {
        setMessages((prev) => sortMessages(mergeMessageList(prev, data)))
      }
      setInput('')
      loadThreads(true)
      window.requestAnimationFrame(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      })
    } catch (err) {
      setError(err?.message || 'Unable to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="owner-chat">
      <div className="owner-chatLayout">
        <aside className="owner-chatSidebar">
          <div className="owner-chatSidebarTop">
            <input
              className="owner-chatSearch"
              placeholder="Search customers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="button" className="owner-chatRefreshBtn" onClick={() => loadThreads()}>
              Reload
            </button>
          </div>
          <div className="owner-chatThreadList">
            {loadingThreads ? <div className="owner-chatHint">Loading conversations...</div> : null}
            {!loadingThreads && !filteredThreads.length ? (
              <div className="owner-chatHint">No matching conversations.</div>
            ) : null}

            {filteredThreads.map((thread, idx) => (
              <button
                key={`${thread.id}-${idx}`}
                type="button"
                className={`owner-chatThread ${thread.id === activeThreadId ? 'active' : ''}`}
                onClick={() => setActiveThreadId(thread.id)}
              >
                <span className="owner-chatThreadAvatar">{initials(thread.title)}</span>
                <span className="owner-chatThreadBody">
                  <span className="owner-chatThreadTitle">{thread.title || 'Customer'}</span>
                  <span className="owner-chatThreadPreview">{thread.lastMessage || 'Start conversation'}</span>
                </span>
                <span className="owner-chatThreadTime">{formatTime(thread.lastMessageAt)}</span>
                {Number(unreadByThread[thread.id] || 0) > 0 ? (
                  <span className="owner-chatUnreadBadge">{unreadByThread[thread.id]}</span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <main className="owner-chatMain">
          <header className="owner-chatHeader">
            <div className="owner-chatUser">
              <span className="owner-chatUserAvatar">{initials(activeThread?.title)}</span>
              <div>
                <div className="owner-chatUserName">{activeThread?.title || 'Select conversation'}</div>
              </div>
            </div>
          </header>

          <div className="owner-chatMessagesScroll" ref={messagesWrapRef} onScroll={handleMessagesScroll}>
            <div className="owner-chatMessages">
            {loadingMessages ? <div className="owner-chatHint">Loading messages...</div> : null}
            {!loadingMessages && !messages.length ? (
              <div className="owner-chatHint">No messages yet. Send a greeting to the customer.</div>
            ) : null}

            {messages.map((msg, idx) => (
              <React.Fragment key={`${msg.id}-${msg.createdAt || idx}`}>
                {firstNewMessageId && msg.id === firstNewMessageId ? (
                  <div className="owner-chatNewDivider">New messages</div>
                ) : null}
                <div className={`owner-chatBubble ${msg.from === 'staff' ? 'owner' : 'customer'}`}>
                  <div className="owner-chatBubbleText">{msg.text}</div>
                  <div className="owner-chatBubbleMeta">{formatTime(msg.createdAt)}</div>
                </div>
              </React.Fragment>
            ))}
            </div>

            {showScrollToLatest ? (
              <button type="button" className="owner-chatScrollLatestBtn" onClick={jumpToLatest}>
                ↓
                {CNewInActive > 0 ? <span>{CNewInActive}</span> : null}
              </button>
            ) : null}
            <div ref={messageEndRef} />
          </div>

          <form className="owner-chatComposer" onSubmit={handleSend}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={activeThread ? 'Type a message to the customer...' : 'Please select a conversation first'}
              disabled={!activeThread || sending}
            />
            <button type="submit" disabled={!activeThread || sending || !input.trim()}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </form>

          {error ? <p className="owner-chatError">{error}</p> : null}
        </main>

        <aside className="owner-chatInfo">
          <h3>Customer information</h3>
          <p><strong>Name:</strong> {activeThread?.title || '-'}</p>
          <p><strong>Email:</strong> {activeThread?.subtitle || '-'}</p>
          <p><strong>Customer ID:</strong> {activeThread?.customerUserId || '-'}</p>
          <p><strong>Updated:</strong> {formatDateTime(activeThread?.lastMessageAt) || '-'}</p>
        </aside>
      </div>
    </section>
  )
}

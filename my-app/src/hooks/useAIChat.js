import { useState, useEffect } from 'react'
import { api, showPortalToast } from '../lib/api'
import { getToken } from '../lib/auth'

export default function useAIChat() {
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState([])

  async function listSessions() {
    try {
      const data = await api.get('/api/customer/ai-chat/sessions')
      setSessions(Array.isArray(data) ? data : [])
      return data
    } catch (err) {
      console.error('listSessions error', err)
      setSessions([])
      return []
    }
  }

  async function createSession(title) {
    const token = getToken()
    if (!token) {
      const err = new Error('Authentication required')
      err.status = 401
      throw err
    }

    const payload = {}
    if (title && String(title).trim()) payload.title = String(title).trim()
    const s = await api.post('/api/customer/ai-chat/sessions', payload)
    const id = s?.SessionId || s?.sessionId || s
    setSessionId(id)
    listSessions().catch(() => {})
    return id
  }

  async function loadMessages(sid) {
    if (!sid) return
    setLoading(true)
    try {
      const data = await api.get(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}/messages`)
      setMessages(data || [])
    } finally {
      setLoading(false)
    }
  }

  async function deleteSession(sid) {
    if (!sid) return
    // Optimistically remove the session locally for immediate UI feedback
    const prev = sessions || []
    const filtered = prev.filter((s) => String(s?.SessionId || s?.sessionId || s?.id) !== String(sid))
    setSessions(filtered)
    // If deleted session was active, clear messages/UI immediately
    if (String(sid) === String(sessionId)) {
      if (filtered.length > 0) {
        const nextId = filtered[0]?.SessionId || filtered[0]?.sessionId || filtered[0]?.id
        setSessionId(nextId)
        // load messages for new active session
        try { await loadMessages(nextId) } catch (e) { void e }
      } else {
        setSessionId(null)
        setMessages([])
      }
    }

    try {
      console.log('deleteSession: sending DELETE for', sid)
      await api.delete(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}`)
      // ensure server-side list is synced
      const all = await listSessions()
      setSessions(Array.isArray(all) ? all : [])
      try { showPortalToast({ type: 'success', message: 'Đã xóa phiên trò chuyện' }) } catch (e) { void e }
      console.log('deleteSession: success', sid)
      return true
    } catch (err) {
      console.error('deleteSession api error', err)
      try { showPortalToast({ type: 'error', message: (err && err.message) || 'Không xóa được phiên', timeoutMs: 4000 }) } catch (e) { void e }
      try {
        if (typeof window !== 'undefined') {
          const msg = (err && err.message) || 'Không xóa được phiên'
          // fallback visible alert for debugging when portal toast is not shown
          window.alert(`Lỗi xóa session: ${msg}`)
        }
      } catch (e) { void e }
      // rollback local state to previous on failure
      try { setSessions(prev) } catch (e) { void e }
      // restore previous active session/messages if we cleared them
      if (String(sid) === String(sessionId)) {
        try {
          if (prev.length > 0) {
            const prevActive = prev[0]?.SessionId || prev[0]?.sessionId || prev[0]?.id
            setSessionId(prevActive)
            await loadMessages(prevActive)
          }
        } catch (e) { void e }
      }
      throw err
    }
  }

  async function selectSession(sid) {
    if (!sid) return
    setSessionId(sid)
    await loadMessages(sid)
  }

  async function sendMessage(text) {
    if (!text) return
    let sid = sessionId
    if (!sid) sid = await createSession()
    setMessages((m) => [...m, { temp: true, sender: 'user', content: text }])
    const res = await api.post(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}/messages`, { content: text })
    await loadMessages(sid)
    listSessions().catch(() => {})
    return res
  }

  async function sendImage(imageDataUrl, caption = '') {
    const images = (Array.isArray(imageDataUrl) ? imageDataUrl : [imageDataUrl])
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .slice(0, 3)
    if (!images.length) return
    let sid = sessionId
    if (!sid) sid = await createSession()

    // Optimistic user image messages for each selected image.
    setMessages((m) => [
      ...m,
      ...images.map((img, idx) => ({
        temp: true,
        sender: 'user',
        messageType: 'image',
        content: caption || (images.length > 1 ? `Ảnh móng tay ${idx + 1}` : 'Ảnh móng tay'),
        ImageUrl: img,
      })),
    ])

    const payload = images.length === 1
      ? { imageDataUrl: images[0], caption }
      : { imageDataUrls: images, caption }

    const res = await api.post(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}/messages/image`, payload)

    await loadMessages(sid)
    listSessions().catch(() => {})
    return res
  }

  useEffect(() => {
    if (!getToken()) return
    listSessions().catch(() => {})
  }, [])

  useEffect(() => {
    if (sessionId) loadMessages(sessionId)
  }, [sessionId])

  return { sessionId, sessions, messages, loading, createSession, loadMessages, selectSession, listSessions, sendMessage, sendImage, deleteSession }
}

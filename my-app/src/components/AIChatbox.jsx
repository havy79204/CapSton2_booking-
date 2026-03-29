import React, { useState, useEffect, useRef } from 'react'
import useAIChat from '../hooks/useAIChat'
import { useAuthMe } from '../hooks/useAuthMe'
import { api } from '../lib/api'
import { resolveApiImageUrl } from '../lib/api'
import { useCustomerCart } from '../hooks/useCustomerCommerce'
import '../styles/AIChatbox.css'

export default function AIChatbox() {
  const { sessionId, sessions, messages, loading, sendMessage, sendImage, selectSession, createSession, listSessions, deleteSession } = useAIChat()
  const { me, loading: authLoading } = useAuthMe()
  const { busy: cartBusy } = useCustomerCart()

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [pendingImages, setPendingImages] = useState([])
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [imageAnalyzing, setImageAnalyzing] = useState(false)

  const bottomRef = useRef(null)
  const bodyRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  const mode = sessionId ? 'chat' : 'welcome'

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return
    bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: 'smooth' })
  }, [messages])

    useEffect(() => {
      if (inputRef.current) inputRef.current.focus()
    }, [])

    useEffect(() => {
      if (sessionId) {
        setTimeout(() => inputRef.current?.focus?.(), 80)
        setCollapsed(false)
      }
    }, [sessionId])

    // cleanup object URLs on unmount or when pendingImages changes
    useEffect(() => {
      return () => {
        try { (pendingImages || []).forEach((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl) }) } catch (e) { void e }
      }
    }, [pendingImages])

  async function sendText(content) {
    if (!content || !content.trim()) return
    try {
      setSending(true)
      if (!sessionId) {
        if (!me) {
            if (authLoading) {
                try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'info', message: 'Đang kiểm tra đăng nhập...', timeoutMs: 2000 } })) } catch (e) { void e; }
            return
          }
              try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: 'Vui lòng đăng nhập để sử dụng chat', timeoutMs: 4000 } })) } catch (e) { void e; }
          window.location.href = '/login'
          return
        }
        await new Promise((r) => setTimeout(r, 80))
      }
      await sendMessage(content.trim())
      setTimeout(() => inputRef.current?.focus?.(), 60)
      } catch (err) {
      console.error('sendText error', err)
      try {
        const msg = (err && err.message) || String(err)
        window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: msg, timeoutMs: 5000 } }))
        } catch (e) {
          void e;
        }
        if (err && err.status === 401) {
          try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'info', message: 'Vui lòng đăng nhập lại', timeoutMs: 2500 } })) } catch (e) { void e }
          window.location.href = '/login'
        }
    } finally {
      setSending(false)
      setImageAnalyzing(false)
    }
  }

  async function handleSend(e) {
    e?.preventDefault()
    if (sending || loading) return
    const t = text.trim()
    if (!t && pendingImages.length === 0) return

    try {
      setSending(true)
      if (pendingImages.length > 0) {
        setImageAnalyzing(true)
        if (!sessionId) {
          if (!me) {
            if (authLoading) {
                try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'info', message: 'Đang kiểm tra đăng nhập...', timeoutMs: 2000 } })) } catch (e) { void e; }
              return
            }
              try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: 'Vui lòng đăng nhập để sử dụng chat', timeoutMs: 4000 } })) } catch (e) { void e; }
            window.location.href = '/login'
            return
          }
          // create session without requiring a name
          await new Promise((r) => setTimeout(r, 80))
        }
        const firstName = pendingImages[0]?.name || 'Ảnh móng'
        const caption = t || (pendingImages.length > 1 ? `Ảnh móng (${pendingImages.length} ảnh), ảnh đầu: ${firstName}` : `Ảnh móng: ${firstName}`)

        // Convert files to data URLs only at send time to reduce selection latency
        const dataUrls = await Promise.all(pendingImages.map(async (p) => {
          if (p.dataUrl) return p.dataUrl
          if (p.file) return await fileToDataUrl(p.file)
          return ''
        }))

        await sendImage(dataUrls, caption)

        try { pendingImages.forEach((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl) }) } catch (e) { void e }
        setPendingImages([])
      } else {
        await sendText(t)
      }
      setText('')
    } catch (err) {
      console.error('handleSend error', err)
      const msg = (err && err.message) || 'Không thể gửi tin nhắn. Vui lòng thử lại.'
      try {
        window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: msg, timeoutMs: 4000 } }))
      } catch (e) {
        void e;
      }
      if (err && err.status === 401) {
        try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'info', message: 'Vui lòng đăng nhập lại', timeoutMs: 2500 } })) } catch (e) { void e }
        window.location.href = '/login'
      }
    } finally {
      setSending(false)
      setImageAnalyzing(false)
      setTimeout(() => inputRef.current?.focus?.(), 60)
    }
  }

  function handlePickImage() {
    if (sending || loading || cartBusy || pendingImages.length >= 3) return
    fileInputRef.current?.click?.()
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = (e) => reject(e)
      reader.readAsDataURL(file)
    })
  }

  async function handleImageChange(e) {
    const incoming = Array.from(e?.target?.files || []).slice(0, 3)
    if (!incoming.length) return
    try {
      const availableSlots = Math.max(0, 3 - pendingImages.length)
      const selected = incoming.slice(0, availableSlots)
      if (!selected.length) return

      // Keep File objects and create object URL previews.
      const next = selected.map((f) => ({
        file: f,
        previewUrl: URL.createObjectURL(f),
        name: f.name || 'image',
      }))

      setPendingImages((prev) => [...prev, ...next].slice(0, 3))
    } catch (err) {
      console.error('sendImage error', err)
      const msg = (err && err.message) || 'Không gửi được ảnh. Vui lòng thử lại.'
      try {
        window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: msg, timeoutMs: 5000 } }))
      } catch (e) {
        void e;
      }
    } finally {
      if (e?.target) e.target.value = ''
      setTimeout(() => inputRef.current?.focus?.(), 60)
    }
  }

  function removePendingImage(index) {
    setPendingImages((prev) => {
      const item = prev[index]
      try { if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl) } catch (e) { void e }
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearPendingImages() {
    try {
      (pendingImages || []).forEach((p) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl) })
    } catch (e) { void e }
    setPendingImages([])
  }

  // Chatbox no longer performs orders; only suggests products/services.

  function parseAnalysisPayload(rawContent) {
    try {
      const obj = JSON.parse(String(rawContent || ''))
      if (obj && obj.type === 'image-analysis') return obj
    } catch (e) {
      void e;
    }
    return null
  }

  function extractImageFromText(raw) {
    if (!raw) return { url: '', text: String(raw || '') }
    const s = String(raw)
    // find first https or /uploads or data:image occurrence
    const imgRegex = /(https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|svg))|(\/uploads\/\S+?\.(?:png|jpe?g|gif|webp|svg))|(data:image\/[a-zA-Z]+;base64,([^\s`'"]+))/i
    const m = imgRegex.exec(s)
    if (!m) return { url: '', text: s.replace(/^[`'"]+|[`'"]+$/g, '').trim() }
    const found = m[0].replace(/^[`'"]+|[`'"]+$/g, '')
    const before = s.slice(0, m.index)
    const after = s.slice(m.index + m[0].length)
    const remaining = (before + ' ' + after).replace(/^[`'"]+|[`'"]+$/g, '').trim()
    return { url: resolveApiImageUrl(found), text: remaining }
  }

  function handleSelect(sid) {
    selectSession(sid)
    setCollapsed(true)
  }

  async function handleRenameSession(sid) {
    try {
      const label = sessions?.find((s) => String(s?.SessionId || s?.sessionId || s?.id) === String(sid))?.title || ''
      const newTitle = window.prompt('update name Session', label || '')
      if (!newTitle || !String(newTitle).trim()) return
      await api.put(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}`, { title: String(newTitle).trim() })
      // refresh sessions list
      await (typeof listSessions === 'function' ? listSessions() : Promise.resolve())
      setMenuOpenId(null)
    } catch (err) {
      const msg = (err && err.message) || 'Dont update session name'
      window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: msg, timeoutMs: 4000 } }))
    }
  }

  async function handleDeleteSession(sid) {
    try {
      const ok = window.confirm('Do you want to delete this chat session? The action will delete the related messages.')
      if (!ok) return
      if (typeof deleteSession === 'function') {
        await deleteSession(sid)
      } else {
        await api.delete(`/api/customer/ai-chat/sessions/${encodeURIComponent(sid)}`)
        await (typeof listSessions === 'function' ? listSessions() : Promise.resolve())
        setCollapsed(true)
      }
      setMenuOpenId(null)
    } catch (err) {
      const msg = (err && err.message) || 'Dont delete session'
      try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: msg, timeoutMs: 4000 } })) } catch (e) { void e }
      try { if (typeof window !== 'undefined') window.alert(`Lỗi khi xóa session: ${msg}`) } catch (e) { void e }
    }
  }

  async function handleNewChat() {
    try {
      // Require login before creating a session
      if (!me) {
    if (authLoading) {
      try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'info', message: 'Đang kiểm tra đăng nhập...', timeoutMs: 2000 } })) } catch (e) { void e; }
      return
    }
    try { window.dispatchEvent(new CustomEvent('portal:toast', { detail: { type: 'error', message: 'Vui lòng đăng nhập để tạo chat mới', timeoutMs: 4000 } })) } catch (e) { void e; }
        window.location.href = '/login'
        return
      }
      // If current session exists but has no messages, delete it first
      try {
        if (sessionId && Array.isArray(messages) && messages.length === 0) {
          if (typeof deleteSession === 'function') {
            await deleteSession(sessionId)
          } else {
            try { await api.delete(`/api/customer/ai-chat/sessions/${encodeURIComponent(sessionId)}`) } catch (e) { void e }
          }
        }
      } catch (err) {
        console.error('auto-delete empty session error', err)
      }

      // Create a new session; name is optional and can be edited later
      try {
        if (typeof createSession === 'function') {
          await createSession()
        }
      } catch (err) {
        console.error('createSession error', err)
      }
      setText('')
      setCollapsed(false)
      setTimeout(() => inputRef.current?.focus?.(), 120)
    } catch (err) {
      console.error('createSession error', err)
    }
  }

  return (
    <div className={`gemini-container ${collapsed ? 'side-collapsed' : 'side-open'}`}>
      <aside className={`gemini-side ${collapsed ? 'collapsed' : ''}`}>
        <div className="side-inner">
          <div className="panel-header">
            <button className="menu-icon" onClick={() => setCollapsed((s) => !s)} aria-label="Menu">☰</button>
          </div>

          <div className={`new-chat ${collapsed ? 'icon-only' : ''}`}>
            <button className="new-chat-btn" onClick={handleNewChat} aria-label="New chat">
              <span className="icon">✎</span>
              <span className="label">New Chat Session</span>
            </button>
          </div>

          <div className="sessions-list">
            {Array.isArray(sessions) && sessions.length > 0 ? (
              sessions.map((s, i) => {
                const id = s?.SessionId || s?.sessionId || s?.id || `${i}`
                const label = s?.title || s?.name || `Session ${i + 1}`
                const active = String(id) === String(sessionId)
                return (
                  <div key={id} className={`session-item ${active ? 'active' : ''}`}>
                    <button className="session-main" onClick={() => handleSelect(id)}>
                      <div className="session-avatar">{(label || '').slice(0,1)}</div>
                      <div className="session-label">{label}</div>
                    </button>
                    <div className="session-actions">
                      <button className="session-menu-btn" onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === id ? null : id) }} aria-label="Session actions">⋯</button>
                      {menuOpenId === id && (
                        <div className="session-menu">
                          <button type="button" onClick={() => handleRenameSession(id)}>Đổi tên</button>
                          <button type="button" onClick={() => handleDeleteSession(id)}>Xóa</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="no-sessions">No chat sessions available</div>
            )}
          </div>
        </div>
      </aside>

      <div className="gemini-card">
        <main ref={bodyRef} className={`gemini-body ${mode === 'welcome' ? 'center' : ''}`}>
          <div className="chat-list">
            {Array.isArray(messages) && messages.map((m, i) => {
              const isAI = (m.sender === 'ai' || m.Sender === 'ai')
              const rawContent = m.content ?? m.Content ?? ''
              const imageUrl = resolveApiImageUrl(m.ImageUrl || m.imageUrl || '')
              const payload = isAI ? parseAnalysisPayload(rawContent) : null
              const extracted = extractImageFromText(rawContent)
              const messageImageUrl = imageUrl || extracted.url || ''
              return (
                <div key={m.MessageId || m.id || i} className={`msg ${isAI ? 'ai' : 'user'}`}>
                  {payload ? (
                    <div className="analysis-block">
                      <div className="analysis-text">{payload.text || 'Phân tích ảnh hoàn tất.'}</div>
                      {Array.isArray(payload?.analysis?.advice) && payload.analysis.advice.length > 0 && (
                        <ul className="analysis-advice">
                          {payload.analysis.advice.map((a, idx) => <li key={idx}>{a}</li>)}
                        </ul>
                      )}
                      {Array.isArray(payload?.suggestedServices) && payload.suggestedServices.length > 0 && (
                        <div className="analysis-suggest-group">
                          <div className="analysis-title">Dịch vụ gợi ý</div>
                          <div className="analysis-chips">
                            {payload.suggestedServices.map((s) => (
                              <span key={s.ServiceId || s.Name} className="analysis-chip suggestion">
                                {s.Name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(payload?.suggestedProducts) && payload.suggestedProducts.length > 0 && (
                        <div className="analysis-suggest-group">
                          <div className="analysis-title">Sản phẩm gợi ý</div>
                          <div className="analysis-products">
                            {payload.suggestedProducts.map((p) => (
                              <div className="analysis-product" key={p.ProductId || p.Name}>
                                <div className="analysis-product-name">{p.Name}</div>
                                <div className="analysis-product-actions">
                                  <a href={`/product/${p.ProductId || ''}`}>Xem chi tiết</a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {messageImageUrl ? <img src={messageImageUrl} alt="Nail upload" className="msg-image" /> : null}
                      {(!messageImageUrl && rawContent) || (messageImageUrl && extracted.text) ? <div>{messageImageUrl ? extracted.text : rawContent}</div> : null}
                    </>
                  )}
                </div>
              )
            })}

            {imageAnalyzing && <div className="msg ai">Đang phân tích ảnh...</div>}
            {!imageAnalyzing && loading && <div className="msg ai">Đang xử lý...</div>}

            <div ref={bottomRef} />
          </div>
        </main>

        <form className={`gemini-input ${mode === 'welcome' ? 'center' : ''}`} onSubmit={handleSend} aria-busy={sending || loading}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            multiple
            onChange={handleImageChange}
            style={{ display: 'none' }}
          />
          <div className="input-shell">
            <button type="button" className="upload-inside-btn" onClick={handlePickImage} disabled={sending || loading || cartBusy || pendingImages.length >= 3} aria-label="Add image" title={pendingImages.length >= 3 ? 'Đã chọn tối đa 3 ảnh' : 'Thêm ảnh'}>
              +
            </button>
            <input
              ref={inputRef}
              className="chat-text-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask NIOM&CE..."
              aria-label="Chat input"
              disabled={sending || loading || cartBusy}
            />
          </div>
          <button type="submit" disabled={sending || loading || cartBusy || (!text.trim() && pendingImages.length === 0)} aria-label="Send message">
            {(sending || loading) ? (
              <span className="btn-spinner" aria-hidden="true" />
            ) : (
              '➤'
            )}
          </button>
        </form>
        {pendingImages.length > 0 && (
          <div className="pending-image-row">
            <div className="pending-image-summary">Đã chọn {pendingImages.length}/3 ảnh</div>
            <div className="pending-image-list">
              {pendingImages.map((img, idx) => (
                <div className="pending-image-card" title={img.name || 'Ảnh đã chọn'} key={`${img.name || 'image'}-${idx}`}>
                  <img src={img.previewUrl || img.dataUrl} alt={img.name || `Selected image ${idx + 1}`} className="pending-image-large" />
                  <div className="pending-image-actions">
                    <button type="button" onClick={() => removePendingImage(idx)} aria-label="Remove selected image" title="Xóa ảnh">x</button>
                  </div>
                </div>
              ))}
              {pendingImages.length < 3 && (
                <button type="button" className="pending-add-card" onClick={handlePickImage} aria-label="Add more images" title="Thêm ảnh">
                  +
                </button>
              )}
            </div>
            <div className="pending-image-footer">
              <button type="button" onClick={clearPendingImages}>Xóa tất cả</button>
            </div>
              </div>
        )}
      </div>
    </div>
  )
}

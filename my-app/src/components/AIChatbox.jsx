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
  const [collapsed, setCollapsed] = useState(false)
  const [pendingImages, setPendingImages] = useState([])
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [imageAnalyzing, setImageAnalyzing] = useState(false)

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
      // Let useAIChat handle session creation automatically
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
        const firstName = pendingImages[0]?.name || 'Ảnh móng'
        const caption = t || (pendingImages.length > 1 ? `Ảnh móng (${pendingImages.length} ảnh), ảnh đầu: ${firstName}` : `Ảnh móng: ${firstName}`)

        // Convert files to data URLs only at send time to reduce selection latency
        const dataUrls = await Promise.all(pendingImages.map(async (p) => {
          if (p.dataUrl) return p.dataUrl
          if (p.file) return await fileToDataUrl(p.file)
          return ''
        }))

        // Let useAIChat handle session creation automatically
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
      const ok = window.confirm('Do you want to delete this chat session? The action will delete related messages.')
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
    <div className={`chat-container ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* SIDEBAR */}
      <aside className={`chat-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <span className="new-chat-icon">+</span>
            <span className="new-chat-text">New chat</span>
          </button>
        </div>

        <div className="sessions-list">
          {Array.isArray(sessions) && sessions.length > 0 ? (
            sessions.map((s, i) => {
              const id = s?.SessionId || s?.sessionId || s?.id || `${i}`;
              const label = s?.title || s?.name || `Chat ${i + 1}`;
              const isActive = String(id) === String(sessionId);

              return (
                <div key={id} className={`session-item ${isActive ? 'active' : ''}`}>
                  <button className="session-btn" onClick={() => handleSelect(id)}>
                    <span className="session-icon">💬</span>
                    <span className="session-title">{label}</span>
                  </button>
                  <button
                    className="session-menu-btn"
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === id ? null : id); }}
                  >
                    ⋯
                  </button>

                  {menuOpenId === id && (
                    <div className="session-dropdown">
                      <button onClick={() => handleRenameSession(id)}>Rename</button>
                      <button onClick={() => handleDeleteSession(id)}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="no-sessions">No previous chats</div>
          )}
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="chat-main">
        <button className="menu-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '☰' : '×'}
        </button>
        
        <div className={`chat-content ${mode === 'welcome' ? 'welcome-mode' : ''}`}>
          {mode === 'welcome' && (
            <div className="welcome-screen">
              <h1 className="welcome-title">Chào bạn!</h1>
              <p className="welcome-subtitle">Hôm nay tôi có thể giúp gì cho bạn?</p>
            </div>
          )}

          <div className="messages-container">
            {Array.isArray(messages) && messages.map((m, i) => {
              const isAI = (m.sender === 'ai' || m.Sender === 'ai');
              const rawContent = m.content ?? m.Content ?? '';
              const imageUrl = resolveApiImageUrl(m.ImageUrl || m.imageUrl || '');
              const payload = isAI ? parseAnalysisPayload(rawContent) : null;
              const extracted = extractImageFromText(rawContent);
              const messageImageUrl = imageUrl || extracted.url || '';

              return (
                <div key={m.MessageId || m.id || i} className={`message ${isAI ? 'ai' : 'user'}`}>
                  <div className="message-avatar">
                    {isAI ? <div className="ai-avatar">🤖</div> : <div className="user-avatar">👤</div>}
                  </div>
                  <div className="message-bubble">
                    {payload ? (
                      <div className="analysis-content">
                        <div className="analysis-text">{payload.text || 'Phân tích ảnh hoàn tất.'}</div>
                        {Array.isArray(payload?.analysis?.advice) && payload.analysis.advice.length > 0 && (
                          <div className="analysis-section">
                            <div className="analysis-label">Lời khuyên:</div>
                            <div className="analysis-list">
                              {payload.analysis.advice.map((a, idx) => <div key={idx} className="analysis-item">{a}</div>)}
                            </div>
                          </div>
                        )}
                        {Array.isArray(payload?.suggestedServices) && payload.suggestedServices.length > 0 && (
                          <div className="analysis-section">
                            <div className="analysis-label">Dịch vụ gợi ý:</div>
                            <div className="service-tags">
                              {payload.suggestedServices.map((s) => (
                                <span key={s.ServiceId || s.Name} className="service-tag">
                                  {s.Name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {Array.isArray(payload?.suggestedProducts) && payload.suggestedProducts.length > 0 && (
                          <div className="analysis-section">
                            <div className="analysis-label">Sản phẩm gợi ý:</div>
                            <div className="product-grid">
                              {payload.suggestedProducts.map((p) => (
                                <div key={p.ProductId || p.Name} className="product-card">
                                  <div className="product-name">{p.Name}</div>
                                  <div className="product-action">
                                    <a href={`/product/${p.ProductId || ''}`}>Xem chi tiết</a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {payload?._debug && (
                          <div className="debug-section">
                            <details>
                              <summary>Debug info</summary>
                              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{payload._debug}</pre>
                            </details>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {messageImageUrl && <img src={messageImageUrl} alt="Uploaded" className="message-image" />}
                        <div className="message-text">{messageImageUrl ? extracted.text : rawContent}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {imageAnalyzing && (
              <div className="message ai">
                <div className="message-avatar">
                  <div className="ai-avatar">🤖</div>
                </div>
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            
            {loading && (
              <div className="message ai">
                <div className="message-avatar">
                  <div className="ai-avatar">🤖</div>
                </div>
                <div className="message-bubble">
                  <div className="typing-text">Đang suy nghĩ...</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* INPUT AREA */}
        <div className="input-area">
          {pendingImages.length > 0 && (
            <div className="pending-images-container">
              <div className="pending-images-header">
                <span className="pending-count">Đã chọn {pendingImages.length}/3 ảnh</span>
                <button className="clear-all-btn" onClick={clearPendingImages}>Xóa tất cả</button>
              </div>
              <div className="pending-images-grid">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="pending-image-item">
                    <img src={img.previewUrl || img.dataUrl} alt={img.name || `Selected image ${idx + 1}`} className="pending-image" />
                    <button className="remove-image-btn" onClick={() => removePendingImage(idx)}>×</button>
                  </div>
                ))}
                {pendingImages.length < 3 && (
                  <button className="add-image-btn" onClick={handlePickImage}>
                    <span className="add-icon">+</span>
                    <span>Thêm ảnh</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <form className="input-form" onSubmit={handleSend}>
            <div className="input-container">
              <button type="button" className="attach-btn" onClick={handlePickImage} disabled={sending || loading || cartBusy}>
                <span className="attach-icon">📎</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />

              <input
                ref={inputRef}
                className="message-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập tin nhắn của bạn..."
                disabled={sending || loading || cartBusy}
              />

              <button type="submit" className="send-btn" disabled={sending || loading || cartBusy || (!text.trim() && pendingImages.length === 0)}>
                {sending || loading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <span className="send-icon">➤</span>
                )}
              </button>
            </div>
          </form>

          <div className="input-footer">
            AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
          </div>
        </div>
      </div>
    </div>
  )
}

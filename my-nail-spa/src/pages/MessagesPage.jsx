import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, SendHorizonal, Search, Smile, Paperclip, Image, MoreVertical } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api'
import '../styles/MessagesPage.css'

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MessagesPage() {
  const auth = useAuth()
  const [params, setParams] = useSearchParams()

  const [salons, setSalons] = useState([])
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  const [salonId, setSalonId] = useState(params.get('salon') || '')
  const [text, setText] = useState('')

  useEffect(() => {
    let alive = true
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
        customerName: auth.user?.name || 'Customer',
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
      alert(err?.message || 'Failed to send message')
    }
  }

  const salon = useMemo(() => salons.find((s) => s.id === salonId) || null, [salonId, salons])
  
  const filteredSalons = useMemo(() => {
    if (!searchQuery) return salons
    const query = searchQuery.toLowerCase()
    return salons.filter(s => s.name?.toLowerCase().includes(query))
  }, [salons, searchQuery])
  
  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="messagesPageContainer">
      <div className="messagesGrid">
        {/* Left Sidebar - Conversations */}
        <div className="messagesSidebar">
          <div className="messagesSidebarHeader">
            <h2>Message</h2>
            <div className="searchBox">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="conversationList">
            {filteredSalons.map((s) => (
              <div
                key={s.id}
                className={`conversationItem ${salonId === s.id ? 'active' : ''}`}
                onClick={() => setSalonId(s.id)}
              >
                <div className="conversationAvatar">
                  {s.logo ? (
                    <img src={s.logo} alt={s.name} />
                  ) : (
                    getInitials(s.name)
                  )}
                  <div className="onlineIndicator"></div>
                </div>
                <div className="conversationInfo">
                  <div className="conversationHeader">
                    <div className="conversationName">{s.name}</div>
                    <div className="conversationTime">19 : 10</div>
                  </div>
                  <div className="conversationPreview">
                    {messages.length > 0 
                      ? messages[messages.length - 1].text 
                      : 'Hello, How Can I Help You?'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Chat Area */}
        <div className="chatArea">
          {salon ? (
            <>
              {/* Chat Header */}
              <div className="chatHeader">
                <div className="chatHeaderLeft">
                  <div className="chatHeaderAvatar">
                    {salon.logo ? (
                      <img src={salon.logo} alt={salon.name} />
                    ) : (
                      getInitials(salon.name)
                    )}
                  </div>
                  <div className="chatHeaderInfo">
                    <h3>{salon.name}</h3>
                    <div className="status">Online...</div>
                  </div>
                </div>
                <div className="chatHeaderRight">
                  <button className="chatHeaderButton" title="More options">
                    <MoreVertical size={20} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="chatMessages">
                {messages.length === 0 ? (
                  <div className="emptyChat">
                    <MessageCircle size={64} />
                    <h3>No messages yet</h3>
                    <p>Say hi to start the conversation</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.fromRole === 'customer'
                    return (
                      <div key={m.id} className={`messageRow ${mine ? 'mine' : 'theirs'}`}>
                        {!mine && (
                          <div className="messageAvatar">
                            {salon.logo ? (
                              <img src={salon.logo} alt={salon.name} />
                            ) : (
                              getInitials(salon.name)
                            )}
                          </div>
                        )}
                        <div className="messageBubble">
                          <div className="messageContent">
                            <div className="messageText">{m.text}</div>
                            {mine && <div className="messageTime">{formatTime(m.createdAt)}</div>}
                          </div>
                          {!mine && <div className="messageTime">{formatTime(m.createdAt)}</div>}
                        </div>
                        {mine && (
                          <div className="messageBadge">
                            {getInitials(auth.user?.name || 'You')}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Chat Input */}
              <div className="chatInput">
                <div className="chatInputContainer">
                  <div className="chatInputLeft">
                    <button className="chatInputButton" title="Add emoji">
                      <Smile size={20} />
                    </button>
                  </div>
                  <input
                    className="chatInputField"
                    placeholder="Type A Message..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  />
                  <button className="chatInputButton" title="Attach file">
                    <Paperclip size={20} />
                  </button>
                  <button className="chatInputButton" title="Send image">
                    <Image size={20} />
                  </button>
                  <button 
                    className="chatSendButton" 
                    onClick={send} 
                    disabled={!String(text || '').trim()}
                    title="Send message"
                  >
                    <SendHorizonal size={20} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="emptyChat">
              <MessageCircle size={64} />
              <h3>Select a conversation</h3>
              <p>Choose a salon from the list to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

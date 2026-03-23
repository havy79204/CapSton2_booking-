import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { IoChatbubbleEllipsesOutline, IoClose, IoSend } from 'react-icons/io5';
import { api } from '../lib/api';
import { getToken } from '../lib/auth';
import '../styles/ChatWidget.css';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const SOCKET_BASE = String(RAW_BASE || '').replace(/\/+$/, '');

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function isNearBottom(element) {
  if (!element) return true;
  const delta = element.scrollHeight - element.scrollTop - element.clientHeight;
  return delta <= 64;
}

function mergeMessageList(prev, incoming) {
  if (!incoming?.id) return prev;
  if (prev.some((item) => item.id === incoming.id)) return prev;
  return [...prev, incoming];
}

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showScrollLatest, setShowScrollLatest] = useState(false);
  const [newIncomingCount, setNewIncomingCount] = useState(0);
  const [firstNewMessageId, setFirstNewMessageId] = useState('');
  const messageListRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const isOpenRef = useRef(false);

  const token = useMemo(() => getToken(), []);
  const canCat = Boolean(token);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const loadMessages = useCallback(async (silent = false) => {
    if (!canCat) {
      setMessages([]);
      return;
    }

    try {
      if (!silent) setLoading(true);
      setError('');
      const data = await api.get('/api/customer/chat/messages');
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Unable to load messages');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canCat]);

  useEffect(() => {
    if (!canCat) return;
    const socket = io(SOCKET_BASE, {
      auth: { token },
      transports: ['polling', 'websocket'],
    });

    function onMessage(payload) {
      if (payload?.scope !== 'customer') return;
      const message = payload?.message;
      if (!message?.id) return;

      if (message.sender === 'shop') {
        if (!isOpenRef.current) {
          setUnreadCount((prev) => prev + 1);
        }
      }

      if (isOpenRef.current) {
        const stickToBottom = isNearBottom(messageListRef.current);
        setMessages((prev) => mergeMessageList(prev, message));
        if (stickToBottom) {
          requestAnimationFrame(() => {
            messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
          });
          setShowScrollLatest(false);
          setNewIncomingCount(0);
          setFirstNewMessageId('');
        } else if (message.sender === 'shop') {
          if (!firstNewMessageId) {
            setFirstNewMessageId(String(message.id || ''));
          }
          setShowScrollLatest(true);
          setNewIncomingCount((prev) => prev + 1);
        }
      } else {
        setMessages((prev) => mergeMessageList(prev, message));
      }
    }

    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
      socket.disconnect();
    };
  }, [canCat, firstNewMessageId, token]);

  useEffect(() => {
    if (!isOpen || !messageListRef.current) {
      return;
    }

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadMessages();
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    setUnreadCount(0);
    setShowScrollLatest(false);
    setNewIncomingCount(0);
    setFirstNewMessageId('');
  }, [isOpen, loadMessages]);

  const handleMessagesScroll = () => {
    const nearBottom = isNearBottom(messageListRef.current);
    if (nearBottom) {
      setShowScrollLatest(false);
      setNewIncomingCount(0);
      return;
    }
    if (newIncomingCount > 0) {
      setShowScrollLatest(true);
    }
  };

  const jumpToLatest = () => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
    setShowScrollLatest(false);
    setNewIncomingCount(0);
    setFirstNewMessageId('');
  };

  const toggleCat = () => {
    setIsOpen((prev) => !prev);
  };

  const handleSend = async () => {
    if (!canCat || sending) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }

    try {
      setSending(true);
      setError('');
      const data = await api.post('/api/customer/chat/messages', { text: trimmed });
      if (data && typeof data === 'object') {
        setMessages((prev) => mergeMessageList(prev, data));
      }
      setInputValue('');
      requestAnimationFrame(() => {
        messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: 'smooth' });
      });
    } catch (err) {
      setError(err?.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSend();
  };

  return (
    <div className="chat-widget">
      {isOpen && (
        <div className="chat-window">
          <header className="chat-window-header">
            <span>Cat with Shop</span>
            <button
              type="button"
              className="chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <IoClose />
            </button>
          </header>

          <div className="chat-messages" ref={messageListRef} onScroll={handleMessagesScroll}>
            {loading ? <div className="chat-error">Loading messages...</div> : null}
            {!loading && !messages.length ? <div className="chat-error">Start a conversation with the shop.</div> : null}
            {error ? <div className="chat-error">{error}</div> : null}

            {messages.map((message) => (
              <div key={message.id}>
                {firstNewMessageId && message.id === firstNewMessageId ? (
                  <div className="chat-new-divider">New messages</div>
                ) : null}

                <div
                  className={`chat-message-row ${message.sender === 'user' ? 'user' : 'shop'}`}
                >
                  <div className="chat-message-bubble">
                    <p>{message.text}</p>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}

            {showScrollLatest ? (
              <button type="button" className="chat-scroll-latest" onClick={jumpToLatest} aria-label="Jump to latest">
                ↓
                {newIncomingCount > 0 ? <span>{newIncomingCount}</span> : null}
              </button>
            ) : null}
          </div>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={canCat ? 'Type a message...' : 'Please login to chat with shop'}
              disabled={!canCat || sending}
            />
            <button type="submit" aria-label="Send message" disabled={!canCat || sending || !inputValue.trim()}>
              <IoSend />
            </button>
          </form>
        </div>
      )}

      {!isOpen && (
        <button
          className="chat-bubble-btn"
          type="button"
          onClick={toggleCat}
          aria-label="Open chat"
        >
          <IoChatbubbleEllipsesOutline />
          {unreadCount > 0 ? <span className="chat-badge">{Math.min(unreadCount, 99)}</span> : null}
        </button>
      )}
    </div>
  );
};

export default ChatWidget;

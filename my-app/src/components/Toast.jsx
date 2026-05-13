import React, { useEffect, useState } from 'react'

function ToastItem({ t, onClose }) {
  const { id, type, message } = t
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000)
    return () => clearTimeout(timer)
  }, [id, onClose])

  const bg = type === 'success' ? '#1f8a3e' : type === 'error' ? '#c23d3d' : '#2b6cb0'

  return (
    <div style={{
      marginBottom: 8,
      padding: '10px 14px',
      borderRadius: 6,
      color: 'white',
      background: bg,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      maxWidth: 360,
    }}>
      {message}
    </div>
  )
}

export default function Toast() {
  const [list, setList] = useState([])

  useEffect(() => {
    function onToast(e) {
      const d = e?.detail || {}
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setList((s) => [{ id, type: d.type || 'info', message: String(d.message || '') }, ...s])
    }
    window.addEventListener('app:toast', onToast)
    return () => window.removeEventListener('app:toast', onToast)
  }, [])

  function remove(id) {
    setList((s) => s.filter((i) => i.id !== id))
  }

  if (!list.length) return null

  return (
    <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 9999 }}>
      {list.map((t) => (
        <ToastItem key={t.id} t={t} onClose={remove} />
      ))}
    </div>
  )
}

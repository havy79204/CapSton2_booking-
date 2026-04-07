import AsyncStorage from '@react-native-async-storage/async-storage'
import { io, Socket } from 'socket.io-client'
import { API_BASE } from '@/services/apiClient'

type StaffUpdatePayload = {
  source?: string
  action?: string
  staffId?: string
  appointmentId?: string
  date?: string
  ts?: string
}

type StaffUpdateListener = (payload: StaffUpdatePayload) => void

const SOCKET_BASE = String(API_BASE || '').replace(/\/api\/?$/i, '')

let socket: Socket | null = null
let connectInFlight: Promise<Socket | null> | null = null
const listeners = new Set<StaffUpdateListener>()

function emitToListeners(payload: StaffUpdatePayload) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(payload)
    } catch {
      // ignore listener errors so one bad subscriber does not break others.
    }
  }
}

async function ensureConnected(): Promise<Socket | null> {
  if (socket && socket.connected) return socket
  if (connectInFlight) return connectInFlight

  connectInFlight = (async () => {
    const token = (await AsyncStorage.getItem('@mynailapp:token')) || ''
    if (!token) return null

    if (socket) {
      socket.disconnect()
      socket = null
    }

    const next = io(SOCKET_BASE, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
    })

    next.on('staff:data-updated', (payload: StaffUpdatePayload) => {
      emitToListeners(payload || {})
    })

    socket = next
    return socket
  })()

  try {
    return await connectInFlight
  } finally {
    connectInFlight = null
  }
}

export function subscribeStaffDataUpdates(listener: StaffUpdateListener) {
  listeners.add(listener)
  ensureConnected().catch(() => {
    // ignore initial connection errors; polling fallback still works.
  })

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && socket) {
      socket.disconnect()
      socket = null
    }
  }
}

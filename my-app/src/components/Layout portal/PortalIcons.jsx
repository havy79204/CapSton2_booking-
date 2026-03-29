import React from 'react'

function IconBase({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

export function IconGrid() {
  return (
    <IconBase>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </IconBase>
  )
}

export function IconCalendar() {
  return (
    <IconBase>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconBase>
  )
}

export function IconClock() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </IconBase>
  )
}

export function IconUsers() {
  return (
    <IconBase>
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a3 3 0 0 1 0 5.75" />
    </IconBase>
  )
}

export function IconScissors() {
  return (
    <IconBase>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.6 15.4" />
      <path d="M20 20L8.6 8.6" />
    </IconBase>
  )
}

export function IconBox() {
  return (
    <IconBase>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
      <path d="M3.3 7l8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </IconBase>
  )
}

export function IconUser() {
  return (
    <IconBase>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconBase>
  )
}

export function IconBarCart() {
  return (
    <IconBase>
      <path d="M3 3v18h18" />
      <path d="M7 14v4" />
      <path d="M11 10v8" />
      <path d="M15 6v12" />
      <path d="M19 12v6" />
    </IconBase>
  )
}

export function IconSettings() {
  return (
    <IconBase>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.3.7a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.5 2.7a7.6 7.6 0 0 0-1.7 1L4.5 6l-2 3.5 2 1.5a7.8 7.8 0 0 0 .1 2l-2 1.5 2 3.5 2.3-.7a7.6 7.6 0 0 0 1.7 1L9 21h6l.5-2.7a7.6 7.6 0 0 0 1.7-1l2.3.7 2-3.5-2-1.5z" />
    </IconBase>
  )
}

export function IconSearch() {
  return (
    <IconBase>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </IconBase>
  )
}

export function IconBell() {
  return (
    <IconBase>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </IconBase>
  )
}

export function IconMessage() {
  return (
    <IconBase>
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </IconBase>
  )
}

export function IconPhone() {
  return (
    <IconBase>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.06a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z" />
    </IconBase>
  )
}

export function IconMail() {
  return (
    <IconBase>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </IconBase>
  )
}

export function IconDownload() {
  return (
    <IconBase>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </IconBase>
  )
}

export function IconAlertTriangle() {
  return (
    <IconBase>
      <path d="M10.29 3.86l-8.12 14.1A2 2 0 0 0 3.9 21h16.2a2 2 0 0 0 1.73-3.04l-8.12-14.1a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </IconBase>
  )
}

export function IconCheckCircle() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.3 2.3 4.7-4.9" />
    </IconBase>
  )
}

export function IconInfo() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6" />
      <path d="M12 7h.01" />
    </IconBase>
  )
}

export function IconXCircle() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5l5 5" />
      <path d="M14.5 9.5l-5 5" />
    </IconBase>
  )
}

export function IconStore() {
  return (
    <IconBase>
      <path d="M3 9l2-5h14l2 5" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-7h6v7" />
    </IconBase>
  )
}

export function IconCevronDown() {
  return (
    <IconBase>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  )
}

export function IconCevronLeft() {
  return (
    <IconBase>
      <path d="M15 18l-6-6 6-6" />
    </IconBase>
  )
}

export function IconCevronRight() {
  return (
    <IconBase>
      <path d="M9 18l6-6-6-6" />
    </IconBase>
  )
}

export function IconDollar() {
  return (
    <IconBase>
      <path d="M12 1v22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" />
    </IconBase>
  )
}

export function IconCube() {
  return (
    <IconBase>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
      <path d="M12 22V12" />
      <path d="M3.3 7L12 12l8.7-5" />
    </IconBase>
  )
}

export function IconStar() {
  return (
    <IconBase>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </IconBase>
  )
}

export default {
  IconGrid,
  IconCalendar,
  IconClock,
  IconUsers,
  IconScissors,
  IconBox,
  IconUser,
  IconBarCart,
  IconSettings,
  IconSearch,
  IconBell,
  IconMessage,
  IconPhone,
  IconMail,
  IconDownload,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconXCircle,
  IconStore,
  IconCevronDown,
  IconCevronLeft,
  IconCevronRight,
  IconDollar,
  IconCube,
  IconStar,
}

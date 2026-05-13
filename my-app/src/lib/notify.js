export function notify(type, message) {
  try {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message } }))
  } catch (err) {
    // fallback to console
    console.warn('notify failed', err)
  }
}

export function notifySuccess(message) {
  notify('success', String(message || ''))
}

export function notifyError(message) {
  notify('error', String(message || ''))
}

export function notifyInfo(message) {
  notify('info', String(message || ''))
}

export default { notify, notifySuccess, notifyError, notifyInfo }

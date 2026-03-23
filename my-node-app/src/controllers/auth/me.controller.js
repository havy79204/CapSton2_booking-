const { asyncHandler } = require('../../utils/asyncHandler')
const meService = require('../../services/me.service')

function getUserIdFromReq(req) {
  const sub = req.user?.sub
  const userId = String(sub || '').trim()
  return userId || null
}

function toAbsoluteAvatarUrl(req, avatarUrl) {
  const raw = String(avatarUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('/')) return `${req.protocol}://${req.get('host')}${raw}`
  // DB stores just the filename (e.g. u1.png).
  if (/\.(png|jpg|jpeg)$/i.test(raw)) {
    return `${req.protocol}://${req.get('host')}/uploads/avatars/${raw}`
  }
  return raw
}

function normalizeMeForResponse(req, me) {
  if (!me || typeof me !== 'object') return me
  return { ...me, avatarUrl: toAbsoluteAvatarUrl(req, me.avatarUrl) }
}

const getMe = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const data = normalizeMeForResponse(req, await meService.getMe(userId))
  res.json({ ok: true, data })
})

const putMe = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { name, email, phone, avatarUrl } = req.body || {}
  const data = normalizeMeForResponse(req, await meService.updateMe(userId, { name, email, phone, avatarUrl }))
  res.json({ ok: true, data })
})

const putPassword = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { currentPassword, newPassword } = req.body || {}
  const data = await meService.changePassword(userId, { currentPassword, newPassword })
  res.json({ ok: true, data })
})

const postAvatar = asyncHandler(async (req, res) => {
  const userId = getUserIdFromReq(req)
  if (!userId) {
    res.status(401).json({ ok: false, error: 'Invalid token subject' })
    return
  }

  const { dataUrl } = req.body || {}
  const data = normalizeMeForResponse(req, await meService.uploadAvatarFromDataUrl(userId, { dataUrl }))
  res.json({ ok: true, data })
})

module.exports = {
  getMe,
  putMe,
  putPassword,
  postAvatar,
}

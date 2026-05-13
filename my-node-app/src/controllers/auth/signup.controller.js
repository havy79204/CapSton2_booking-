const { asyncHandler } = require('../../utils/asyncHandler')
const authService = require('../../services/auth.service')

const postSignup = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body || {}
  const data = await authService.signup({ name, email, password, phone })
  res.status(201).json({ ok: true, data })
})

const postVerifyEmail = asyncHandler(async (req, res) => {
  const token = String(req.body?.token || req.query?.token || '').trim()
  const data = await authService.verifyEmail({ token })
  res.json({ ok: true, data })
})

module.exports = {
  postSignup,
  postVerifyEmail,
}

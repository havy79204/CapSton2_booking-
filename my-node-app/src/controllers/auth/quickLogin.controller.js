const { asyncHandler } = require('../../utils/asyncHandler')
const { env } = require('../../config/config')
const authService = require('../../services/auth.service')

const postQuickLogin = asyncHandler(async (req, res) => {
  if (!env.features?.quickLoginEnabled) {
    res
      .status(403)
      .json({ ok: false, error: 'Quick login is disabled. Set ENABLE_QUICK_LOGIN=true (dev only).' })
    return
  }

  const { roleId, roleKey, role, email } = req.body || {}
  const data = await authService.quickLogin({ roleId: roleId ?? roleKey ?? role, email })
  res.json({ ok: true, data })
})

module.exports = {
  postQuickLogin,
}

const { asyncHandler } = require('../../utils/asyncHandler')
const authService = require('../../services/auth.service')

const postForgotPassword = asyncHandler(async(req, res) => {
    const { email } = req.body || {}
    const data = await authService.forgotPassword({ email })
    res.json({ ok: true, data })
})

const postResetPassword = asyncHandler(async(req, res) => {
    const { email, code, newPassword } = req.body || {}
    const data = await authService.resetPassword({ email, code, newPassword })
    res.json({ ok: true, data })
})

module.exports = {
    postForgotPassword,
    postResetPassword,
}
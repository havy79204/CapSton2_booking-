const { asyncHandler } = require('../../utils/asyncHandler')
const authService = require('../../services/auth.service')

const postLogin = asyncHandler(async(req, res) => {
    const { email, password } = req.body || {}
    try {
        const { user, token } = await authService.login({ email, password })
        res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } })
    } catch (err) {
        const status = err.statusCode || err.status || 401
        const message = err && err.message ? err.message : 'Sai tài khoản hoặc mật khẩu'
        res.status(status).json({ success: false, message })
    }
})

module.exports = { postLogin }
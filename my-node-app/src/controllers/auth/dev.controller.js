const { asyncHandler } = require('../../utils/asyncHandler')
const bcrypt = require('bcryptjs')
const { query } = require('../../config/query')
const { env } = require('../../config/config')

const postSetPassword = asyncHandler(async(req, res) => {
    if (!env.features?.quickLoginEnabled) {
        res.status(403).json({ ok: false, error: 'Dev endpoints disabled' })
        return
    }

    const { userId, password } = req.body || {}
    if (!userId || !password) {
        res.status(400).json({ ok: false, error: 'Missing userId or password' })
        return
    }

    const hashed = await bcrypt.hash(String(password), 10)
    await query('UPDATE Users SET PasswordHash = @h WHERE UserId = @userId', { h: hashed, userId })
    res.json({ ok: true })
})

module.exports = { postSetPassword }


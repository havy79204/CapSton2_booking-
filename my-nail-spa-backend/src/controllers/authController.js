const authService = require('../services/authService')

async function signup(req, res, next) {
  try {
    const result = await authService.signup(req, req.body)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body)
    res.json({ user, token })
  } catch (err) {
    next(err)
  }
}

async function verifyEmail(req, res, next) {
  try {
    const token = req.query.token
    const result = await authService.verifyEmail(token)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.getMe(req.user.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function patchMe(req, res, next) {
  try {
    const result = await authService.updateMe(req.user.id, req.body)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function changePassword(req, res, next) {
  try {
    const body = req.body || {}
    const result = await authService.changePassword(req.user.id, body.currentPassword, body.newPassword)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function forgotPassword(req, res, next) {
  try {
    const body = req.body || {}
    const result = await authService.forgotPassword(req, body.email)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function resendVerification(req, res, next) {
  try {
    const body = req.body || {}
    const result = await authService.resendVerification(req, body.email)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

async function resetPassword(req, res, next) {
  try {
    const body = req.body || {}
    const result = await authService.resetPassword(body.token, body.password)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  signup,
  login,
  verifyEmail,
  me,
  patchMe,
  changePassword,
  forgotPassword,
  resendVerification,
  resetPassword,
}

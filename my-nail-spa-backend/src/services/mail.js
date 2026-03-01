const nodemailer = require('nodemailer')
const { env } = require('../config/config')

function canSendMail() {
  const host = String(env.smtp.host || '').trim().toLowerCase()
  const user = String(env.smtp.user || '').trim()
  const pass = String(env.smtp.pass || '').trim()

  if (!host || host === 'smtp.example.com' || host.endsWith('.example.com')) return false

  return Boolean(host && user && pass)
}

function getTransport() {
  if (!canSendMail()) return null
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  })
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport()
  if (!transport) {
    const err = new Error('SMTP is not configured')
    err.status = 400
    throw err
  }

  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject,
    text,
    html,
  })

  return true
}

module.exports = { sendMail, canSendMail }

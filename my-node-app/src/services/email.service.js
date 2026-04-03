const nodemailer = require('nodemailer')
const { env } = require('../config/config')

let transporter = null

function hasSmtpConfig() {
  return Boolean(env.smtp?.host && env.smtp?.port && env.smtp?.user && env.smtp?.pass)
}

function getTransporter() {
  if (!hasSmtpConfig()) return null
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: Number(env.smtp.port || 465),
    secure: Boolean(env.smtp.secure),
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  })

  return transporter
}

async function sendEmail({ to, subject, text, html } = {}) {
  const toEmail = String(to || '').trim()
  const safeSubject = String(subject || '').trim()
  if (!toEmail || !safeSubject) return { sent: false, reason: 'missing_to_or_subject' }

  const tx = getTransporter()
  if (!tx) return { sent: false, reason: 'smtp_not_configured' }

  try {
    const info = await tx.sendMail({
      from: env.smtp.from,
      to: toEmail,
      subject: safeSubject,
      text: text || '',
      html: html || undefined,
    })

    return { sent: true, messageId: info?.messageId || null }
  } catch (err) {
    return {
      sent: false,
      reason: 'send_failed',
      error: err?.message || 'send_failed',
    }
  }
}

module.exports = {
  sendEmail,
  hasSmtpConfig,
}

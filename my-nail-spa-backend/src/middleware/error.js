function notFound(req, res) {
  res.status(404).json({ error: 'Not found' })
}

function errorHandler(err, req, res, next) {
  const _ = next
  const isZod = err && (err.name === 'ZodError' || Array.isArray(err.issues))
  const status = Number(err?.status) || (isZod ? 400 : 500)

  let message = err?.message || 'Server error'
  if (isZod) {
    const first = Array.isArray(err.issues) ? err.issues[0] : null
    message = first?.message || 'Invalid request'
  }

  if (status >= 500) {
    console.error(err)
  }

  res.status(status).json({ error: message })
}

module.exports = { notFound, errorHandler }

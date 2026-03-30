function notFound(req, res, next) {
  console.warn(`404 - Not Found: ${req.method} ${req.originalUrl}`)
  res.status(404).json({ ok: false, error: 'Not Found' })
}

function errorHandler(err, req, res, next) {
  const status = err?.statusCode || err?.status || 500
  const message = status === 500 ? 'Internal Server Error' : err?.message

  if (status === 500) {
    console.error(`500 Error on ${req.method} ${req.originalUrl}:`)
    console.error('Error details:', {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      sqlMessage: err?.originalError?.message,
    })
    console.error(err)
  }

  res.status(status).json({ ok: false, error: message })
}

module.exports = { notFound, errorHandler }

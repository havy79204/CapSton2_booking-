const { ZodError } = require('zod')

function validate(schema, where = 'body') {
  return (req, res, next) => {
    try {
      if (!schema) return next()
      const target = where === 'params' ? req.params : where === 'query' ? req.query : req.body
      const parsed = schema.parse(target)
      if (where === 'params') req.params = parsed
      else if (where === 'query') req.query = parsed
      else req.body = parsed
      return next()
    } catch (err) {
      if (err instanceof ZodError) return next(err)
      return next(err)
    }
  }
}

module.exports = { validate }

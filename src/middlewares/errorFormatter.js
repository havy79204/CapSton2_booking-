const ValidationError = require('../errors/ValidationError');

const errorHandler = (err, req, res, next) => {
  if (!err) return next();
  if (err instanceof ValidationError) {
    return res.status(400).json({
      message: err.message,
      errors: err.errors
    });
  }

  // handle generic errors
  const status = err.status || 500;
  const payload = { message: err.message || 'Internal Server Error' };
  if (process.env.NODE_ENV === 'development') payload.stack = err.stack;
  return res.status(status).json(payload);
};

module.exports = { errorHandler };

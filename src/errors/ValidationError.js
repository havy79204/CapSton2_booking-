class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.name = 'ValidationError';
    // normalize errors to array of { field?, message }
    this.errors = Array.isArray(errors)
      ? errors.map(e => (typeof e === 'string' ? { message: e } : e))
      : [{ message: String(errors) }];
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ValidationError;

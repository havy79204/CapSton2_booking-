const { z } = require('zod')

const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters, start with an uppercase letter, and include at least 1 special character'

function passwordSchema() {
  return z
    .string()
    .min(8, PASSWORD_RULE_MESSAGE)
    .refine((v) => /^[A-Z]/.test(String(v || '')), { message: PASSWORD_RULE_MESSAGE })
    .refine((v) => /[^A-Za-z0-9]/.test(String(v || '')), { message: PASSWORD_RULE_MESSAGE })
}

module.exports = { passwordSchema, PASSWORD_RULE_MESSAGE }

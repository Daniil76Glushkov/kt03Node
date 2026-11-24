const Joi = require('joi');

const password = Joi.string().min(8).required().custom((value, helpers) => {
  if (Buffer.byteLength(value, 'utf8') > 72) {
    return helpers.error('string.max', { limit: 72 });
  }
  return value;
});

const registerSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  name: Joi.string().trim().min(1).max(100).required(),
  password,
  role: Joi.forbidden(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password,
});

module.exports = { registerSchema, loginSchema };

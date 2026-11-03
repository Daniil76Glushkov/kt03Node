module.exports = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      error: 'Ошибка валидации',
      details: error.details.map((item) => item.message),
    });
  }

  req[target] = value;
  next();
};

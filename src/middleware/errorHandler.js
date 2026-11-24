function errorHandler(error, req, res, next) {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос' });
  }

  if (error.code === 'P2025') {
    return res.status(404).json({ error: 'Запись не найдена' });
  }

  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'Такое значение уже существует' });
  }

  if (error.code === 'P2003') {
    return res.status(400).json({ error: 'Связанная запись не найдена' });
  }

  console.error(error);
  const response = { error: 'Внутренняя ошибка сервера' };

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(500).json(response);
}

module.exports = errorHandler;

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const config = require('./config');
const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Blog API работает' });
});

app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`Сервер запущен: http://localhost:${config.port}`);
});

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

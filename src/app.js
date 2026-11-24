const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const prisma = require('./db');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const postsRouter = require('./routes/posts');
const adminRouter = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Blog API работает' });
});

app.use('/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/posts', postsRouter);
app.use('/admin', adminRouter);
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});
app.use(errorHandler);

module.exports = app;

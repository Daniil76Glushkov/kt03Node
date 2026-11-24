const request = require('supertest');
const app = require('../src/app');
const errorHandler = require('../src/middleware/errorHandler');
const { prisma, clearDatabase } = require('./helpers');

beforeEach(clearDatabase);
afterAll(() => prisma.$disconnect());

test('Helmet добавляет защитные заголовки', async () => {
  const res = await request(app).get('/');
  expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers).not.toHaveProperty('x-powered-by');
});

test('JSON больше 10kb отклоняется', async () => {
  const res = await request(app).post('/auth/register').send({
    email: 'user@example.com',
    name: 'a'.repeat(11 * 1024),
    password: 'password123',
  });
  expect(res.status).toBe(413);
});

test('Некорректный JSON возвращает 400', async () => {
  const res = await request(app).post('/auth/register')
    .set('Content-Type', 'application/json').send('{"email":');
  expect(res.status).toBe(400);
});

test('После 10 попыток входа за 15 минут возвращается 429', async () => {
  for (let i = 0; i < 10; i += 1) {
    const res = await request(app).post('/auth/login').send({
      email: 'missing@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(401);
  }

  const limited = await request(app).post('/auth/login').send({
    email: 'missing@example.com',
    password: 'password123',
  });
  expect(limited.status).toBe(429);
  expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(900);

  const home = await request(app).get('/');
  expect(home.status).toBe(200);
});

test('Error handler скрывает stack trace и детали ошибки в production', () => {
  const previousEnv = process.env.NODE_ENV;
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  process.env.NODE_ENV = 'production';

  try {
    errorHandler(new Error('Секретные данные базы'), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Внутренняя ошибка сервера' });
  } finally {
    process.env.NODE_ENV = previousEnv;
    log.mockRestore();
  }
});

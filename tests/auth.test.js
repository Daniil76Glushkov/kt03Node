const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { createRefreshToken, hashToken } = require('../src/utils/jwt');
const { prisma, password, clearDatabase, createUser, bearer } = require('./helpers');

beforeEach(clearDatabase);
afterAll(() => prisma.$disconnect());

const registration = {
  email: 'student@example.com',
  name: 'Студент',
  password,
};

async function login(user) {
  return request(app).post('/auth/login').send({ email: user.email, password });
}

test('Регистрация создаёт пользователя с bcrypt-хэшем', async () => {
  const res = await request(app).post('/auth/register').send(registration);

  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ email: registration.email, role: 'USER' });
  expect(res.body).not.toHaveProperty('password');

  const user = await prisma.user.findUnique({ where: { email: registration.email } });
  expect(user.password).not.toBe(password);
  expect(await bcrypt.compare(password, user.password)).toBe(true);
});

test('Повторный email возвращает 409', async () => {
  await request(app).post('/auth/register').send(registration);
  const res = await request(app).post('/auth/register').send({
    ...registration,
    email: 'STUDENT@example.com',
  });
  expect(res.status).toBe(409);
});

test('Нельзя назначить себе ADMIN при регистрации', async () => {
  const res = await request(app).post('/auth/register').send({ ...registration, role: 'ADMIN' });
  expect(res.status).toBe(400);
  expect(await prisma.user.count()).toBe(0);
});

test('Логин выдаёт access token и refresh token в httpOnly cookie', async () => {
  const user = await createUser();
  const res = await login(user);

  expect(res.status).toBe(200);
  expect(res.body.accessToken).toEqual(expect.any(String));
  expect(res.body).not.toHaveProperty('refreshToken');
  expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(res.headers['set-cookie'][0]).toContain('SameSite=Strict');
  expect(res.headers['set-cookie'][0]).toContain('Path=/auth');
  expect(await prisma.refreshToken.count()).toBe(1);

  const cookie = res.headers['set-cookie'][0].split(';')[0];
  const saved = await prisma.refreshToken.findFirst();
  expect(saved.tokenHash).toBe(hashToken(cookie.slice('refreshToken='.length)));
});

test('Неверный пароль возвращает 401', async () => {
  const user = await createUser();
  const res = await request(app).post('/auth/login').send({
    email: user.email,
    password: 'wrong-password',
  });
  expect(res.status).toBe(401);
  expect(res.body).not.toHaveProperty('accessToken');
  expect(await prisma.refreshToken.count()).toBe(0);
});

test('Неизвестный email возвращает 401', async () => {
  const res = await request(app).post('/auth/login').send({
    email: 'missing@example.com',
    password,
  });
  expect(res.status).toBe(401);
});

test('/auth/me с токеном возвращает текущего пользователя без пароля', async () => {
  const user = await createUser();
  const res = await request(app).get('/auth/me').set('Authorization', bearer(user));
  expect(res.status).toBe(200);
  expect(res.body.id).toBe(user.id);
  expect(res.body).not.toHaveProperty('password');
  expect(res.body).not.toHaveProperty('refreshTokens');
});

test('/auth/me без токена возвращает 401', async () => {
  const res = await request(app).get('/auth/me');
  expect(res.status).toBe(401);
});

test('Повреждённый access token возвращает 401', async () => {
  const res = await request(app).get('/auth/me').set('Authorization', 'Bearer invalid-token');
  expect(res.status).toBe(401);
});

test('Истёкший access token возвращает 401', async () => {
  const user = await createUser();
  const token = jwt.sign({ type: 'access' }, config.accessSecret, {
    subject: String(user.id),
    expiresIn: -1,
  });
  const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(401);
});

test('Refresh token не подходит для /auth/me', async () => {
  const user = await createUser();
  const res = await request(app).get('/auth/me')
    .set('Authorization', `Bearer ${createRefreshToken(user.id)}`);
  expect(res.status).toBe(401);
});

test('/auth/refresh обновляет токены и отзывает старый refresh token', async () => {
  const user = await createUser();
  const loggedIn = await login(user);
  const cookie = loggedIn.headers['set-cookie'][0].split(';')[0];
  const res = await request(app).post('/auth/refresh').set('Cookie', cookie);

  expect(res.status).toBe(200);
  expect(res.body.accessToken).toEqual(expect.any(String));
  expect(res.body.accessToken).not.toBe(loggedIn.body.accessToken);
  expect(res.headers['set-cookie'][0].split(';')[0]).not.toBe(cookie);
  expect(await prisma.refreshToken.count()).toBe(1);

  const me = await request(app).get('/auth/me')
    .set('Authorization', `Bearer ${res.body.accessToken}`);
  expect(me.status).toBe(200);

  const replay = await request(app).post('/auth/refresh').set('Cookie', cookie);
  expect(replay.status).toBe(401);
});

test('/auth/refresh без cookie возвращает 401', async () => {
  const res = await request(app).post('/auth/refresh');
  expect(res.status).toBe(401);
});

test('/auth/refresh не принимает повреждённую cookie', async () => {
  const res = await request(app).post('/auth/refresh').set('Cookie', 'refreshToken=invalid');
  expect(res.status).toBe(401);
});

test('/auth/refresh не принимает access token вместо refresh token', async () => {
  const user = await createUser();
  const res = await request(app).post('/auth/refresh')
    .set('Cookie', `refreshToken=${user.token}`);
  expect(res.status).toBe(401);
});

test('/auth/logout очищает cookie и отзывает refresh token', async () => {
  const user = await createUser();
  const loggedIn = await login(user);
  const cookie = loggedIn.headers['set-cookie'][0].split(';')[0];
  const res = await request(app).post('/auth/logout').set('Cookie', cookie);

  expect(res.status).toBe(204);
  expect(res.headers['set-cookie'][0]).toContain('refreshToken=;');
  expect(res.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
  expect(await prisma.refreshToken.count()).toBe(0);

  const refresh = await request(app).post('/auth/refresh').set('Cookie', cookie);
  expect(refresh.status).toBe(401);
});

test('/auth/logout без cookie тоже работает', async () => {
  const res = await request(app).post('/auth/logout');
  expect(res.status).toBe(204);
});

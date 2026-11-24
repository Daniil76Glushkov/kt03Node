const jwt = require('jsonwebtoken');
const config = require('../src/config');
const { registerSchema } = require('../src/validation/auth');
const { createAccessToken, createRefreshToken, verifyToken, hashToken } = require('../src/utils/jwt');

test('JWT-утилита создаёт и проверяет access token', () => {
  const token = createAccessToken(5);
  const payload = verifyToken(token, 'access');
  expect(payload.sub).toBe('5');
  expect(payload.type).toBe('access');
  expect(payload.exp - payload.iat).toBe(15 * 60);
});

test('JWT-утилита не принимает подпись с чужим секретом', () => {
  const token = jwt.sign({ type: 'access' }, 'wrong-secret', { subject: '5' });
  expect(() => verifyToken(token, 'access')).toThrow();
});

test('JWT-утилита не принимает неправильный тип токена', () => {
  const token = jwt.sign({ type: 'refresh' }, config.accessSecret, { subject: '5' });
  expect(() => verifyToken(token, 'access')).toThrow();
});

test('Refresh tokens уникальны и действуют 7 дней', () => {
  const first = createRefreshToken(5);
  const second = createRefreshToken(5);
  expect(first).not.toBe(second);
  const payload = verifyToken(first, 'refresh');
  expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
});

test('Хэш refresh token одинаков для одного значения и отличается от токена', () => {
  expect(hashToken('token')).toBe(hashToken('token'));
  expect(hashToken('token')).not.toBe('token');
  expect(hashToken('token')).not.toBe(hashToken('other'));
});

test('Валидация не принимает некорректный email и короткий пароль', () => {
  const result = registerSchema.validate({ email: 'wrong', name: 'Студент', password: '123' });
  expect(result.error).toBeDefined();
});

test('Валидация не принимает пароль длиннее 72 байт для bcrypt', () => {
  const result = registerSchema.validate({
    email: 'student@example.com',
    name: 'Студент',
    password: 'я'.repeat(40),
  });
  expect(result.error).toBeDefined();
});

const jwt = require('jsonwebtoken');
const { randomUUID, createHash } = require('crypto');
const config = require('../config');

function createAccessToken(userId) {
  return jwt.sign({ type: 'access' }, config.accessSecret, {
    subject: String(userId),
    jwtid: randomUUID(),
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

function createRefreshToken(userId) {
  return jwt.sign({ type: 'refresh' }, config.refreshSecret, {
    subject: String(userId),
    jwtid: randomUUID(),
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

function verifyToken(token, type) {
  const secret = type === 'access' ? config.accessSecret : config.refreshSecret;
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  const id = Number(payload.sub);

  if (payload.type !== type || !Number.isInteger(id) || id <= 0 || id > 2147483647) {
    throw new Error('Некорректный токен');
  }

  return payload;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

module.exports = { createAccessToken, createRefreshToken, verifyToken, hashToken };

const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { registerSchema, loginSchema } = require('../validation/auth');
const userSelect = require('../utils/user');
const { createAccessToken, createRefreshToken, verifyToken, hashToken } = require('../utils/jwt');

const router = express.Router();
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth',
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут' },
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, name, password } = req.body;
    const user = await req.prisma.user.create({
      data: { email, name, password: await bcrypt.hash(password, 10), role: 'USER' },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({ where: { email: req.body.email } });

    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const refreshToken = createRefreshToken(user.id);
    await req.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + config.refreshMaxAge),
      },
    });

    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: config.refreshMaxAge });
    res.json({ accessToken: createAccessToken(user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  const token = req.cookies.refreshToken;
  let payload;

  try {
    payload = verifyToken(token, 'refresh');
  } catch {
    return res.status(401).json({ error: 'Неверный refresh token' });
  }

  try {
    const userId = Number(payload.sub);
    const refreshToken = createRefreshToken(userId);
    const rotated = await req.prisma.$transaction(async (tx) => {
      const result = await tx.refreshToken.deleteMany({
        where: { tokenHash: hashToken(token), userId, expiresAt: { gt: new Date() } },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.refreshToken.create({
        data: {
          tokenHash: hashToken(refreshToken),
          userId,
          expiresAt: new Date(Date.now() + config.refreshMaxAge),
        },
      });
      return true;
    });

    if (!rotated) {
      return res.status(401).json({ error: 'Refresh token истёк или отозван' });
    }

    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: config.refreshMaxAge });
    res.json({ accessToken: createAccessToken(userId) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.cookies.refreshToken) {
      await req.prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(req.cookies.refreshToken) },
      });
    }

    res.clearCookie('refreshToken', cookieOptions);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;

const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');
const bcrypt = require('bcrypt');
const { authenticate, allowRoles } = require('../middleware/auth');
const { registerSchema } = require('../validation/auth');
const userSelect = require('../utils/user');

const router = express.Router();

router.use(authenticate);

const updateUserSchema = Joi.object({
  email: Joi.string().trim().lowercase().email(),
  name: Joi.string().trim().min(1).max(100),
  role: Joi.forbidden(),
}).min(1);

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).max(1000000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

router.use('/:id', validate(Joi.object({
  id: Joi.number().integer().positive().max(2147483647).required(),
}), 'params'));

router.get('/', allowRoles('MODERATOR', 'ADMIN'), validate(querySchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      req.prisma.user.findMany({
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      req.prisma.user.count(),
    ]);

    res.json({
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', allowRoles('MODERATOR', 'ADMIN'), async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      select: {
        ...userSelect,
        posts: {
          orderBy: { createdAt: 'desc' },
          include: { tags: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/', allowRoles('ADMIN'), validate(registerSchema), async (req, res, next) => {
  try {
    const user = await req.prisma.user.create({
      data: { ...req.body, password: await bcrypt.hash(req.body.password, 10), role: 'USER' },
      select: userSelect,
    });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', allowRoles('ADMIN'), validate(updateUserSchema), async (req, res, next) => {
  try {
    const user = await req.prisma.user.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      select: userSelect,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', allowRoles('ADMIN'), async (req, res, next) => {
  try {
    await req.prisma.user.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;

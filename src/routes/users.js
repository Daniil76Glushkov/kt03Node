const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');

const router = express.Router();

const userSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(1).required(),
  role: Joi.string().valid('USER', 'ADMIN').default('USER'),
});

const updateUserSchema = Joi.object({
  email: Joi.string().email(),
  name: Joi.string().min(1),
  role: Joi.string().valid('USER', 'ADMIN'),
}).min(1);

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).max(1000000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

router.use('/:id', validate(Joi.object({
  id: Joi.number().integer().positive().max(2147483647).required(),
}), 'params'));

router.get('/', validate(querySchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      req.prisma.user.findMany({
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

router.get('/:id', async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      include: {
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

router.post('/', validate(userSchema), async (req, res, next) => {
  try {
    const user = await req.prisma.user.create({ data: req.body });
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const user = await req.prisma.user.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await req.prisma.user.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;

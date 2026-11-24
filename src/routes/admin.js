const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');
const { authenticate, allowRoles } = require('../middleware/auth');
const userSelect = require('../utils/user');

const router = express.Router();

router.use(authenticate, allowRoles('ADMIN'));

router.patch('/users/:id/role',
  validate(Joi.object({
    id: Joi.number().integer().positive().max(2147483647).required(),
  }), 'params'),
  validate(Joi.object({
    role: Joi.string().valid('USER', 'MODERATOR', 'ADMIN').required(),
  })),
  async (req, res, next) => {
    try {
      const user = await req.prisma.user.update({
        where: { id: req.params.id },
        data: { role: req.body.role },
        select: userSelect,
      });
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

module.exports = router;

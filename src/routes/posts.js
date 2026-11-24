const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');
const { authenticate, canEditPost } = require('../middleware/auth');
const userSelect = require('../utils/user');

const router = express.Router();

router.use(authenticate);

const postSchema = Joi.object({
  title: Joi.string().min(1).required(),
  content: Joi.string().allow('', null),
  published: Joi.boolean().default(false),
  authorId: Joi.forbidden(),
  tags: Joi.array().items(Joi.string().trim().min(1)).unique().default([]),
});

const updatePostSchema = Joi.object({
  title: Joi.string().min(1),
  content: Joi.string().allow('', null),
  published: Joi.boolean(),
  authorId: Joi.forbidden(),
  tags: Joi.array().items(Joi.string().trim().min(1)).unique(),
}).min(1);

const querySchema = Joi.object({
  search: Joi.string().trim().allow(''),
  published: Joi.boolean(),
  authorId: Joi.number().integer().positive().max(2147483647),
  page: Joi.number().integer().min(1).max(1000000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

router.use('/:id', validate(Joi.object({
  id: Joi.number().integer().positive().max(2147483647).required(),
}), 'params'));

function filters(query) {
  const where = {};

  if (query.search && !/[^\x00-\x7F]/.test(query.search)) {
    where.title = { contains: query.search };
  }

  if (query.published !== undefined) {
    where.published = query.published;
  }

  if (query.authorId !== undefined) {
    where.authorId = query.authorId;
  }

  return where;
}

const postInclude = {
  author: { select: userSelect },
  tags: true,
};

router.get('/', validate(querySchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;
    const where = filters(req.query);

    if (req.query.search && /[^\x00-\x7F]/.test(req.query.search)) {
      const posts = await req.prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { createdAt: 'desc' },
      });
      const search = req.query.search.toLowerCase();
      const matches = posts.filter((post) => post.title.toLowerCase().includes(search));
      const total = matches.length;

      return res.json({
        data: matches.slice(skip, skip + limit),
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    }

    const [data, total] = await Promise.all([
      req.prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      req.prisma.post.count({ where }),
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
    const post = await req.prisma.post.findUnique({
      where: { id: Number(req.params.id) },
      include: postInclude,
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    res.json(post);
  } catch (error) {
    next(error);
  }
});

router.post('/', validate(postSchema), async (req, res, next) => {
  try {
    const { tags, ...postData } = req.body;
    const post = await req.prisma.post.create({
      data: {
        ...postData,
        authorId: req.user.id,
        tags: {
          connectOrCreate: tags.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: postInclude,
    });

    res.status(201).json(post);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', canEditPost, validate(updatePostSchema), async (req, res, next) => {
  try {
    const { tags, ...postData } = req.body;
    const data = { ...postData };

    if (tags !== undefined) {
      data.tags = {
        set: [],
        connectOrCreate: tags.map((name) => ({
          where: { name },
          create: { name },
        })),
      };
    }

    const post = await req.prisma.post.update({
      where: { id: Number(req.params.id) },
      data,
      include: postInclude,
    });

    res.json(post);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', canEditPost, async (req, res, next) => {
  try {
    await req.prisma.post.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;

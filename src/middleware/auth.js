const { verifyToken } = require('../utils/jwt');
const userSelect = require('../utils/user');

async function authenticate(req, res, next) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (\S+)$/i);

  if (!match) {
    return res.status(401).json({ error: 'Нужна авторизация' });
  }

  let payload;
  try {
    payload = verifyToken(match[1], 'access');
  } catch {
    return res.status(401).json({ error: 'Токен недействителен или истёк' });
  }

  try {
    const user = await req.prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: userSelect,
    });

    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    next();
  };
}

async function canEditPost(req, res, next) {
  try {
    const post = await req.prisma.post.findUnique({
      where: { id: Number(req.params.id) },
    });

    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    if (req.user.role === 'USER' && post.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Можно изменять только свои посты' });
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticate, allowRoles, canEditPost };

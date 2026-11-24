const bcrypt = require('bcrypt');
const prisma = require('../src/db');
const { createAccessToken } = require('../src/utils/jwt');

const password = 'password123';
const passwordHash = bcrypt.hashSync(password, 10);

async function clearDatabase() {
  await prisma.refreshToken.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(email = 'user@example.com', role = 'USER') {
  const user = await prisma.user.create({
    data: { email, name: 'Студент', password: passwordHash, role },
  });
  return { ...user, token: createAccessToken(user.id) };
}

function bearer(user) {
  return `Bearer ${user.token}`;
}

module.exports = { prisma, password, clearDatabase, createUser, bearer };

const request = require('supertest');
const app = require('../src/app');
const { prisma, clearDatabase, createUser, bearer } = require('./helpers');

beforeEach(clearDatabase);
afterAll(() => prisma.$disconnect());

async function createPost(user) {
  return prisma.post.create({
    data: { title: 'Мой пост', content: 'Текст', authorId: user.id },
  });
}

test.each(['USER', 'MODERATOR', 'ADMIN'])('%s может читать и создавать посты', async (role) => {
  const user = await createUser('student@example.com', role);
  const created = await request(app).post('/api/posts')
    .set('Authorization', bearer(user))
    .send({ title: 'Новый пост', tags: ['node', 'express'] });

  expect(created.status).toBe(201);
  expect(created.body.authorId).toBe(user.id);
  expect(created.body.tags).toHaveLength(2);
  expect(created.body.author).not.toHaveProperty('password');

  const list = await request(app).get('/api/posts').set('Authorization', bearer(user));
  expect(list.status).toBe(200);
  expect(list.body.data).toHaveLength(1);
  expect(list.body.data[0].author).not.toHaveProperty('password');
});

test('Список постов без токена недоступен', async () => {
  const res = await request(app).get('/api/posts');
  expect(res.status).toBe(401);
});

test('Владелец удаляет свой пост', async () => {
  const user = await createUser();
  const post = await createPost(user);
  const res = await request(app).delete(`/api/posts/${post.id}`)
    .set('Authorization', bearer(user));
  expect(res.status).toBe(204);
  expect(await prisma.post.count()).toBe(0);
});

test('Другой пользователь получает 403 при удалении чужого поста', async () => {
  const owner = await createUser('owner@example.com');
  const other = await createUser('other@example.com');
  const post = await createPost(owner);
  const res = await request(app).delete(`/api/posts/${post.id}`)
    .set('Authorization', bearer(other));
  expect(res.status).toBe(403);
  expect(await prisma.post.count()).toBe(1);
});

test('Владелец может редактировать свой пост', async () => {
  const user = await createUser();
  const post = await createPost(user);
  const res = await request(app).patch(`/api/posts/${post.id}`)
    .set('Authorization', bearer(user))
    .send({ title: 'Изменённый пост', tags: ['test'] });
  expect(res.status).toBe(200);
  expect(res.body.title).toBe('Изменённый пост');
  expect(res.body.tags[0].name).toBe('test');
});

test('Другой пользователь не может редактировать чужой пост', async () => {
  const owner = await createUser('owner@example.com');
  const other = await createUser('other@example.com');
  const post = await createPost(owner);
  const res = await request(app).patch(`/api/posts/${post.id}`)
    .set('Authorization', bearer(other))
    .send({ title: 'Чужой пост' });
  expect(res.status).toBe(403);
  expect((await prisma.post.findUnique({ where: { id: post.id } })).title).toBe('Мой пост');
});

test.each(['MODERATOR', 'ADMIN'])('%s редактирует и удаляет чужой пост', async (role) => {
  const owner = await createUser('owner@example.com');
  const moderator = await createUser('staff@example.com', role);
  const post = await createPost(owner);
  const updated = await request(app).patch(`/api/posts/${post.id}`)
    .set('Authorization', bearer(moderator))
    .send({ title: 'Проверено' });
  expect(updated.status).toBe(200);

  const deleted = await request(app).delete(`/api/posts/${post.id}`)
    .set('Authorization', bearer(moderator));
  expect(deleted.status).toBe(204);
});

test('Нельзя подставить другого автора при создании поста', async () => {
  const user = await createUser();
  const res = await request(app).post('/api/posts').set('Authorization', bearer(user))
    .send({ title: 'Пост', authorId: 123 });
  expect(res.status).toBe(400);
});

test('Нельзя изменить автора поста', async () => {
  const user = await createUser();
  const post = await createPost(user);
  const res = await request(app).patch(`/api/posts/${post.id}`)
    .set('Authorization', bearer(user)).send({ authorId: 123 });
  expect(res.status).toBe(400);
});

test.each([
  ['USER', 403],
  ['MODERATOR', 200],
  ['ADMIN', 200],
])('Список пользователей для %s: статус %s', async (role, status) => {
  const user = await createUser('student@example.com', role);
  const res = await request(app).get('/api/users').set('Authorization', bearer(user));
  expect(res.status).toBe(status);
  if (status === 200) {
    expect(res.body.data[0]).not.toHaveProperty('password');
    expect(res.body.data[0]).not.toHaveProperty('refreshTokens');
  }
});

test.each(['USER', 'MODERATOR'])('%s не может менять роли', async (role) => {
  const user = await createUser('student@example.com', role);
  const res = await request(app).patch(`/admin/users/${user.id}/role`)
    .set('Authorization', bearer(user)).send({ role: 'ADMIN' });
  expect(res.status).toBe(403);
  expect((await prisma.user.findUnique({ where: { id: user.id } })).role).toBe(role);
});

test('ADMIN меняет роль, и права обновляются даже со старым access token', async () => {
  const admin = await createUser('admin@example.com', 'ADMIN');
  const user = await createUser();
  const updated = await request(app).patch(`/admin/users/${user.id}/role`)
    .set('Authorization', bearer(admin)).send({ role: 'MODERATOR' });
  expect(updated.status).toBe(200);
  expect(updated.body.role).toBe('MODERATOR');
  expect(updated.body).not.toHaveProperty('password');

  const list = await request(app).get('/api/users').set('Authorization', bearer(user));
  expect(list.status).toBe(200);

  await request(app).patch(`/admin/users/${user.id}/role`)
    .set('Authorization', bearer(admin)).send({ role: 'USER' });
  const forbidden = await request(app).get('/api/users').set('Authorization', bearer(user));
  expect(forbidden.status).toBe(403);
});

test('ADMIN не может назначить несуществующую роль', async () => {
  const admin = await createUser('admin@example.com', 'ADMIN');
  const res = await request(app).patch(`/admin/users/${admin.id}/role`)
    .set('Authorization', bearer(admin)).send({ role: 'OWNER' });
  expect(res.status).toBe(400);
});

test('Старый маршрут изменения пользователя не позволяет обойти смену ролей', async () => {
  const user = await createUser();
  const res = await request(app).patch(`/api/users/${user.id}`)
    .set('Authorization', bearer(user)).send({ role: 'ADMIN' });
  expect(res.status).toBe(403);
});

test('Несуществующий пост возвращает 404', async () => {
  const user = await createUser();
  const res = await request(app).delete('/api/posts/2147483647')
    .set('Authorization', bearer(user));
  expect(res.status).toBe(404);
});

test('Поиск по русскому заголовку и пагинация продолжают работать', async () => {
  const user = await createUser();
  await createPost(user);
  const res = await request(app).get('/api/posts')
    .query({ search: 'МОЙ', page: 1, limit: 1 })
    .set('Authorization', bearer(user));
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 1, pages: 1 });
});

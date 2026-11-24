const config = require('./config');
const app = require('./app');
const prisma = require('./db');

const server = app.listen(config.port, () => {
  console.log(`Сервер запущен: http://localhost:${config.port}`);
});

function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const prisma = require('../src/db');

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error('Укажите email: npm run make:admin -- student@example.com');
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: 'ADMIN' },
    select: { email: true },
  });
  console.log(`Пользователь ${user.email} теперь ADMIN`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'Invitado' }
  });
}

main().finally(() => prisma.$disconnect());
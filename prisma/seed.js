import prisma from '../src/utiles/db.js';

// Idempotente (upsert): se puede correr varias veces sin duplicar el usuario.
// Hasta que haya login, todas las tareas pertenecen a este usuario invitado (id 1).
async function main() {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'Invitado' }
  });
}

main().finally(() => prisma.$disconnect());

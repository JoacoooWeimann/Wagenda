// Levanta la app contra una base SQLite propia de este proceso de tests.
// Nunca toca prisma/dev.db.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

export async function startTestServer() {
  // Nombre único por proceso: node --test corre cada archivo en paralelo, y con
  // una base compartida un archivo borraría las tareas que otro está usando.
  const dbFile = `test-${process.pid}.db`;
  process.env.DATABASE_URL = `file:./${dbFile}`; // relativo a prisma/, como dev.db
  process.env.NODE_ENV = 'test';

  // Mismo camino que `npm run setup`: también prueba que las migraciones corren desde cero
  execSync('npx prisma migrate deploy', { cwd: ROOT, env: process.env, stdio: 'pipe' });

  // Import dinámico DESPUÉS de fijar DATABASE_URL: db.js crea el PrismaClient al
  // importarse y lee la variable en ese momento.
  const { default: app } = await import('../../src/app.js');
  const { default: prisma } = await import('../../src/utiles/db.js');

  // Puerto 0: el sistema operativo asigna uno libre (no choca con `npm run dev`)
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  // Estado inicial de cada test: sin objetivos, tareas ni seguimientos, y solo el usuario invitado
  async function reset() {
    await prisma.goal.deleteMany(); // cascade: sus semanas y tareas
    await prisma.task.deleteMany();
    await prisma.tracker.deleteMany(); // cascade: sus registros
    await prisma.user.deleteMany({ where: { id: { not: 1 } } });
    await prisma.user.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Invitado' } });
  }

  async function stop() {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    for (const suffix of ['', '-journal']) {
      rmSync(path.join(ROOT, 'prisma', dbFile + suffix), { force: true });
    }
  }

  // Pedido a la API; devuelve status, content-type y body (JSON si corresponde)
  async function request(method, url, body, { raw = false } = {}) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, type, body: data };
  }

  return { prisma, reset, stop, request };
}

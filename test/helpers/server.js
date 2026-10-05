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
  const { createSession, SESSION_COOKIE } = await import('../../src/utiles/auth/sessions.js');

  // Puerto 0: el sistema operativo asigna uno libre (no choca con `npm run dev`)
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  // Cookie de sesión de un usuario, sin pasar por el login (scrypt es lento a propósito)
  const sessionCookie = async (userId) => `${SESSION_COOKIE}=${await createSession(userId)}`;
  let defaultCookie = null;

  // Estado inicial de cada test: sin objetivos, tareas, seguimientos ni tableros,
  // solo el usuario invitado (sin credenciales) y una sesión suya, que
  // request() usa por defecto
  async function reset() {
    await prisma.goal.deleteMany(); // cascade: sus semanas y tareas
    await prisma.task.deleteMany();
    await prisma.tracker.deleteMany(); // cascade: sus registros
    await prisma.board.deleteMany();
    await prisma.group.deleteMany(); // cascade: miembros, tableros compartidos y uniones
    await prisma.user.deleteMany({ where: { id: { not: 1 } } });
    await prisma.session.deleteMany();
    await prisma.user.upsert({
      where: { id: 1 },
      update: { name: 'Invitado', username: null, passwordHash: null },
      create: { id: 1, name: 'Invitado' }
    });
    defaultCookie = await sessionCookie(1);
  }

  async function stop() {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    for (const suffix of ['', '-journal']) {
      rmSync(path.join(ROOT, 'prisma', dbFile + suffix), { force: true });
    }
  }

  // Pedido a la app con la sesión del usuario 1 (cookie: null = sin sesión, u
  // otra cookie). form: body como formulario HTML. No sigue redirecciones, para
  // poder ver el Location y el Set-Cookie. Devuelve status, content-type, body,
  // location y la cookie de sesión que haya fijado.
  async function request(method, url, body, { raw = false, form = false, cookie = defaultCookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(baseUrl + url, {
      method,
      headers,
      redirect: 'manual',
      body: body === undefined ? undefined : raw ? body : form ? new URLSearchParams(body).toString() : JSON.stringify(body)
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.text();
    const setCookie = res.headers.getSetCookie().find(c => c.startsWith(`${SESSION_COOKIE}=`)) ?? null;
    return { status: res.status, type, body: data, location: res.headers.get('location'), setCookie };
  }

  return { prisma, reset, stop, request, sessionCookie };
}

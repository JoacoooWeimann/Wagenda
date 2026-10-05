import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

const anon = { cookie: null };
const account = (extra = {}) => ({
  name: 'Joaco', username: 'joaco', password: 'secreto123', passwordConfirm: 'secreto123', ...extra
});
const register = (body, next) => ctx.request('POST', '/register', { ...body, ...(next ? { next } : {}) }, { form: true, ...anon });
const login = (username, password, next) =>
  ctx.request('POST', '/login', { username, password, ...(next ? { next } : {}) }, { form: true, ...anon });
// "wagenda_session=abc; Path=/; HttpOnly..." -> "wagenda_session=abc"
const cookieOf = (res) => res.setCookie.split(';')[0];

describe('acceso sin sesión', () => {
  it('la API responde 401 y las páginas redirigen al login recordando la URL', async () => {
    assert.equal((await ctx.request('GET', '/api/goals', undefined, anon)).status, 401);
    assert.equal((await ctx.request('POST', '/api/tasks', { title: 'x', startDate: '2026-10-05' }, anon)).status, 401);

    const page = await ctx.request('GET', '/goals', undefined, anon);
    assert.equal(page.status, 302);
    assert.equal(page.location, '/login?next=%2Fgoals');

    assert.equal((await ctx.request('GET', '/', undefined, anon)).status, 200);
    assert.equal((await ctx.request('GET', '/login', undefined, anon)).status, 200);
  });

  it('una cookie inventada o de una sesión vencida no sirve', async () => {
    assert.equal((await ctx.request('GET', '/api/goals', undefined, { cookie: 'wagenda_session=inventada' })).status, 401);

    const cookie = await ctx.sessionCookie(1);
    await ctx.prisma.session.updateMany({ data: { expiresAt: new Date('2020-01-01') } });
    assert.equal((await ctx.request('GET', '/api/goals', undefined, { cookie })).status, 401);
  });
});

describe('registro', () => {
  it('la primera cuenta reclama al invitado con sus datos', async () => {
    const goalTask = await ctx.request('POST', '/api/tasks', { title: 'Del invitado', startDate: '2026-10-05' });

    const res = await register(account({ username: ' Joaco ' }), '/goals');
    assert.equal(res.status, 302);
    assert.equal(res.location, '/goals');
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Lax/);

    const user = await ctx.prisma.user.findUnique({ where: { id: 1 } });
    assert.equal(user.username, 'joaco'); // normalizado
    assert.match(user.passwordHash, /^scrypt\$/);
    assert.ok(!user.passwordHash.includes('secreto123'));

    const tasks = (await ctx.request('GET', '/api/tasks?year=2026&month=10', undefined, { cookie: cookieOf(res) })).body;
    assert.deepEqual(tasks.map(t => t.id), [goalTask.body.id]);
  });

  it('las cuentas siguientes empiezan vacías y no ven datos ajenos', async () => {
    await register(account());
    await ctx.request('POST', '/api/tasks', { title: 'De joaco', startDate: '2026-10-05' });

    const res = await register(account({ name: 'Lucía', username: 'lucia' }));
    assert.equal(res.status, 302);
    const cookie = cookieOf(res);
    assert.deepEqual((await ctx.request('GET', '/api/tasks?year=2026&month=10', undefined, { cookie })).body, []);
    assert.notEqual((await ctx.prisma.user.findUnique({ where: { username: 'lucia' } })).id, 1);
  });

  it('rechaza datos inválidos y usuarios repetidos (sin importar mayúsculas)', async () => {
    const bad = await register(account({ username: 'a', password: 'corta', passwordConfirm: 'corta' }));
    assert.equal(bad.status, 400);
    assert.match(bad.body, /Entre 3 y 20 caracteres/);
    assert.match(bad.body, /Mínimo 8 caracteres/);
    assert.ok(!bad.body.includes('value="corta"')); // la contraseña nunca vuelve en el HTML

    assert.match((await register(account({ passwordConfirm: 'otra-cosa' }))).body, /no coinciden/);

    await register(account());
    const dup = await register(account({ username: 'JOACO' }));
    assert.equal(dup.status, 400);
    assert.match(dup.body, /Ese usuario ya existe/);
  });
});

describe('login y logout', () => {
  beforeEach(async () => { await register(account()); });

  it('con datos correctos inicia sesión y va al destino pedido', async () => {
    const res = await login('Joaco', 'secreto123', '/trackers');
    assert.equal(res.status, 302);
    assert.equal(res.location, '/trackers');
    assert.equal((await ctx.request('GET', '/api/goals', undefined, { cookie: cookieOf(res) })).status, 200);
  });

  it('usuario inexistente y contraseña incorrecta responden igual', async () => {
    const wrongPassword = await login('joaco', 'incorrecta');
    const unknownUser = await login('nadie', 'secreto123');
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.match(wrongPassword.body, /Usuario o contraseña incorrectos/);
    assert.match(unknownUser.body, /Usuario o contraseña incorrectos/);
    assert.equal(wrongPassword.setCookie, null);
  });

  it('no redirige a otros sitios después del login', async () => {
    assert.equal((await login('joaco', 'secreto123', '//sitio-malo.com')).location, '/calendar');
    assert.equal((await login('joaco', 'secreto123', 'https://sitio-malo.com')).location, '/calendar');
  });

  it('salir borra la sesión: la cookie deja de servir', async () => {
    const cookie = cookieOf(await login('joaco', 'secreto123'));
    const out = await ctx.request('POST', '/logout', undefined, { cookie });
    assert.equal(out.status, 302);
    assert.match(out.setCookie, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await ctx.request('GET', '/api/goals', undefined, { cookie })).status, 401);
  });
});

describe('límite de intentos', () => {
  beforeEach(async () => { await register(account()); });

  it('5 contraseñas incorrectas bloquean la cuenta, aunque después acierte', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('joaco', 'incorrecta')).status, 401);
    const blocked = await login('joaco', 'incorrecta');
    assert.equal(blocked.status, 429);
    assert.match(blocked.body, /Demasiados intentos/);

    const right = await login('joaco', 'secreto123');
    assert.equal(right.status, 429);
    assert.equal(right.setCookie, null);
  });

  it('un login correcto borra los intentos fallidos anteriores', async () => {
    for (let i = 0; i < 4; i++) await login('joaco', 'incorrecta');
    assert.equal((await login('joaco', 'secreto123')).status, 302);
    for (let i = 0; i < 4; i++) assert.equal((await login('joaco', 'incorrecta')).status, 401);
  });

  it('crear cuentas en masa desde una IP se frena', async () => {
    // beforeEach ya registró una; 4 más permitidas, la 6.ª no
    for (let i = 0; i < 4; i++) assert.equal((await register(account({ username: `u${i}x` }))).status, 302);
    const res = await register(account({ username: 'otra' }));
    assert.equal(res.status, 429);
  });
});

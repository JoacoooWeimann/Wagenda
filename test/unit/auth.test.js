import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/utiles/auth/password.js';
import { readCookie } from '../../src/utiles/auth/sessions.js';
import { validateRegister, validateLogin, safeNext } from '../../src/utiles/validation/auth.js';

describe('hash de contraseñas', () => {
  it('verifica la correcta, rechaza otra y no contiene la contraseña', async () => {
    const hash = await hashPassword('secreto123');
    assert.match(hash, /^scrypt\$32768\$8\$3\$/);
    assert.ok(!hash.includes('secreto123'));
    assert.equal(await verifyPassword('secreto123', hash), true);
    assert.equal(await verifyPassword('Secreto123', hash), false);
  });

  it('la misma contraseña da hashes distintos (salt aleatorio)', async () => {
    assert.notEqual(await hashPassword('secreto123'), await hashPassword('secreto123'));
  });

  it('un hash con otro formato no verifica', async () => {
    assert.equal(await verifyPassword('x', 'md5$abc'), false);
    assert.equal(await verifyPassword('x', null), false);
  });
});

describe('validación de registro y login', () => {
  const ok = { name: 'Joaco', username: 'Joaco_99', password: 'secreto123', passwordConfirm: 'secreto123' };

  it('normaliza el usuario a minúsculas y no recorta la contraseña', () => {
    const { data, fields } = validateRegister({ ...ok, password: ' con espacios ', passwordConfirm: ' con espacios ' });
    assert.deepEqual(fields, {});
    assert.equal(data.username, 'joaco_99');
    assert.equal(data.password, ' con espacios ');
  });

  it('rechaza usuarios cortos, largos o con caracteres raros', () => {
    assert.ok(validateRegister({ ...ok, username: 'jo' }).fields.username);
    assert.ok(validateRegister({ ...ok, username: 'x'.repeat(21) }).fields.username);
    assert.ok(validateRegister({ ...ok, username: 'jo aco' }).fields.username);
    assert.ok(validateRegister({ ...ok, username: 'joaco!' }).fields.username);
  });

  it('contraseña de 8 a 200 caracteres y confirmación igual', () => {
    assert.ok(validateRegister({ ...ok, password: '1234567', passwordConfirm: '1234567' }).fields.password);
    assert.ok(validateRegister({ ...ok, password: 'x'.repeat(201) }).fields.password);
    assert.ok(validateRegister({ ...ok, passwordConfirm: 'distinta' }).fields.passwordConfirm);
    assert.ok(validateRegister({ ...ok, name: ' ' }).fields.name);
  });

  it('el login solo exige que vengan los datos', () => {
    assert.deepEqual(validateLogin({ username: ' JOACO ', password: 'x' }), { data: { username: 'joaco', password: 'x' }, fields: {} });
    assert.deepEqual(Object.keys(validateLogin({}).fields).sort(), ['password', 'username']);
  });
});

describe('utilidades de sesión', () => {
  it('readCookie encuentra la cookie entre otras', () => {
    assert.equal(readCookie('a=1; wagenda_session=abc%3D; b=2', 'wagenda_session'), 'abc=');
    assert.equal(readCookie('a=1', 'wagenda_session'), null);
    assert.equal(readCookie(undefined, 'wagenda_session'), null);
  });

  it('safeNext solo acepta rutas propias', () => {
    assert.equal(safeNext('/goals?x=1'), '/goals?x=1');
    for (const bad of ['//malo.com', '/\\malo.com', 'https://malo.com', undefined, 42]) {
      assert.equal(safeNext(bad), '/calendar', String(bad));
    }
  });
});

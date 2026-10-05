import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { limitPerWeek } from '../../src/utiles/trackers.js';
import { generateInviteCode, normalizeInviteCode, INVITE_CODE_LENGTH } from '../../src/utiles/groups/inviteCode.js';
import { validateGroupCreate, validateGroupUpdate } from '../../src/utiles/validation/groups.js';

const at = (key, value) => ({ date: new Date(`${key}T00:00:00Z`), value });

describe('limitPerWeek', () => {
  // 2026-10-05 es lunes y 2026-10-11 domingo: misma semana
  const entries = [at('2026-10-05', 1), at('2026-10-05', 2), at('2026-10-11', 3), at('2026-10-12', 4), at('2026-10-13', 5)];

  it('toma los primeros N de cada semana (de lunes a domingo)', () => {
    assert.deepEqual(limitPerWeek(entries, 2).map(e => e.value), [1, 2, 4, 5]);
    assert.deepEqual(limitPerWeek(entries, 1).map(e => e.value), [1, 4]);
  });

  it('sin límite quedan todos', () => {
    assert.equal(limitPerWeek(entries, null).length, 5);
  });
});

describe('código de invitación', () => {
  it('8 caracteres sin los ambiguos (0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      assert.equal(code.length, INVITE_CODE_LENGTH);
      assert.doesNotMatch(code, /[01OIL]/);
    }
  });

  it('normaliza lo que escribe el usuario', () => {
    assert.equal(normalizeInviteCode(' abcd-efgh '), 'ABCDEFGH');
    assert.equal(normalizeInviteCode(undefined), '');
  });
});

describe('validación de grupos', () => {
  it('nombre obligatorio; límite semanal de 1 a 50 o null', () => {
    assert.deepEqual(validateGroupCreate({ name: ' Los pibes ', weeklyLimit: 3 }).data, { name: 'Los pibes', weeklyLimit: 3 });
    assert.ok(validateGroupCreate({}).fields.name);
    assert.ok(validateGroupCreate({ name: 'a', weeklyLimit: 51 }).fields.weeklyLimit);
    assert.ok(validateGroupCreate({ name: 'a', weeklyLimit: '3' }).fields.weeklyLimit);
    assert.deepEqual(validateGroupUpdate({ weeklyLimit: null }).data, { weeklyLimit: null });
    assert.ok(validateGroupUpdate({}).error);
  });
});

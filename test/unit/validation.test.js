import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTaskCreate,
  validateTaskUpdate,
  validateMonthQuery,
  checkDateOrder,
  parseId
} from '../../src/utiles/validation/tasks.js';

const valid = { title: 'Estudiar', startDate: '2026-09-10' };

describe('validateTaskCreate', () => {
  it('acepta lo mínimo y aplica valores por defecto', () => {
    const { data, fields } = validateTaskCreate(valid);
    assert.deepEqual(fields, {});
    assert.equal(data.priority, 'normal');
    assert.equal(data.endDate.toISOString(), data.startDate.toISOString()); // un solo día
  });

  it('endDate vacío equivale a una tarea de un día', () => {
    const { data, fields } = validateTaskCreate({ ...valid, endDate: '' });
    assert.deepEqual(fields, {});
    assert.equal(data.endDate.toISOString(), '2026-09-10T00:00:00.000Z');
  });

  it('exige título y fecha de inicio', () => {
    const { fields } = validateTaskCreate({});
    assert.ok(fields.title);
    assert.ok(fields.startDate);
  });

  it('recorta espacios y trata un título de solo espacios como vacío', () => {
    assert.equal(validateTaskCreate({ ...valid, title: '  Hola  ' }).data.title, 'Hola');
    assert.ok(validateTaskCreate({ ...valid, title: '   ' }).fields.title);
  });

  it('aplica los límites de longitud', () => {
    assert.ok(validateTaskCreate({ ...valid, title: 'x'.repeat(101) }).fields.title);
    assert.ok(validateTaskCreate({ ...valid, description: 'x'.repeat(1001) }).fields.description);
    assert.ok(validateTaskCreate({ ...valid, category: 'x'.repeat(31) }).fields.category);
    assert.deepEqual(validateTaskCreate({ ...valid, title: 'x'.repeat(100) }).fields, {});
  });

  it('convierte descripción y categoría vacías en null', () => {
    const { data } = validateTaskCreate({ ...valid, description: '  ', category: '' });
    assert.equal(data.description, null);
    assert.equal(data.category, null);
  });

  it('solo acepta prioridades de la lista', () => {
    assert.equal(validateTaskCreate({ ...valid, priority: 'alta' }).data.priority, 'alta');
    assert.ok(validateTaskCreate({ ...valid, priority: 'urgente' }).fields.priority);
  });

  it('done tiene que ser booleano estricto', () => {
    assert.equal(validateTaskCreate({ ...valid, done: true }).data.done, true);
    for (const done of ['true', 1, null]) {
      assert.ok(validateTaskCreate({ ...valid, done }).fields.done, String(done));
    }
  });

  it('rechaza fin anterior al inicio', () => {
    assert.ok(validateTaskCreate({ ...valid, endDate: '2026-09-01' }).fields.endDate);
  });

  it('ignora campos que no están en la whitelist (userId, id)', () => {
    const { data } = validateTaskCreate({ ...valid, userId: 99, id: 5, createdAt: 'x' });
    assert.equal('userId' in data, false);
    assert.equal('id' in data, false);
    assert.equal('createdAt' in data, false);
  });

  it('devuelve todos los errores juntos, no solo el primero', () => {
    const { fields } = validateTaskCreate({ title: '', startDate: 'mal', priority: 'x', done: 'si' });
    assert.deepEqual(Object.keys(fields).sort(), ['done', 'priority', 'startDate', 'title']);
  });
});

describe('validateTaskUpdate', () => {
  it('todos los campos son opcionales pero se validan si vienen', () => {
    assert.deepEqual(validateTaskUpdate({ done: true }).fields, {});
    assert.ok(validateTaskUpdate({ title: '' }).fields.title);
    assert.ok(validateTaskUpdate({ endDate: '' }).fields.endDate);
  });

  it('no aplica valores por defecto', () => {
    const { data } = validateTaskUpdate({ done: true });
    assert.deepEqual(data, { done: true });
  });

  it('marca como error un PATCH sin campos válidos', () => {
    assert.ok(validateTaskUpdate({}).error);
    assert.ok(validateTaskUpdate({ userId: 2 }).error);
  });
});

describe('checkDateOrder', () => {
  it('agrega error solo si el fin es anterior al inicio', () => {
    const a = new Date('2026-09-01T00:00:00Z');
    const b = new Date('2026-09-10T00:00:00Z');
    assert.deepEqual(checkDateOrder(a, b, {}), {});
    assert.deepEqual(checkDateOrder(a, a, {}), {});
    assert.ok(checkDateOrder(b, a, {}).endDate);
  });
});

describe('parseId', () => {
  it('acepta enteros positivos y rechaza el resto', () => {
    assert.equal(parseId('7'), 7);
    for (const value of ['abc', '0', '-1', '1.5', '']) {
      assert.equal(parseId(value), null, value);
    }
  });
});

describe('validateMonthQuery', () => {
  it('acepta año y mes válidos', () => {
    assert.deepEqual(validateMonthQuery({ year: '2026', month: '9' }).fields, {});
  });

  it('rechaza mes fuera de 1-12, año fuera de rango o faltantes', () => {
    assert.ok(validateMonthQuery({ year: '2026', month: '13' }).fields.month);
    assert.ok(validateMonthQuery({ year: '1800', month: '1' }).fields.year);
    const { fields } = validateMonthQuery({});
    assert.ok(fields.year && fields.month);
  });
});

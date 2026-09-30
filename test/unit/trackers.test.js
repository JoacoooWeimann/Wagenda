import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrackerCreate, validateTrackerUpdate, validateEntry } from '../../src/utiles/validation/trackers.js';
import { trackerSummary } from '../../src/utiles/trackers.js';

describe('validateTrackerCreate / validateTrackerUpdate', () => {
  it('acepta nombre y campos opcionales', () => {
    const { data, fields } = validateTrackerCreate({ name: ' Rating Premier ', unit: 'pts', higherIsBetter: true, type: 'videojuego' });
    assert.deepEqual(fields, {});
    assert.deepEqual(data, { name: 'Rating Premier', unit: 'pts', higherIsBetter: true, type: 'videojuego' });
  });

  it('el nombre es obligatorio al crear y opcional al editar', () => {
    assert.ok(validateTrackerCreate({}).fields.name);
    assert.deepEqual(validateTrackerUpdate({ unit: 'kg' }).data, { unit: 'kg' });
    assert.ok(validateTrackerUpdate({}).error);
  });

  it('rechaza textos largos, tipos inválidos y booleanos que no lo son', () => {
    assert.ok(validateTrackerCreate({ name: 'x'.repeat(41) }).fields.name);
    assert.ok(validateTrackerCreate({ name: 'a', unit: 'x'.repeat(11) }).fields.unit);
    assert.ok(validateTrackerCreate({ name: 'a', type: 'deporte' }).fields.type);
    assert.ok(validateTrackerCreate({ name: 'a', higherIsBetter: 1 }).fields.higherIsBetter);
    assert.deepEqual(validateTrackerUpdate({ type: null }).data, { type: null }); // null quita la categoría
  });
});

describe('validateEntry', () => {
  it('fecha y valor obligatorios; nota opcional', () => {
    const { data, fields } = validateEntry({ date: '2026-10-05', value: 82.5, note: ' ok ' });
    assert.deepEqual(fields, {});
    assert.equal(data.value, 82.5);
    assert.equal(data.note, 'ok');
    assert.ok(validateEntry({ date: '2026-10-05' }).fields.value);
  });

  it('el valor tiene que ser un número finito', () => {
    for (const value of ['80', NaN, Infinity, 1e10, true]) {
      assert.ok(validateEntry({ date: '2026-10-05', value }).fields.value, String(value));
    }
  });

  it('en una sesión el valor es opcional', () => {
    const { data, fields } = validateEntry({ date: '2026-10-05' }, { valueRequired: false });
    assert.deepEqual(fields, {});
    assert.equal(data.value, undefined);
  });
});

describe('trackerSummary', () => {
  const entries = [
    { value: 80, date: 'd1' }, { value: 85, date: 'd2' }, { value: 85, date: 'd3' }, { value: 83, date: 'd4' }
  ];

  it('último, mejor marca (la primera vez que se logró) y variación', () => {
    assert.deepEqual(trackerSummary(entries, true), {
      count: 4, last: { value: 83, date: 'd4' }, best: { value: 85, date: 'd2' }, change: 3
    });
  });

  it('con higherIsBetter false la mejor es la menor', () => {
    assert.deepEqual(trackerSummary(entries, false).best, { value: 80, date: 'd1' });
  });

  it('sin registros', () => {
    assert.deepEqual(trackerSummary([], true), { count: 0, last: null, best: null, change: null });
  });
});

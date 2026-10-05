import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freeSlots, mergeIntervals, overlaps, minutesToTime, timeToMinutes, weekdayOf } from '../../src/utiles/schedule/slots.js';
import { validateWindow, validateRoutineCreate, validateRoutineUpdate } from '../../src/utiles/validation/week.js';

const iv = (s, e) => ({ startMinute: s, endMinute: e });
const h = (hours) => hours * 60;

describe('intervalos y huecos libres', () => {
  it('overlaps: tocarse en el borde no es pisarse', () => {
    assert.equal(overlaps(iv(h(9), h(10)), iv(h(10), h(11))), false);
    assert.equal(overlaps(iv(h(9), h(11)), iv(h(10), h(12))), true);
  });

  it('mergeIntervals une lo que se pisa o se toca', () => {
    assert.deepEqual(mergeIntervals([iv(600, 700), iv(540, 610), iv(700, 720), iv(800, 900)]),
      [iv(540, 720), iv(800, 900)]);
  });

  it('freeSlots: la franja menos lo ocupado', () => {
    // franja 7–23; trabajo 9–17; cursada 18–22
    assert.deepEqual(freeSlots(iv(h(7), h(23)), [iv(h(9), h(17)), iv(h(18), h(22))]),
      [iv(h(7), h(9)), iv(h(17), h(18)), iv(h(22), h(23))]);
  });

  it('freeSlots con margen: deja aire alrededor de lo ocupado', () => {
    assert.deepEqual(freeSlots(iv(h(7), h(23)), [iv(h(9), h(17))], 15),
      [iv(h(7), h(9) - 15), iv(h(17) + 15, h(23))]);
  });

  it('freeSlots: ocupado fuera de la franja no cuenta, y todo ocupado deja nada', () => {
    assert.deepEqual(freeSlots(iv(h(8), h(12)), [iv(h(6), h(7)), iv(h(20), h(21))]), [iv(h(8), h(12))]);
    assert.deepEqual(freeSlots(iv(h(8), h(12)), [iv(h(7), h(13))]), []);
  });

  it('HH:MM <-> minutos y día de la semana', () => {
    assert.equal(minutesToTime(545), '09:05');
    assert.equal(timeToMinutes('17:30'), 1050);
    assert.equal(timeToMinutes('24:00'), 1440);
    for (const bad of ['24:30', '9:00', '12:60', '', null]) assert.equal(timeToMinutes(bad), null, String(bad));
    assert.equal(weekdayOf(new Date('2026-10-05T00:00:00Z')), 0); // lunes
    assert.equal(weekdayOf(new Date('2026-10-11T00:00:00Z')), 6); // domingo
  });
});

describe('validación de Mi semana', () => {
  it('franja: minutos 0–1440 y el fin después del inicio', () => {
    assert.deepEqual(validateWindow(iv(420, 1380)).data, iv(420, 1380));
    assert.ok(validateWindow(iv(600, 600)).fields.endMinute);
    assert.ok(validateWindow(iv(-1, 600)).fields.startMinute);
    assert.ok(validateWindow({}).fields.startMinute);
  });

  it('bloque de rutina: título, días, horario y seguimiento opcional', () => {
    const { data, fields } = validateRoutineCreate({ title: ' Trabajo ', weekdays: [4, 0, 1, 0], ...iv(540, 1020), trackerId: 3 });
    assert.deepEqual(fields, {});
    assert.deepEqual(data, { title: 'Trabajo', weekdays: [0, 1, 4], ...iv(540, 1020), trackerId: 3 });
    const bad = validateRoutineCreate({ title: '', weekdays: [7], ...iv(600, 600) });
    assert.deepEqual(Object.keys(bad.fields).sort(), ['endMinute', 'title', 'weekdays']);
  });

  it('al editar, solo lo que viene; el orden con solo una hora lo controla el controller', () => {
    assert.deepEqual(validateRoutineUpdate({ endMinute: 600 }).data, { endMinute: 600 });
    assert.ok(validateRoutineUpdate({ weekday: 9 }).fields.weekday);
    assert.ok(validateRoutineUpdate({}).error);
  });
});

describe('bloques que cruzan la medianoche', () => {
  it('splitOvernight: dos tramos, uno en cada día (el domingo sigue en el lunes)', async () => {
    const { splitOvernight } = await import('../../src/utiles/schedule/slots.js');
    assert.deepEqual(splitOvernight({ weekday: 4, startMinute: h(22), endMinute: h(6) }),
      [{ weekday: 4, startMinute: h(22), endMinute: 1440 }, { weekday: 5, startMinute: 0, endMinute: h(6) }]);
    assert.deepEqual(splitOvernight({ weekday: 6, startMinute: h(23), endMinute: h(1) })[1].weekday, 0);
    assert.deepEqual(splitOvernight({ weekday: 0, startMinute: h(20), endMinute: 0 }), [{ weekday: 0, startMinute: h(20), endMinute: 1440 }]);
    assert.deepEqual(splitOvernight({ weekday: 0, startMinute: h(9), endMinute: h(17) }), [{ weekday: 0, startMinute: h(9), endMinute: h(17) }]);
  });

  it('la validación del bloque acepta un fin anterior al inicio, pero no igual', () => {
    assert.deepEqual(validateRoutineCreate({ title: 'Noche', weekdays: [4], startMinute: h(22), endMinute: h(6) }).fields, {});
    assert.ok(validateRoutineCreate({ title: 'x', weekdays: [4], startMinute: h(6), endMinute: h(6) }).fields.endMinute);
  });
});

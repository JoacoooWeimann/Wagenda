import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickSlot, createCalendar, idealDayIndexes, placeWeekSessions, splitSittings
} from '../../../src/utiles/planning/schedule.js';
import { generatePlan } from '../../../src/utiles/planning/index.js';
import { buildWeeks } from '../../../src/utiles/planning/weeks.js';
import { parseDateOnly } from '../../../src/utiles/dates.js';

const d = parseDateOnly;
const key = (date) => date.toISOString().slice(0, 10);
const h = (hours) => hours * 60;
const iv = (s, e) => ({ startMinute: s, endMinute: e });

// Semana tipo: disponible 8–23 todos los días; trabajo L–V 9–17
const windows = Array.from({ length: 7 }, () => iv(h(8), h(23)));
const work = [0, 1, 2, 3, 4].map(weekday => ({ weekday, ...iv(h(9), h(17)) }));
const agenda = (extra = {}) => ({ windows, routine: work, busy: {}, ...extra });

describe('pickSlot', () => {
  const free = [iv(h(8), h(9)), iv(h(17) + 15, h(23))];

  it('el primer hueco dentro del horario preferido', () => {
    assert.deepEqual(pickSlot(free, 60, 'noche'), iv(h(19), h(20)));
    assert.deepEqual(pickSlot(free, 60, 'tarde'), iv(h(17) + 15, h(18) + 15));
    assert.deepEqual(pickSlot(free, 60, 'manana'), iv(h(8), h(9)));
  });

  it('si en la preferencia no entra, cualquier hueco del día; si tampoco, null', () => {
    assert.deepEqual(pickSlot([iv(h(8), h(9))], 60, 'noche'), iv(h(8), h(9)));
    assert.equal(pickSlot([iv(h(8), h(8) + 30)], 60, 'cualquiera'), null);
  });
});

describe('ubicación en la semana', () => {
  it('idealDayIndexes reparte parejo', () => {
    assert.deepEqual(idealDayIndexes(7, 3), [1, 3, 5]);
    assert.deepEqual(idealDayIndexes(7, 1), [3]);
    assert.deepEqual(idealDayIndexes(2, 3), [0, 1, 1]); // más sesiones que días: se repiten
  });

  it('3 sesiones de 60 a la tarde: días parejos, después del trabajo y con margen', () => {
    const [week] = buildWeeks(d('2026-10-05'), d('2026-10-11')); // lunes a domingo
    const sessions = Array.from({ length: 3 }, () => ({ title: 'x', minutes: 60 }));
    const { tasks, unplaced } = placeWeekSessions(week, sessions, createCalendar(agenda()), 'tarde');
    assert.equal(unplaced, 0);
    assert.deepEqual(tasks.map(t => [key(t.startDate), t.startMinute, t.endMinute]), [
      ['2026-10-06', h(17) + 15, h(18) + 15], // martes, 15 min después del trabajo
      ['2026-10-08', h(17) + 15, h(18) + 15], // jueves
      ['2026-10-10', h(12), h(13)]            // sábado: sin trabajo, desde que empieza la tarde
    ]);
  });

  it('si el día ideal no tiene lugar, pasa al día siguiente que sí', () => {
    const [week] = buildWeeks(d('2026-10-05'), d('2026-10-11'));
    // el jueves está todo ocupado (además del trabajo, una cursada 17–23)
    const busy = { '2026-10-08': [iv(h(8), h(9)), iv(h(17), h(23))] };
    const { tasks } = placeWeekSessions(week, [{ title: 'x', minutes: 60 }], createCalendar(agenda({ busy })), 'noche');
    assert.deepEqual([key(tasks[0].startDate), tasks[0].startMinute], ['2026-10-09', h(19)]); // viernes
  });

  it('lo ya ubicado ocupa lugar: dos sesiones el mismo día no se pisan', () => {
    const [week] = buildWeeks(d('2026-10-10'), d('2026-10-10')); // un solo día (sábado)
    const sessions = [{ title: 'a', minutes: 60 }, { title: 'b', minutes: 60 }];
    const { tasks } = placeWeekSessions(week, sessions, createCalendar(agenda()), 'noche');
    assert.deepEqual(tasks.map(t => t.startMinute), [h(19), h(20) + 15]);
  });

  it('sin lugar en toda la semana: queda sin horario en su día ideal y se cuenta', () => {
    const [week] = buildWeeks(d('2026-10-05'), d('2026-10-06'));
    const full = Array.from({ length: 7 }, () => iv(h(9), h(10)));
    const { tasks, unplaced } = placeWeekSessions(week, [{ title: 'x', minutes: 120 }],
      createCalendar({ windows: full, routine: [], busy: {} }), 'cualquiera');
    assert.equal(unplaced, 1);
    assert.equal(tasks[0].startMinute, undefined);
    assert.equal(key(tasks[0].startDate), '2026-10-06');
  });

  it('splitSittings: sentadas parejas de hasta el máximo, redondeadas a 5', () => {
    assert.deepEqual(splitSittings(120, 60), [60, 60]);
    assert.deepEqual(splitSittings(100, 60), [50, 50]);
    assert.deepEqual(splitSittings(45, 60), [45]);
    assert.deepEqual(splitSittings(130, 60), [45, 45, 45]);
  });
});

describe('generatePlan con horarios', () => {
  const fases = {
    title: 'Fuerza', type: 'fisico', strategy: 'fases',
    startDate: d('2026-10-05'), deadline: d('2026-11-01'), // 4 semanas
    sessionsPerWeek: 3, sessionMinutes: 60, timePreference: 'noche'
  };

  it('fases: las sesiones de cada semana quedan con día y horario, pendientes', () => {
    const plan = generatePlan(fases, agenda());
    assert.deepEqual(plan.warnings, []);
    const sessions = plan.weeks[0].tasks.filter(t => t.kind === 'sesion');
    assert.equal(sessions.length, 3);
    assert.ok(sessions.every(t => t.startMinute === h(19) && t.endMinute === h(20)));
    assert.ok(sessions.every(t => key(t.startDate) === key(t.endDate)));
  });

  it('contenido: cada contenido en sentadas según lo que lleva; la cuota cuenta sentadas', () => {
    const plan = generatePlan({
      title: 'Álgebra', type: 'academico', strategy: 'divisible',
      startDate: d('2026-10-05'), deadline: d('2026-11-08'), reviewWeek: true,
      contents: [{ name: 'Unidad', count: 6, minutes: 120 }], sessionMinutes: 60, timePreference: 'tarde'
    }, agenda());
    const week1 = plan.weeks[0];
    assert.deepEqual(week1.tasks.map(t => t.title), ['Unidad 1 · 1/2', 'Unidad 1 · 2/2', 'Unidad 2 · 1/2', 'Unidad 2 · 2/2']);
    assert.equal(week1.target, 4);
    assert.ok(week1.tasks.every(t => t.startMinute !== null));
    assert.deepEqual(plan.weeks.at(-1).tasks.filter(t => t.kind !== 'hito').map(t => t.title),
      ['Repaso general · 1/2', 'Repaso general · 2/2']);
  });

  it('avisa las semanas con sesiones sin lugar', () => {
    const tight = { windows: Array.from({ length: 7 }, () => iv(h(9), h(10))), routine: [], busy: {} };
    const plan = generatePlan({ ...fases, sessionMinutes: 90 }, tight);
    assert.equal(plan.warnings.length, 4);
    assert.match(plan.warnings[0], /Semana 1: 3 sesiones sin lugar/);
  });

  it('sin sessionMinutes, el plan es el de siempre (sin horarios)', () => {
    const plan = generatePlan({ ...fases, sessionMinutes: undefined }, agenda());
    assert.deepEqual(plan.weeks[0].tasks, []);
  });
});

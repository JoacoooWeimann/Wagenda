import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestedStrategy, typeLabel, todayKey, dayMonth, daysBetweenKeys,
  goalStatus, deadlineText, progressFromWeeks, percent, buildGoalPayload,
  withWeekDone, weekSummary, paceOf, countNoun, calendarLink
} from '../../src/client/utiles/goals.js';

const iso = (k) => `${k}T00:00:00.000Z`;
const goal = {
  startDate: iso('2026-10-05'),
  deadline: iso('2026-10-25'),
  weeks: [
    { number: 1, startDate: iso('2026-10-05'), endDate: iso('2026-10-11'), label: 'Diagnóstico' },
    { number: 2, startDate: iso('2026-10-12'), endDate: iso('2026-10-18'), label: 'Práctica' },
    { number: 3, startDate: iso('2026-10-19'), endDate: iso('2026-10-25'), label: 'Evaluación' }
  ]
};

describe('helpers de objetivos (cliente)', () => {
  it('estrategia sugerida y etiqueta por tipo', () => {
    assert.equal(suggestedStrategy('fisico'), 'fases');
    assert.equal(suggestedStrategy('academico'), 'divisible');
    assert.equal(typeLabel('videojuego'), 'Videojuego');
  });

  it('todayKey usa la fecha local y dayMonth formatea dd/mm', () => {
    assert.equal(todayKey(new Date(2026, 8, 5, 23, 30)), '2026-09-05');
    assert.equal(dayMonth(iso('2026-10-05')), '05/10');
  });

  it('daysBetweenKeys cruza meses y años', () => {
    assert.equal(daysBetweenKeys('2026-09-26', '2026-11-10'), 45);
    assert.equal(daysBetweenKeys('2026-12-31', '2027-01-01'), 1);
    assert.equal(daysBetweenKeys('2026-10-10', '2026-10-08'), -2);
  });

  it('goalStatus: por empezar, semana actual y finalizado', () => {
    assert.deepEqual(goalStatus(goal, '2026-10-01'), { kind: 'upcoming', text: 'Empieza el 05/10' });
    assert.equal(goalStatus(goal, '2026-10-05').text, 'Semana 1 de 3 · Diagnóstico');
    assert.equal(goalStatus(goal, '2026-10-18').text, 'Semana 2 de 3 · Práctica');
    assert.equal(goalStatus(goal, '2026-10-25').text, 'Semana 3 de 3 · Evaluación');
    assert.equal(goalStatus(goal, '2026-10-26').kind, 'finished');
  });

  it('goalStatus: un objetivo cerrado muestra su cierre, no la semana', () => {
    const closedAt = new Date(2026, 9, 12, 15, 30).toISOString(); // 12/10 hora local
    assert.deepEqual(goalStatus({ ...goal, status: 'logrado', closedAt }, '2026-10-14'), { kind: 'closed', text: '✔ Logrado el 12/10' });
    assert.equal(goalStatus({ ...goal, status: 'abandonado', closedAt }, '2026-10-14').text, 'Abandonado');
    assert.equal(goalStatus({ ...goal, status: 'activo', closedAt: null }, '2026-10-14').kind, 'active');
  });

  it('deadlineText', () => {
    assert.equal(deadlineText(goal, '2026-10-20'), 'faltan 5 días');
    assert.equal(deadlineText(goal, '2026-10-24'), 'falta 1 día');
    assert.equal(deadlineText(goal, '2026-10-25'), 'vence hoy');
    assert.equal(deadlineText(goal, '2026-10-26'), 'venció hace 1 día');
    assert.equal(deadlineText(goal, '2026-10-30'), 'venció hace 5 días');
  });

  it('withWeekDone cuenta lo hecho sin el hito', () => {
    const [week] = withWeekDone([{ target: 2, tasks: [
      { done: true, kind: 'sesion' }, { done: false, kind: 'tarea' }, { done: true, kind: 'hito' }
    ] }]);
    assert.equal(week.done, 1);
  });

  it('cumplimiento: el exceso de una semana no compensa otra', () => {
    const weeks = [{ done: 5, target: 3 }, { done: 1, target: 3 }];
    assert.deepEqual(progressFromWeeks(weeks), { done: 4, total: 6 });
    assert.equal(percent({ done: 2, total: 3 }), 67);
    assert.equal(percent({ done: 0, total: 0 }), 0);
  });

  it('weekSummary: futura, en curso y los tres cierres', () => {
    const week = (done) => ({ ...goal.weeks[1], done, target: 3 }); // 12/10 a 18/10
    assert.equal(weekSummary(week(0), '2026-10-11', 'fases').text, 'Cuota: 3 sesiones');
    assert.equal(weekSummary(week(1), '2026-10-14', 'fases').text, 'Llevás 1 de 3 · quedan 4 días');
    assert.equal(weekSummary(week(1), '2026-10-18', 'fases').text, 'Llevás 1 de 3 · último día');
    assert.deepEqual(weekSummary(week(3), '2026-10-19', 'fases'), { state: 'met', text: '✔ Cuota cumplida (3/3)' });
    assert.equal(weekSummary(week(4), '2026-10-19', 'fases').state, 'exceeded');
    assert.equal(weekSummary(week(2), '2026-10-19', 'fases').text, '✖ Te faltó 1 sesión (2/3)');
    assert.equal(weekSummary(week(0), '2026-10-19', 'divisible').text, '✖ Te faltaron 3 tareas (0/3)');
  });

  it('paceOf: solo cuentan las semanas cerradas', () => {
    const weeks = goal.weeks.map((w, i) => ({ ...w, target: 3, done: [3, 1, 0][i] }));
    // hoy 14/10: cerrada solo la semana 1 (cumplida)
    assert.deepEqual(paceOf(weeks, '2026-10-14'), { expected: 3, behind: 0, markerPercent: 33 });
    // hoy 20/10: cerradas 1 y 2; a la 2 le faltaron 2
    assert.deepEqual(paceOf(weeks, '2026-10-20'), { expected: 6, behind: 2, markerPercent: 67 });
    // antes de empezar no se espera nada
    assert.equal(paceOf(weeks, '2026-10-01').expected, 0);
  });

  it('countNoun', () => {
    assert.equal(countNoun('fases', 1), 'sesión');
    assert.equal(countNoun('fases', 2), 'sesiones');
    assert.equal(countNoun('divisible', 2), 'tareas');
  });

  it('buildGoalPayload manda solo los parámetros de la estrategia', () => {
    const form = {
      title: 'X', description: '', type: 'academico', strategy: 'divisible',
      startDate: '2026-10-05', deadline: '2026-11-08',
      contents: [{ name: 'Unidad', count: '6' }, { name: 'TP', count: '' }],
      reviewWeek: false, sessionsPerWeek: '3'
    };
    const divisible = buildGoalPayload(form);
    assert.deepEqual(divisible.contents, [{ name: 'Unidad', count: 6 }, { name: 'TP', count: undefined }]);
    assert.equal(divisible.reviewWeek, false);
    assert.equal('sessionsPerWeek' in divisible, false);

    const fases = buildGoalPayload({ ...form, strategy: 'fases' });
    assert.equal(fases.sessionsPerWeek, 3);
    assert.equal('contents' in fases, false);
  });

  it('calendarLink apunta al mes más útil', () => {
    assert.equal(calendarLink(goal, '2026-09-20'), '/calendar?year=2026&month=10'); // por empezar
    assert.equal(calendarLink(goal, '2026-10-14'), '/calendar?year=2026&month=10'); // en curso
    assert.equal(calendarLink({ ...goal, deadline: iso('2026-11-20') }, '2026-11-02'), '/calendar?year=2026&month=11');
    assert.equal(calendarLink(goal, '2027-01-03'), '/calendar?year=2026&month=10'); // terminado
    const closedAt = new Date(2027, 0, 3, 12).toISOString(); // cerrado después del plazo
    assert.equal(calendarLink({ ...goal, status: 'logrado', closedAt }, '2027-01-03'), '/calendar?year=2026&month=10');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestedStrategy, typeLabel, todayKey, dayMonth, daysBetweenKeys,
  goalStatus, deadlineText, progressFromWeeks, percent, buildGoalPayload
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

  it('deadlineText', () => {
    assert.equal(deadlineText(goal, '2026-10-20'), 'faltan 5 días');
    assert.equal(deadlineText(goal, '2026-10-24'), 'falta 1 día');
    assert.equal(deadlineText(goal, '2026-10-25'), 'vence hoy');
    assert.equal(deadlineText(goal, '2026-10-26'), 'venció hace 1 día');
    assert.equal(deadlineText(goal, '2026-10-30'), 'venció hace 5 días');
  });

  it('progreso y porcentaje', () => {
    const weeks = [{ tasks: [{ done: true }, { done: false }] }, { tasks: [{ done: true }] }];
    assert.deepEqual(progressFromWeeks(weeks), { done: 2, total: 3 });
    assert.equal(percent({ done: 2, total: 3 }), 67);
    assert.equal(percent({ done: 0, total: 0 }), 0);
  });

  it('buildGoalPayload manda solo los parámetros de la estrategia', () => {
    const form = {
      title: 'X', description: '', type: 'academico', strategy: 'divisible',
      startDate: '2026-10-05', deadline: '2026-11-08',
      totalUnits: '6', unitName: '', reviewWeek: false, sessionsPerWeek: '3'
    };
    const divisible = buildGoalPayload(form);
    assert.equal(divisible.totalUnits, 6);
    assert.equal(divisible.reviewWeek, false);
    assert.equal('sessionsPerWeek' in divisible, false);

    const fases = buildGoalPayload({ ...form, strategy: 'fases' });
    assert.equal(fases.sessionsPerWeek, 3);
    assert.equal('totalUnits' in fases, false);

    assert.equal(buildGoalPayload({ ...form, totalUnits: '' }).totalUnits, undefined);
  });
});

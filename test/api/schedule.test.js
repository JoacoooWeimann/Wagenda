import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/server.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.stop(); });
beforeEach(async () => { await ctx.reset(); });

async function ok(promise, status = 200) {
  const res = await promise;
  assert.equal(res.status, status, JSON.stringify(res.body));
  return res.body;
}
const h = (hours) => hours * 60;
const key = (iso) => iso.slice(0, 10);
const fases = (extra = {}) => ({
  title: 'Fuerza', type: 'fisico', strategy: 'fases',
  startDate: '2026-10-05', deadline: '2026-11-01', sessionsPerWeek: 3,
  sessionMinutes: 60, timePreference: 'tarde', ...extra
});
const overlaps = (a, b) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

describe('objetivos planificados con horarios', () => {
  beforeEach(async () => {
    // Trabajo L–V 9–17 y cursada martes y jueves 17–21
    await ok(ctx.request('POST', '/api/routine', { title: 'Trabajo', weekdays: [0, 1, 2, 3, 4], startMinute: h(9), endMinute: h(17) }), 201);
    await ok(ctx.request('POST', '/api/routine', { title: 'Cursada', weekdays: [1, 3], startMinute: h(17), endMinute: h(21) }), 201);
  });

  it('las sesiones caen en huecos libres: no pisan la rutina ni otras tareas con horario', async () => {
    // el miércoles ya hay algo de 17:30 a 19:00
    await ok(ctx.request('POST', '/api/tasks', { title: 'Dentista', startDate: '2026-10-07', startMinute: h(17) + 30, endMinute: h(19) }), 201);

    const goal = await ok(ctx.request('POST', '/api/goals', fases()), 201);
    assert.deepEqual([goal.sessionMinutes, goal.timePreference], [60, 'tarde']);

    const { routine } = await ok(ctx.request('GET', '/api/week'));
    const sessions = goal.weeks.flatMap(w => w.tasks).filter(t => t.kind === 'sesion');
    assert.equal(sessions.length, goal.weeks.reduce((n, w) => n + w.target, 0));
    for (const s of sessions) {
      assert.equal(s.done, false);
      assert.equal(s.endMinute - s.startMinute, 60);
      const weekday = (new Date(s.startDate).getUTCDay() + 6) % 7;
      for (const block of routine.filter(b => b.weekday === weekday)) assert.ok(!overlaps(s, block), `${key(s.startDate)} pisa ${block.title}`);
    }
    const wednesday = sessions.filter(s => key(s.startDate) === '2026-10-07');
    assert.ok(wednesday.every(s => !overlaps(s, { startMinute: h(17) + 30, endMinute: h(19) })));
  });

  it('la vista previa muestra horarios y avisa lo que no entra, sin guardar nada', async () => {
    // franja de 9 a 10 todos los días, sesiones de 90: no entran nunca
    for (let d = 0; d < 7; d++) await ok(ctx.request('PUT', `/api/week/windows/${d}`, { startMinute: h(9), endMinute: h(10) }));
    const preview = await ok(ctx.request('POST', '/api/goals/preview', fases({ sessionMinutes: 90 })));
    assert.equal(preview.warnings.length, 4);
    assert.equal(await ctx.prisma.goal.count(), 0);
  });

  it('las sesiones planificadas se tildan y cuentan para la cuota', async () => {
    const goal = await ok(ctx.request('POST', '/api/goals', fases()), 201);
    const [first] = goal.weeks[0].tasks;
    await ok(ctx.request('PATCH', `/api/tasks/${first.id}`, { done: true }));
    const after = await ok(ctx.request('GET', `/api/goals/${goal.id}`));
    assert.equal(after.weeks[0].done, 1);
  });

  it('cambiar el plazo: al extender se ubican las sesiones nuevas; al acortar se descartan las pendientes quitadas', async () => {
    const goal = await ok(ctx.request('POST', '/api/goals', fases()), 201);
    const sessionsOf = (g) => g.weeks.flatMap(w => w.tasks).filter(t => t.kind === 'sesion');

    const longer = await ok(ctx.request('PUT', `/api/goals/${goal.id}/deadline`, { deadline: '2026-11-15', today: '2026-10-01' }));
    assert.equal(longer.weeks.length, 6);
    const added = longer.weeks.slice(4).flatMap(w => w.tasks).filter(t => t.kind === 'sesion');
    assert.equal(added.length, longer.weeks[4].target + longer.weeks[5].target);
    assert.ok(added.every(t => t.startMinute !== null));
    assert.deepEqual(longer.warnings, []);

    const shorter = await ok(ctx.request('PUT', `/api/goals/${goal.id}/deadline`, { deadline: '2026-10-18', today: '2026-10-01' }));
    assert.equal(shorter.weeks.length, 2);
    assert.equal(sessionsOf(shorter).length, shorter.weeks[0].target + shorter.weeks[1].target);
  });

  it('un objetivo sin duración de sesión se planifica como siempre (sin horarios)', async () => {
    const goal = await ok(ctx.request('POST', '/api/goals', fases({ sessionMinutes: undefined })), 201);
    assert.equal(goal.sessionMinutes, null);
    assert.deepEqual(goal.weeks[0].tasks, []);
  });
});

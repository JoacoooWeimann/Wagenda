import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutColumns, agendaRange, buildDayAgenda } from '../../src/client/utiles/agenda.js';

const iv = (id, s, e) => ({ id, startMinute: s, endMinute: e });

describe('agenda del día (cliente)', () => {
  it('layoutColumns: lo que se superpone va en columnas; lo que no, ocupa todo el ancho', () => {
    const out = layoutColumns([iv('a', 540, 600), iv('b', 570, 630), iv('c', 700, 760)]);
    const by = Object.fromEntries(out.map(o => [o.id, [o.column, o.columns]]));
    assert.deepEqual(by, { a: [0, 2], b: [1, 2], c: [0, 1] });
  });

  it('layoutColumns: reutiliza una columna que quedó libre dentro del grupo', () => {
    const out = layoutColumns([iv('a', 540, 720), iv('b', 540, 600), iv('c', 610, 660)]);
    const by = Object.fromEntries(out.map(o => [o.id, o.column]));
    assert.deepEqual(by, { a: 0, b: 1, c: 1 });
    assert.ok(out.every(o => o.columns === 2));
  });

  it('agendaRange se estira si hay algo fuera de la franja', () => {
    assert.deepEqual(agendaRange({ startMinute: 480, endMinute: 1380 }, [iv('x', 360, 420)]), { startMinute: 360, endMinute: 1380 });
  });

  it('buildDayAgenda: la tarea de una rutina hecha marca su bloque y no aparece como tarea', () => {
    const agenda = buildDayAgenda({
      window: { startMinute: 480, endMinute: 1380 },
      routine: [{ id: 3, title: 'Gimnasio', startMinute: 480, endMinute: 600 }],
      tasks: [
        { id: 9, title: 'Gimnasio', startMinute: 480, endMinute: 600, done: true, routineBlockId: 3 },
        { id: 10, title: 'Viejo', startMinute: 700, endMinute: 760, done: true, routineBlockId: 99 } // de un bloque borrado o de otro día
      ]
    });
    const routineItem = agenda.items.find(i => i.type === 'routine');
    assert.equal(routineItem.doneTask.id, 9);
    assert.deepEqual(agenda.items.filter(i => i.type === 'task').map(i => i.task.id), [10]);
  });

  it('buildDayAgenda: rutina + tareas con horario, sin horario aparte, y huecos libres de al menos 30 min', () => {
    const agenda = buildDayAgenda({
      window: { startMinute: 480, endMinute: 1380 },          // 8–23
      routine: [{ id: 1, title: 'Trabajo', startMinute: 540, endMinute: 1020 }], // 9–17
      tasks: [
        { id: 7, title: 'Estudiar', startMinute: 1020, endMinute: 1080, done: false }, // 17–18
        { id: 8, title: 'Comprar', startMinute: null, endMinute: null, done: false }
      ]
    });
    assert.deepEqual(agenda.items.map(i => i.type), ['routine', 'task']);
    assert.deepEqual(agenda.untimed.map(t => t.id), [8]);
    assert.deepEqual(agenda.free, [{ startMinute: 480, endMinute: 540 }, { startMinute: 1080, endMinute: 1380 }]);
  });
});

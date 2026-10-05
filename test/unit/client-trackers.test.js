import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, changeInfo, sparklinePoints, buildTrackerPayload, groupByBoard } from '../../src/client/utiles/trackers.js';

describe('utilidades de seguimientos (cliente)', () => {
  it('formatValue', () => {
    assert.equal(formatValue(82.5, 'kg'), '82,5 kg');
    assert.equal(formatValue(80, null), '80');
    assert.equal(formatValue(1 / 3, 'min'), '0,33 min');
  });

  it('changeInfo según higherIsBetter', () => {
    assert.deepEqual(changeInfo({ count: 3, change: 5 }, true, 'kg'), { text: '+5 kg', kind: 'up' });
    assert.deepEqual(changeInfo({ count: 3, change: -2 }, false, 'min'), { text: '−2 min', kind: 'up' });
    assert.deepEqual(changeInfo({ count: 3, change: -2 }, true, ''), { text: '−2', kind: 'down' });
    assert.equal(changeInfo({ count: 1, change: 0 }, true).kind, 'neutral');
  });

  it('sparklinePoints usa el tiempo real en X y el valor en Y', () => {
    const entries = [
      { date: '2026-10-01T00:00:00.000Z', value: 10 },
      { date: '2026-10-03T00:00:00.000Z', value: 20 },
      { date: '2026-10-11T00:00:00.000Z', value: 15 }
    ];
    assert.deepEqual(sparklinePoints(entries, 108, 48, 4), [
      { x: 4, y: 44 }, { x: 24, y: 4 }, { x: 104, y: 24 }
    ]);
    assert.deepEqual(sparklinePoints([entries[0]], 100, 40), [{ x: 50, y: 20 }]);
    assert.deepEqual(sparklinePoints([], 100, 40), []);
  });

  it('buildTrackerPayload: sin tablero es null; con tablero, el id numérico', () => {
    assert.equal(buildTrackerPayload({ name: 'a', kind: 'medicion', unit: '', higherIsBetter: true, boardId: '' }).boardId, null);
    assert.equal(buildTrackerPayload({ name: 'a', kind: 'medicion', unit: '', higherIsBetter: true, boardId: '3' }).boardId, 3);
    const activity = buildTrackerPayload({ name: 'Facultad', kind: 'actividad', unit: 'kg', higherIsBetter: false, boardId: '' });
    assert.deepEqual(activity, { name: 'Facultad', kind: 'actividad', boardId: null }); // sin unidad ni "mejor es"
  });

  it('groupByBoard: secciones en el orden de los tableros y los sueltos aparte', () => {
    const boards = [{ id: 2, name: 'CS2' }, { id: 1, name: 'Gimnasio' }];
    const trackers = [{ id: 10, boardId: 1 }, { id: 11, boardId: null }, { id: 12, boardId: 2 }, { id: 13, boardId: 1 }];
    const { sections, loose } = groupByBoard(boards, trackers);
    assert.deepEqual(sections.map(s => [s.board.name, s.trackers.map(t => t.id)]), [['CS2', [12]], ['Gimnasio', [10, 13]]]);
    assert.deepEqual(loose.map(t => t.id), [11]);
    assert.deepEqual(groupByBoard([], []).sections, []);
  });
});

describe('actividad (cliente)', () => {
  it('weeklyActivity: últimas N semanas de lunes a domingo, la última es la de hoy', async () => {
    const { weeklyActivity } = await import('../../src/client/utiles/trackers.js');
    const at = (k, count) => ({ date: `${k}T00:00:00.000Z`, count });
    // hoy: miércoles 14/10; esta semana va del lunes 12 al domingo 18
    const activity = [at('2026-09-01', 4), at('2026-10-05', 1), at('2026-10-11', 2), at('2026-10-12', 3), at('2026-10-14', 1)];
    const result = weeklyActivity(activity, '2026-10-14', 3);
    assert.deepEqual(result.weeks, [
      { label: '28/9', count: 0 },
      { label: '5/10', count: 3 },  // 5 y 11 (domingo)
      { label: '12/10', count: 4 }
    ]);
    assert.equal(result.thisWeek, 4);
    assert.equal(result.total, 11); // el histórico incluye lo de septiembre
  });

  it('groupTrackerOptions: sin tablero primero, después por tablero', async () => {
    const { groupTrackerOptions } = await import('../../src/client/utiles/trackers.js');
    const options = [
      { id: 1, name: 'Press', board: { id: 2, name: 'Gimnasio' } },
      { id: 2, name: 'Facultad', board: null },
      { id: 3, name: 'Rating', board: { id: 1, name: 'CS2' } },
      { id: 4, name: 'Sentadilla', board: { id: 2, name: 'Gimnasio' } }
    ];
    const { loose, groups } = groupTrackerOptions(options);
    assert.deepEqual(loose.map(o => o.id), [2]);
    assert.deepEqual(groups.map(g => [g.name, g.options.map(o => o.id)]), [['CS2', [3]], ['Gimnasio', [1, 4]]]);
  });
});

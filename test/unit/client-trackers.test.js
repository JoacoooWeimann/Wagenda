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
    assert.equal(buildTrackerPayload({ name: 'a', unit: '', higherIsBetter: true, boardId: '' }).boardId, null);
    assert.equal(buildTrackerPayload({ name: 'a', unit: '', higherIsBetter: true, boardId: '3' }).boardId, 3);
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

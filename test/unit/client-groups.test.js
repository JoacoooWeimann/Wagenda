import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sortRanking, rankingValue, inviteLink, shareableBoards } from '../../src/client/utiles/groups.js';

const row = (username, values) => ({
  user: { username },
  summary: values.length === 0
    ? { count: 0, last: null, best: null, change: null }
    : {
        count: values.length,
        last: { value: values.at(-1) },
        best: { value: Math.max(...values) },
        change: values.at(-1) - values[0]
      }
});

describe('ranking (cliente)', () => {
  const rows = [row('joaco', [80, 85]), row('lucia', [50, 70]), row('tomi', []), row('ana', [90])];
  const order = (mode, hib = true) => sortRanking(rows, mode, hib).map(r => r.user.username);

  it('por mejor marca, último y mejora; sin registros al final', () => {
    assert.deepEqual(order('best'), ['ana', 'joaco', 'lucia', 'tomi']);
    assert.deepEqual(order('last'), ['ana', 'joaco', 'lucia', 'tomi']);
    assert.deepEqual(order('change'), ['lucia', 'joaco', 'ana', 'tomi']);
  });

  it('si menos es mejor, se invierte', () => {
    assert.deepEqual(order('last', false), ['lucia', 'joaco', 'ana', 'tomi']);
  });

  it('rankingValue', () => {
    assert.equal(rankingValue(rows[0].summary, 'best'), 85);
    assert.equal(rankingValue(rows[1].summary, 'change'), 20);
    assert.equal(rankingValue(rows[2].summary, 'last'), null);
  });
});

describe('utilidades de grupos (cliente)', () => {
  it('inviteLink', () => {
    assert.equal(inviteLink('ABCD2345', 'http://localhost:3000'), 'http://localhost:3000/groups?join=ABCD2345');
  });

  it('shareableBoards: originales que no están compartidos en el grupo', () => {
    const boards = [{ id: 1, sharedBy: null }, { id: 2, sharedBy: { username: 'x' } }, { id: 3, sharedBy: null }];
    const group = { shares: [{ board: { id: 1 } }] };
    assert.deepEqual(shareableBoards(boards, group).map(b => b.id), [3]);
  });
});

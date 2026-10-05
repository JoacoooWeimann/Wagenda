import { useState, useEffect } from 'react';
import { getRanking } from '../../utiles/api.js';
import { RANKING_MODES, sortRanking, rankingValue, modeFor } from '../../utiles/groups.js';
import { formatValue } from '../../utiles/trackers.js';

// Ranking de un seguimiento compartido: primero la actividad de todo el
// seguimiento (tareas hechas en el gimnasio), después un bloque por ítem. El
// orden de los ítems (mejor marca, último, mejora, actividad) se elige acá; el
// servidor solo manda los números.
export default function Ranking({ groupId, shareId, onError }) {
  const [ranking, setRanking] = useState(null);
  const [mode, setMode] = useState('best');

  useEffect(() => {
    getRanking(groupId, shareId).then(setRanking).catch(err => onError(`No se pudo cargar el ranking: ${err.message}`));
  }, [groupId, shareId]);

  if (!ranking) return <p className="goals-empty">Cargando ranking…</p>;

  const show = (row, unit, rowMode) => {
    const value = rankingValue(row, rowMode);
    if (value === null) return '—';
    if (rowMode === 'activity') return `${value} ${value === 1 ? 'tarea' : 'tareas'}`;
    const text = formatValue(Math.abs(value), unit);
    return rowMode === 'change' ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}` : text;
  };

  const rows = (list, rowMode, unit, higherIsBetter) => (
    <ol>
      {sortRanking(list, rowMode, higherIsBetter).map((row, i) => (
        <li key={row.user.id} className={row.isMe ? 'group-ranking-me' : ''}>
          <span className="group-ranking-pos">{rankingValue(row, rowMode) !== null ? `${i + 1}.` : ''}</span>
          <span className="group-ranking-user">{row.user.name} <small>@{row.user.username}</small></span>
          <strong>{show(row, unit, rowMode)}</strong>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="group-ranking">
      {ranking.weeklyLimit && <p className="goal-meta">Cuenta hasta {ranking.weeklyLimit} por semana</p>}

      <div className="group-ranking-tracker">
        <h4><i className="bi bi-lightning-charge" aria-hidden="true" /> Actividad en {ranking.tracker.name} <small>· tareas hechas</small></h4>
        {rows(ranking.activity, 'activity')}
      </div>

      {ranking.items.length > 0 && (
        <div className="group-ranking-tabs" role="tablist">
          {RANKING_MODES.map(m => (
            <button key={m.value} type="button" role="tab" aria-selected={mode === m.value}
              className={mode === m.value ? 'goal-btn-primary goal-btn-small' : 'goal-btn goal-btn-small'}
              onClick={() => setMode(m.value)}>{m.label}</button>
          ))}
        </div>
      )}

      {ranking.items.map(item => {
        const rowMode = modeFor(item, mode);
        return (
          <div key={item.id} className="group-ranking-tracker">
            <h4>
              {item.name}{item.unit && <small> ({item.unit})</small>}
              {rowMode === 'activity' && <small> · tareas hechas</small>}
            </h4>
            {rows(item.rows, rowMode, item.unit, item.higherIsBetter)}
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { getRanking } from '../../utiles/api.js';
import { RANKING_MODES, sortRanking, rankingValue } from '../../utiles/groups.js';
import { formatValue } from '../../utiles/trackers.js';

// Ranking de un tablero compartido: un bloque por seguimiento. El orden (mejor
// marca, último, mejora) se elige acá; el servidor solo manda los resúmenes.
export default function Ranking({ groupId, shareId, onError }) {
  const [ranking, setRanking] = useState(null);
  const [mode, setMode] = useState('best');

  useEffect(() => {
    getRanking(groupId, shareId).then(setRanking).catch(err => onError(`No se pudo cargar el ranking: ${err.message}`));
  }, [groupId, shareId]);

  if (!ranking) return <p className="goals-empty">Cargando ranking…</p>;
  if (ranking.trackers.length === 0) return <p className="goals-empty">El tablero todavía no tiene seguimientos.</p>;

  const show = (summary, unit) => {
    const value = rankingValue(summary, mode);
    if (value === null) return '—';
    const text = formatValue(Math.abs(value), unit);
    return mode === 'change' ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${text}` : text;
  };

  return (
    <div className="group-ranking">
      <div className="group-ranking-tabs" role="tablist">
        {RANKING_MODES.map(m => (
          <button key={m.value} type="button" role="tab" aria-selected={mode === m.value}
            className={mode === m.value ? 'goal-btn-primary goal-btn-small' : 'goal-btn goal-btn-small'}
            onClick={() => setMode(m.value)}>{m.label}</button>
        ))}
        {ranking.weeklyLimit && <span className="goal-meta">Cuenta hasta {ranking.weeklyLimit} registros por semana</span>}
      </div>

      {ranking.trackers.map(tracker => (
        <div key={tracker.id} className="group-ranking-tracker">
          <h4>{tracker.name}{tracker.unit && <small> ({tracker.unit})</small>}</h4>
          <ol>
            {sortRanking(tracker.rows, mode, tracker.higherIsBetter).map((row, i) => (
              <li key={row.user.id} className={row.isMe ? 'group-ranking-me' : ''}>
                <span className="group-ranking-pos">{row.summary.count > 0 ? `${i + 1}.` : ''}</span>
                <span className="group-ranking-user">{row.user.name} <small>@{row.user.username}</small></span>
                <strong>{show(row.summary, tracker.unit)}</strong>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

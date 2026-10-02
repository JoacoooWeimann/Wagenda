import { useState } from 'react';
import { addEntry, deleteEntry, updateTracker } from '../../utiles/api.js';
import { dayMonth } from '../../utiles/goals.js';
import { formatValue, changeInfo } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';
import Sparkline from './Sparkline.jsx';
import TrackerForm from './TrackerForm.jsx';

// Un seguimiento: resumen (último, mejor marca, variación), evolución, carga
// rápida de un registro e historial. Cada cambio devuelve o recarga el
// seguimiento desde el servidor, que es quien calcula el resumen.
export default function TrackerCard({ tracker, boards, today, onChange, onReload, onDelete, onError }) {
  const [entry, setEntry] = useState({ date: today, value: '', note: '' });
  const [entryErrors, setEntryErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { summary, unit, higherIsBetter } = tracker;
  // Copia de un tablero compartido: la estructura la define el dueño
  const isCopy = tracker.sourceTrackerId !== null;
  const change = changeInfo(summary, higherIsBetter, unit);
  const fmt = (v) => formatValue(v, unit);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addEntry(tracker.id, {
        date: entry.date,
        value: entry.value === '' ? undefined : Number(entry.value),
        note: entry.note
      });
      setEntry(en => ({ ...en, value: '', note: '' }));
      setEntryErrors({});
      await onReload(tracker.id);
    } catch (err) {
      setEntryErrors(err.fields || {});
      if (!err.fields || Object.keys(err.fields).length === 0) onError(`No se pudo registrar: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(id) {
    try {
      await deleteEntry(tracker.id, id);
      await onReload(tracker.id);
    } catch (err) {
      onError(`No se pudo borrar el registro: ${err.message}`);
    }
  }

  async function saveEdit(payload) {
    onChange(await updateTracker(tracker.id, payload)); // si falla, TrackerForm muestra los errores
    setEditing(false);
  }

  return (
    <article className="goal-card">
      <div className="goal-card-header">
        <h3>{tracker.name}</h3>
      </div>

      {editing ? (
        <TrackerForm tracker={tracker} boards={boards} onSave={saveEdit} onCancel={() => setEditing(false)} />
      ) : summary.count === 0 ? (
        <p className="goal-meta">Todavía no hay registros. Cargá el primero.</p>
      ) : (
        <div className="tracker-summary">
          <div>
            <span className="tracker-stat-label">Último</span>
            <strong>{fmt(summary.last.value)}</strong>
            <span className="tracker-stat-date">{dayMonth(summary.last.date)}</span>
          </div>
          <div>
            <span className="tracker-stat-label">Mejor marca</span>
            <strong>{fmt(summary.best.value)}</strong>
            <span className="tracker-stat-date">{dayMonth(summary.best.date)}</span>
          </div>
          <div>
            <span className="tracker-stat-label">Desde el inicio</span>
            <strong className={`tracker-change-${change.kind}`}>{change.text}</strong>
            <span className="tracker-stat-date">{summary.count} {summary.count === 1 ? 'registro' : 'registros'}</span>
          </div>
          <Sparkline entries={tracker.entries} label={`Evolución de ${tracker.name}`} />
        </div>
      )}

      <form className="goal-session-form tracker-entry-form" onSubmit={handleAdd} noValidate>
        <input type="date" value={entry.date} max={today} aria-label="Fecha del registro"
          className={entryErrors.date ? 'is-invalid' : ''}
          onChange={(e) => setEntry(en => ({ ...en, date: e.target.value }))} />
        <input type="number" step="any" placeholder={unit ? `Valor (${unit})` : 'Valor'} aria-label="Valor"
          className={entryErrors.value ? 'is-invalid' : ''} value={entry.value}
          onChange={(e) => setEntry(en => ({ ...en, value: e.target.value }))} />
        <input type="text" maxLength={200} placeholder="Nota (opcional)" aria-label="Nota" value={entry.note}
          onChange={(e) => setEntry(en => ({ ...en, note: e.target.value }))} />
        <button type="submit" className="goal-btn-primary" disabled={busy}>{busy ? 'Guardando…' : '+ Registrar'}</button>
        <FieldError message={entryErrors.value || entryErrors.date || entryErrors.note} />
      </form>

      <div className="goal-actions">
        {summary.count > 0 && (
          <button type="button" className="goal-btn" onClick={() => setShowHistory(h => !h)} aria-expanded={showHistory}>
            {showHistory ? 'Ocultar historial ▴' : 'Ver historial ▾'}
          </button>
        )}
        {!editing && !isCopy && <button type="button" className="goal-btn" onClick={() => setEditing(true)}>Editar</button>}
        {isCopy ? null : confirmingDelete ? (
          <span className="goal-confirm">
            ¿Borrar el seguimiento y sus registros?
            <button type="button" className="goal-btn-danger" onClick={() => onDelete(tracker.id)}>Borrar</button>
            <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(true)}>Borrar</button>
        )}
      </div>

      {showHistory && (
        <ul className="goal-week-tasks tracker-history">
          {[...tracker.entries].reverse().map(e => (
            <li key={e.id}>
              <span className="goal-task-date">{dayMonth(e.date)}</span>
              <strong>{fmt(e.value)}</strong>
              {e.note && <span className="tracker-note">{e.note}</span>}
              <button type="button" className="goal-task-remove" onClick={() => handleDeleteEntry(e.id)} aria-label="Borrar registro">✕</button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

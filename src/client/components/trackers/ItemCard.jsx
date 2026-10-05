import { useState } from 'react';
import { addEntry, deleteEntry, updateItem, deleteItem } from '../../utiles/api.js';
import { dayMonth } from '../../utiles/goals.js';
import { formatValue, changeInfo } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';
import Sparkline from './Sparkline.jsx';
import ActivitySummary from './ActivitySummary.jsx';
import ItemForm from './ItemForm.jsx';

// Un ítem de un seguimiento (un ejercicio, una materia):
//   - de medición: último valor, mejor marca, variación, evolución y carga rápida
//   - de actividad: tareas hechas por semana
// Uno de medición también muestra su actividad si tiene tareas vinculadas.
// Los cambios de estructura devuelven el seguimiento completo (onTrackerChange);
// los registros recargan el seguimiento (onReload), que es quien calcula los resúmenes.
export default function ItemCard({ item, noun, moveTo, readOnly, today, onTrackerChange, onReload, onError }) {
  const [entry, setEntry] = useState({ date: today, value: '', note: '' });
  const [entryErrors, setEntryErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { summary, unit, higherIsBetter } = item;
  const isMeasure = item.kind === 'medicion';
  const hasActivity = (item.activity ?? []).length > 0;
  const change = changeInfo(summary, higherIsBetter, unit);
  const fmt = (v) => formatValue(v, unit);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addEntry(item.id, { date: entry.date, value: entry.value === '' ? undefined : Number(entry.value), note: entry.note });
      setEntry(en => ({ ...en, value: '', note: '' }));
      setEntryErrors({});
      await onReload();
    } catch (err) {
      setEntryErrors(err.fields || {});
      if (!err.fields || Object.keys(err.fields).length === 0) onError(`No se pudo registrar: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry(id) {
    try {
      await deleteEntry(item.id, id);
      await onReload();
    } catch (err) {
      onError(`No se pudo borrar el registro: ${err.message}`);
    }
  }

  async function saveEdit(payload) {
    onTrackerChange(await updateItem(item.id, payload)); // si falla, ItemForm muestra los errores
    setEditing(false);
  }

  async function handleDelete() {
    try {
      onTrackerChange(await deleteItem(item.id));
    } catch (err) {
      onError(`No se pudo borrar: ${err.message}`);
      setConfirmingDelete(false);
    }
  }

  if (editing) {
    return (
      <article className="item-card">
        <ItemForm item={item} noun={noun} moveTo={moveTo} onSave={saveEdit} onCancel={() => setEditing(false)} />
      </article>
    );
  }

  return (
    <article className={`item-card item-${item.kind}`}>
      <div className="item-card-header">
        <h4>{item.name}</h4>
        <span className="item-kind">
          <i className={`bi ${isMeasure ? 'bi-graph-up' : 'bi-check2-square'}`} aria-hidden="true" />
          {isMeasure ? (unit ? ` ${unit}` : ' Medición') : ' Actividad'}
        </span>
      </div>

      {isMeasure && (summary.count === 0
        ? <p className="goal-meta">Todavía no hay registros.</p>
        : (
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
            <Sparkline entries={item.entries} label={`Evolución de ${item.name}`} />
          </div>
        ))}

      {(!isMeasure || hasActivity) && (
        <ActivitySummary activity={item.activity} today={today} label={`Tareas hechas por semana en ${item.name}`} />
      )}
      {!isMeasure && !hasActivity && (
        <p className="goal-meta">Elegí «{item.name}» en tus tareas: cada una que hagas suma acá.</p>
      )}

      {isMeasure && (
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
      )}

      <div className="goal-actions">
        {isMeasure && summary.count > 0 && (
          <button type="button" className="goal-btn goal-btn-small" onClick={() => setShowHistory(h => !h)} aria-expanded={showHistory}>
            {showHistory ? 'Ocultar historial ▴' : 'Ver historial ▾'}
          </button>
        )}
        {!readOnly && <button type="button" className="goal-btn goal-btn-small" onClick={() => setEditing(true)}>Editar</button>}
        {!readOnly && (confirmingDelete ? (
          <span className="goal-confirm">
            ¿Borrar {item.name} y sus registros?
            <button type="button" className="goal-btn-danger" onClick={handleDelete}>Borrar</button>
            <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="goal-btn goal-btn-small" onClick={() => setConfirmingDelete(true)}>Borrar</button>
        ))}
      </div>

      {showHistory && (
        <ul className="goal-week-tasks tracker-history">
          {[...item.entries].reverse().map(e => (
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

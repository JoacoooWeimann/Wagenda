import { useState } from 'react';
import { deadlineChangeNote } from '../../utiles/goals.js';
import { FieldError } from '../common.jsx';

// Cambio de fecha límite. El pasado no se toca: el mínimo es hoy (o el inicio,
// si todavía no empezó). La nota anticipa qué le pasa al plan.
export default function DeadlineForm({ goal, today, onSave, onCancel }) {
  const currentKey = goal.deadline.slice(0, 10);
  const startKey = goal.startDate.slice(0, 10);
  const [deadline, setDeadline] = useState(currentKey);
  const [fieldError, setFieldError] = useState(null);
  const [busy, setBusy] = useState(false);

  const changed = deadline && deadline !== currentKey;

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(deadline);
    } catch (err) {
      setFieldError(Object.values(err.fields || {})[0] || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="goal-form goal-deadline-form" onSubmit={handleSubmit} noValidate>
      <label>Nueva fecha límite
        <input type="date" value={deadline} min={today > startKey ? today : startKey}
          className={fieldError ? 'is-invalid' : ''}
          onChange={(e) => { setDeadline(e.target.value); setFieldError(null); }} />
        <FieldError message={fieldError} />
      </label>
      {changed && <p className="goal-meta">{deadlineChangeNote(goal, deadline)}</p>}
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy || !changed}>{busy ? 'Guardando…' : 'Cambiar plazo'}</button>
        <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

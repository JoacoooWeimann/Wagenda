import { useState } from 'react';
import { getGoal, updateTask } from '../../utiles/api.js';
import { typeLabel, goalStatus, deadlineText, dayMonth, progressFromWeeks, percent } from '../../utiles/goals.js';
import PlanWeeks from './PlanWeeks.jsx';

export default function GoalCard({ goal, today, onDelete, onError }) {
  const [detail, setDetail] = useState(null); // plan con tareas, se pide al desplegar
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Una vez cargado el detalle, el progreso se calcula de ahí: así refleja
  // las tareas marcadas en esta página sin volver a pedir la lista
  const progress = detail ? progressFromWeeks(detail.weeks) : goal.progress;
  const status = goalStatus(goal, today);

  async function toggleOpen() {
    if (!open && !detail) {
      try {
        setDetail(await getGoal(goal.id));
      } catch (err) {
        onError(`No se pudo cargar el plan: ${err.message}`);
        return;
      }
    }
    setOpen(o => !o);
  }

  async function toggleTask(task) {
    try {
      const updated = await updateTask(task.id, { done: !task.done });
      setDetail(d => ({
        ...d,
        weeks: d.weeks.map(w => ({ ...w, tasks: w.tasks.map(t => (t.id === updated.id ? updated : t)) }))
      }));
    } catch (err) {
      onError(`No se pudo actualizar la tarea: ${err.message}`);
    }
  }

  return (
    <article className="goal-card">
      <div className="goal-card-header">
        <h3>{goal.title}</h3>
        <span className="goal-type">{typeLabel(goal.type)}</span>
      </div>
      <p className="goal-meta">
        Fecha límite: {dayMonth(goal.deadline)} · {deadlineText(goal, today)}
      </p>
      {status.text && <p className={`goal-status goal-status-${status.kind}`}>{status.text}</p>}

      <div className="goal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(progress)}>
        <div className="goal-progress-bar" style={{ width: `${percent(progress)}%` }} />
      </div>
      <p className="goal-progress-text">{progress.done}/{progress.total} tareas ({percent(progress)}%)</p>

      <div className="goal-actions">
        <button type="button" className="goal-btn" onClick={toggleOpen} aria-expanded={open}>
          {open ? 'Ocultar plan ▴' : 'Ver plan ▾'}
        </button>
        {confirmingDelete ? (
          <span className="goal-confirm">
            ¿Borrar el objetivo y sus tareas?
            <button type="button" className="goal-btn-danger" onClick={() => onDelete(goal.id)}>Borrar</button>
            <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
          </span>
        ) : (
          <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(true)}>Borrar</button>
        )}
      </div>

      {open && detail && <PlanWeeks weeks={detail.weeks} onToggle={toggleTask} />}
    </article>
  );
}

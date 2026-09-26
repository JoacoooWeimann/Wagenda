import { useState } from 'react';
import { isMultiDay, shortDate } from '../../utiles/tasks.js';
import { COLOR_PRIORIDAD } from './constants.js';

// Una fila de la lista del día. Si la tarea pertenece a un plan, muestra la
// etiqueta del objetivo con link a la página de objetivos.
export default function TaskItem({ task, onToggle, onEdit, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const goalWeek = task.goalWeek;

  return (
    <li className={task.done ? 'calendar-task-done' : ''}>
      <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} aria-label={`Marcar ${task.title}`} />
      <span className="calendar-task-priority-dot" style={{ background: COLOR_PRIORIDAD[task.priority] }} />
      <div className="calendar-task-info" onClick={() => onEdit(task)}>
        <span>
          {task.title} {task.category && <em>({task.category})</em>}
          {isMultiDay(task) && (
            <span className="calendar-task-range"> · {shortDate(task.startDate)} → {shortDate(task.endDate)}</span>
          )}
        </span>
        {goalWeek && (
          <a className="calendar-task-goal" href="/goals" onClick={(e) => e.stopPropagation()}>
            {goalWeek.goal.title} · Sem {goalWeek.number}
          </a>
        )}
        {task.description && <span className="calendar-task-description">{task.description}</span>}
      </div>
      {confirming ? (
        <span className="calendar-task-confirm">
          <button type="button" className="calendar-task-confirm-delete" onClick={() => onRemove(task.id)}>Borrar</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} aria-label="Borrar tarea">✕</button>
      )}
    </li>
  );
}

import { useState } from 'react';
import { isMultiDay, shortDate, categoryColor } from '../../utiles/tasks.js';
import { ETIQUETA_PRIORIDAD } from './constants.js';

// Una tarea como mini-card: borde izquierdo del color de su prioridad, check
// redondo, categoría como etiqueta de color y chips con el objetivo, el rango de
// fechas o el tipo (sesión, fecha límite). Click en el contenido = editar.
// Las tareas de un objetivo cerrado son historial: no se marcan, editan ni borran.
export default function TaskItem({ task, onToggle, onEdit, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const goalWeek = task.goalWeek;
  const readOnly = goalWeek && goalWeek.goal.status !== 'activo';

  const classes = ['task-card', `task-priority-${task.priority}`];
  if (task.done) classes.push('is-done');
  if (readOnly) classes.push('is-readonly');

  return (
    <li className={classes.join(' ')}>
      <button
        type="button" role="checkbox" aria-checked={task.done} disabled={readOnly}
        className="task-check" onClick={() => onToggle(task)} aria-label={`Marcar ${task.title}`}
      >
        <i className="bi bi-check-lg" aria-hidden="true" />
      </button>

      <div className="task-body" onClick={() => !readOnly && onEdit(task)}
        title={readOnly ? undefined : 'Editar'}>
        <div className="task-title-row">
          <span className="task-title">{task.title}</span>
          {task.category && (
            <span className={`task-tag task-tag-${categoryColor(task.category)}`}>{task.category}</span>
          )}
        </div>

        {task.description && <p className="task-description">{task.description}</p>}

        <div className="task-chips">
          {task.priority === 'alta' && !task.done && (
            <span className="task-chip task-chip-alta"><i className="bi bi-exclamation-circle" aria-hidden="true" /> {ETIQUETA_PRIORIDAD.alta}</span>
          )}
          {task.kind === 'hito' && (
            <span className="task-chip task-chip-hito"><i className="bi bi-flag" aria-hidden="true" /> Fecha límite</span>
          )}
          {task.kind === 'sesion' && (
            <span className="task-chip"><i className="bi bi-lightning-charge" aria-hidden="true" /> Sesión</span>
          )}
          {isMultiDay(task) && (
            <span className="task-chip"><i className="bi bi-arrow-left-right" aria-hidden="true" /> {shortDate(task.startDate)} → {shortDate(task.endDate)}</span>
          )}
          {goalWeek && (
            <a className="task-chip task-chip-goal" href="/goals" onClick={(e) => e.stopPropagation()}>
              <i className="bi bi-bullseye" aria-hidden="true" /> {goalWeek.goal.title} · Sem {goalWeek.number}
            </a>
          )}
          {readOnly && <span className="task-chip"><i className="bi bi-lock" aria-hidden="true" /> Cerrado</span>}
        </div>
      </div>

      {readOnly ? null : confirming ? (
        <span className="task-confirm">
          <button type="button" className="task-confirm-delete" onClick={() => onRemove(task.id)}>Borrar</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancelar</button>
        </span>
      ) : (
        <button type="button" className="task-delete" onClick={() => setConfirming(true)} aria-label={`Borrar ${task.title}`}>
          <i className="bi bi-trash3" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

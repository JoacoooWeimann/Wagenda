import { dayMonth, weekSummary, countNoun } from '../../utiles/goals.js';

// Plan semana por semana.
// - Vista previa (sin `today`): cada semana muestra su cuota.
// - Plan de un objetivo (con `today`): muestra el resumen de la semana; las
//   tareas se pueden marcar (onToggle) y las sesiones borrar (onDeleteSession).
export default function PlanWeeks({ weeks, strategy, today, onToggle, onDeleteSession }) {
  return (
    <ol className="goal-weeks">
      {weeks.map(week => {
        const summary = today
          ? weekSummary(week, today, strategy)
          : { state: 'future', text: `Cuota: ${week.target} ${countNoun(strategy, week.target)}` };

        return (
          <li key={week.number}>
            <div className="goal-week-header">
              <strong>Sem {week.number}</strong>
              <span>{dayMonth(week.startDate)}–{dayMonth(week.endDate)}</span>
              <span className="goal-week-label">{week.label}</span>
              <span className={`goal-week-summary goal-week-${summary.state}`}>{summary.text}</span>
            </div>
            {week.tasks.length > 0 && (
              <ul className="goal-week-tasks">
                {week.tasks.map((task, i) => (
                  <TaskRow key={task.id ?? i} task={task} onToggle={onToggle} onDeleteSession={onDeleteSession} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TaskRow({ task, onToggle, onDeleteSession }) {
  const date = task.startDate === task.endDate
    ? dayMonth(task.startDate)
    : `${dayMonth(task.startDate)}–${dayMonth(task.endDate)}`;

  // Una sesión ya está hecha por definición: se borra, no se desmarca
  if (task.kind === 'sesion') {
    return (
      <li>
        <span>· {task.title}</span>
        <span className="goal-task-date">{date}</span>
        {onDeleteSession && (
          <button type="button" className="goal-task-remove" onClick={() => onDeleteSession(task)} aria-label="Borrar sesión">✕</button>
        )}
      </li>
    );
  }

  return (
    <li className={task.done ? 'goal-task-done' : ''}>
      {onToggle && (
        <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} aria-label={`Marcar ${task.title}`} />
      )}
      <span className={task.kind === 'hito' ? 'goal-task-deadline' : ''}>{task.title}</span>
      <span className="goal-task-date">{date}</span>
    </li>
  );
}

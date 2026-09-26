import { dayMonth } from '../../utiles/goals.js';

// Plan semana por semana. Se usa en la vista previa (solo lectura) y en el plan
// desplegado de un objetivo (con checkbox para marcar tareas: onToggle).
export default function PlanWeeks({ weeks, onToggle }) {
  return (
    <ol className="goal-weeks">
      {weeks.map(week => (
        <li key={week.number}>
          <div className="goal-week-header">
            <strong>Sem {week.number}</strong>
            <span>{dayMonth(week.startDate)}–{dayMonth(week.endDate)}</span>
            <span className="goal-week-label">{week.label}</span>
          </div>
          <ul className="goal-week-tasks">
            {week.tasks.map((task, i) => (
              <li key={task.id ?? i} className={task.done ? 'goal-task-done' : ''}>
                {onToggle && (
                  <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} aria-label={`Marcar ${task.title}`} />
                )}
                <span className={task.priority === 'alta' ? 'goal-task-deadline' : ''}>{task.title}</span>
                <span className="goal-task-date">
                  {task.startDate === task.endDate
                    ? dayMonth(task.startDate)
                    : `${dayMonth(task.startDate)}–${dayMonth(task.endDate)}`}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

import { shortDayTitle } from '../../utiles/calendar.js';
import { daySummary } from '../../utiles/tasks.js';

// Preview de ayer o mañana al costado de la card del día (solo en pantallas
// anchas). Es de solo lectura: toda la card es un botón que lleva a ese día,
// así el único lugar donde se edita es la card del centro.
export default function DayPreview({ date, label, tasks, side, onOpen }) {
  const summary = tasks ? daySummary(tasks) : null;
  const title = shortDayTitle(date);

  return (
    <button type="button" className={`day-preview day-preview-${side}`} onClick={onOpen}
      aria-label={`Ir a ${label.toLowerCase()}, ${title}`}>
      <span className="day-preview-label">
        {side === 'prev' && <i className="bi bi-chevron-left" aria-hidden="true" />}
        {label}
        {side === 'next' && <i className="bi bi-chevron-right" aria-hidden="true" />}
      </span>
      <span className="day-preview-title">{title}</span>

      {!summary
        ? <span className="day-preview-empty">Cargando…</span>
        : summary.total === 0
          ? <span className="day-preview-empty">Sin tareas</span>
          : (
            <>
              <ul>
                {summary.items.map(task => (
                  <li key={task.id} className={task.done ? 'is-done' : ''}>
                    <i className={`bi ${task.done ? 'bi-check-square' : 'bi-square'}`} aria-hidden="true" />
                    <span>{task.title}</span>
                  </li>
                ))}
              </ul>
              {summary.more > 0 && <span className="day-preview-more">y {summary.more} más</span>}
              <span className="day-preview-count">{summary.done} de {summary.total} hechas</span>
            </>
          )}
    </button>
  );
}

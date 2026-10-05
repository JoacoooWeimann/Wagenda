import { minutesToTime, durationText } from '../../utiles/week.js';
import { categoryColor } from '../../utiles/tasks.js';
import TaskItem from '../calendar/TaskItem.jsx';

// Agenda del día como lista cronológica compacta: la rutina (una fila tenue
// que se tilda si se hizo: "fui al gimnasio"), las tareas con horario (la mini-card de siempre, con la hora a
// la izquierda) y, entre medio, el tiempo libre ("1 h 30 min libre · +") para
// crear una tarea a esa hora. Las tareas sin horario van aparte (DayPanel).
export default function DayAgenda({ agenda, canMarkRoutine, onToggle, onToggleRoutine, onEdit, onRemove, onAddAt }) {
  // Orden por hora de inicio; a igual hora, la rutina antes que las tareas
  const order = { routine: 0, task: 1, free: 2 };
  const rows = [
    ...agenda.items.map(i => ({ ...i })),
    ...agenda.free.map(f => ({ type: 'free', id: `f${f.startMinute}`, ...f }))
  ].sort((a, b) => a.startMinute - b.startMinute || order[a.type] - order[b.type]);

  if (rows.length === 0) return null;

  return (
    <ul className="calendar-task-list agenda-list">
      {rows.map(row => {
        if (row.type === 'free') {
          return (
            <li key={row.id} className="agenda-free-row">
              <button type="button" onClick={() => onAddAt({ startMinute: row.startMinute, endMinute: Math.min(row.endMinute, row.startMinute + 60) })}>
                <span>{minutesToTime(row.startMinute)}</span>
                <span className="agenda-free-line">{durationText(row.endMinute - row.startMinute)} libre</span>
                <i className="bi bi-plus-lg" aria-hidden="true" />
              </button>
            </li>
          );
        }
        if (row.type === 'routine') {
          const { block, doneTask } = row;
          const done = doneTask !== null;
          return (
            <li key={row.id} className={`agenda-routine-row task-tag-${categoryColor(block.tracker?.name ?? block.title)}${done ? ' is-done' : ''}`}>
              <span className="agenda-time">{minutesToTime(row.startMinute)}</span>
              {/* Solo hoy o días pasados: no se puede haber ido a un día que no llegó */}
              {canMarkRoutine && (
                <button type="button" role="checkbox" aria-checked={done} className="task-check agenda-routine-check"
                  onClick={() => onToggleRoutine(block, doneTask)}
                  aria-label={done ? `Desmarcar ${block.title}` : `Marcar ${block.title} como hecho`}
                  title={block.tracker ? `Suma a ${block.tracker.name}` : 'Marcar como hecho'}>
                  <i className="bi bi-check-lg" aria-hidden="true" />
                </button>
              )}
              <span className="agenda-routine-title">
                <strong>{block.title}</strong>
                {block.tracker && block.tracker.name !== block.title && <small> · {block.tracker.name}</small>}
              </span>
              <span className="agenda-until">hasta {minutesToTime(row.endMinute === 1440 ? 0 : row.endMinute)}</span>
            </li>
          );
        }
        return (
          <TaskItem key={row.id} task={row.task} time={minutesToTime(row.startMinute)}
            onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />
        );
      })}
    </ul>
  );
}

import { minutesToTime, gridPosition, timeRange } from '../../utiles/week.js';
import { categoryColor } from '../../utiles/tasks.js';
import { trackerPath } from '../../utiles/trackers.js';

const PX_PER_MINUTE = 0.9; // 1 h = 54 px

// Línea de tiempo del día: la rutina (tenue, con el color de su seguimiento),
// las tareas con horario (se marcan y se editan como siempre) y los huecos
// libres, con un "+" para crear una tarea a esa hora.
export default function DayAgenda({ agenda, onToggle, onEdit, onAddAt }) {
  const { range } = agenda;
  const height = (range.endMinute - range.startMinute) * PX_PER_MINUTE;
  const pos = (i) => gridPosition(i, range);
  const firstHour = Math.ceil(range.startMinute / 60);
  const hours = Array.from({ length: Math.floor(range.endMinute / 60) - firstHour + 1 }, (_, i) => firstHour + i);

  // Horizontal: columnas para lo que se superpone
  const horizontal = (item) => ({
    left: `calc(${(item.column / item.columns) * 100}% + 2px)`,
    width: `calc(${100 / item.columns}% - 4px)`
  });

  return (
    <div className="agenda" style={{ height }}>
      {hours.map(h => (
        <div key={h} className="agenda-hour" style={{ top: `${pos({ startMinute: h * 60, endMinute: h * 60 }).top}%` }}>
          <span>{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}

      <div className="agenda-lane">
        {agenda.free.map(slot => {
          const p = pos(slot);
          return (
            <button key={slot.startMinute} type="button" className="agenda-free" style={{ top: `${p.top}%`, height: `${p.height}%` }}
              onClick={() => onAddAt({ startMinute: slot.startMinute, endMinute: Math.min(slot.endMinute, slot.startMinute + 60) })}
              aria-label={`Agregar una tarea a las ${minutesToTime(slot.startMinute)}`}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> {timeRange(slot, minutesToTime)} libre
            </button>
          );
        })}

        {agenda.items.map(item => {
          const p = pos(item);
          const style = { top: `${p.top}%`, height: `${p.height}%`, ...horizontal(item) };
          if (item.type === 'routine') {
            const { block } = item;
            return (
              <div key={item.id} className={`agenda-routine task-tag-${categoryColor(block.tracker?.name ?? block.title)}`} style={style}
                title={`${block.title} · ${timeRange(block, minutesToTime)} (rutina)`}>
                <strong>{block.title}</strong> <span>{timeRange(block, minutesToTime)}</span>
              </div>
            );
          }
          const { task } = item;
          return (
            <div key={item.id} className={`agenda-task task-priority-${task.priority}${task.done ? ' is-done' : ''}`} style={style}>
              <button type="button" role="checkbox" aria-checked={task.done} className="task-check"
                onClick={() => onToggle(task)} aria-label={`Marcar ${task.title}`}>
                <i className="bi bi-check-lg" aria-hidden="true" />
              </button>
              <button type="button" className="agenda-task-body" onClick={() => onEdit(task)} title="Editar">
                <strong>{task.title}</strong>
                <span>
                  {timeRange(task, minutesToTime)}
                  {task.tracker && ` · ${trackerPath(task.tracker, task.item)}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

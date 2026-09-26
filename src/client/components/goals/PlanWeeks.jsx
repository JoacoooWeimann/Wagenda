import { useState } from 'react';
import { dayMonth, weekSummary, countNoun } from '../../utiles/goals.js';

// Plan semana por semana.
// - Vista previa (sin `today`): cada semana muestra su cuota.
// - Plan de un objetivo (con `today`): resumen de la semana; tareas marcables
//   (onToggle) y sesiones borrables (onDeleteSession).
// - Modo edición (`edit` con los handlers): etiqueta y cuota de cada semana, y en
//   objetivos por contenido renombrar, mover, borrar y agregar contenidos.
export default function PlanWeeks({ weeks, strategy, today, onToggle, onDeleteSession, edit }) {
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
              {!edit && <span className="goal-week-label">{week.label}</span>}
              <span className={`goal-week-summary goal-week-${summary.state}`}>{summary.text}</span>
            </div>

            {/* key con etiqueta y cuota: si cambian (ej. por "aplicar a toda la fase"),
                React recrea el editor y su estado toma los valores nuevos */}
            {edit && (
              <WeekEditor
                key={`${week.id}-${week.label}-${week.target}`}
                week={week} strategy={strategy}
                onSave={(changes) => edit.onUpdateWeek(week, changes)}
              />
            )}

            {week.tasks.length > 0 && (
              <ul className="goal-week-tasks">
                {week.tasks.map((task, i) => (
                  edit && strategy === 'divisible' && task.kind !== 'sesion'
                    ? <EditableTaskRow key={`${task.id}-${task.title}`} task={task} week={week} weeks={weeks} edit={edit} />
                    : <TaskRow key={task.id ?? i} task={task} onToggle={onToggle} onDeleteSession={onDeleteSession} />
                ))}
              </ul>
            )}

            {edit && strategy === 'divisible' && <AddContent onAdd={(title) => edit.onAddTask(week, title)} />}
          </li>
        );
      })}
    </ol>
  );
}

function taskDate(task) {
  return task.startDate === task.endDate
    ? dayMonth(task.startDate)
    : `${dayMonth(task.startDate)}–${dayMonth(task.endDate)}`;
}

function TaskRow({ task, onToggle, onDeleteSession }) {
  // Una sesión ya está hecha por definición: se borra, no se desmarca
  if (task.kind === 'sesion') {
    return (
      <li>
        <span>· {task.title}</span>
        <span className="goal-task-date">{taskDate(task)}</span>
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
      <span className="goal-task-date">{taskDate(task)}</span>
    </li>
  );
}

// Etiqueta (y cuota, en fases) de una semana. "Aplicar a toda la fase" cambia
// todas las semanas con la misma etiqueta: así se renombra una fase entera.
function WeekEditor({ week, strategy, onSave }) {
  const [label, setLabel] = useState(week.label);
  const [target, setTarget] = useState(String(week.target));
  const [applyToPhase, setApplyToPhase] = useState(false);

  const changes = {};
  if (label.trim() !== week.label) changes.label = label;
  if (strategy === 'fases' && target !== String(week.target)) changes.target = target === '' ? undefined : Number(target);
  // La casilla solo modifica un cambio; por sí sola no es un cambio
  const dirty = Object.keys(changes).length > 0;

  function handleSubmit(e) {
    e.preventDefault();
    if (dirty) onSave({ ...changes, applyToPhase });
  }

  return (
    <form className="goal-week-editor" onSubmit={handleSubmit}>
      <input type="text" maxLength={50} value={label} onChange={(e) => setLabel(e.target.value)} aria-label={`Etiqueta de la semana ${week.number}`} />
      {strategy === 'fases' && (
        <label className="goal-week-target">Cuota
          <input type="number" min={0} max={14} value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
      )}
      <label className="goal-checkbox goal-week-apply">
        <input type="checkbox" checked={applyToPhase} onChange={(e) => setApplyToPhase(e.target.checked)} />
        Aplicar a todas las semanas de «{week.label}»
      </label>
      <button type="submit" className="goal-btn goal-btn-small" disabled={!dirty}>Guardar</button>
    </form>
  );
}

// Contenido editable: renombrar (Enter o al salir del campo), pasar a otra
// semana y borrar. El hito (fecha límite) solo se renombra.
function EditableTaskRow({ task, week, weeks, edit }) {
  const [title, setTitle] = useState(task.title);
  const [confirming, setConfirming] = useState(false);
  const isHito = task.kind === 'hito';

  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) edit.onRenameTask(task, trimmed);
    else setTitle(task.title);
  }

  return (
    <li className="goal-task-editable">
      <input
        type="text" maxLength={100} value={title} aria-label="Título"
        className={isHito ? 'goal-task-deadline' : ''}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      />
      {isHito ? (
        <span className="goal-task-date">{taskDate(task)}</span>
      ) : (
        <>
          <select
            value={week.id} aria-label="Semana"
            onChange={(e) => edit.onMoveTask(task, weeks.find(w => w.id === Number(e.target.value)))}
          >
            {weeks.map(w => <option key={w.id} value={w.id}>Sem {w.number}</option>)}
          </select>
          {confirming ? (
            <span className="goal-confirm">
              <button type="button" className="goal-btn-danger goal-btn-small" onClick={() => edit.onDeleteTask(task)}>Borrar</button>
              <button type="button" className="goal-btn goal-btn-small" onClick={() => setConfirming(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="goal-task-remove" onClick={() => setConfirming(true)} aria-label="Borrar contenido">✕</button>
          )}
        </>
      )}
    </li>
  );
}

function AddContent({ onAdd }) {
  const [title, setTitle] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle('');
  }

  return (
    <form className="goal-add-content" onSubmit={handleSubmit}>
      <input type="text" maxLength={100} placeholder="Nuevo contenido para esta semana" value={title}
        onChange={(e) => setTitle(e.target.value)} aria-label="Nuevo contenido" />
      <button type="submit" className="goal-btn goal-btn-small" disabled={!title.trim()}>+ Agregar</button>
    </form>
  );
}

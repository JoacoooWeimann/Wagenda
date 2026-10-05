import { useState } from 'react';
import { getGoal, updateGoal, changeDeadline, updateTask, deleteTask, logSession, updateWeek, addWeekTask } from '../../utiles/api.js';
import {
  typeLabel, goalStatus, deadlineText, dayMonth, withWeekDone, progressFromWeeks,
  paceOf, percent, countNoun, calendarLink, isClosed
} from '../../utiles/goals.js';
import PlanWeeks from './PlanWeeks.jsx';
import GoalInfoForm from './GoalInfoForm.jsx';
import DeadlineForm from './DeadlineForm.jsx';

export default function GoalCard({ goal, today, trackers, onChange, onDelete, onError }) {
  const [detail, setDetail] = useState(null); // plan con tareas, se pide al desplegar
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionValue, setSessionValue] = useState('');
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);

  // Con el plan cargado, `done` se recalcula de sus tareas: así la tarjeta refleja
  // lo que se marca en esta página sin volver a pedir la lista
  const weeks = detail ? withWeekDone(detail.weeks) : goal.weeks;
  const progress = progressFromWeeks(weeks);
  const pace = paceOf(weeks, today);
  const status = goalStatus(goal, today);
  const isFases = goal.strategy === 'fases';
  const closed = isClosed(goal); // solo lectura hasta que se reabra
  const noun = (n) => countNoun(goal.strategy, n);

  // Última fecha en la que se puede registrar: hoy, o la fecha límite si ya pasó
  const deadlineKey = goal.deadline.slice(0, 10);
  const maxSessionDate = today < deadlineKey ? today : deadlineKey;

  async function reload() {
    setDetail(await getGoal(goal.id));
  }

  async function toggleOpen() {
    if (!open && !detail) {
      try {
        await reload();
      } catch (err) {
        onError(`No se pudo cargar el plan: ${err.message}`);
        return;
      }
    }
    setOpen(o => !o);
  }

  function replaceTasks(fn) {
    setDetail(d => ({ ...d, weeks: d.weeks.map(w => ({ ...w, tasks: fn(w.tasks) })) }));
  }

  async function toggleTask(task) {
    try {
      const updated = await updateTask(task.id, { done: !task.done });
      replaceTasks(tasks => tasks.map(t => (t.id === updated.id ? updated : t)));
    } catch (err) {
      onError(`No se pudo actualizar la tarea: ${err.message}`);
    }
  }

  async function removeSession(task) {
    try {
      await deleteTask(task.id);
      replaceTasks(tasks => tasks.filter(t => t.id !== task.id));
    } catch (err) {
      onError(`No se pudo borrar la sesión: ${err.message}`);
    }
  }

  // Después de registrar se recarga el plan: el servidor decide en qué semana cae
  async function registerSession(e) {
    e.preventDefault();
    setLogging(true);
    try {
      // Con seguimiento vinculado, la medición es opcional: vacío = solo la sesión
      await logSession(goal.id, sessionDate, sessionValue === '' ? undefined : Number(sessionValue));
      setSessionValue('');
      await reload();
    } catch (err) {
      const fieldMessage = Object.values(err.fields || {})[0];
      onError(`No se pudo registrar la sesión: ${fieldMessage || err.message}`);
    } finally {
      setLogging(false);
    }
  }

  // Edición del plan: cada cambio es una operación chica validada por el servidor;
  // después se recarga el plan, porque el servidor recalcula semanas y cuotas.
  async function mutate(action, errorPrefix) {
    try {
      const result = await action();
      if (result?.weeks) setDetail(result); // updateWeek ya devuelve el objetivo completo
      else await reload();
    } catch (err) {
      const fieldMessage = Object.values(err.fields || {})[0];
      onError(`${errorPrefix}: ${fieldMessage || err.message}`);
    }
  }

  // Cambios en el objetivo en sí (datos, estado, plazo): el servidor devuelve el
  // objetivo completo con su plan; se actualizan la lista y el plan desplegado.
  function applyGoal(updated) {
    onChange(updated);
    if (detail) setDetail(updated);
  }

  async function changeStatus(newStatus) {
    try {
      applyGoal(await updateGoal(goal.id, { status: newStatus }));
      if (newStatus !== 'activo') setEditing(false);
    } catch (err) {
      onError(`No se pudo cambiar el estado: ${err.message}`);
    }
  }

  async function saveDeadline(deadline) {
    applyGoal(await changeDeadline(goal.id, deadline, today)); // si falla, DeadlineForm muestra el error
    setEditingDeadline(false);
  }

  async function saveInfo(changes) {
    applyGoal(await updateGoal(goal.id, changes)); // si falla, GoalInfoForm muestra los errores
    setEditingInfo(false);
  }

  const dateOnly = (iso) => iso.slice(0, 10);
  const edit = {
    onUpdateWeek: (week, changes) =>
      mutate(() => updateWeek(goal.id, week.id, changes), 'No se pudo editar la semana'),
    onRenameTask: (task, title) =>
      mutate(() => updateTask(task.id, { title }), 'No se pudo renombrar'),
    onMoveTask: (task, week) =>
      mutate(() => updateTask(task.id, { startDate: dateOnly(week.startDate), endDate: dateOnly(week.endDate) }), 'No se pudo mover'),
    onDeleteTask: (task) =>
      mutate(() => deleteTask(task.id), 'No se pudo borrar'),
    onAddTask: (week, title) =>
      mutate(() => addWeekTask(goal.id, week.id, title), 'No se pudo agregar')
  };

  return (
    <article className="goal-card">
      <div className="goal-card-header">
        <h3>{goal.title}</h3>
        <span className="goal-type">{typeLabel(goal.type)}</span>
      </div>
      {editingInfo && <GoalInfoForm goal={goal} trackers={trackers} onSave={saveInfo} onCancel={() => setEditingInfo(false)} />}
      {goal.description && !editingInfo && <p className="goal-description">{goal.description}</p>}
      {goal.item && !editingInfo && (
        <p className="goal-meta"><i className="bi bi-graph-up-arrow" aria-hidden="true" /> Suma a {goal.item.tracker.name} › {goal.item.name}</p>
      )}
      <p className="goal-meta">
        Fecha límite: {dayMonth(goal.deadline)} · {deadlineText(goal, today)}
      </p>
      {editingDeadline && (
        <DeadlineForm goal={goal} today={today} onSave={saveDeadline} onCancel={() => setEditingDeadline(false)} />
      )}
      {status.text && <p className={`goal-status goal-status-${status.kind}`}>{status.text}</p>}

      <div className="goal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(progress)}>
        <div className="goal-progress-bar" style={{ width: `${percent(progress)}%` }} />
        {pace.expected > 0 && (
          <div className="goal-progress-marker" style={{ left: `${pace.markerPercent}%` }} title="Dónde deberías estar hoy" />
        )}
      </div>
      <p className="goal-progress-text">
        {progress.done}/{progress.total} {noun(progress.total)} ({percent(progress)}%)
        {pace.expected > 0 && (
          pace.behind > 0
            ? <span className="goal-pace-behind"> · atrasado {pace.behind} {noun(pace.behind)}</span>
            : <span className="goal-pace-ok"> · al día</span>
        )}
      </p>

      {isFases && !closed && status.kind !== 'upcoming' && (
        <form className="goal-session-form" onSubmit={registerSession}>
          <input
            type="date" value={sessionDate} aria-label="Fecha de la sesión"
            min={goal.startDate.slice(0, 10)} max={maxSessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
          {goal.item?.kind === 'medicion' && (
            <input
              type="number" step="any" value={sessionValue} className="goal-session-value"
              placeholder={`${goal.item.name}${goal.item.unit ? ` (${goal.item.unit})` : ''}`}
              aria-label={`Medición de ${goal.item.tracker.name} › ${goal.item.name} (opcional)`}
              onChange={(e) => setSessionValue(e.target.value)}
            />
          )}
          <button type="submit" className="goal-btn-primary" disabled={logging}>
            {logging ? 'Registrando…' : '+ Registrar sesión'}
          </button>
        </form>
      )}

      <div className="goal-actions">
        <button type="button" className="goal-btn" onClick={toggleOpen} aria-expanded={open}>
          {open ? 'Ocultar plan ▴' : 'Ver plan ▾'}
        </button>
        {open && !closed && (
          <button type="button" className={editing ? 'goal-btn-primary' : 'goal-btn'} onClick={() => setEditing(e => !e)}>
            {editing ? 'Listo' : 'Editar plan'}
          </button>
        )}
        <a className="goal-btn" href={calendarLink(goal, today)}>Ver en calendario</a>
        {!editingInfo && <button type="button" className="goal-btn" onClick={() => setEditingInfo(true)}>Editar datos</button>}
        {!closed && !editingDeadline && (
          <button type="button" className="goal-btn" onClick={() => setEditingDeadline(true)}>Cambiar plazo</button>
        )}
        {closed ? (
          <button type="button" className="goal-btn" onClick={() => changeStatus('activo')}>Reabrir</button>
        ) : (
          <>
            <button type="button" className="goal-btn" onClick={() => changeStatus('logrado')}>✔ Logrado</button>
            <button type="button" className="goal-btn" onClick={() => changeStatus('abandonado')}>Abandonar</button>
          </>
        )}
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

      {open && detail && (
        <PlanWeeks
          weeks={weeks}
          strategy={goal.strategy}
          today={today}
          onToggle={closed ? undefined : toggleTask}
          onDeleteSession={closed ? undefined : removeSession}
          edit={editing && !closed ? edit : null}
        />
      )}
    </article>
  );
}

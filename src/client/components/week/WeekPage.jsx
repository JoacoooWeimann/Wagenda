import { useState, useEffect } from 'react';
import { getWeek, putWindow, createRoutine, updateRoutine, deleteRoutine, getTrackerOptions } from '../../utiles/api.js';
import { WEEKDAYS, GRID, gridPosition, gridHours, minutesToTime, timeToMinutes, timeRange, freeSlots, durationText } from '../../utiles/week.js';
import { categoryColor } from '../../utiles/tasks.js';
import { ErrorBanner } from '../common.jsx';
import RoutineForm from './RoutineForm.jsx';

// "Mi semana": la franja en la que estás disponible cada día y tu rutina fija.
// Con esto el planificador de objetivos sabe cuándo tenés tiempo libre.
// En pantallas anchas se ven los 7 días; en el celular, uno por vez.
export default function WeekPage() {
  const [week, setWeek] = useState(null);
  const [trackers, setTrackers] = useState([]);
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7); // hoy (lunes = 0)
  const [editing, setEditing] = useState(null); // null | { block } | { weekday } (nuevo)
  const [error, setError] = useState(null);

  useEffect(() => {
    getWeek().then(setWeek).catch(err => setError(`No se pudo cargar tu semana: ${err.message}`));
    getTrackerOptions().then(setTrackers).catch(() => setTrackers([]));
  }, []);

  async function saveBlock(payload) {
    const updated = editing.block ? await updateRoutine(editing.block.id, payload) : await createRoutine(payload);
    setWeek(updated); // si falla, RoutineForm muestra los errores
    setEditing(null);
  }

  async function removeBlock() {
    try {
      setWeek(await deleteRoutine(editing.block.id));
      setEditing(null);
    } catch (err) {
      setError(`No se pudo borrar: ${err.message}`);
    }
  }

  async function saveWindow(weekday, start, end) {
    try {
      setWeek(await putWindow(weekday, { startMinute: timeToMinutes(start), endMinute: timeToMinutes(end) }));
    } catch (err) {
      setError(`No se pudo guardar la franja: ${Object.values(err.fields || {})[0] || err.message}`);
    }
  }

  if (!week) return <div className="goals-container"><ErrorBanner message={error} onClose={() => setError(null)} /><p className="goals-empty">Cargando…</p></div>;

  const blocksOf = (weekday) => week.routine.filter(b => b.weekday === weekday);
  const freeOf = (weekday) => freeSlots(week.windows[weekday], blocksOf(weekday)).reduce((n, s) => n + s.endMinute - s.startMinute, 0);

  return (
    <div className="week-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Mi semana</h2>
          {!editing && (
            <button type="button" className="goal-btn-primary" onClick={() => setEditing({ weekday: day })}>
              <i className="bi bi-plus-lg" aria-hidden="true" /> Agregar a la rutina
            </button>
          )}
        </div>
        <p className="goals-empty">
          Marcá cuándo estás disponible cada día y tu rutina fija (trabajo, cursada, entrenamiento). Al crear un
          objetivo, sus sesiones se ubican en tu tiempo libre.
        </p>
        {editing && (
          <RoutineForm key={editing.block?.id ?? 'nuevo'} block={editing.block} initialWeekday={editing.weekday ?? day}
            trackers={trackers} onSave={saveBlock} onCancel={() => setEditing(null)}
            onDelete={editing.block ? removeBlock : null} />
        )}
      </section>

      {/* En el celular se elige el día con estas pestañas; en pantallas anchas se ven todos */}
      <div className="week-tabs" role="tablist">
        {WEEKDAYS.map((name, i) => (
          <button key={name} type="button" role="tab" aria-selected={day === i} className={day === i ? 'is-on' : ''}
            onClick={() => setDay(i)}>{name.slice(0, 3)}</button>
        ))}
      </div>

      <section className="goals-card week-grid-card">
        <div className="week-grid">
          <div className="week-hours" aria-hidden="true">
            {gridHours().map(h => <span key={h} style={{ top: `${gridPosition({ startMinute: h * 60, endMinute: h * 60 }).top}%` }}>{h}:00</span>)}
          </div>
          {WEEKDAYS.map((name, weekday) => {
            const window = week.windows[weekday];
            const win = gridPosition(window);
            return (
              <div key={name} className={`week-day${day === weekday ? ' is-selected' : ''}`}>
                <div className="week-day-header">
                  <strong>{name}</strong>
                  <WindowEditor window={window} onSave={(s, e) => saveWindow(weekday, s, e)} />
                  <span className="week-free">{durationText(freeOf(weekday))} libres</span>
                </div>
                <div className="week-day-body" onClick={(e) => { if (e.target === e.currentTarget) setEditing({ weekday }); }}>
                  {gridHours().map(h => <div key={h} className="week-hour-line" style={{ top: `${gridPosition({ startMinute: h * 60, endMinute: h * 60 }).top}%` }} />)}
                  <div className="week-window" style={{ top: `${win.top}%`, height: `${win.height}%` }} />
                  {blocksOf(weekday).map(block => {
                    const pos = gridPosition(block);
                    const color = categoryColor(block.tracker?.name ?? block.title);
                    return (
                      <button key={block.id} type="button" className={`week-block task-tag-${color}`}
                        style={{ top: `${pos.top}%`, height: `${pos.height}%` }}
                        onClick={() => setEditing({ block })} title={`${block.title} · ${timeRange(block, minutesToTime)}`}>
                        <strong>{block.title}</strong>
                        <span>{timeRange(block, minutesToTime)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="goal-meta week-legend">
          <span className="week-legend-window" /> Disponible · tocá un espacio vacío para agregar · tocá un bloque para editarlo
        </p>
      </section>
    </div>
  );
}

// "07:00 – 23:00" editable en el encabezado de cada día
function WindowEditor({ window, onSave }) {
  const [start, setStart] = useState(minutesToTime(window.startMinute));
  const [end, setEnd] = useState(minutesToTime(window.endMinute));
  const dirty = start !== minutesToTime(window.startMinute) || end !== minutesToTime(window.endMinute);
  return (
    <span className="week-window-editor">
      <input type="time" value={start} aria-label="Disponible desde" onChange={(e) => setStart(e.target.value)} />
      <input type="time" value={end} aria-label="Disponible hasta" onChange={(e) => setEnd(e.target.value)} />
      {dirty && <button type="button" className="goal-btn goal-btn-small" onClick={() => onSave(start, end)}>Guardar</button>}
    </span>
  );
}

import { useState, useEffect, useRef } from 'react';
import { getTasks, getGoals } from '../../utiles/api.js';
import { dayInRange, sessionGoalsFor } from '../../utiles/tasks.js';
import { shiftDay, dayTitle, relativeLabel, monthOf } from '../../utiles/calendar.js';
import { ErrorBanner } from '../common.jsx';
import DayPanel from '../calendar/DayPanel.jsx';

const SWIPE_MIN_PX = 50;
const monthKey = (key) => key.slice(0, 7); // "2026-10"
const isTyping = (el) => el?.closest?.('input, textarea, select, [contenteditable]');

// Card del inicio: un día con sus tareas, que se recorre como un carrusel
// (flechas, teclas ← →, o deslizando en el celular). El contenido del día es
// DayPanel, el mismo del modal del calendario.
export default function DayCard({ initialDate, today }) {
  const [date, setDate] = useState(initialDate);
  const [direction, setDirection] = useState(null); // 'next' | 'prev': sentido de la animación
  const [months, setMonths] = useState({});         // cache de tareas por mes: { "2026-10": [...] }
  const [goals, setGoals] = useState([]);
  const [error, setError] = useState(null);
  const pointerStart = useRef(null);

  const { year, month } = monthOf(date);
  const tasks = months[monthKey(date)];

  // Las tareas se piden por mes (la API ya funciona así) y quedan en cache:
  // moverse dentro del mismo mes no hace otro pedido. `ignore` descarta una
  // respuesta vieja si se cambió de mes antes de que llegara.
  useEffect(() => {
    if (tasks) return;
    let ignore = false;
    getTasks(year, month)
      .then(data => { if (!ignore) setMonths(m => ({ ...m, [monthKey(date)]: data })); })
      .catch(err => { if (!ignore) setError(`No se pudieron cargar las tareas: ${err.message}`); });
    return () => { ignore = true; };
  }, [year, month, tasks]);

  // Objetivos, para ofrecer registrar sesiones (si falla, solo no se ofrece)
  useEffect(() => {
    getGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  // La URL refleja el día: recargar o compartir el link abre el mismo
  useEffect(() => {
    window.history.replaceState(null, '', date === today ? '/' : `/?date=${date}`);
  }, [date, today]);

  function go(delta) {
    setDirection(delta > 0 ? 'next' : 'prev');
    setDate(d => shiftDay(d, delta));
  }

  function goToday() {
    setDirection(today > date ? 'next' : 'prev');
    setDate(today);
  }

  // Flechas del teclado, salvo mientras se escribe en el formulario
  useEffect(() => {
    function onKeyDown(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(document.activeElement)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Deslizar horizontalmente (táctil o mouse), sin librería: se compara dónde
  // empezó y dónde terminó el gesto. Arrastrar dentro de un input no cuenta.
  function onPointerDown(e) {
    pointerStart.current = isTyping(e.target) ? null : { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }

  // Una tarea guardada puede abarcar otros meses: se actualiza el mes actual y
  // se descartan los demás del cache, que se vuelven a pedir al visitarlos.
  function updateMonth(fn) {
    setMonths(m => ({ [monthKey(date)]: fn(m[monthKey(date)] ?? []) }));
  }
  const handleTaskSaved = (task, wasEditing) =>
    updateMonth(list => (wasEditing ? list.map(t => (t.id === task.id ? task : t)) : [...list, task]));
  const handleTaskRemoved = (id) => updateMonth(list => list.filter(t => t.id !== id));

  const relative = relativeLabel(date, today);
  const dayTasks = tasks?.filter(t => dayInRange(year, month, Number(date.slice(8, 10)), t)) ?? [];

  return (
    <section className="day-card" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <header className="day-card-header">
        <button type="button" className="day-card-arrow" onClick={() => go(-1)} aria-label="Día anterior">
          <i className="bi bi-chevron-left" aria-hidden="true" />
        </button>
        <div className="day-card-title">
          {relative && <span className={`day-card-relative${relative === 'Hoy' ? ' is-today' : ''}`}>{relative}</span>}
          <h1>{dayTitle(date)}</h1>
        </div>
        <button type="button" className="day-card-arrow" onClick={() => go(1)} aria-label="Día siguiente">
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </button>
      </header>

      <div className="day-card-actions">
        {date !== today && (
          <button type="button" className="goal-btn goal-btn-small" onClick={goToday}>
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Volver a hoy
          </button>
        )}
        <a className="goal-btn goal-btn-small" href={`/calendar?year=${year}&month=${month}`}>
          <i className="bi bi-calendar3" aria-hidden="true" /> Calendario
        </a>
      </div>

      {/* key = fecha: el panel se recrea (estado limpio) y la animación se repite en cada cambio */}
      <div key={date} className={`day-card-body${direction ? ` day-slide-${direction}` : ''}`} aria-live="polite">
        {tasks === undefined
          ? <p className="day-empty">Cargando…</p>
          : (
            <DayPanel
              date={date}
              tasks={dayTasks}
              sessionGoals={sessionGoalsFor(goals, date, today)}
              onTaskSaved={handleTaskSaved}
              onTaskRemoved={handleTaskRemoved}
            />
          )}
      </div>
    </section>
  );
}

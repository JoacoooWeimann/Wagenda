import { useState, useEffect, useRef } from 'react';
import { getTasks, getGoals, getTrackerOptions, getWeek } from '../../utiles/api.js';
import { dayInRange, sessionGoalsFor } from '../../utiles/tasks.js';
import { shiftDay, dayTitle, relativeLabel, monthOf } from '../../utiles/calendar.js';
import { ErrorBanner } from '../common.jsx';
import DayPanel from '../calendar/DayPanel.jsx';
import DayPreview from './DayPreview.jsx';

const SWIPE_MIN_PX = 50;
const monthKey = (key) => key.slice(0, 7); // "2026-10"
const isTyping = (el) => el?.closest?.('input, textarea, select, [contenteditable]');

// Franja y rutina del día de la semana de una fecha "YYYY-MM-DD" (lunes = 0)
function agendaFor(week, key) {
  const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return { window: week.windows[weekday], routine: week.routine.filter(b => b.weekday === weekday) };
}

// Card del inicio: un día con sus tareas, que se recorre como un carrusel
// (flechas, teclas ← →, o deslizando en el celular). El contenido del día es
// DayPanel, el mismo del modal del calendario. En pantallas anchas, a los
// costados se ven las previews de ayer y mañana (el CSS las oculta en las angostas).
export default function DayCard({ initialDate, today }) {
  const [date, setDate] = useState(initialDate);
  const [direction, setDirection] = useState(null); // 'next' | 'prev': sentido de la animación
  const [months, setMonths] = useState({});         // cache de tareas por mes: { "2026-10": [...] }
  const [goals, setGoals] = useState([]);
  const [trackers, setTrackers] = useState([]); // para clasificar tareas
  const [week, setWeek] = useState(null);       // franjas y rutina: la agenda del día
  const [error, setError] = useState(null);
  const pointerStart = useRef(null);

  const { year, month } = monthOf(date);
  const prevDate = shiftDay(date, -1);
  const nextDate = shiftDay(date, 1);
  const tasks = months[monthKey(date)];

  // Tareas de un día, o undefined si su mes todavía no llegó
  function tasksOn(key) {
    const list = months[monthKey(key)];
    const { year: y, month: m } = monthOf(key);
    return list?.filter(t => dayInRange(y, m, Number(key.slice(8, 10)), t));
  }

  // Las tareas se piden por mes (la API ya funciona así) y quedan en cache:
  // moverse dentro del mismo mes no hace otro pedido. Se piden el mes del día y,
  // si ayer o mañana caen en otro mes, también ese (para las previews).
  // `requested` evita pedir dos veces un mes que ya está en camino. Una
  // respuesta que llega tarde no pisa nada: cada una llena solo su mes.
  const requested = useRef(new Set());
  const needed = [...new Set([date, prevDate, nextDate].map(monthKey))];
  useEffect(() => {
    for (const key of needed) {
      if (months[key] || requested.current.has(key)) continue;
      requested.current.add(key);
      getTasks(Number(key.slice(0, 4)), Number(key.slice(5, 7)))
        .then(data => setMonths(m => ({ ...m, [key]: data })))
        .catch(err => {
          requested.current.delete(key); // se reintenta al volver a ese mes
          setError(`No se pudieron cargar las tareas: ${err.message}`);
        });
    }
  }, [needed.join(), months]);

  // Objetivos, para ofrecer registrar sesiones (si falla, solo no se ofrece)
  useEffect(() => {
    getGoals().then(setGoals).catch(() => setGoals([]));
    getTrackerOptions().then(setTrackers).catch(() => setTrackers([]));
    // Si falla, la card funciona como lista (sin línea de tiempo)
    getWeek().then(setWeek).catch(() => setWeek(null));
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
  // se descartan los demás del cache, que se vuelven a pedir (también los de
  // las previews, si caen en otro mes).
  function updateMonth(fn) {
    requested.current = new Set([monthKey(date)]);
    setMonths(m => ({ [monthKey(date)]: fn(m[monthKey(date)] ?? []) }));
  }
  const handleTaskSaved = (task, wasEditing) =>
    updateMonth(list => (wasEditing ? list.map(t => (t.id === task.id ? task : t)) : [...list, task]));
  const handleTaskRemoved = (id) => updateMonth(list => list.filter(t => t.id !== id));

  const relative = relativeLabel(date, today);
  const dayTasks = tasksOn(date) ?? [];
  // Etiqueta de cada preview: "Ayer"/"Hoy"/"Mañana" si corresponde, si no "Día anterior"/"Día siguiente"
  const previewLabel = (key, fallback) => relativeLabel(key, today) ?? fallback;

  return (
    <div className="day-carousel">
      <DayPreview side="prev" date={prevDate} label={previewLabel(prevDate, 'Día anterior')}
        tasks={tasksOn(prevDate)} onOpen={() => go(-1)} />

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
              trackers={trackers}
              agenda={week && agendaFor(week, date)}
                onTaskSaved={handleTaskSaved}
                onTaskRemoved={handleTaskRemoved}
              />
            )}
        </div>
      </section>

      <DayPreview side="next" date={nextDate} label={previewLabel(nextDate, 'Día siguiente')}
        tasks={tasksOn(nextDate)} onOpen={() => go(1)} />
    </div>
  );
}

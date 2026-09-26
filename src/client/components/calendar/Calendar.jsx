import { useState, useEffect, useCallback } from 'react';
import { buildCalendar, toDateKey, MESES, DIAS_SEMANA } from '../../utiles/calendar.js';
import { getTasks, getGoals } from '../../utiles/api.js';
import { dayInRange, highestPriority } from '../../utiles/tasks.js';
import { todayKey } from '../../utiles/goals.js';
import { ErrorBanner } from '../common.jsx';
import { COLOR_PRIORIDAD } from './constants.js';
import DayModal from './DayModal.jsx';

// Grilla del mes, navegación y datos. El detalle de un día vive en DayModal.
export default function Calendar({ initialYear, initialMonth }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [goals, setGoals] = useState([]);
  const [error, setError] = useState(null);

  const { weeks } = buildCalendar(year, month);
  const today = new Date();

  useEffect(() => {
    // Si el usuario cambia de mes rápido, una respuesta vieja podría llegar
    // después de la nueva y pisarla: `ignore` descarta las respuestas obsoletas.
    let ignore = false;
    getTasks(year, month)
      .then(data => { if (!ignore) { setTasks(data); setError(null); } })
      .catch(err => { if (!ignore) setError(`No se pudieron cargar las tareas: ${err.message}`); });
    return () => { ignore = true; };
  }, [year, month]);

  // Objetivos, para ofrecer "Registrar sesión" en los días de un plan por fases.
  // Si falla, el calendario funciona igual: solo no se ofrece esa opción.
  useEffect(() => {
    getGoals().then(setGoals).catch(() => setGoals([]));
  }, []);

  function goPrev() { month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1); }
  function goNext() { month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1); }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }

  const tasksForDay = (day) => tasks.filter(t => dayInRange(year, month, day, t));

  // Objetivos por fases cuyo plazo incluye ese día (y que no sea futuro)
  function sessionGoalsFor(dateKey) {
    if (dateKey > todayKey()) return [];
    return goals.filter(g =>
      g.strategy === 'fases' && g.startDate.slice(0, 10) <= dateKey && dateKey <= g.deadline.slice(0, 10)
    );
  }

  // useCallback: DayModal usa onClose en un efecto; una función nueva en cada
  // render volvería a registrar el listener de Escape sin necesidad
  const closeModal = useCallback(() => setSelectedDay(null), []);

  function handleTaskSaved(task, wasEditing) {
    setTasks(prev => (wasEditing ? prev.map(t => (t.id === task.id ? task : t)) : [...prev, task]));
  }

  function handleTaskRemoved(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const selectedKey = selectedDay && toDateKey(year, month, selectedDay);

  return (
    <div className="calendar-container">
      {!selectedDay && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div className="calendar-header">
        {/* En pantallas angostas el CSS oculta los textos y quedan solo las flechas */}
        <button onClick={goPrev} className="calendar-nav" aria-label="Mes anterior">
          &laquo;<span className="calendar-nav-label"> Anterior</span>
        </button>
        <h2>{MESES[month - 1]} {year}</h2>
        <div className="calendar-header-actions">
          <button onClick={goToday} className="calendar-nav">Hoy</button>
          <button onClick={goNext} className="calendar-nav" aria-label="Mes siguiente">
            <span className="calendar-nav-label">Siguiente </span>&raquo;
          </button>
        </div>
      </div>

      <table className="calendar-table">
        <thead><tr>{DIAS_SEMANA.map(d => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day, j) => {
                const prio = day ? highestPriority(tasksForDay(day.day)) : null;
                return (
                  <td
                    key={j}
                    className={`${day ? '' : 'calendar-empty'} ${day?.isToday ? 'calendar-today' : ''}`}
                    onClick={() => day && setSelectedDay(day.day)}
                  >
                    {day ? day.day : ''}
                    {prio && <div className="calendar-dot" style={{ background: COLOR_PRIORIDAD[prio] }} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {selectedDay && (
        <DayModal
          key={selectedKey}
          title={`${selectedDay} de ${MESES[month - 1]}, ${year}`}
          date={selectedKey}
          tasks={tasksForDay(selectedDay)}
          sessionGoals={sessionGoalsFor(selectedKey)}
          onClose={closeModal}
          onTaskSaved={handleTaskSaved}
          onTaskRemoved={handleTaskRemoved}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { buildCalendar, MESES, DIAS_SEMANA } from '../utiles/calendar.js';

export default function Calendar({ initialYear, initialMonth }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [newTitle, setNewTitle] = useState('');

  const { weeks } = buildCalendar(year, month);

  useEffect(() => {
    fetch(`/api/tasks?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(setTasks);
  }, [year, month]);

  function goPrev() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function goNext() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  function tasksForDay(day) {
    return tasks.filter(t => new Date(t.date).getDate() === day);
  }

  async function addTask() {
    if (!newTitle.trim()) return;
    const dateISO = new Date(year, month - 1, selectedDay).toISOString();
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, date: dateISO })
    });
    const created = await res.json();
    setTasks(prev => [...prev, created]);
    setNewTitle('');
  }

  async function toggleDone(task) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !task.done })
    });
    const updated = await res.json();
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  async function deleteTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={goPrev} className="calendar-nav">&laquo; Anterior</button>
        <h2>{MESES[month - 1]} {year}</h2>
        <button onClick={goNext} className="calendar-nav">Siguiente &raquo;</button>
      </div>

      <table className="calendar-table">
        <thead>
          <tr>{DIAS_SEMANA.map(d => <th key={d}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day, j) => (
                <td
                  key={j}
                  className={`${day ? '' : 'calendar-empty'} ${day?.isToday ? 'calendar-today' : ''}`}
                  onClick={() => day && setSelectedDay(day.day)}
                >
                  {day ? day.day : ''}
                  {day && tasksForDay(day.day).length > 0 && (
                    <div className="calendar-dot" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {selectedDay && (
        <div className="calendar-modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedDay} de {MESES[month - 1]}, {year}</h3>

            <ul className="calendar-task-list">
              {tasksForDay(selectedDay).map(task => (
                <li key={task.id} className={task.done ? 'calendar-task-done' : ''}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleDone(task)} />
                  <span>{task.title}</span>
                  <button onClick={() => deleteTask(task.id)}>✕</button>
                </li>
              ))}
            </ul>

            <div className="calendar-task-form">
              <input
                type="text"
                placeholder="Nueva tarea..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              <button onClick={addTask}>Agregar</button>
            </div>

            <button className="calendar-modal-close" onClick={() => setSelectedDay(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
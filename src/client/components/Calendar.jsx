import { useState, useEffect } from 'react';
import { buildCalendar, toDateKey, MESES, DIAS_SEMANA } from '../utiles/calendar.js';

const PRIORIDADES = ['baja', 'normal', 'alta'];
const COLOR_PRIORIDAD = { alta: '#ef4444', normal: '#2563eb', baja: '#9ca3af' };

// Las fechas llegan como medianoche UTC ("2026-09-09T00:00:00.000Z"): nos quedamos
// con la parte "YYYY-MM-DD" y comparamos strings. Con ceros a la izquierda, el orden
// alfabético coincide con el cronológico, y no interviene la zona horaria local.
function dayInRange(year, month, day, task) {
  const key = toDateKey(year, month, day);
  return key >= task.startDate.slice(0, 10) && key <= task.endDate.slice(0, 10);
}

function highestPriority(tasks) {
  if (tasks.some(t => t.priority === 'alta')) return 'alta';
  if (tasks.some(t => t.priority === 'normal')) return 'normal';
  if (tasks.length > 0) return 'baja';
  return null;
}

const emptyForm = { title: '', description: '', startDate: '', endDate: '', priority: 'normal', category: '' };

export default function Calendar({ initialYear, initialMonth }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const { weeks } = buildCalendar(year, month);

  useEffect(() => {
    fetch(`/api/tasks?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(setTasks);
  }, [year, month]);

  function goPrev() { month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1); }
  function goNext() { month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1); }

  function tasksForDay(day) {
    return tasks.filter(t => dayInRange(year, month, day, t));
  }

  function openDay(day) {
    setSelectedDay(day);
    const iso = toDateKey(year, month, day);
    setForm({ ...emptyForm, startDate: iso, endDate: iso });
    setEditingId(null);
  }

  function startEdit(task) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description || '',
      startDate: task.startDate.slice(0, 10),
      endDate: task.endDate.slice(0, 10),
      priority: task.priority,
      category: task.category || ''
    });
  }

  async function saveTask() {
    if (!form.title.trim() || !form.startDate) return;

    const payload = { ...form, endDate: form.endDate || form.startDate };

    if (editingId) {
      const res = await fetch(`/api/tasks/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } else {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const created = await res.json();
      setTasks(prev => [...prev, created]);
    }

    setEditingId(null);
    setForm({ ...emptyForm, startDate: form.startDate, endDate: form.startDate });
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

  async function removeTask(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
    if (editingId === id) { setEditingId(null); setForm(emptyForm); }
  }

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={goPrev} className="calendar-nav">&laquo; Anterior</button>
        <h2>{MESES[month - 1]} {year}</h2>
        <button onClick={goNext} className="calendar-nav">Siguiente &raquo;</button>
      </div>

      <table className="calendar-table">
        <thead><tr>{DIAS_SEMANA.map(d => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={i}>
              {week.map((day, j) => {
                const dayTasks = day ? tasksForDay(day.day) : [];
                const prio = highestPriority(dayTasks);
                return (
                  <td
                    key={j}
                    className={`${day ? '' : 'calendar-empty'} ${day?.isToday ? 'calendar-today' : ''}`}
                    onClick={() => day && openDay(day.day)}
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
        <div className="calendar-modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedDay} de {MESES[month - 1]}, {year}</h3>

            <ul className="calendar-task-list">
              {tasksForDay(selectedDay).map(task => (
                <li key={task.id} className={task.done ? 'calendar-task-done' : ''}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleDone(task)} />
                  <span className="calendar-task-priority-dot" style={{ background: COLOR_PRIORIDAD[task.priority] }} />
                  <span onClick={() => startEdit(task)} style={{ cursor: 'pointer' }}>
                    {task.title} {task.category && <em>({task.category})</em>}
                  </span>
                  <button onClick={() => removeTask(task.id)}>✕</button>
                </li>
              ))}
            </ul>

            <div className="calendar-task-form">
              <input
                type="text" placeholder="Título"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              />
              <div className="calendar-task-form-row">
                <label>Desde <input type="date" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} /></label>
                <label>Hasta <input type="date" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} /></label>
              </div>
              <div className="calendar-task-form-row">
                <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input
                  type="text" placeholder="Categoría (opcional)"
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                />
              </div>
              <button onClick={saveTask}>{editingId ? 'Guardar cambios' : 'Agregar'}</button>
              {editingId && <button onClick={() => { setEditingId(null); setForm({ ...emptyForm, startDate: form.startDate, endDate: form.startDate }); }}>Cancelar edición</button>}
            </div>

            <button className="calendar-modal-close" onClick={() => setSelectedDay(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

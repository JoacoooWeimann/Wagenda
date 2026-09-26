import { useState, useEffect } from 'react';
import { buildCalendar, toDateKey, MESES, DIAS_SEMANA } from '../utiles/calendar.js';
import { getTasks, createTask, updateTask, deleteTask } from '../utiles/api.js';

const PRIORIDADES = ['baja', 'normal', 'alta'];
const ETIQUETA_PRIORIDAD = { baja: 'Baja', normal: 'Normal', alta: 'Alta' };
const COLOR_PRIORIDAD = { alta: '#ef4444', normal: '#2563eb', baja: '#9ca3af' };
const ORDEN_PRIORIDAD = { alta: 0, normal: 1, baja: 2 };

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

// Pendientes primero y, dentro de cada grupo, de mayor a menor prioridad.
// sort es estable: los empates conservan el orden por startDate que manda el servidor.
function sortForDay(tasks) {
  return [...tasks].sort((a, b) =>
    (a.done - b.done) || (ORDEN_PRIORIDAD[a.priority] - ORDEN_PRIORIDAD[b.priority])
  );
}

const isMultiDay = (task) => task.startDate.slice(0, 10) !== task.endDate.slice(0, 10);

// "2026-09-09T00:00:00.000Z" -> "9/9"
function shortDate(iso) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

const emptyForm = { title: '', description: '', startDate: '', endDate: '', priority: 'normal', category: '' };

function FieldError({ message }) {
  return message ? <span className="calendar-field-error">{message}</span> : null;
}

function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="calendar-error" role="alert">
      <span>⚠ {message}</span>
      <button type="button" onClick={onClose} aria-label="Cerrar aviso">✕</button>
    </div>
  );
}

export default function Calendar({ initialYear, initialMonth }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);           // mensaje general (aviso)
  const [fieldErrors, setFieldErrors] = useState({}); // errores por campo del formulario
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

  const { weeks } = buildCalendar(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const editingTask = tasks.find(t => t.id === editingId);

  useEffect(() => {
    // Si el usuario cambia de mes rápido, una respuesta vieja podría llegar
    // después de la nueva y pisarla: `ignore` descarta las respuestas obsoletas.
    let ignore = false;
    getTasks(year, month)
      .then(data => { if (!ignore) { setTasks(data); setError(null); } })
      .catch(err => { if (!ignore) setError(`No se pudieron cargar las tareas: ${err.message}`); });
    return () => { ignore = true; };
  }, [year, month]);

  // Escape cierra el modal. El listener existe solo mientras el modal está abierto
  // y la función de limpieza lo quita al cerrarse (si no, quedaría colgado).
  useEffect(() => {
    if (!selectedDay) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') closeModal();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedDay]);

  function goPrev() { month === 1 ? (setMonth(12), setYear(y => y - 1)) : setMonth(m => m - 1); }
  function goNext() { month === 12 ? (setMonth(1), setYear(y => y + 1)) : setMonth(m => m + 1); }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }

  function tasksForDay(day) {
    return tasks.filter(t => dayInRange(year, month, day, t));
  }

  // Al editar un campo se borra su error, para no dejar un mensaje viejo en rojo
  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
  }

  function resetForm(date) {
    setEditingId(null);
    setForm({ ...emptyForm, startDate: date, endDate: date });
    setFieldErrors({});
  }

  function openDay(day) {
    setSelectedDay(day);
    setError(null);
    setConfirmingDeleteId(null);
    resetForm(toDateKey(year, month, day));
  }

  function closeModal() {
    setSelectedDay(null);
    setError(null);
    setFieldErrors({});
    setConfirmingDeleteId(null);
  }

  function startEdit(task) {
    setEditingId(task.id);
    setFieldErrors({});
    setForm({
      title: task.title,
      description: task.description || '',
      startDate: task.startDate.slice(0, 10),
      endDate: task.endDate.slice(0, 10),
      priority: task.priority,
      category: task.category || ''
    });
  }

  async function saveTask(e) {
    e.preventDefault(); // el submit del <form> recargaría la página

    // Chequeo local solo para no hacer un pedido inútil; la validación real es del servidor
    if (!form.title.trim()) {
      setFieldErrors({ title: 'El título es obligatorio' });
      return;
    }

    const payload = { ...form, endDate: form.endDate || form.startDate };
    setSaving(true);
    setError(null);

    // Pesimista: la lista cambia recién cuando el servidor confirma
    try {
      if (editingId) {
        const updated = await updateTask(editingId, payload);
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        const created = await createTask(payload);
        setTasks(prev => [...prev, created]);
      }
      resetForm(form.startDate);
    } catch (err) {
      const hasFieldErrors = Object.keys(err.fields || {}).length > 0;
      setFieldErrors(err.fields || {});
      setError(hasFieldErrors ? 'No se pudo guardar la tarea' : err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(task) {
    try {
      const updated = await updateTask(task.id, { done: !task.done });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      setError(`No se pudo actualizar la tarea: ${err.message}`);
    }
  }

  async function removeTask(id) {
    setConfirmingDeleteId(null);
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      if (editingId === id) resetForm(form.startDate);
    } catch (err) {
      setError(`No se pudo borrar la tarea: ${err.message}`);
    }
  }

  return (
    <div className="calendar-container">
      {!selectedDay && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div className="calendar-header">
        <button onClick={goPrev} className="calendar-nav">&laquo; Anterior</button>
        <h2>{MESES[month - 1]} {year}</h2>
        <div className="calendar-header-actions">
          <button onClick={goToday} className="calendar-nav" disabled={isCurrentMonth}>Hoy</button>
          <button onClick={goNext} className="calendar-nav">Siguiente &raquo;</button>
        </div>
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
        <div className="calendar-modal-overlay" onClick={closeModal}>
          <div className="calendar-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <ErrorBanner message={error} onClose={() => setError(null)} />

            <h3>{selectedDay} de {MESES[month - 1]}, {year}</h3>

            <ul className="calendar-task-list">
              {sortForDay(tasksForDay(selectedDay)).map(task => (
                <li key={task.id} className={task.done ? 'calendar-task-done' : ''}>
                  <input type="checkbox" checked={task.done} onChange={() => toggleDone(task)} />
                  <span className="calendar-task-priority-dot" style={{ background: COLOR_PRIORIDAD[task.priority] }} />
                  <div className="calendar-task-info" onClick={() => startEdit(task)}>
                    <span>
                      {task.title} {task.category && <em>({task.category})</em>}
                      {isMultiDay(task) && (
                        <span className="calendar-task-range"> · {shortDate(task.startDate)} → {shortDate(task.endDate)}</span>
                      )}
                    </span>
                    {task.description && <span className="calendar-task-description">{task.description}</span>}
                  </div>
                  {confirmingDeleteId === task.id ? (
                    <span className="calendar-task-confirm">
                      <button type="button" className="calendar-task-confirm-delete" onClick={() => removeTask(task.id)}>Borrar</button>
                      <button type="button" onClick={() => setConfirmingDeleteId(null)}>Cancelar</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmingDeleteId(task.id)} aria-label="Borrar tarea">✕</button>
                  )}
                </li>
              ))}
            </ul>

            <form className="calendar-task-form" onSubmit={saveTask} noValidate>
              <h4 className="calendar-form-title">
                {editingTask ? `Editando: ${editingTask.title}` : 'Nueva tarea'}
              </h4>
              <div className="calendar-field">
                <input
                  type="text" placeholder="Título" maxLength={100} autoFocus
                  className={fieldErrors.title ? 'is-invalid' : ''}
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                />
                <FieldError message={fieldErrors.title} />
              </div>
              <div className="calendar-field">
                <textarea
                  placeholder="Descripción (opcional)" maxLength={1000} rows={2}
                  className={fieldErrors.description ? 'is-invalid' : ''}
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                />
                <FieldError message={fieldErrors.description} />
              </div>
              <div className="calendar-task-form-row">
                <label>Desde
                  <input type="date" className={fieldErrors.startDate ? 'is-invalid' : ''} value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} />
                  <FieldError message={fieldErrors.startDate} />
                </label>
                <label>Hasta
                  <input type="date" className={fieldErrors.endDate ? 'is-invalid' : ''} value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} />
                  <FieldError message={fieldErrors.endDate} />
                </label>
              </div>
              <div className="calendar-task-form-row">
                <div className="calendar-field">
                  <select className={fieldErrors.priority ? 'is-invalid' : ''} value={form.priority} onChange={(e) => updateField('priority', e.target.value)}>
                    {PRIORIDADES.map(p => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
                  </select>
                  <FieldError message={fieldErrors.priority} />
                </div>
                <div className="calendar-field">
                  <input
                    type="text" placeholder="Categoría (opcional)" maxLength={30}
                    className={fieldErrors.category ? 'is-invalid' : ''}
                    value={form.category}
                    onChange={(e) => updateField('category', e.target.value)}
                  />
                  <FieldError message={fieldErrors.category} />
                </div>
              </div>
              <button type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar'}
              </button>
              {editingId && <button type="button" onClick={() => resetForm(form.startDate)}>Cancelar edición</button>}
            </form>

            <button type="button" className="calendar-modal-close" onClick={closeModal}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

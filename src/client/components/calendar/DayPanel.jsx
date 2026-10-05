import { useState } from 'react';
import { updateTask, deleteTask } from '../../utiles/api.js';
import { sortForDay } from '../../utiles/tasks.js';
import { ErrorBanner } from '../common.jsx';
import TaskItem from './TaskItem.jsx';
import TaskForm from './TaskForm.jsx';
import SessionLogger from './SessionLogger.jsx';
import DayAgenda from '../home/DayAgenda.jsx';
import { buildDayAgenda } from '../../utiles/agenda.js';

// Contenido de un día: sus tareas (marcar, editar, borrar), registrar sesiones
// y el formulario de alta/edición, que está cerrado hasta que se pide
// ("+ Nueva tarea" o click en una tarea para editarla). Con `agenda` (la franja
// y la rutina de ese día, en la card del inicio), las tareas con horario se ven
// en una línea de tiempo y abajo van las que no tienen; sin agenda (el modal
// del calendario), una sola lista. Lo usan el modal del calendario y la card
// del inicio: un solo componente para lo mismo. Se monta con key = fecha, así
// al cambiar de día el estado (edición, errores) arranca limpio.
export default function DayPanel({ date, tasks, sessionGoals, trackers, agenda, onTaskSaved, onTaskRemoved }) {
  const [editingTask, setEditingTask] = useState(null);
  const [adding, setAdding] = useState(false); // false | { times? }: horario inicial desde un hueco libre
  const [error, setError] = useState(null);
  const formOpen = adding !== false || editingTask !== null;
  const dayAgenda = agenda && buildDayAgenda({ window: agenda.window, routine: agenda.routine, tasks });
  const listed = dayAgenda ? dayAgenda.untimed : tasks;

  function closeForm() {
    setAdding(false);
    setEditingTask(null);
  }

  function startEdit(task) {
    setAdding(false);
    setEditingTask(task);
  }

  async function toggleDone(task) {
    try {
      onTaskSaved(await updateTask(task.id, { done: !task.done }), true);
    } catch (err) {
      setError(`No se pudo actualizar la tarea: ${err.message}`);
    }
  }

  async function removeTask(id) {
    try {
      await deleteTask(id);
      onTaskRemoved(id);
      if (editingTask?.id === id) setEditingTask(null);
    } catch (err) {
      setError(`No se pudo borrar la tarea: ${err.message}`);
    }
  }

  function handleSaved(task, wasEditing) {
    onTaskSaved(task, wasEditing);
    closeForm();
  }

  return (
    <>
      <ErrorBanner message={error} onClose={() => setError(null)} />

      {dayAgenda && (
        <DayAgenda agenda={dayAgenda} onToggle={toggleDone} onEdit={startEdit}
          onAddAt={(times) => { setEditingTask(null); setAdding({ times }); }} />
      )}
      {dayAgenda && <h4 className="day-section-title">Sin horario</h4>}

      {listed.length === 0
        ? <p className="day-empty">{dayAgenda ? 'Nada sin horario.' : 'No hay tareas para este día.'}</p>
        : (
          <ul className="calendar-task-list">
            {sortForDay(listed).map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleDone} onEdit={startEdit} onRemove={removeTask} />
            ))}
          </ul>
        )}

      {sessionGoals.length > 0 && (
        <SessionLogger goals={sessionGoals} date={date} onLogged={(t) => onTaskSaved(t, false)} onError={setError} />
      )}

      {formOpen ? (
        <TaskForm
          key={editingTask?.id ?? `nueva-${adding?.times?.startMinute ?? ''}`}
          date={date}
          editingTask={editingTask}
          initialTimes={adding?.times}
          trackers={trackers}
          onSaved={handleSaved}
          onCancel={closeForm}
          onError={setError}
        />
      ) : (
        <button type="button" className="day-add-task" onClick={() => setAdding({})}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Nueva tarea
        </button>
      )}
    </>
  );
}

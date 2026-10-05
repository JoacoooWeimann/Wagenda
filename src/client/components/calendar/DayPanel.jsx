import { useState } from 'react';
import { updateTask, deleteTask } from '../../utiles/api.js';
import { sortForDay } from '../../utiles/tasks.js';
import { ErrorBanner } from '../common.jsx';
import TaskItem from './TaskItem.jsx';
import TaskForm from './TaskForm.jsx';
import SessionLogger from './SessionLogger.jsx';

// Contenido de un día: sus tareas (marcar, editar, borrar), registrar sesiones
// y el formulario de alta/edición, que está cerrado hasta que se pide
// ("+ Nueva tarea" o click en una tarea para editarla). Lo usan el modal del calendario y la card
// del inicio: un solo componente para lo mismo. Se monta con key = fecha, así
// al cambiar de día el estado (edición, errores) arranca limpio.
export default function DayPanel({ date, tasks, sessionGoals, onTaskSaved, onTaskRemoved }) {
  const [editingTask, setEditingTask] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const formOpen = adding || editingTask !== null;

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

      {tasks.length === 0
        ? <p className="day-empty">No hay tareas para este día.</p>
        : (
          <ul className="calendar-task-list">
            {sortForDay(tasks).map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggleDone} onEdit={startEdit} onRemove={removeTask} />
            ))}
          </ul>
        )}

      {sessionGoals.length > 0 && (
        <SessionLogger goals={sessionGoals} date={date} onLogged={(t) => onTaskSaved(t, false)} onError={setError} />
      )}

      {formOpen ? (
        <TaskForm
          key={editingTask?.id ?? 'nueva'}
          date={date}
          editingTask={editingTask}
          onSaved={handleSaved}
          onCancel={closeForm}
          onError={setError}
        />
      ) : (
        <button type="button" className="day-add-task" onClick={() => setAdding(true)}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Nueva tarea
        </button>
      )}
    </>
  );
}

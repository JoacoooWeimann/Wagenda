import { useState, useEffect } from 'react';
import { updateTask, deleteTask } from '../../utiles/api.js';
import { sortForDay } from '../../utiles/tasks.js';
import { ErrorBanner } from '../common.jsx';
import TaskItem from './TaskItem.jsx';
import TaskForm from './TaskForm.jsx';
import SessionLogger from './SessionLogger.jsx';

// Modal de un día. Calendar lo monta con key = fecha: al abrir otro día React
// crea uno nuevo, así el estado (edición, errores) arranca limpio sin resetearlo a mano.
export default function DayModal({ title, date, tasks, sessionGoals, onClose, onTaskSaved, onTaskRemoved }) {
  const [editingTask, setEditingTask] = useState(null);
  const [error, setError] = useState(null);

  // Escape cierra el modal; el listener se quita al desmontarlo
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    setEditingTask(null);
  }

  return (
    <div className="calendar-modal-overlay" onClick={onClose}>
      <div className="calendar-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <ErrorBanner message={error} onClose={() => setError(null)} />

        <h3>{title}</h3>

        <ul className="calendar-task-list">
          {sortForDay(tasks).map(task => (
            <TaskItem key={task.id} task={task} onToggle={toggleDone} onEdit={setEditingTask} onRemove={removeTask} />
          ))}
        </ul>

        {sessionGoals.length > 0 && (
          <SessionLogger goals={sessionGoals} date={date} onLogged={(t) => onTaskSaved(t, false)} onError={setError} />
        )}

        <TaskForm
          key={editingTask?.id ?? 'nueva'}
          date={date}
          editingTask={editingTask}
          onSaved={handleSaved}
          onCancelEdit={() => setEditingTask(null)}
          onError={setError}
        />

        <button type="button" className="calendar-modal-close" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

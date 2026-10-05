import { useState } from 'react';
import { createTask, updateTask } from '../../utiles/api.js';
import { FieldError } from '../common.jsx';
import { PRIORIDADES, ETIQUETA_PRIORIDAD } from './constants.js';
import TrackerPicker from '../trackers/TrackerPicker.jsx';
import { minutesToTime, timeToMinutes } from '../../utiles/week.js';

// `times` (opcional): horario inicial, ej. al tocar un hueco libre de la agenda
const emptyForm = (date, times) => ({
  title: '', description: '', startDate: date, endDate: date, priority: 'normal', trackerId: '', itemId: '',
  startTime: times ? minutesToTime(times.startMinute) : '',
  endTime: times ? minutesToTime(times.endMinute) : ''
});

const formFromTask = (task) => ({
  title: task.title,
  description: task.description || '',
  startDate: task.startDate.slice(0, 10),
  endDate: task.endDate.slice(0, 10),
  priority: task.priority,
  trackerId: task.trackerId ? String(task.trackerId) : '',
  itemId: task.itemId ? String(task.itemId) : '',
  startTime: task.startMinute !== null ? minutesToTime(task.startMinute) : '',
  endTime: task.endMinute !== null ? minutesToTime(task.endMinute) : ''
});

// Formulario de alta/edición. El componente padre lo monta con key = tarea en
// edición: al cambiar de tarea, React crea uno nuevo y el estado arranca limpio.
export default function TaskForm({ date, editingTask, initialTimes, trackers = [], onSaved, onCancel, onError }) {
  const [form, setForm] = useState(() => (editingTask ? formFromTask(editingTask) : emptyForm(date, initialTimes)));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Al editar un campo se borra su error, para no dejar un mensaje viejo en rojo
  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
  }

  async function handleSubmit(e) {
    e.preventDefault(); // el submit del <form> recargaría la página

    // Chequeo local solo para no hacer un pedido inútil; la validación real es del servidor
    if (!form.title.trim()) {
      setFieldErrors({ title: 'El título es obligatorio' });
      return;
    }

    // Seguimiento e ítem viajan como id, y el horario en minutos (null = ninguno)
    const toId = (value) => (value === '' ? null : Number(value));
    const { startTime, endTime, ...rest } = form;
    const endDate = form.endDate || form.startDate;
    const oneDay = endDate === form.startDate;
    const payload = {
      ...rest,
      endDate,
      trackerId: toId(form.trackerId),
      itemId: toId(form.itemId),
      // Solo las tareas de un día tienen horario
      startMinute: oneDay && startTime ? timeToMinutes(startTime) : null,
      endMinute: oneDay && endTime ? timeToMinutes(endTime) : null
    };
    setSaving(true);
    onError(null);

    // Pesimista: la lista cambia recién cuando el servidor confirma
    try {
      const saved = editingTask ? await updateTask(editingTask.id, payload) : await createTask(payload);
      onSaved(saved, Boolean(editingTask));
      if (!editingTask) setForm(emptyForm(form.startDate));
    } catch (err) {
      const fields = err.fields || {};
      setFieldErrors(fields);
      onError(Object.keys(fields).length > 0 ? 'No se pudo guardar la tarea' : err.message);
    } finally {
      setSaving(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');

  return (
    <form className="calendar-task-form" onSubmit={handleSubmit} noValidate>
      <h4 className="calendar-form-title">
        {editingTask ? `Editando: ${editingTask.title}` : 'Nueva tarea'}
      </h4>
      <div className="calendar-field">
        <input type="text" placeholder="Título" maxLength={100} autoFocus className={invalid('title')}
          value={form.title} onChange={(e) => updateField('title', e.target.value)} />
        <FieldError message={fieldErrors.title} />
      </div>
      <div className="calendar-field">
        <textarea placeholder="Descripción (opcional)" maxLength={1000} rows={2} className={invalid('description')}
          value={form.description} onChange={(e) => updateField('description', e.target.value)} />
        <FieldError message={fieldErrors.description} />
      </div>
      <div className="calendar-task-form-row">
        <label>Desde
          <input type="date" className={invalid('startDate')} value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} />
          <FieldError message={fieldErrors.startDate} />
        </label>
        <label>Hasta
          <input type="date" className={invalid('endDate')} value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} />
          <FieldError message={fieldErrors.endDate} />
        </label>
      </div>
      {(form.endDate === '' || form.endDate === form.startDate) && (
        <div className="calendar-task-form-row">
          <label>Hora desde (opcional)
            <input type="time" className={invalid('startMinute')} value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} />
          </label>
          <label>Hora hasta
            <input type="time" className={invalid('endMinute')} value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} />
          </label>
        </div>
      )}
      <FieldError message={fieldErrors.startMinute || fieldErrors.endMinute} />
      <div className="calendar-task-form-row">
        <div className="calendar-field">
          <select className={invalid('priority')} value={form.priority} onChange={(e) => updateField('priority', e.target.value)}>
            {PRIORIDADES.map(p => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
          </select>
          <FieldError message={fieldErrors.priority} />
        </div>
        <div className="calendar-field">
          <TrackerPicker options={trackers} trackerId={form.trackerId} itemId={form.itemId}
            invalid={invalid('trackerId') || invalid('itemId')}
            onChange={({ trackerId, itemId }) => { updateField('trackerId', trackerId); updateField('itemId', itemId); }} />
          <FieldError message={fieldErrors.trackerId || fieldErrors.itemId} />
        </div>
      </div>
      <div className="calendar-task-form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : editingTask ? 'Guardar cambios' : 'Agregar'}
        </button>
        <button type="button" className="calendar-task-form-cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

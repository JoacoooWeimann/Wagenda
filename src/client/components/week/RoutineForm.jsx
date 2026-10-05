import { useState } from 'react';
import { WEEKDAYS, WEEKDAYS_SHORT, minutesToTime, timeToMinutes } from '../../utiles/week.js';
import { FieldError } from '../common.jsx';

// Crear un bloque de rutina (en uno o varios días a la vez) o editar uno.
// Los horarios se escriben como HH:MM y viajan en minutos.
export default function RoutineForm({ block, trackers, initialWeekday = 0, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    title: block?.title ?? '',
    weekdays: block ? [block.weekday] : [initialWeekday],
    start: block ? minutesToTime(block.startMinute) : '09:00',
    end: block ? minutesToTime(block.endMinute) : '10:00',
    trackerId: block?.trackerId ? String(block.trackerId) : ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
  }

  // Al crear se eligen varios días; al editar, un bloque es de un solo día
  function toggleDay(day) {
    const days = block ? [day] : form.weekdays.includes(day) ? form.weekdays.filter(d => d !== day) : [...form.weekdays, day];
    updateField('weekdays', days);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const times = { startMinute: timeToMinutes(form.start), endMinute: timeToMinutes(form.end) };
    const trackerId = form.trackerId === '' ? null : Number(form.trackerId);
    const payload = block
      ? { title: form.title, weekday: form.weekdays[0], ...times, trackerId }
      : { title: form.title, weekdays: form.weekdays, ...times, trackerId };
    try {
      await onSave(payload);
    } catch (err) {
      setFieldErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');

  return (
    <form className="goal-form routine-form" onSubmit={handleSubmit} noValidate>
      <div className="goal-form-row">
        <label>Actividad
          <input type="text" maxLength={40} placeholder="Ej. Trabajo, Cursada, Gimnasio" autoFocus
            className={invalid('title')} value={form.title} onChange={(e) => updateField('title', e.target.value)} />
          <FieldError message={fieldErrors.title} />
        </label>
        <label>Seguimiento (opcional)
          <select value={form.trackerId} onChange={(e) => updateField('trackerId', e.target.value)}>
            <option value="">Ninguno</option>
            {trackers.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="routine-days">
        <legend>{block ? 'Día' : 'Días'}</legend>
        {WEEKDAYS_SHORT.map((short, day) => (
          <button key={day} type="button" title={WEEKDAYS[day]} aria-pressed={form.weekdays.includes(day)}
            className={form.weekdays.includes(day) ? 'is-on' : ''} onClick={() => toggleDay(day)}>{short}</button>
        ))}
        <FieldError message={fieldErrors.weekdays || fieldErrors.weekday} />
      </fieldset>

      <div className="goal-form-row">
        <label>Desde
          <input type="time" className={invalid('startMinute')} value={form.start} onChange={(e) => updateField('start', e.target.value)} />
        </label>
        <label>Hasta
          <input type="time" className={invalid('endMinute')} value={form.end} onChange={(e) => updateField('end', e.target.value)} />
        </label>
      </div>
      <FieldError message={fieldErrors.startMinute || fieldErrors.endMinute} />

      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>{busy ? 'Guardando…' : block ? 'Guardar' : 'Agregar a la rutina'}</button>
        <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>
        {onDelete && <button type="button" className="goal-btn-danger" onClick={onDelete}>Borrar</button>}
      </div>
    </form>
  );
}

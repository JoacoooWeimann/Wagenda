import { useState } from 'react';
import { buildTrackerPayload } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';

// Crear o editar un seguimiento (un área: Gimnasio, Facultad…). `onSave`
// devuelve una promesa que rechaza con los errores por campo del servidor.
export default function TrackerForm({ tracker, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: tracker?.name ?? '',
    itemLabel: tracker?.itemLabel ?? '',
    description: tracker?.description ?? ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(buildTrackerPayload(form));
    } catch (err) {
      setFieldErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');

  return (
    <form className="goal-form" onSubmit={handleSubmit} noValidate>
      <div className="goal-form-row">
        <label>Nombre
          <input type="text" maxLength={40} placeholder="Ej. Gimnasio, Facultad, Trabajo" autoFocus
            className={invalid('name')} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <FieldError message={fieldErrors.name} />
        </label>
        <label>Sus ítems se llaman
          <input type="text" maxLength={20} placeholder="Ej. Ejercicio, Materia, Proyecto" className={invalid('itemLabel')}
            value={form.itemLabel} onChange={(e) => updateField('itemLabel', e.target.value)} />
          <FieldError message={fieldErrors.itemLabel} />
        </label>
      </div>
      <input type="text" maxLength={200} placeholder="Descripción (opcional)" className={invalid('description')}
        value={form.description} onChange={(e) => updateField('description', e.target.value)} />
      <FieldError message={fieldErrors.description} />
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : tracker ? 'Guardar' : 'Crear seguimiento'}
        </button>
        {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}

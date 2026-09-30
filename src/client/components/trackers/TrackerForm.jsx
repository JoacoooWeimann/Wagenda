import { useState } from 'react';
import { GOAL_TYPES } from '../../utiles/goals.js';
import { buildTrackerPayload } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';

// Crear o editar un seguimiento. `onSave(payload)` devuelve una promesa que
// rechaza con los errores por campo del servidor.
export default function TrackerForm({ tracker, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: tracker?.name ?? '',
    unit: tracker?.unit ?? '',
    higherIsBetter: tracker?.higherIsBetter ?? true,
    type: tracker?.type ?? ''
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
          <input type="text" maxLength={40} placeholder="Ej. Press banca, Rating Premier" autoFocus
            className={invalid('name')} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <FieldError message={fieldErrors.name} />
        </label>
        <label>Unidad
          <input type="text" maxLength={10} placeholder="kg, min, pts" className={invalid('unit')}
            value={form.unit} onChange={(e) => updateField('unit', e.target.value)} />
          <FieldError message={fieldErrors.unit} />
        </label>
      </div>
      <div className="goal-form-row">
        <label>Mejor es
          <select value={form.higherIsBetter ? 'mas' : 'menos'} onChange={(e) => updateField('higherIsBetter', e.target.value === 'mas')}>
            <option value="mas">Más (peso, puntos)</option>
            <option value="menos">Menos (tiempo)</option>
          </select>
        </label>
        <label>Categoría
          <select className={invalid('type')} value={form.type} onChange={(e) => updateField('type', e.target.value)}>
            <option value="">Sin categoría</option>
            {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <FieldError message={fieldErrors.type} />
        </label>
      </div>
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : tracker ? 'Guardar' : 'Crear seguimiento'}
        </button>
        {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}

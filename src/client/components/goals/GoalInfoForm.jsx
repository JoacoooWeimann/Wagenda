import { useState } from 'react';
import { GOAL_TYPES } from '../../utiles/goals.js';
import { FieldError } from '../common.jsx';
import ItemSelect from './ItemSelect.jsx';

// Edición de los datos básicos (título, tipo, descripción y, en fases, el
// seguimiento vinculado). La estrategia no se edita: define la estructura del
// plan. `onSave` devuelve una promesa que rechaza con los errores por campo.
export default function GoalInfoForm({ goal, trackers = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    title: goal.title,
    type: goal.type,
    description: goal.description ?? '',
    itemId: goal.itemId ? String(goal.itemId) : ''
  });
  const isFases = goal.strategy === 'fases';
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
      const { itemId, ...changes } = form;
      // '' = ninguno (null desvincula); en contenido no se manda
      await onSave(isFases ? { ...changes, itemId: itemId ? Number(itemId) : null } : changes);
    } catch (err) {
      setFieldErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');

  return (
    <form className="goal-form goal-info-form" onSubmit={handleSubmit} noValidate>
      <div className="goal-form-row">
        <label>Título
          <input type="text" maxLength={100} className={invalid('title')} value={form.title}
            onChange={(e) => updateField('title', e.target.value)} />
          <FieldError message={fieldErrors.title} />
        </label>
        <label>Tipo
          <select className={invalid('type')} value={form.type} onChange={(e) => updateField('type', e.target.value)}>
            {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <FieldError message={fieldErrors.type} />
        </label>
      </div>
      {isFases && (
        <div className="goal-form-row">
          <ItemSelect trackers={trackers} value={form.itemId} error={fieldErrors.itemId}
            onChange={(value) => updateField('itemId', value)} />
        </div>
      )}
      <textarea placeholder="Descripción (opcional)" maxLength={1000} rows={2} className={invalid('description')}
        value={form.description} onChange={(e) => updateField('description', e.target.value)} />
      <FieldError message={fieldErrors.description} />
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

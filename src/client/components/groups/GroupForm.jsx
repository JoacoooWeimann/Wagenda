import { useState } from 'react';
import { FieldError } from '../common.jsx';

// Crear o editar un grupo. El límite semanal es opcional: vacío = sin límite.
export default function GroupForm({ group, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: group?.name ?? '',
    description: group?.description ?? '',
    weeklyLimit: group?.weeklyLimit ? String(group.weeklyLimit) : ''
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
      await onSave({ ...form, weeklyLimit: form.weeklyLimit === '' ? null : Number(form.weeklyLimit) });
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
          <input type="text" maxLength={40} placeholder="Ej. Los pibes" autoFocus className={invalid('name')}
            value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <FieldError message={fieldErrors.name} />
        </label>
        <label>Límite semanal (opcional)
          <input type="number" min={1} max={50} placeholder="Sin límite" className={invalid('weeklyLimit')}
            value={form.weeklyLimit} onChange={(e) => updateField('weeklyLimit', e.target.value)} />
          <FieldError message={fieldErrors.weeklyLimit} />
        </label>
      </div>
      <p className="goal-meta">
        El límite es anti-spam: el grupo solo cuenta los primeros N registros por semana de cada persona en cada
        seguimiento. En tu cuenta seguís viendo todo.
      </p>
      <input type="text" maxLength={200} placeholder="Descripción (opcional)" className={invalid('description')}
        value={form.description} onChange={(e) => updateField('description', e.target.value)} />
      <FieldError message={fieldErrors.description} />
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : group ? 'Guardar' : 'Crear grupo'}
        </button>
        {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}

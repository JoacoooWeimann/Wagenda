import { useState } from 'react';
import { FieldError } from '../common.jsx';

// Crear o editar un tablero. `onSave(payload)` devuelve una promesa que
// rechaza con los errores por campo del servidor.
export default function BoardForm({ board, onSave, onCancel }) {
  const [form, setForm] = useState({ name: board?.name ?? '', description: board?.description ?? '' });
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
      await onSave(form);
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
          <input type="text" maxLength={40} placeholder="Ej. Gimnasio, CS2" autoFocus className={invalid('name')}
            value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <FieldError message={fieldErrors.name} />
        </label>
        <label>Descripción (opcional)
          <input type="text" maxLength={200} className={invalid('description')}
            value={form.description} onChange={(e) => updateField('description', e.target.value)} />
          <FieldError message={fieldErrors.description} />
        </label>
      </div>
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : board ? 'Guardar' : 'Crear tablero'}
        </button>
        {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}

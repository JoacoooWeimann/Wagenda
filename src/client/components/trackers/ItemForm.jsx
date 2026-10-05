import { useState } from 'react';
import { buildItemPayload } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';

// Crear o editar un ítem (un ejercicio, una materia…). `noun` es cómo se llaman
// en ese seguimiento. Al editar, `moveTo` lista los otros seguimientos propios
// a los que se puede pasar. `onSave` rechaza con los errores por campo.
export default function ItemForm({ item, noun, moveTo = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    name: item?.name ?? '',
    kind: item?.kind ?? 'medicion',
    unit: item?.unit ?? '',
    higherIsBetter: item?.higherIsBetter ?? true,
    trackerId: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const isMeasure = form.kind === 'medicion';

  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = buildItemPayload(form);
      if (form.trackerId) payload.trackerId = Number(form.trackerId);
      await onSave(payload);
    } catch (err) {
      setFieldErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');

  return (
    <form className="goal-form item-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="goal-strategy tracker-kind">
        <legend>Tipo</legend>
        <label>
          <input type="radio" name={`kind-${item?.id ?? 'nuevo'}`} checked={isMeasure} onChange={() => updateField('kind', 'medicion')} />
          <span><strong>Medición</strong> · cargás valores (kg, puntos, nota)</span>
        </label>
        <label>
          <input type="radio" name={`kind-${item?.id ?? 'nuevo'}`} checked={!isMeasure} onChange={() => updateField('kind', 'actividad')} />
          <span><strong>Actividad</strong> · cuenta las tareas hechas</span>
        </label>
        <FieldError message={fieldErrors.kind} />
      </fieldset>

      <div className="goal-form-row">
        <label>{noun}
          <input type="text" maxLength={40} autoFocus placeholder={isMeasure ? 'Ej. Press banca, Parcial 1' : 'Ej. Lógica, Cardio'}
            className={invalid('name')} value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <FieldError message={fieldErrors.name} />
        </label>
        {isMeasure && (
          <label>Unidad
            <input type="text" maxLength={10} placeholder="kg, min, pts" className={invalid('unit')}
              value={form.unit} onChange={(e) => updateField('unit', e.target.value)} />
            <FieldError message={fieldErrors.unit} />
          </label>
        )}
      </div>

      {(isMeasure || moveTo.length > 0) && (
        <div className="goal-form-row">
          {isMeasure && (
            <label>Mejor es
              <select value={form.higherIsBetter ? 'mas' : 'menos'} onChange={(e) => updateField('higherIsBetter', e.target.value === 'mas')}>
                <option value="mas">Más (peso, puntos, nota)</option>
                <option value="menos">Menos (tiempo)</option>
              </select>
            </label>
          )}
          {moveTo.length > 0 && (
            <label>Pasar a otro seguimiento
              <select className={invalid('trackerId')} value={form.trackerId} onChange={(e) => updateField('trackerId', e.target.value)}>
                <option value="">Dejarlo acá</option>
                {moveTo.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </select>
              <FieldError message={fieldErrors.trackerId} />
            </label>
          )}
        </div>
      )}

      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : item ? 'Guardar' : `Agregar ${noun.toLowerCase()}`}
        </button>
        <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { buildTrackerPayload } from '../../utiles/trackers.js';
import { FieldError } from '../common.jsx';

// Crear o editar un seguimiento. `boardId` es el tablero donde se crea (null =
// sin tablero); al editar, el select permite moverlo. `onSave(payload)` devuelve
// una promesa que rechaza con los errores por campo del servidor.
export default function TrackerForm({ tracker, boards = [], boardId = null, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: tracker?.name ?? '',
    kind: tracker?.kind ?? 'medicion',
    unit: tracker?.unit ?? '',
    higherIsBetter: tracker?.higherIsBetter ?? true,
    boardId: String((tracker ? tracker.boardId : boardId) ?? '')
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

  const isMeasure = form.kind === 'medicion';

  return (
    <form className="goal-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="goal-strategy tracker-kind">
        <legend>Tipo</legend>
        <label>
          <input type="radio" name="kind" checked={isMeasure} onChange={() => updateField('kind', 'medicion')} />
          <span><strong>Medición</strong> · cargás valores (kg, puntos, tiempo)</span>
        </label>
        <label>
          <input type="radio" name="kind" checked={!isMeasure} onChange={() => updateField('kind', 'actividad')} />
          <span><strong>Actividad</strong> · cuenta las tareas hechas (ej. Facultad)</span>
        </label>
        <FieldError message={fieldErrors.kind} />
      </fieldset>

      <div className="goal-form-row">
        <label>Nombre
          <input type="text" maxLength={40} placeholder={isMeasure ? 'Ej. Press banca, Rating Premier' : 'Ej. Facultad, Trabajo, Lectura'} autoFocus
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
      <div className="goal-form-row">
        {isMeasure && (
          <label>Mejor es
            <select value={form.higherIsBetter ? 'mas' : 'menos'} onChange={(e) => updateField('higherIsBetter', e.target.value === 'mas')}>
              <option value="mas">Más (peso, puntos)</option>
              <option value="menos">Menos (tiempo)</option>
            </select>
          </label>
        )}
        <label>Tablero
          <select className={invalid('boardId')} value={form.boardId} onChange={(e) => updateField('boardId', e.target.value)}>
            <option value="">Sin tablero</option>
            {/* Las copias de tableros compartidos no reciben seguimientos propios */}
            {boards.filter(b => !b.sharedBy).map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
          <FieldError message={fieldErrors.boardId} />
        </label>
      </div>
      <p className="goal-meta">Cualquier seguimiento puede tener tareas vinculadas: al elegirlo en una tarea, cuenta como actividad.</p>
      <div className="goal-actions">
        <button type="submit" className="goal-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : tracker ? 'Guardar' : 'Crear seguimiento'}
        </button>
        {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}

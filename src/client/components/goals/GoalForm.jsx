import { useState } from 'react';
import { previewGoal, createGoal } from '../../utiles/api.js';
import { GOAL_TYPES, suggestedStrategy, todayKey, buildGoalPayload, countNoun, MAX_CONTENT_TYPES } from '../../utiles/goals.js';
import { FieldError, ErrorBanner } from '../common.jsx';
import PlanWeeks from './PlanWeeks.jsx';
import ItemSelect from './ItemSelect.jsx';

const initialForm = () => ({
  title: '',
  description: '',
  type: 'academico',
  strategy: 'divisible',
  startDate: todayKey(),
  deadline: '',
  contents: [{ name: 'Unidad', count: '' }],
  reviewWeek: true,
  sessionsPerWeek: '3',
  itemId: ''
});

export default function GoalForm({ trackers = [], onCreated, onCancel }) {
  const [form, setForm] = useState(initialForm);
  const [strategyTouched, setStrategyTouched] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Cualquier cambio invalida la vista previa: lo que se crea es siempre lo que se vio
  function updateField(name, value) {
    setForm(f => ({ ...f, [name]: value }));
    setFieldErrors(({ [name]: _, ...rest }) => rest);
    setPreview(null);
  }

  // Mientras el usuario no elija la estrategia a mano, sigue la sugerida por el tipo
  function changeType(type) {
    updateField('type', type);
    if (!strategyTouched) setForm(f => ({ ...f, strategy: suggestedStrategy(type) }));
  }

  function changeStrategy(strategy) {
    setStrategyTouched(true);
    updateField('strategy', strategy);
  }

  // Filas de tipos de contenido: todas comparten el error `contents`
  function updateContent(index, field, value) {
    updateField('contents', form.contents.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }
  const addContent = () => updateField('contents', [...form.contents, { name: '', count: '' }]);
  const removeContent = (index) => updateField('contents', form.contents.filter((_, i) => i !== index));

  function showError(err) {
    const fields = err.fields || {};
    setFieldErrors(fields);
    setError(Object.keys(fields).length > 0 ? 'Revisá los campos marcados' : err.message);
  }

  async function handlePreview(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewGoal(buildGoalPayload(form)));
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  // Manda los mismos datos del formulario, no el plan: el servidor lo vuelve a
  // generar (es determinista) y nunca confía en un plan armado por el cliente.
  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      await createGoal(buildGoalPayload(form));
      setForm(initialForm());
      setStrategyTouched(false);
      setPreview(null);
      onCreated();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  const invalid = (name) => (fieldErrors[name] ? 'is-invalid' : '');
  const totalTarget = preview?.weeks.reduce((n, w) => n + w.target, 0);

  return (
    <section className="goals-card">
      <h2 className="goals-title">Nuevo objetivo</h2>
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <form className="goal-form" onSubmit={handlePreview} noValidate>
        <div className="calendar-field">
          <input type="text" placeholder="Título (ej. Aprobar Álgebra)" maxLength={100} autoFocus
            className={invalid('title')} value={form.title} onChange={(e) => updateField('title', e.target.value)} />
          <FieldError message={fieldErrors.title} />
        </div>

        <div className="goal-form-row">
          <label>Tipo
            <select className={invalid('type')} value={form.type} onChange={(e) => changeType(e.target.value)}>
              {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <FieldError message={fieldErrors.type} />
          </label>
          <fieldset className="goal-strategy">
            <legend>Estrategia</legend>
            <label><input type="radio" name="strategy" checked={form.strategy === 'divisible'}
              onChange={() => changeStrategy('divisible')} /> Por contenido</label>
            <label><input type="radio" name="strategy" checked={form.strategy === 'fases'}
              onChange={() => changeStrategy('fases')} /> Por fases</label>
          </fieldset>
        </div>

        <div className="goal-form-row">
          <label>Desde
            <input type="date" className={invalid('startDate')} value={form.startDate}
              onChange={(e) => updateField('startDate', e.target.value)} />
            <FieldError message={fieldErrors.startDate} />
          </label>
          <label>Fecha límite
            <input type="date" className={invalid('deadline')} value={form.deadline}
              onChange={(e) => updateField('deadline', e.target.value)} />
            <FieldError message={fieldErrors.deadline} />
          </label>
        </div>

        {form.strategy === 'divisible' ? (
          <>
            <fieldset className="goal-contents">
              <legend>Contenidos</legend>
              {form.contents.map((content, i) => (
                <div className="goal-content-row" key={i}>
                  <input type="number" min={1} max={100} placeholder="Cant." aria-label={`Cantidad del contenido ${i + 1}`}
                    className={invalid('contents')} value={content.count}
                    onChange={(e) => updateContent(i, 'count', e.target.value)} />
                  <input type="text" maxLength={30} placeholder="Nombre (ej. Unidad, TP)" aria-label={`Nombre del contenido ${i + 1}`}
                    className={invalid('contents')} value={content.name}
                    onChange={(e) => updateContent(i, 'name', e.target.value)} />
                  {form.contents.length > 1 && (
                    <button type="button" className="goal-task-remove" onClick={() => removeContent(i)} aria-label={`Quitar contenido ${i + 1}`}>✕</button>
                  )}
                </div>
              ))}
              {form.contents.length < MAX_CONTENT_TYPES && (
                <button type="button" className="goal-btn goal-btn-small" onClick={addContent}>+ Agregar tipo de contenido</button>
              )}
              <FieldError message={fieldErrors.contents} />
            </fieldset>
            <label className="goal-checkbox">
              <input type="checkbox" checked={form.reviewWeek} onChange={(e) => updateField('reviewWeek', e.target.checked)} />
              Reservar el final para repaso
            </label>
          </>
        ) : (
          <div className="goal-form-row">
            <label>Sesiones por semana
              <input type="number" min={1} max={7} className={invalid('sessionsPerWeek')} value={form.sessionsPerWeek}
                onChange={(e) => updateField('sessionsPerWeek', e.target.value)} />
              <FieldError message={fieldErrors.sessionsPerWeek} />
            </label>
            <ItemSelect trackers={trackers} value={form.itemId} error={fieldErrors.itemId}
              onChange={(value) => updateField('itemId', value)} />
          </div>
        )}

        <div className="calendar-field">
          <textarea placeholder="Descripción (opcional)" maxLength={1000} rows={2} className={invalid('description')}
            value={form.description} onChange={(e) => updateField('description', e.target.value)} />
          <FieldError message={fieldErrors.description} />
        </div>

        {!preview && (
          <div className="goal-actions">
            <button type="submit" className="goal-btn-primary" disabled={busy}>{busy ? 'Generando…' : 'Ver plan'}</button>
            {onCancel && <button type="button" className="goal-btn" onClick={onCancel}>Cancelar</button>}
          </div>
        )}
      </form>

      {preview && (
        <div className="goal-preview">
          <h3>
            Vista previa · {preview.weeks.length} semanas · {totalTarget} {countNoun(form.strategy, totalTarget)} en total
          </h3>
          <PlanWeeks weeks={preview.weeks} strategy={form.strategy} />
          <div className="goal-actions">
            <button type="button" className="goal-btn-primary" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creando…' : 'Crear plan'}
            </button>
            <button type="button" className="goal-btn" onClick={() => setPreview(null)}>Modificar</button>
          </div>
        </div>
      )}
    </section>
  );
}

import { FieldError } from '../common.jsx';

// Seguimiento vinculado a un objetivo por fases (opcional). `value` es el id
// como texto ('' = ninguno), igual que los demás campos del formulario.
export default function TrackerSelect({ trackers, value, error, onChange }) {
  if (trackers.length === 0) {
    return (
      <p className="goal-meta">
        Podés vincular un <a href="/trackers">seguimiento</a> para cargar una medición en cada sesión.
      </p>
    );
  }
  return (
    <label>Seguimiento (opcional)
      <select className={error ? 'is-invalid' : ''} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ninguno</option>
        {trackers.map(t => <option key={t.id} value={String(t.id)}>{t.name}{t.unit ? ` (${t.unit})` : ''}</option>)}
      </select>
      <FieldError message={error} />
    </label>
  );
}

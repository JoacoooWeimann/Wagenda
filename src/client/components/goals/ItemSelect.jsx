import { FieldError } from '../common.jsx';

// Ítem de un seguimiento vinculado a un objetivo por fases (opcional), agrupado
// por seguimiento: "Gimnasio › Press banca". `value` es el id como texto
// ('' = ninguno). Cada sesión suma actividad al ítem y, si es de medición,
// puede cargar un valor.
export default function ItemSelect({ trackers, value, error, onChange }) {
  const withItems = trackers.filter(t => t.items.length > 0);
  if (withItems.length === 0) {
    return (
      <p className="goal-meta">
        Podés vincularlo a un ítem de un <a href="/trackers">seguimiento</a> (ej. Gimnasio › Press banca) para que
        cada sesión sume ahí y puedas cargar el valor.
      </p>
    );
  }
  return (
    <label>Seguimiento (opcional)
      <select className={error ? 'is-invalid' : ''} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ninguno</option>
        {withItems.map(t => (
          <optgroup key={t.id} label={t.name}>
            {t.items.map(i => <option key={i.id} value={String(i.id)}>{i.name}{i.unit ? ` (${i.unit})` : ''}</option>)}
          </optgroup>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

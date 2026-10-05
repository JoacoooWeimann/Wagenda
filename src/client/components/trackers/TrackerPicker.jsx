import { itemNoun } from '../../utiles/trackers.js';

// Seguimiento de una tarea y, opcional, uno de sus ítems ("Facultad" y después
// "Lógica"). Los ids viajan como texto ('' = ninguno). Al cambiar de
// seguimiento se borra el ítem: era de otro. Sin seguimientos, invita a crear uno.
export default function TrackerPicker({ options, trackerId, itemId, invalid = '', onChange }) {
  if (options.length === 0) {
    return (
      <span className="tracker-picker-empty">
        <i className="bi bi-graph-up-arrow" aria-hidden="true" /> <a href="/trackers">Creá un seguimiento</a> para clasificar tus tareas
      </span>
    );
  }
  const tracker = options.find(t => String(t.id) === trackerId);

  return (
    <>
      <select className={invalid} value={trackerId} aria-label="Seguimiento"
        onChange={(e) => onChange({ trackerId: e.target.value, itemId: '' })}>
        <option value="">Sin seguimiento</option>
        {options.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
      </select>
      {tracker && tracker.items.length > 0 && (
        <select value={itemId} aria-label={itemNoun(tracker)} onChange={(e) => onChange({ trackerId, itemId: e.target.value })}>
          <option value="">{`Sin ${itemNoun(tracker).toLowerCase()} (todo ${tracker.name})`}</option>
          {tracker.items.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
        </select>
      )}
    </>
  );
}

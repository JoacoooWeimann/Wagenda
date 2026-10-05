import { groupTrackerOptions } from '../../utiles/trackers.js';

// Select de seguimiento para una tarea, agrupado por tablero. `value` es el id
// como texto ('' = sin seguimiento). Sin seguimientos, invita a crear uno.
export default function TrackerPicker({ options, value, className, onChange }) {
  if (options.length === 0) {
    return (
      <span className="tracker-picker-empty">
        <i className="bi bi-graph-up-arrow" aria-hidden="true" /> <a href="/trackers">Creá un seguimiento</a> para clasificar tus tareas
      </span>
    );
  }
  const { loose, groups } = groupTrackerOptions(options);
  const option = (o) => <option key={o.id} value={String(o.id)}>{o.name}</option>;

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Seguimiento">
      <option value="">Sin seguimiento</option>
      {loose.map(option)}
      {groups.map(g => <optgroup key={g.name} label={g.name}>{g.options.map(option)}</optgroup>)}
    </select>
  );
}

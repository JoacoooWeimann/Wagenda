import { useState, useEffect } from 'react';
import { getTrackers, getTracker, createTracker } from '../../utiles/api.js';
import { todayKey } from '../../utiles/goals.js';
import { ErrorBanner } from '../common.jsx';
import TrackerForm from './TrackerForm.jsx';
import TrackerSection from './TrackerSection.jsx';

const byName = (a, b) => a.name.localeCompare(b.name);

export default function TrackersPage() {
  const [trackers, setTrackers] = useState(null); // null = todavía cargando
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const today = todayKey();

  // Sin seguimientos, el formulario arranca abierto
  useEffect(() => {
    getTrackers()
      .then(data => {
        setTrackers(data);
        setShowForm(data.length === 0);
      })
      .catch(err => {
        setError(`No se pudieron cargar los seguimientos: ${err.message}`);
        setTrackers([]);
      });
  }, []);

  // Un cambio en un ítem puede tocar dos seguimientos (al pasarlo de uno a
  // otro): se recarga la lista entera, que es barata
  async function handleChange(updated) {
    setTrackers(ts => ts.map(t => (t.id === updated.id ? updated : t)));
    try {
      setTrackers(await getTrackers());
    } catch {
      // ya se mostró el cambio principal; la lista se actualiza en la próxima carga
    }
  }

  // Después de cargar o borrar un registro: los resúmenes los calcula el servidor
  async function reload(id) {
    const updated = await getTracker(id);
    setTrackers(ts => ts.map(t => (t.id === id ? updated : t)));
  }

  async function handleCreate(payload) {
    const created = await createTracker(payload); // si falla, TrackerForm muestra los errores
    setTrackers(ts => [...ts, created].sort(byName));
    setShowForm(false);
  }

  const handleDelete = (id) => setTrackers(ts => ts.filter(t => t.id !== id));

  if (trackers === null) return <div className="goals-container"><p className="goals-empty">Cargando…</p></div>;

  return (
    <div className="goals-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Seguimientos</h2>
          {!showForm && (
            <button type="button" className="goal-btn-primary" onClick={() => setShowForm(true)}>+ Nuevo seguimiento</button>
          )}
        </div>
        <p className="goals-empty">
          Un seguimiento es un área que querés medir en el tiempo: el gimnasio, la facultad, el trabajo. Adentro
          agregás sus ítems (ejercicios, materias, proyectos): unos con valores (kg, notas) y otros que cuentan las
          tareas que hacés. Al clasificar una tarea en un seguimiento, suma a su actividad.
        </p>
        {showForm && <TrackerForm onSave={handleCreate} onCancel={trackers.length > 0 ? () => setShowForm(false) : null} />}
      </section>

      {trackers.map(tracker => (
        <TrackerSection key={tracker.id} tracker={tracker} today={today}
          others={trackers.filter(t => t.id !== tracker.id)}
          onChange={handleChange} onDelete={handleDelete} onReload={reload} onError={setError} />
      ))}
    </div>
  );
}

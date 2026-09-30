import { useState, useEffect } from 'react';
import { getTrackers, getTracker, createTracker, deleteTracker } from '../../utiles/api.js';
import { todayKey } from '../../utiles/goals.js';
import { ErrorBanner } from '../common.jsx';
import TrackerCard from './TrackerCard.jsx';
import TrackerForm from './TrackerForm.jsx';

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

  const replace = (updated) => setTrackers(ts => ts.map(t => (t.id === updated.id ? updated : t)));

  // Después de cargar o borrar un registro: el resumen lo calcula el servidor
  async function reload(id) {
    replace(await getTracker(id));
  }

  async function handleCreate(payload) {
    const created = await createTracker(payload); // si falla, TrackerForm muestra los errores
    setTrackers(ts => [...ts, created].sort((a, b) => a.name.localeCompare(b.name)));
    setShowForm(false);
  }

  async function handleDelete(id) {
    try {
      await deleteTracker(id);
      setTrackers(ts => ts.filter(t => t.id !== id));
    } catch (err) {
      setError(`No se pudo borrar el seguimiento: ${err.message}`);
    }
  }

  return (
    <div className="goals-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Mis seguimientos</h2>
          {!showForm && (
            <button type="button" className="goal-btn-primary" onClick={() => setShowForm(true)}>+ Nuevo seguimiento</button>
          )}
        </div>
        <p className="goals-empty">
          Algo que medís en el tiempo, sin fecha límite: el peso que levantás, tu rating, tu tiempo en 5 km.
          Un objetivo por fases puede vincularse a uno para cargar la medición al registrar la sesión.
        </p>

        {trackers === null && <p className="goals-empty">Cargando…</p>}
        {trackers?.map(tracker => (
          <TrackerCard key={tracker.id} tracker={tracker} today={today}
            onChange={replace} onReload={reload} onDelete={handleDelete} onError={setError} />
        ))}
      </section>

      {showForm && (
        <section className="goals-card">
          <h2 className="goals-title">Nuevo seguimiento</h2>
          <TrackerForm onSave={handleCreate} onCancel={trackers?.length > 0 ? () => setShowForm(false) : null} />
        </section>
      )}
    </div>
  );
}

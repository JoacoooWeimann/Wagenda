import { useState, useEffect } from 'react';
import { getGoals, deleteGoal, getTrackerOptions } from '../../utiles/api.js';
import { todayKey, isClosed } from '../../utiles/goals.js';
import { ErrorBanner } from '../common.jsx';
import GoalCard from './GoalCard.jsx';
import GoalForm from './GoalForm.jsx';

export default function GoalsPage() {
  const [goals, setGoals] = useState(null); // null = todavía cargando
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [trackers, setTrackers] = useState([]); // para vincular objetivos por fases
  const [error, setError] = useState(null);
  const today = todayKey();

  async function loadGoals() {
    try {
      const data = await getGoals();
      setGoals(data);
      return data;
    } catch (err) {
      setError(`No se pudieron cargar los objetivos: ${err.message}`);
      setGoals([]);
      return [];
    }
  }

  // Sin objetivos, el formulario arranca abierto; con objetivos, plegado
  useEffect(() => {
    loadGoals().then(data => setShowForm(data.length === 0));
    // Si falla, los objetivos siguen funcionando: solo no se ofrece vincular
    getTrackerOptions().then(setTrackers).catch(() => setTrackers([]));
  }, []);

  async function handleCreated() {
    await loadGoals();
    setShowForm(false);
  }

  const handleChange = (updated) => setGoals(gs => gs.map(g => (g.id === updated.id ? updated : g)));

  async function handleDelete(id) {
    try {
      await deleteGoal(id);
      setGoals(gs => gs.filter(g => g.id !== id));
    } catch (err) {
      setError(`No se pudo borrar el objetivo: ${err.message}`);
    }
  }

  // Activos arriba; los cerrados van al historial (plegado). Se separa en el
  // cliente: en SQLite el enum se guarda como texto y ordenaría alfabéticamente.
  const active = goals?.filter(g => !isClosed(g)) ?? [];
  const history = goals?.filter(isClosed) ?? [];
  const card = (goal) => (
    <GoalCard key={goal.id} goal={goal} today={today} trackers={trackers} onChange={handleChange} onDelete={handleDelete} onError={setError} />
  );

  return (
    <div className="goals-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Mis objetivos</h2>
          {!showForm && (
            <button type="button" className="goal-btn-primary" onClick={() => setShowForm(true)}>+ Nuevo objetivo</button>
          )}
        </div>

        {goals === null && <p className="goals-empty">Cargando…</p>}
        {goals?.length === 0 && <p className="goals-empty">Todavía no tenés objetivos. Creá el primero abajo.</p>}
        {goals?.length > 0 && active.length === 0 && <p className="goals-empty">No tenés objetivos en curso.</p>}
        {active.map(card)}
      </section>

      {history.length > 0 && (
        <section className="goals-card">
          <div className="goals-header">
            <h2 className="goals-title">Historial ({history.length})</h2>
            <button type="button" className="goal-btn" onClick={() => setShowHistory(h => !h)} aria-expanded={showHistory}>
              {showHistory ? 'Ocultar ▴' : 'Ver ▾'}
            </button>
          </div>
          {showHistory && history.map(card)}
        </section>
      )}

      {showForm && (
        <GoalForm
          trackers={trackers}
          onCreated={handleCreated}
          onCancel={goals?.length > 0 ? () => setShowForm(false) : null}
        />
      )}
    </div>
  );
}

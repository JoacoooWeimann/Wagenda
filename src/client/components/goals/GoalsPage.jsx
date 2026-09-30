import { useState, useEffect } from 'react';
import { getGoals, deleteGoal } from '../../utiles/api.js';
import { todayKey } from '../../utiles/goals.js';
import { ErrorBanner } from '../common.jsx';
import GoalCard from './GoalCard.jsx';
import GoalForm from './GoalForm.jsx';

export default function GoalsPage() {
  const [goals, setGoals] = useState(null); // null = todavía cargando
  const [showForm, setShowForm] = useState(false);
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
        {goals?.map(goal => (
          <GoalCard key={goal.id} goal={goal} today={today} onChange={handleChange} onDelete={handleDelete} onError={setError} />
        ))}
      </section>

      {showForm && (
        <GoalForm
          onCreated={handleCreated}
          onCancel={goals?.length > 0 ? () => setShowForm(false) : null}
        />
      )}
    </div>
  );
}

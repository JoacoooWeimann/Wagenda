import { useState } from 'react';
import { logSession } from '../../utiles/api.js';

// Registrar una sesión de un objetivo por fases en el día abierto.
// `goals` ya viene filtrado: objetivos por fases cuyo plazo incluye ese día.
export default function SessionLogger({ goals, date, onLogged, onError }) {
  const [goalId, setGoalId] = useState(goals[0].id);
  const [logging, setLogging] = useState(false);

  async function handleLog() {
    setLogging(true);
    onError(null);
    try {
      onLogged(await logSession(goalId, date));
    } catch (err) {
      onError(`No se pudo registrar la sesión: ${Object.values(err.fields || {})[0] || err.message}`);
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="calendar-session">
      <span>Registrar sesión de</span>
      {goals.length === 1 ? (
        <strong>{goals[0].title}</strong>
      ) : (
        <select value={goalId} onChange={(e) => setGoalId(Number(e.target.value))} aria-label="Objetivo">
          {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      )}
      <button type="button" onClick={handleLog} disabled={logging}>{logging ? '…' : '+ Registrar'}</button>
    </div>
  );
}

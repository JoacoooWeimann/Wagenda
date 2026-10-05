import { useState } from 'react';
import { updateTracker, deleteTracker, createItem } from '../../utiles/api.js';
import { itemNoun } from '../../utiles/trackers.js';
import ActivitySummary from './ActivitySummary.jsx';
import TrackerForm from './TrackerForm.jsx';
import ItemForm from './ItemForm.jsx';
import ItemCard from './ItemCard.jsx';

// Un seguimiento (Gimnasio, Facultad…): su actividad total (todas sus tareas,
// con o sin ítem) y sus ítems. Una copia de uno compartido (sharedBy) es de
// solo lectura en su estructura: se cargan registros y tareas, y se deja
// desde la página de Grupos.
export default function TrackerSection({ tracker, others, today, onChange, onDelete, onReload, onError }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCopy = tracker.sharedBy !== null;
  const noun = itemNoun(tracker);
  // Seguimientos propios (no copias) a los que se puede pasar un ítem
  const moveTo = others.filter(t => !t.sharedBy);

  async function saveTracker(payload) {
    onChange(await updateTracker(tracker.id, payload)); // si falla, TrackerForm muestra los errores
    setEditing(false);
  }

  async function addItem(payload) {
    onChange(await createItem(tracker.id, payload)); // si falla, ItemForm muestra los errores
    setAdding(false);
  }

  async function handleDelete() {
    try {
      await deleteTracker(tracker.id);
      onDelete(tracker.id);
    } catch (err) {
      onError(`No se pudo borrar el seguimiento: ${err.message}`);
      setConfirmingDelete(false);
    }
  }

  return (
    <section className="goals-card tracker-section">
      {editing ? (
        <TrackerForm tracker={tracker} onSave={saveTracker} onCancel={() => setEditing(false)} />
      ) : (
        <div className="goals-header">
          <div>
            <h2 className="goals-title">{tracker.name}</h2>
            {tracker.description && <p className="goal-meta">{tracker.description}</p>}
            {isCopy && (
              <p className="goal-meta">
                <i className="bi bi-people" aria-hidden="true" /> Compartido por {tracker.sharedBy.name} (@{tracker.sharedBy.username}).
                Para dejarlo, andá a <a href="/groups">Grupos</a>.
              </p>
            )}
          </div>
          {!isCopy && (
            <div className="goal-actions">
              <button type="button" className="goal-btn goal-btn-small" onClick={() => setEditing(true)}>Editar</button>
              {confirmingDelete ? (
                <span className="goal-confirm">
                  ¿Borrar {tracker.name} con todos sus ítems y registros? Las tareas quedan.
                  <button type="button" className="goal-btn-danger" onClick={handleDelete}>Borrar</button>
                  <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                </span>
              ) : (
                <button type="button" className="goal-btn goal-btn-small" onClick={() => setConfirmingDelete(true)}>Borrar</button>
              )}
            </div>
          )}
        </div>
      )}

      <ActivitySummary activity={tracker.activity} today={today} label={`Tareas hechas por semana en ${tracker.name}`} />

      <div className="tracker-items">
        {tracker.items.length === 0 && !adding && (
          <p className="goals-empty">
            Todavía no hay {noun.toLowerCase()}s. {!isCopy && `Agregá uno para seguir algo puntual dentro de ${tracker.name}.`}
          </p>
        )}
        {tracker.items.map(item => (
          <ItemCard key={item.id} item={item} noun={noun} moveTo={moveTo} today={today}
            // en una copia, solo los ítems que siguen vinculados son de solo lectura
            readOnly={item.sourceItemId !== null}
            onTrackerChange={onChange} onReload={() => onReload(tracker.id)} onError={onError} />
        ))}
      </div>

      {!isCopy && (adding ? (
        <div className="item-card">
          <ItemForm noun={noun} onSave={addItem} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" className="day-add-task" onClick={() => setAdding(true)}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> Agregar {noun.toLowerCase()}
        </button>
      ))}
    </section>
  );
}

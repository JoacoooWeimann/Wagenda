import { useState } from 'react';
import BoardForm from './BoardForm.jsx';
import TrackerForm from './TrackerForm.jsx';
import TrackerCard from './TrackerCard.jsx';

// Un tablero con sus seguimientos. Sin `board` es la sección "Sin tablero":
// no se edita ni se borra, y lo que se crea ahí queda sin tablero. Una copia de
// un tablero compartido (board.sharedBy) es de solo lectura: se cargan registros
// pero la estructura la define su dueño, y se deja desde la página de Grupos.
export default function BoardSection({
  board, trackers, boards, today, cardProps, onCreateTracker, onUpdateBoard, onDeleteBoard
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isCopy = Boolean(board?.sharedBy);

  async function createTracker(payload) {
    await onCreateTracker(payload); // si falla, TrackerForm muestra los errores
    setAdding(false);
  }

  async function saveBoard(payload) {
    await onUpdateBoard(board.id, payload);
    setEditing(false);
  }

  return (
    <section className="goals-card">
      {editing ? (
        <BoardForm board={board} onSave={saveBoard} onCancel={() => setEditing(false)} />
      ) : (
        <div className="goals-header">
          <div>
            <h2 className="goals-title">{board ? board.name : 'Sin tablero'}</h2>
            {board?.description && <p className="goal-meta">{board.description}</p>}
            {isCopy && (
              <p className="goal-meta">
                Compartido por {board.sharedBy.name} (@{board.sharedBy.username}). Para dejarlo, andá a <a href="/groups">Grupos</a>.
              </p>
            )}
          </div>
          {board && !isCopy && (
            <div className="goal-actions">
              <button type="button" className="goal-btn" onClick={() => setEditing(true)}>Editar</button>
              {confirmingDelete ? (
                <span className="goal-confirm">
                  ¿Borrar el tablero? Sus seguimientos pasan a «Sin tablero».
                  <button type="button" className="goal-btn-danger" onClick={() => onDeleteBoard(board.id)}>Borrar</button>
                  <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button>
                </span>
              ) : (
                <button type="button" className="goal-btn" onClick={() => setConfirmingDelete(true)}>Borrar</button>
              )}
            </div>
          )}
        </div>
      )}

      {trackers.length === 0 && !adding && <p className="goals-empty">Todavía no hay seguimientos en este tablero.</p>}
      {trackers.map(tracker => (
        <TrackerCard key={tracker.id} tracker={tracker} boards={boards} today={today} {...cardProps} />
      ))}

      {isCopy ? null : adding ? (
        <div className="goal-card">
          <h3 className="tracker-new-title">Nuevo seguimiento{board ? ` en ${board.name}` : ''}</h3>
          <TrackerForm boards={boards} boardId={board?.id ?? null} onSave={createTracker} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" className="goal-btn goal-btn-small" onClick={() => setAdding(true)}>+ Nuevo seguimiento</button>
      )}
    </section>
  );
}

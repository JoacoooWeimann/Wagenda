import { useState, useEffect } from 'react';
import {
  getTrackers, getTracker, createTracker, deleteTracker, getBoards, createBoard, updateBoard, deleteBoard
} from '../../utiles/api.js';
import { todayKey } from '../../utiles/goals.js';
import { groupByBoard } from '../../utiles/trackers.js';
import { ErrorBanner } from '../common.jsx';
import BoardForm from './BoardForm.jsx';
import BoardSection from './BoardSection.jsx';

const byName = (a, b) => a.name.localeCompare(b.name);

export default function TrackersPage() {
  const [boards, setBoards] = useState(null); // null = todavía cargando
  const [trackers, setTrackers] = useState([]);
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [error, setError] = useState(null);
  const today = todayKey();

  // Sin nada creado, el formulario de tablero arranca abierto
  useEffect(() => {
    Promise.all([getBoards(), getTrackers()])
      .then(([b, t]) => {
        setBoards(b);
        setTrackers(t);
        setShowBoardForm(b.length === 0 && t.length === 0);
      })
      .catch(err => {
        setError(`No se pudieron cargar los seguimientos: ${err.message}`);
        setBoards([]);
      });
  }, []);

  const replace = (updated) => setTrackers(ts => ts.map(t => (t.id === updated.id ? updated : t)));

  // Después de cargar o borrar un registro: el resumen lo calcula el servidor
  async function reload(id) {
    replace(await getTracker(id));
  }

  async function handleCreateTracker(payload) {
    const created = await createTracker(payload);
    setTrackers(ts => [...ts, created].sort(byName));
  }

  async function handleDeleteTracker(id) {
    try {
      await deleteTracker(id);
      setTrackers(ts => ts.filter(t => t.id !== id));
    } catch (err) {
      setError(`No se pudo borrar el seguimiento: ${err.message}`);
    }
  }

  async function handleCreateBoard(payload) {
    const created = await createBoard(payload);
    setBoards(bs => [...bs, created].sort(byName));
    setShowBoardForm(false);
  }

  async function handleUpdateBoard(id, payload) {
    const updated = await updateBoard(id, payload);
    setBoards(bs => bs.map(b => (b.id === id ? updated : b)).sort(byName));
  }

  // En la base es SetNull: sus seguimientos quedan sin tablero. Se refleja igual acá.
  async function handleDeleteBoard(id) {
    try {
      await deleteBoard(id);
      setBoards(bs => bs.filter(b => b.id !== id));
      setTrackers(ts => ts.map(t => (t.boardId === id ? { ...t, boardId: null } : t)));
    } catch (err) {
      setError(`No se pudo borrar el tablero: ${err.message}`);
    }
  }

  if (boards === null) return <div className="goals-container"><p className="goals-empty">Cargando…</p></div>;

  const { sections, loose } = groupByBoard(boards, trackers);
  const shared = {
    boards,
    today,
    onCreateTracker: handleCreateTracker,
    onUpdateBoard: handleUpdateBoard,
    onDeleteBoard: handleDeleteBoard,
    cardProps: { onChange: replace, onReload: reload, onDelete: handleDeleteTracker, onError: setError }
  };

  return (
    <div className="goals-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Seguimientos</h2>
          {!showBoardForm && (
            <button type="button" className="goal-btn-primary" onClick={() => setShowBoardForm(true)}>+ Nuevo tablero</button>
          )}
        </div>
        <p className="goals-empty">
          Un seguimiento es algo que medís en el tiempo, sin fecha límite: el peso que levantás, tu rating, tu tiempo
          en 5 km. Agrupalos en tableros (ej. «Gimnasio», «CS2»). Un objetivo por fases puede vincularse a un
          seguimiento para cargar la medición al registrar la sesión.
        </p>
        {showBoardForm && (
          <BoardForm onSave={handleCreateBoard} onCancel={boards.length > 0 || trackers.length > 0 ? () => setShowBoardForm(false) : null} />
        )}
      </section>

      {sections.map(({ board, trackers: inBoard }) => (
        <BoardSection key={board.id} board={board} trackers={inBoard} {...shared} />
      ))}
      {/* "Sin tablero": solo si hay seguimientos sueltos, o si todavía no hay tableros */}
      {(loose.length > 0 || boards.length === 0) && <BoardSection board={null} trackers={loose} {...shared} />}
    </div>
  );
}

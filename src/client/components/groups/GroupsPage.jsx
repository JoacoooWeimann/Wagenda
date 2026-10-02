import { useState, useEffect } from 'react';
import { getGroups, getGroup, createGroup, joinGroup, getBoards } from '../../utiles/api.js';
import { normalizeCode } from '../../utiles/groups.js';
import { ErrorBanner, FieldError } from '../common.jsx';
import GroupForm from './GroupForm.jsx';
import GroupDetail from './GroupDetail.jsx';

// Grupos de amigos. Arriba la lista y cómo entrar o crear uno; abajo el grupo
// elegido. El link de invitación (/groups?join=CÓDIGO) llega con el código cargado.
export default function GroupsPage({ me }) {
  const [groups, setGroups] = useState(null); // null = todavía cargando
  const [boards, setBoards] = useState([]);   // propios, para compartir
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('join') ?? '');
  const [codeError, setCodeError] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getGroups().then(setGroups).catch(err => {
      setError(`No se pudieron cargar los grupos: ${err.message}`);
      setGroups([]);
    });
    getBoards().then(setBoards).catch(() => setBoards([]));
  }, []);

  async function open(id) {
    try {
      setSelected(await getGroup(id));
    } catch (err) {
      setError(`No se pudo abrir el grupo: ${err.message}`);
    }
  }

  // Refresca el grupo elegido y su fila en la lista (nombre, cantidad de miembros)
  function handleChange(detail) {
    setSelected(detail);
    const summary = { id: detail.id, name: detail.name, description: detail.description, myRole: detail.myRole, memberCount: detail.members.length };
    setGroups(gs => (gs.some(g => g.id === detail.id) ? gs.map(g => (g.id === detail.id ? summary : g)) : [...gs, summary])
      .sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleGone(id) {
    setGroups(gs => gs.filter(g => g.id !== id));
    setSelected(null);
  }

  async function handleCreate(payload) {
    handleChange(await createGroup(payload)); // si falla, GroupForm muestra los errores
    setShowForm(false);
  }

  async function handleJoin(e) {
    e.preventDefault();
    try {
      handleChange(await joinGroup(normalizeCode(code)));
      setCode('');
      setCodeError(null);
      window.history.replaceState(null, '', '/groups'); // saca ?join= de la URL
    } catch (err) {
      setCodeError(err.fields?.code || err.message);
    }
  }

  return (
    <div className="goals-container">
      <ErrorBanner message={error} onClose={() => setError(null)} />

      <section className="goals-card">
        <div className="goals-header">
          <h2 className="goals-title">Mis grupos</h2>
          {!showForm && <button type="button" className="goal-btn-primary" onClick={() => setShowForm(true)}>+ Nuevo grupo</button>}
        </div>
        <p className="goals-empty">
          En un grupo cada uno elige qué tablero compartir y a cuáles unirse. Entrar a un grupo no comparte nada tuyo.
          Los objetivos nunca se comparten.
        </p>

        {groups === null && <p className="goals-empty">Cargando…</p>}
        {groups?.length === 0 && <p className="goals-empty">Todavía no estás en ningún grupo.</p>}
        <ul className="group-list">
          {groups?.map(g => (
            <li key={g.id}>
              <button type="button" className={selected?.id === g.id ? 'goal-btn-primary' : 'goal-btn'} onClick={() => open(g.id)}>
                {g.name} · {g.memberCount} {g.memberCount === 1 ? 'miembro' : 'miembros'}{g.myRole === 'owner' ? ' · administrás' : ''}
              </button>
            </li>
          ))}
        </ul>

        <form className="goal-session-form" onSubmit={handleJoin} noValidate>
          <input type="text" placeholder="Código de invitación" aria-label="Código de invitación" maxLength={12}
            className={codeError ? 'is-invalid' : ''} value={code}
            onChange={(e) => { setCode(e.target.value); setCodeError(null); }} />
          <button type="submit" className="goal-btn-primary" disabled={!code.trim()}>Entrar</button>
          <FieldError message={codeError} />
        </form>

        {showForm && <GroupForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      </section>

      {selected && (
        <GroupDetail key={selected.id} group={selected} boards={boards} me={me}
          onChange={handleChange} onGone={handleGone} onError={setError} />
      )}
    </div>
  );
}

import { useState } from 'react';
import {
  updateGroup, deleteGroup, regenerateCode, transferGroup, leaveGroup, kickMember,
  shareBoard, unshareBoard, joinBoard, leaveBoard
} from '../../utiles/api.js';
import { inviteLink, shareableBoards } from '../../utiles/groups.js';
import GroupForm from './GroupForm.jsx';
import Ranking from './Ranking.jsx';

// Un grupo: invitación, miembros y tableros compartidos. Cada acción devuelve
// el grupo actualizado desde el servidor (onChange); salir o borrar lo saca
// de la lista (onGone).
export default function GroupDetail({ group, boards, me, onChange, onGone, onError }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(null); // 'delete' | 'leave' | { kick: userId } | { transfer: userId }
  const [boardToShare, setBoardToShare] = useState('');
  const [openRanking, setOpenRanking] = useState(null); // id del tablero compartido desplegado
  const [copied, setCopied] = useState(false);

  const isOwner = group.myRole === 'owner';
  const link = inviteLink(group.inviteCode, window.location.origin);
  const available = shareableBoards(boards, group);

  async function run(action, errorPrefix) {
    try {
      const result = await action();
      if (result?.id) onChange(result);
    } catch (err) {
      const fieldMessage = Object.values(err.fields || {})[0];
      onError(`${errorPrefix}: ${fieldMessage || err.message}`);
    } finally {
      setConfirming(null);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('No se pudo copiar: copiá el link a mano');
    }
  }

  async function saveGroup(payload) {
    onChange(await updateGroup(group.id, payload)); // si falla, GroupForm muestra los errores
    setEditing(false);
  }

  async function goAway(action, errorPrefix) {
    try {
      await action();
      onGone(group.id);
    } catch (err) {
      onError(`${errorPrefix}: ${err.message}`);
      setConfirming(null);
    }
  }

  const confirmBox = (text, onYes) => (
    <span className="goal-confirm">
      {text}
      <button type="button" className="goal-btn-danger" onClick={onYes}>Sí</button>
      <button type="button" className="goal-btn" onClick={() => setConfirming(null)}>Cancelar</button>
    </span>
  );

  return (
    <section className="goals-card">
      {editing ? (
        <GroupForm group={group} onSave={saveGroup} onCancel={() => setEditing(false)} />
      ) : (
        <div className="goals-header">
          <div>
            <h2 className="goals-title">{group.name}</h2>
            {group.description && <p className="goal-meta">{group.description}</p>}
            {group.weeklyLimit && <p className="goal-meta">Límite: {group.weeklyLimit} registros por semana</p>}
          </div>
          <div className="goal-actions">
            {isOwner && <button type="button" className="goal-btn" onClick={() => setEditing(true)}>Editar</button>}
            {confirming === 'delete'
              ? confirmBox('¿Borrar el grupo? Nadie pierde sus datos.', () => goAway(() => deleteGroup(group.id), 'No se pudo borrar'))
              : confirming === 'leave'
                ? confirmBox('¿Salir del grupo?', () => goAway(() => leaveGroup(group.id), 'No se pudo salir'))
                : isOwner
                  ? <button type="button" className="goal-btn" onClick={() => setConfirming('delete')}>Borrar grupo</button>
                  : <button type="button" className="goal-btn" onClick={() => setConfirming('leave')}>Salir</button>}
          </div>
        </div>
      )}

      <div className="group-invite">
        <span>Invitación: <code>{group.inviteCode}</code></span>
        <button type="button" className="goal-btn goal-btn-small" onClick={copyLink}>{copied ? '✔ Copiado' : 'Copiar link'}</button>
        {isOwner && (
          <button type="button" className="goal-btn goal-btn-small"
            onClick={() => run(() => regenerateCode(group.id), 'No se pudo regenerar')}>Regenerar código</button>
        )}
      </div>

      <h3 className="group-subtitle">Miembros</h3>
      <ul className="group-members">
        {group.members.map(member => (
          <li key={member.id}>
            <span>{member.name} <small>@{member.username}</small>{member.role === 'owner' && <em> · administra</em>}</span>
            {isOwner && member.id !== me.id && (
              confirming?.kick === member.id
                ? confirmBox(`¿Expulsar a ${member.name}?`, () => run(() => kickMember(group.id, member.id), 'No se pudo expulsar'))
                : confirming?.transfer === member.id
                ? confirmBox(`¿Darle la administración a ${member.name}? Vos quedás como miembro.`,
                    () => run(() => transferGroup(group.id, member.id), 'No se pudo transferir'))
                : (
                  <span className="goal-actions">
                    <button type="button" className="goal-btn goal-btn-small" onClick={() => setConfirming({ transfer: member.id })}>Darle la administración</button>
                    <button type="button" className="goal-btn goal-btn-small" onClick={() => setConfirming({ kick: member.id })}>Expulsar</button>
                  </span>
                )
            )}
          </li>
        ))}
      </ul>

      <h3 className="group-subtitle">Tableros compartidos</h3>
      {group.shares.length === 0 && <p className="goals-empty">Todavía nadie compartió un tablero.</p>}
      {group.shares.map(share => (
        <article key={share.id} className="goal-card">
          <div className="goal-card-header">
            <h3>{share.board.name}</h3>
            <span className="goal-type">de @{share.owner.username}</span>
          </div>
          <p className="goal-meta">
            {share.participants} {share.participants === 1 ? 'participa' : 'participan'}
            {share.isMine ? ' · es tuyo' : share.joined ? ' · participás' : ''}
          </p>
          <div className="goal-actions">
            <button type="button" className="goal-btn" aria-expanded={openRanking === share.id}
              onClick={() => setOpenRanking(o => (o === share.id ? null : share.id))}>
              {openRanking === share.id ? 'Ocultar ranking ▴' : 'Ver ranking ▾'}
            </button>
            {!share.isMine && (share.joined
              ? <button type="button" className="goal-btn"
                  onClick={() => run(() => leaveBoard(group.id, share.id), 'No se pudo salir del tablero')}>Dejar de participar</button>
              : <button type="button" className="goal-btn-primary"
                  onClick={() => run(() => joinBoard(group.id, share.id), 'No se pudo unir')}>Unirme</button>)}
            {(share.isMine || isOwner) && (
              <button type="button" className="goal-btn"
                onClick={() => run(() => unshareBoard(group.id, share.id), 'No se pudo quitar')}>
                {share.isMine ? 'Dejar de compartir' : 'Quitar del grupo'}
              </button>
            )}
          </div>
          {!share.isMine && !share.joined && (
            <p className="goal-meta">Al unirte recibís una copia del tablero en tus Seguimientos. Lo que cargues es tuyo.</p>
          )}
          {openRanking === share.id && <Ranking groupId={group.id} shareId={share.id} onError={onError} />}
        </article>
      ))}

      {available.length > 0 && (
        <form className="goal-session-form" onSubmit={(e) => {
          e.preventDefault();
          if (boardToShare) run(() => shareBoard(group.id, Number(boardToShare)), 'No se pudo compartir').then(() => setBoardToShare(''));
        }}>
          <select value={boardToShare} onChange={(e) => setBoardToShare(e.target.value)} aria-label="Tablero a compartir">
            <option value="">Compartir un tablero tuyo…</option>
            {available.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </select>
          <button type="submit" className="goal-btn-primary" disabled={!boardToShare}>Compartir</button>
        </form>
      )}
    </section>
  );
}

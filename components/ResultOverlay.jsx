'use client';
import { getAvatar } from '@/lib/game/avatars';
import Avatar from './Avatar';

export default function ResultOverlay({ winner, draw, abandoned, iWon, isHost, onPlayAgain, onLeave, onClose, busy }) {
  const av = winner ? getAvatar(winner.avatar) : null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="result">
        {winner ? (
          <>
            <div className="trophy" style={{ '--c': av.color }}><Avatar avatar={av} /></div>
            <h2>{iWon ? 'You are the last one standing' : `${winner.name} is the last one standing`}</h2>
            {abandoned && <p className="muted">Everyone else left the room.</p>}
          </>
        ) : (
          <>
            <div className="trophy">💥</div>
            <h2>{draw ? 'Nobody wins this one' : 'Game over'}</h2>
            <p className="muted">Everyone was eliminated, or the arena ran out of room.</p>
          </>
        )}
        <div className="row center">
          {isHost ? (
            <button className="btn primary" onClick={onPlayAgain} disabled={busy}>Play again</button>
          ) : (
            <span className="hint">Waiting for the host to start a rematch…</span>
          )}
          <button className="btn ghost" onClick={onClose}>View board</button>
          <button className="btn ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}

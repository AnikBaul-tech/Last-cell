'use client';
import { getAvatar } from '@/lib/game/avatars';

export default function PlayerList({ players, hostId, myId, showStatus = false }) {
  return (
    <ul className="players">
      {players.map((p) => {
        const av = getAvatar(p.avatar);
        const out = showStatus && !p.is_alive;
        return (
          <li key={p.id} className={`player${out ? ' out' : ''}`} style={{ '--c': av.color }}>
            <span className="player-face">{av.emoji}</span>
            <span className="player-name">
              {p.name}
              {p.id === myId && <em className="tag">you</em>}
              {p.id === hostId && <em className="tag host">host</em>}
            </span>
            {showStatus && <span className="player-state">{p.is_alive ? 'alive' : 'out'}</span>}
          </li>
        );
      })}
    </ul>
  );
}

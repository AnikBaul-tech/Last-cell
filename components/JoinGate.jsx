'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { loadProfile, saveProfile, saveSession } from '@/lib/client/session';
import { AVATARS } from '@/lib/game/avatars';
import ProfileForm from './ProfileForm';

/** Shown when someone opens a room link without being in that room yet. */
export default function JoinGate({ code, room, players, onJoined }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('cowboy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = loadProfile();
    if (p?.name) setName(p.name);
    setAvatar(p?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)].id);
  }, []);

  const taken = players.map((p) => p.avatar);
  const locked = room.status !== 'lobby';
  const full = players.length >= room.settings.maxPlayers;

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      saveProfile({ name, avatar });
      const d = await api(`/api/rooms/${code}/join`, { name, avatar });
      const session = { playerId: d.playerId, secret: d.secret };
      saveSession(code, session);
      await onJoined(session);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <main className="page narrow">
      <h1 className="code">{code}</h1>
      <p className="muted">{players.length} / {room.settings.maxPlayers} players in the lobby</p>
      {locked ? (
        <section className="card"><p>This game has already started. Ask the host for a new room.</p></section>
      ) : (
        <section className="card">
          <ProfileForm name={name} avatar={avatar} taken={taken} onName={setName} onAvatar={setAvatar} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary big" disabled={busy || full} onClick={join}>
            {full ? 'Room is full' : busy ? 'Joining…' : 'Join room'}
          </button>
        </section>
      )}
      <Link href="/" className="link">Back to start</Link>
    </main>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { loadProfile, loadSession, saveProfile, saveSession } from '@/lib/client/session';
import { AVATARS } from '@/lib/game/avatars';
import { ROOM_CODE_LENGTH } from '@/lib/game/constants';
import { playSfx } from '@/lib/audio/audioManager';
import ProfileForm from '@/components/ProfileForm';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('cowboy');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = loadProfile();
    if (p?.name) setName(p.name);
    setAvatar(p?.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)].id);
  }, []);

  const enter = async (kind) => {
    setError('');
    setBusy(kind);
    playSfx('click');
    try {
      saveProfile({ name, avatar });
      if (kind === 'create') {
        const d = await api('/api/rooms', { name, avatar });
        saveSession(d.code, { playerId: d.playerId, secret: d.secret });
        router.push(`/room/${d.code}`);
      } else {
        const c = code.trim().toUpperCase();
        if (c.length !== ROOM_CODE_LENGTH) throw new Error(`Room codes have ${ROOM_CODE_LENGTH} characters`);
        if (!loadSession(c)) {
          const d = await api(`/api/rooms/${c}/join`, { name, avatar });
          saveSession(c, { playerId: d.playerId, secret: d.secret });
        }
        router.push(`/room/${c}`);
      }
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };

  return (
    <main className="page narrow home">
      <h1 className="logo">Last Cell</h1>
      <p className="lede">Everyone moves in secret. Everyone fires at once. The floor keeps shrinking.</p>

      <section className="card">
        <ProfileForm name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
      </section>

      <section className="card two">
        <div className="stack">
          <h2>Host a game</h2>
          <button className="btn primary big" disabled={Boolean(busy)} onClick={() => enter('create')}>
            {busy === 'create' ? 'Creating…' : 'Create room'}
          </button>
        </div>
        <div className="stack">
          <h2>Join a game</h2>
          <input
            className="code-input"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder="ABCDE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && code && enter('join')}
          />
          <button className="btn big" disabled={Boolean(busy) || !code} onClick={() => enter('join')}>
            {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
        </div>
      </section>
      {error && <p className="error" role="alert">{error}</p>}

      <details className="card how">
        <summary>How a round works</summary>
        <p>Each round has a short planning timer. Move up to your move range and pick a direction to shoot. Nobody can see anyone else.</p>
        <p>When the timer ends, everyone is revealed and all shots land at once. A shot hits the first player in its line, so in a row A → B → C only B is hit by A. Two players aiming at each other both go down.</p>
        <p>Then the outer edge of the arena collapses. Anyone left standing on it falls. Be the last player alive.</p>
      </details>
    </main>
  );
}

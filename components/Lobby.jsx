'use client';
import { useEffect, useRef, useState } from 'react';
import { roomApi } from '@/lib/client/api';
import { saveProfile } from '@/lib/client/session';
import { playSfx } from '@/lib/audio/audioManager';
import PlayerList from './PlayerList';
import ProfileForm from './ProfileForm';
import SettingsPanel from './SettingsPanel';

export default function Lobby({ code, room, players, myPlayer, isHost, session, onLeave }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(myPlayer.name);
  const prevCount = useRef(players.length);

  useEffect(() => {
    if (players.length > prevCount.current) playSfx('join');
    prevCount.current = players.length;
  }, [players.length]);

  const settings = room.settings;
  const taken = players.filter((p) => p.id !== myPlayer.id).map((p) => p.avatar);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/room/${code}` : '';

  const guard = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const changeAvatar = (avatar) => guard(async () => {
    await roomApi(code, 'profile', session, { avatar });
    saveProfile({ name: myPlayer.name, avatar });
    playSfx('click');
  });
  const saveName = () => guard(async () => {
    if (name.trim() && name !== myPlayer.name) {
      await roomApi(code, 'profile', session, { name });
      saveProfile({ name, avatar: myPlayer.avatar });
    }
  });
  const start = async () => {
    setBusy(true);
    await guard(() => roomApi(code, 'start', session));
    setBusy(false);
  };

  const cells = settings.gridSize * settings.gridSize;
  const canStart = players.length >= 2 && players.length <= cells;

  return (
    <main className="page lobby">
      <header className="lobby-head">
        <div>
          <p className="muted">Room code</p>
          <h1 className="code">{code}</h1>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={copy}>{copied ? 'Link copied' : 'Copy invite link'}</button>
          <button className="btn ghost" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="lobby-grid">
        <section className="card">
          <div className="card-head">
            <h2>Players</h2>
            <span className="hint">{players.length} / {settings.maxPlayers}</span>
          </div>
          <PlayerList players={players} hostId={room.host_id} myId={myPlayer.id} />
        </section>

        <section className="card">
          <h2>Your character</h2>
          <ProfileForm
            name={name}
            avatar={myPlayer.avatar}
            taken={taken}
            onName={setName}
            onNameBlur={saveName}
            onAvatar={changeAvatar}
          />
        </section>

        <SettingsPanel
          settings={settings}
          editable={isHost}
          playerCount={players.length}
          onSave={(s) => roomApi(code, 'settings', session, { settings: s })}
        />

        <section className="card start-card">
          {isHost ? (
            <>
              <button className="btn primary big" disabled={!canStart || busy} onClick={start}>
                {busy ? 'Starting…' : 'Start game'}
              </button>
              <p className="hint">
                {players.length < 2
                  ? 'Waiting for at least one more player.'
                  : players.length > cells
                  ? 'Grid is too small for this many players.'
                  : `${players.length} players ready.`}
              </p>
            </>
          ) : (
            <p className="hint">Waiting for the host to start the game…</p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </div>
    </main>
  );
}

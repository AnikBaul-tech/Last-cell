'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import Countdown from './Countdown';
import PlayerList from './PlayerList';
import ResultOverlay from './ResultOverlay';
import { getAvatar } from '@/lib/game/avatars';
import { DEFAULT_SETTINGS, SPAWN_REVEAL_MS } from '@/lib/game/constants';
import { boundsHeight, boundsWidth, inBounds } from '@/lib/game/engine';
import { playSfx } from '@/lib/audio/audioManager';
import { roomApi } from '@/lib/client/api';

// Reveal timeline (ms from the start of the reveal phase)
const STAGE_AT = [0, 500, 1700, 2800]; // 0 start positions, 1 move, 2 shots, 3 deaths
const RESULT_AT = 4600; // winner overlay appears
const KEY_DIR = {
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  q: 'upleft', e: 'upright', z: 'downleft', c: 'downright', // diagonals
};
const keyOf = (to, dir) => `${to.x},${to.y},${dir ?? '-'}`;

function playRevealSounds(stage, result) {
  if (!result) return;
  if (stage === 1 && result.players.some((p) => p.from && (p.from.x !== p.to.x || p.from.y !== p.to.y))) playSfx('move');
  if (stage === 2) result.shots.slice(0, 8).forEach((_, i) => setTimeout(() => playSfx('shoot'), i * 90));
  if (stage === 3) {
    result.players
      .filter((p) => p.dead)
      .slice(0, 8)
      .forEach((p, i) => setTimeout(() => playSfx(p.fell ? 'fall' : 'die'), i * 140));
  }
}

/** Drives the reveal animation stages from the server's phase deadline (works for late joiners too). */
function useReveal(room, settings, serverNow) {
  const [stage, setStage] = useState(0);
  const [resultReady, setResultReady] = useState(false);

  useEffect(() => {
    if (room.phase !== 'reveal') {
      setStage(0);
      setResultReady(false);
      return;
    }
    const dur = room.round === 0 ? SPAWN_REVEAL_MS : settings.revealSeconds * 1000;
    const start = Date.parse(room.phase_ends_at) - dur;
    const elapsed = Math.max(0, serverNow() - start);
    const timers = [];
    let current = 0;
    STAGE_AT.forEach((t, i) => {
      if (i === 0) return;
      if (elapsed >= t) current = i;
      else
        timers.push(
          setTimeout(() => {
            setStage(i);
            playRevealSounds(i, room.last_result);
          }, t - elapsed)
        );
    });
    setStage(current);
    if (room.status === 'finished') {
      if (elapsed >= RESULT_AT) setResultReady(true);
      else timers.push(setTimeout(() => setResultReady(true), RESULT_AT - elapsed));
    } else setResultReady(false);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.round, room.phase, room.status, room.phase_ends_at]);

  return { stage, resultReady };
}

export default function Game({ code, room, players, me, myPlayer, isHost, session, serverNow, onLeave }) {
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...room.settings }), [room.settings]);
  const size = settings.gridSize;
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const myId = myPlayer.id;
  const iAmAlive = myPlayer.is_alive;
  const aliveCount = players.filter((p) => p.is_alive).length;
  const bounds = room.bounds || { x0: 0, y0: 0, x1: size - 1, y1: size - 1 };

  const [sel, setSel] = useState({ to: null, dir: null });
  const [lockedKey, setLockedKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const planning = room.status === 'playing' && room.phase === 'planning';
  const pos = me?.pos || null;
  const canAct = planning && iAmAlive && Boolean(pos);
  const { stage, resultReady } = useReveal(room, settings, serverNow);

  // new round => clear the draft selection
  useEffect(() => {
    setSel({ to: null, dir: null });
    setLockedKey(null);
    setNote('');
  }, [room.round, planning]);

  // refreshed mid-round => restore what I already locked in
  useEffect(() => {
    if (planning && me?.action) {
      setSel({ to: me.action.to, dir: me.action.dir });
      setLockedKey(keyOf(me.action.to, me.action.dir));
    }
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (room.status !== 'finished') setDismissed(false);
  }, [room.status]);

  useEffect(() => {
    if (!resultReady) return;
    const res = room.last_result;
    playSfx(res?.winnerId === myId ? 'win' : 'lose');
  }, [resultReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = sel.to || pos;
  const curKey = pos ? keyOf(target, sel.dir) : null;
  const dirty = lockedKey !== curKey;

  const lock = useCallback(
    async (silent = false) => {
      if (!canAct || !pos) return;
      const to = sel.to || pos;
      setBusy(true);
      setNote('');
      try {
        await roomApi(code, 'action', session, { to, dir: sel.dir });
        setLockedKey(keyOf(to, sel.dir));
        if (!silent) playSfx('lock');
      } catch (e) {
        setNote(e.message);
      } finally {
        setBusy(false);
      }
    },
    [canAct, pos, sel, code, session]
  );

  // keep the latest values reachable from timers / key handlers
  const lockRef = useRef(lock);
  const flagsRef = useRef({});
  lockRef.current = lock;
  flagsRef.current = { dirty, touched: Boolean(sel.to || sel.dir) };

  // auto lock-in right before the timer ends, if the draft was never submitted
  useEffect(() => {
    if (!canAct || !room.phase_ends_at) return;
    const ms = Date.parse(room.phase_ends_at) - serverNow() - 350;
    const t = setTimeout(() => {
      if (flagsRef.current.dirty && flagsRef.current.touched) lockRef.current(true);
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [canAct, room.round, room.phase_ends_at, serverNow]);

  const chooseDir = useCallback((d, toggle) => {
    setSel((s) => ({ ...s, dir: toggle && s.dir === d ? null : d }));
    playSfx('aim');
  }, []);

  useEffect(() => {
    if (!canAct) return;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      const k = e.key.toLowerCase();
      if (KEY_DIR[k]) {
        e.preventDefault();
        chooseDir(KEY_DIR[k], false);
      } else if (k === 'enter') {
        e.preventDefault();
        lockRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAct, chooseDir]);

  const reach = useMemo(() => {
    if (!canAct) return null;
    const set = new Set();
    const R = settings.moveRange;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        if (inBounds(bounds, x, y)) set.add(`${x},${y}`);
      }
    return set;
  }, [canAct, pos, bounds, settings.moveRange]);

  const onCellClick = (x, y) => {
    if (!canAct || !reach.has(`${x},${y}`)) return;
    setSel((s) => ({ ...s, to: { x, y } }));
    playSfx('click');
  };

  // ---- what to draw ----------------------------------------------------
  let avatars = [];
  let beams = [];
  let origin = null;
  const res = room.last_result;

  if (room.phase === 'reveal' && res) {
    res.players.forEach((rp) => {
      const pl = byId[rp.id];
      const av = getAvatar(pl?.avatar);
      const at = res.round === 0 || stage >= 1 ? rp.to : rp.from || rp.to;
      avatars.push({
        key: rp.id,
        src: av.src,
        color: av.color,
        label: pl?.name,
        x: at.x,
        y: at.y,
        dir: stage >= 2 && rp.dir && !rp.fell ? rp.dir : null,
        dead: stage >= 3 && rp.dead,
        fell: stage >= 3 && rp.fell,
        me: rp.id === myId,
        pop: res.round === 0,
      });
    });
    if (stage >= 2) {
      beams = res.shots.map((s) => ({
        key: `${res.round}-${s.by}`,
        from: s.from,
        end: s.end,
        color: getAvatar(byId[s.by]?.avatar).color,
        hit: s.hit.length > 0,
      }));
    }
  } else if (iAmAlive && pos) {
    const av = getAvatar(myPlayer.avatar);
    avatars = [
      {
        key: myId,
        src: av.src,
        color: av.color,
        label: myPlayer.name,
        x: target.x,
        y: target.y,
        dir: sel.dir,
        me: true,
        fast: true,
        danger: canAct && !inBounds(bounds, target.x, target.y),
      },
    ];
    if (canAct) origin = pos;
  } else if (!iAmAlive && me?.others) {
    avatars = me.others.map((o) => {
      const av = getAvatar(byId[o.id]?.avatar);
      return { key: o.id, src: av.src, color: av.color, label: byId[o.id]?.name, x: o.x, y: o.y, ghost: true };
    });
  }

  const stayingInRuins = canAct && !inBounds(bounds, target.x, target.y);
  const phaseLabel =
    room.status === 'finished' ? 'Game over'
    : room.phase === 'planning' ? 'Plan your move'
    : room.phase === 'resolving' ? 'Resolving…'
    : room.round === 0 ? 'Players take position'
    : 'Reveal';
  const showTimer = room.status === 'playing' && (room.phase === 'planning' || room.phase === 'reveal');

  const winner = res?.winnerId ? byId[res.winnerId] : null;
  const [resetBusy, setResetBusy] = useState(false);
  const playAgain = async () => {
    setResetBusy(true);
    try {
      await roomApi(code, 'reset', session);
    } catch (e) {
      setNote(e.message);
    }
    setResetBusy(false);
  };

  // [direction, arrow rotation in degrees (0 = pointing up), label, grid area]
  const DIR_BTN = [
    ['upleft', -45, 'Shoot up-left', 'r1 c1'],
    ['up', 0, 'Shoot up', 'r1 c2'],
    ['upright', 45, 'Shoot up-right', 'r1 c3'],
    ['left', -90, 'Shoot left', 'r2 c1'],
    ['right', 90, 'Shoot right', 'r2 c3'],
    ['downleft', -135, 'Shoot down-left', 'r3 c1'],
    ['down', 180, 'Shoot down', 'r3 c2'],
    ['downright', 135, 'Shoot down-right', 'r3 c3'],
  ];

  return (
    <main className="page game">
      <header className="hud">
        <div className="hud-chips">
          <span className="chip">Room {code}</span>
          <span className="chip">Round {room.round || '–'}</span>
          <span className="chip">{aliveCount} alive</span>
          <span className="chip">Arena {boundsWidth(bounds)}×{boundsHeight(bounds)}</span>
        </div>
        <div className="hud-phase">
          <h2>{phaseLabel}</h2>
          {showTimer && <Countdown endsAt={room.phase_ends_at} serverNow={serverNow} beep={canAct && room.phase === 'planning'} />}
        </div>
        <button className="btn ghost small" onClick={onLeave}>Leave</button>
      </header>

      <div className="game-body">
        <div className="board-col">
          {stayingInRuins && <p className="banner danger" role="alert">Your cell is collapsing. Pick a highlighted cell inside the arena or you fall.</p>}
          {planning && !iAmAlive && <p className="banner">You are out. You can still see where the survivors stand.</p>}
          <Board
            size={size}
            bounds={room.phase === 'reveal' && res?.bounds ? res.bounds : bounds}
            avatars={avatars}
            beams={beams}
            reach={reach}
            origin={origin}
            onCellClick={onCellClick}
          />
        </div>

        <aside className="side">
          {canAct && (
            <section className="card controls">
              <p className="hint">Tap a glowing cell to move, then choose where to shoot (8 directions, diagonals included). Everyone else is hidden until the reveal.</p>
              <div className="dpad" role="group" aria-label="Shooting direction">
                {DIR_BTN.map(([d, deg, label, area]) => (
                  <button
                    key={d}
                    type="button"
                    className={`dir ${area}${sel.dir === d ? ' on' : ''}`}
                    aria-label={label}
                    aria-pressed={sel.dir === d}
                    onClick={() => chooseDir(d, true)}
                  >
                    <svg className="glyph" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
                      <path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
                <button
                  type="button"
                  className={`dir r2 c2 none${sel.dir === null ? ' on' : ''}`}
                  aria-label="Hold fire"
                  title="Hold fire"
                  onClick={() => setSel((s) => ({ ...s, dir: null }))}
                >
                  ✕
                </button>
              </div>
              <button className="btn primary big" disabled={busy || !dirty} onClick={() => lock()}>
                {busy ? 'Locking…' : !dirty ? 'Locked in' : lockedKey ? 'Update move' : 'Lock in'}
              </button>
              <p className="hint">Locked: {room.locked_count} / {aliveCount} · Keys: arrows/WASD, Q E Z C for diagonals, Enter</p>
              {note && <p className="error" role="alert">{note}</p>}
            </section>
          )}
          {!canAct && note && <p className="error" role="alert">{note}</p>}
          <section className="card">
            <h2>Players</h2>
            <PlayerList players={players} hostId={room.host_id} myId={myId} showStatus />
          </section>
        </aside>
      </div>

      {room.status === 'finished' && resultReady && !dismissed && (
        <ResultOverlay
          winner={winner}
          draw={Boolean(res?.draw)}
          abandoned={Boolean(res?.abandoned)}
          iWon={res?.winnerId === myId}
          isHost={isHost}
          busy={resetBusy}
          onPlayAgain={playAgain}
          onLeave={onLeave}
          onClose={() => setDismissed(true)}
        />
      )}
      {room.status === 'finished' && resultReady && dismissed && (
        <div className="reopen">
          <button className="btn primary small" onClick={() => setDismissed(false)}>Show result</button>
        </div>
      )}
    </main>
  );
}

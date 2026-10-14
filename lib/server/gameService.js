// In-game operations: submit a move, advance phases (lazily, driven by client ticks), resolve rounds.
import { admin, must } from './db.js';
import { ApiError, bad } from './http.js';
import { DIRS } from '../game/constants.js';
import { canMove, fullBounds, inBounds, nextBounds, resolveRound as runRules } from '../game/engine.js';
import { getPlayers, getRoom, transferHostOrDelete } from './roomService.js';

const nowIso = () => new Date().toISOString();
const SUBMIT_GRACE_MS = 1500; // accept a lock-in that arrives just after the timer
const STUCK_RESOLVE_MS = 10000;

async function getActions(code, round) {
  return must(await admin().from('actions').select('*').eq('room_code', code).eq('round', round));
}

/** Conditional room update: only applies if the room is still in the expected (round, phase). */
async function claim(room, patch, expectPhase = room.phase) {
  const data = must(
    await admin()
      .from('rooms')
      .update({ ...patch, updated_at: nowIso() })
      .eq('code', room.code)
      .eq('round', room.round)
      .eq('phase', expectPhase)
      .select('code')
  );
  return Array.isArray(data) && data.length > 0;
}

export async function submitAction(code, player, priv, { to, dir }) {
  const room = await getRoom(code);
  if (room.status !== 'playing' || room.phase !== 'planning') throw new ApiError(409, 'Not in the planning phase');
  if (Date.now() > Date.parse(room.phase_ends_at) + SUBMIT_GRACE_MS) throw new ApiError(409, 'Time is up');
  if (!player.is_alive) throw new ApiError(403, 'You are out of the game');

  const cleanDir = dir === null || dir === undefined ? null : String(dir);
  if (cleanDir !== null && !DIRS[cleanDir]) throw bad('Invalid direction');
  const target = { x: Number(to?.x), y: Number(to?.y) };
  const here = { x: priv.x, y: priv.y };
  if (!canMove(here, target, room.settings.moveRange, room.settings.gridSize)) throw bad('You cannot reach that cell');
  if (!inBounds(room.bounds, target.x, target.y)) throw bad('That cell has been destroyed');

  must(
    await admin().from('actions').upsert({
      room_code: code,
      round: room.round,
      player_id: player.id,
      to_x: target.x,
      to_y: target.y,
      dir: cleanDir,
    })
  );

  return { ok: true, ...(await afterLockChange(room)) };
}

/** Update the locked counter; resolve immediately when every living player has locked in. */
async function afterLockChange(room) {
  const [players, actions] = await Promise.all([getPlayers(room.code), getActions(room.code, room.round)]);
  const alive = players.filter((p) => p.is_alive);
  const locked = alive.filter((p) => actions.some((a) => a.player_id === p.id)).length;
  if (alive.length > 0 && locked >= alive.length) {
    await resolveRound(room);
  } else {
    await claim(room, { locked_count: locked });
  }
  return { locked, total: alive.length };
}

export async function resolveRound(room) {
  const db = admin();
  // Claim first so concurrent ticks can't resolve the same round twice.
  const won = await claimPhase(room, 'planning', 'resolving');
  if (!won) return false;

  try {
    const [players, actionRows, privRows] = await Promise.all([
      getPlayers(room.code),
      getActions(room.code, room.round),
      db.from('player_private').select('player_id,x,y').eq('room_code', room.code).then(must),
    ]);
    const privBy = Object.fromEntries(privRows.map((r) => [r.player_id, r]));
    const alive = players.filter((p) => p.is_alive && privBy[p.id]?.x !== null && privBy[p.id]?.x !== undefined);
    const actions = {};
    for (const a of actionRows) actions[a.player_id] = { to: { x: a.to_x, y: a.to_y }, dir: a.dir };

    const res = runRules({
      round: room.round,
      bounds: room.bounds,
      gridSize: room.settings.gridSize,
      moveRange: room.settings.moveRange,
      shrinkMode: room.settings.shrinkMode,
      players: alive.map((p) => ({ id: p.id, x: privBy[p.id].x, y: privBy[p.id].y })),
      actions,
    });

    await Promise.all([
      ...res.entries.map((e) =>
        db.from('player_private').update({ x: e.to.x, y: e.to.y }).eq('player_id', e.id).then(must)
      ),
      res.deaths.length ? db.from('players').update({ is_alive: false }).in('id', res.deaths).then(must) : null,
    ]);

    const patch = {
      phase: 'reveal',
      phase_ends_at: new Date(Date.now() + room.settings.revealSeconds * 1000).toISOString(),
      last_result: res.result,
      locked_count: 0,
    };
    if (res.over) patch.status = 'finished';
    await claimPhase(room, 'resolving', 'reveal', patch);
    return true;
  } catch (e) {
    console.error('resolveRound failed, reopening planning', e);
    await claimPhase(room, 'resolving', 'planning', {
      phase_ends_at: new Date(Date.now() + 4000).toISOString(),
    });
    throw e;
  }
}

/** Atomically move a room from one phase to another (same round). */
async function claimPhase(room, from, to, extra = {}) {
  const data = must(
    await admin()
      .from('rooms')
      .update({ phase: to, updated_at: nowIso(), ...extra })
      .eq('code', room.code)
      .eq('round', room.round)
      .eq('phase', from)
      .select('code')
  );
  return Array.isArray(data) && data.length > 0;
}

async function startNextRound(room) {
  const size = room.settings.gridSize;
  const nextRound = room.round + 1;
  const bounds = room.round === 0 ? fullBounds(size) : nextBounds(room.bounds, room.settings.shrinkMode, nextRound);

  if (!bounds) {
    // Safety net: arena cannot shrink further.
    await claimPhase(room, 'reveal', 'reveal', {
      status: 'finished',
      last_result: { round: room.round, bounds: room.bounds, players: [], shots: [], deaths: [], over: true, winnerId: null, draw: true },
    });
    return;
  }
  const won = await claimPhase(room, 'reveal', 'planning', {
    round: nextRound,
    bounds,
    locked_count: 0,
    phase_ends_at: new Date(Date.now() + room.settings.planSeconds * 1000).toISOString(),
  });
  // NOTE: claimPhase filters on the OLD round, so it only succeeds for one racer.
  if (won) {
    admin().from('actions').delete().eq('room_code', room.code).lt('round', nextRound).then(() => {});
  }
}

/** Anyone may poke this. It only does something when a deadline has actually passed. */
export async function advance(code) {
  const room = await getRoom(code);
  const now = Date.now();
  if (room.status !== 'playing') return { state: 'idle', now };

  if (room.phase === 'resolving') {
    if (now - Date.parse(room.updated_at) > STUCK_RESOLVE_MS) {
      await claimPhase(room, 'resolving', 'planning', { phase_ends_at: new Date(now + 4000).toISOString() });
    }
    return { state: 'resolving', now };
  }

  const ends = room.phase_ends_at ? Date.parse(room.phase_ends_at) : 0;
  if (now < ends) return { state: 'wait', remainingMs: ends - now, now };

  if (room.phase === 'planning') await resolveRound(room);
  else if (room.phase === 'reveal') await startNextRound(room);
  return { state: 'advanced', now: Date.now() };
}

/** Private view for one player: own position, own pending move, spectator view if eliminated. */
export async function getMe(code, player, priv) {
  const db = admin();
  const room = await getRoom(code);
  const out = {
    now: Date.now(),
    alive: player.is_alive,
    pos: priv.x === null || priv.x === undefined ? null : { x: priv.x, y: priv.y },
    action: null,
    others: null,
  };
  if (room.status === 'playing' && room.phase === 'planning') {
    const a = must(
      await db.from('actions').select('*').eq('room_code', code).eq('round', room.round).eq('player_id', player.id).maybeSingle()
    );
    if (a) out.action = { to: { x: a.to_x, y: a.to_y }, dir: a.dir };
  }
  if (!player.is_alive && room.status !== 'lobby') {
    const [players, privRows] = await Promise.all([
      getPlayers(code),
      db.from('player_private').select('player_id,x,y').eq('room_code', code).then(must),
    ]);
    const privBy = Object.fromEntries(privRows.map((r) => [r.player_id, r]));
    out.others = players
      .filter((p) => p.is_alive && privBy[p.id]?.x !== null && privBy[p.id]?.x !== undefined)
      .map((p) => ({ id: p.id, x: privBy[p.id].x, y: privBy[p.id].y }));
  }
  return out;
}

export async function leaveRoom(code, player) {
  const db = admin();
  const room = await getRoom(code);

  if (room.status !== 'playing') {
    await transferHostOrDelete(code, player.id);
    // transferHostOrDelete reads the roster before deletion, so delete after.
    must(await db.from('players').delete().eq('id', player.id));
    return { ok: true };
  }

  // Mid-game: the player is eliminated but stays in the roster so results still make sense.
  must(await db.from('players').update({ is_alive: false, left_at: nowIso() }).eq('id', player.id));
  const players = await getPlayers(code);
  const present = players.filter((p) => !p.left_at);
  if (present.length === 0) {
    must(await db.from('rooms').delete().eq('code', code));
    return { ok: true };
  }
  if (room.host_id === player.id) {
    must(await db.from('rooms').update({ host_id: present[0].id, updated_at: nowIso() }).eq('code', code));
  }
  const alive = players.filter((p) => p.is_alive);

  if (alive.length <= 1) {
    must(
      await db
        .from('rooms')
        .update({
          status: 'finished',
          phase: 'reveal',
          phase_ends_at: nowIso(),
          locked_count: 0,
          last_result: {
            round: room.round,
            bounds: room.bounds,
            players: [],
            shots: [],
            deaths: [],
            over: true,
            winnerId: alive[0]?.id ?? null,
            draw: alive.length === 0,
            abandoned: true,
          },
          updated_at: nowIso(),
        })
        .eq('code', code)
    );
  } else if (room.phase === 'planning') {
    await afterLockChange(room);
  }
  return { ok: true };
}

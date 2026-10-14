// Lobby-level operations: create / join / leave / settings / profile / start / reset.
import { randomBytes } from 'node:crypto';
import { admin, must } from './db.js';
import { ApiError, bad } from './http.js';
import { AVATARS, isValidAvatar } from '../game/avatars.js';
import {
  DEFAULT_SETTINGS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SPAWN_REVEAL_MS,
  sanitizeSettings,
} from '../game/constants.js';
import { fullBounds, spawnPositions } from '../game/engine.js';

const nowIso = () => new Date().toISOString();

export function cleanName(name) {
  const n = String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
  return n || `Guest${Math.floor(100 + Math.random() * 900)}`;
}

function generateCode() {
  let s = '';
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return s;
}

/** Use the requested avatar if free, otherwise the first free one. */
function pickAvatar(requested, taken) {
  if (isValidAvatar(requested) && !taken.includes(requested)) return requested;
  const free = AVATARS.find((a) => !taken.includes(a.id));
  if (!free) throw new ApiError(409, 'No characters left in this room');
  return free.id;
}

export async function getRoom(code) {
  const room = must(await admin().from('rooms').select('*').eq('code', code).maybeSingle());
  if (!room) throw new ApiError(404, 'Room not found');
  return { ...room, settings: sanitizeSettings(room.settings || {}, DEFAULT_SETTINGS) };
}

export async function getPlayers(code) {
  return must(await admin().from('players').select('*').eq('room_code', code).order('joined_at'));
}

async function addPlayer(code, name, avatar) {
  const db = admin();
  const player = must(
    await db.from('players').insert({ room_code: code, name, avatar }).select('*').single()
  );
  const secret = randomBytes(16).toString('hex');
  must(await db.from('player_private').insert({ player_id: player.id, room_code: code, secret }));
  return { playerId: player.id, secret, player };
}

export async function createRoom({ name, avatar, settings }) {
  const db = admin();
  const clean = sanitizeSettings(settings || {});
  let code = null;
  for (let i = 0; i < 8 && !code; i++) {
    const attempt = generateCode();
    const { error } = await db.from('rooms').insert({ code: attempt, settings: clean });
    if (!error) code = attempt;
    else if (error.code !== '23505') {
      console.error(error);
      throw new ApiError(500, 'Could not create room');
    }
  }
  if (!code) throw new ApiError(500, 'Could not create room, try again');

  const { playerId, secret } = await addPlayer(code, cleanName(name), pickAvatar(avatar, []));
  must(await db.from('rooms').update({ host_id: playerId, updated_at: nowIso() }).eq('code', code));
  return { code, playerId, secret };
}

export async function joinRoom(code, { name, avatar }) {
  const room = await getRoom(code);
  if (room.status !== 'lobby') throw new ApiError(409, 'That game has already started');
  const players = await getPlayers(code);
  if (players.length >= room.settings.maxPlayers) throw new ApiError(409, 'This room is full');
  const avatarId = pickAvatar(avatar, players.map((p) => p.avatar));
  const { playerId, secret } = await addPlayer(code, cleanName(name), avatarId);
  return { code, playerId, secret };
}

async function transferHostOrDelete(code, leavingId) {
  const db = admin();
  const remaining = (await getPlayers(code)).filter((p) => p.id !== leavingId);
  if (remaining.length === 0) {
    must(await db.from('rooms').delete().eq('code', code));
    return;
  }
  const room = await getRoom(code);
  if (room.host_id === leavingId || !remaining.some((p) => p.id === room.host_id)) {
    must(await db.from('rooms').update({ host_id: remaining[0].id, updated_at: nowIso() }).eq('code', code));
  }
}

export async function updateSettings(code, player, incoming) {
  const room = await getRoom(code);
  if (room.host_id !== player.id) throw new ApiError(403, 'Only the host can change settings');
  if (room.status !== 'lobby') throw bad('Settings are locked once the game starts');
  const next = sanitizeSettings(incoming || {}, room.settings);
  const players = await getPlayers(code);
  if (next.maxPlayers < players.length) next.maxPlayers = players.length;
  must(await admin().from('rooms').update({ settings: next, updated_at: nowIso() }).eq('code', code));
  return { settings: next };
}

export async function updateProfile(code, player, { name, avatar }) {
  const room = await getRoom(code);
  if (room.status !== 'lobby') throw bad('You can only change your character in the lobby');
  const patch = {};
  if (name !== undefined) patch.name = cleanName(name);
  if (avatar !== undefined) {
    if (!isValidAvatar(avatar)) throw bad('Unknown character');
    const players = await getPlayers(code);
    if (players.some((p) => p.id !== player.id && p.avatar === avatar)) {
      throw new ApiError(409, 'Someone already picked that character');
    }
    patch.avatar = avatar;
  }
  if (Object.keys(patch).length) must(await admin().from('players').update(patch).eq('id', player.id));
  return { ok: true };
}

export async function startGame(code, player) {
  const db = admin();
  const room = await getRoom(code);
  if (room.host_id !== player.id) throw new ApiError(403, 'Only the host can start the game');
  if (room.status !== 'lobby') throw bad('Game already started');
  const players = await getPlayers(code);
  const { gridSize } = room.settings;
  if (players.length < 2) throw bad('Need at least 2 players to start');
  if (players.length > gridSize * gridSize) throw bad('The grid is too small for this many players');

  const spots = spawnPositions(players.length, gridSize);
  await Promise.all(
    players.map((p, i) => db.from('player_private').update({ x: spots[i].x, y: spots[i].y }).eq('player_id', p.id).then(must))
  );
  must(await db.from('players').update({ is_alive: true }).eq('room_code', code));
  must(await db.from('actions').delete().eq('room_code', code));

  const bounds = fullBounds(gridSize);
  const result = {
    round: 0,
    bounds,
    players: players.map((p, i) => ({ id: p.id, from: null, to: spots[i], dir: null, fell: false, dead: false })),
    shots: [],
    deaths: [],
    over: false,
    winnerId: null,
    draw: false,
  };
  must(
    await db
      .from('rooms')
      .update({
        status: 'playing',
        phase: 'reveal',
        round: 0,
        bounds,
        locked_count: 0,
        last_result: result,
        phase_ends_at: new Date(Date.now() + SPAWN_REVEAL_MS).toISOString(),
        updated_at: nowIso(),
      })
      .eq('code', code)
  );
  return { ok: true };
}

export async function resetToLobby(code, player) {
  const db = admin();
  const room = await getRoom(code);
  if (room.host_id !== player.id) throw new ApiError(403, 'Only the host can do that');
  must(await db.from('actions').delete().eq('room_code', code));
  must(await db.from('players').delete().eq('room_code', code).not('left_at', 'is', null));
  must(await db.from('players').update({ is_alive: true }).eq('room_code', code));
  must(await db.from('player_private').update({ x: null, y: null }).eq('room_code', code));
  must(
    await db
      .from('rooms')
      .update({
        status: 'lobby',
        phase: 'lobby',
        round: 0,
        bounds: null,
        phase_ends_at: null,
        locked_count: 0,
        last_result: null,
        updated_at: nowIso(),
      })
      .eq('code', code)
  );
  return { ok: true };
}

export { transferHostOrDelete };

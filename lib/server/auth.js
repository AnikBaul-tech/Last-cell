import { admin, must } from './db.js';
import { ApiError } from './http.js';

/** Guests identify with { playerId, secret } handed out on create/join. */
export async function authPlayer(code, body) {
  const { playerId, secret } = body || {};
  if (!playerId || !secret) throw new ApiError(401, 'Not signed in to this room');
  const db = admin();
  const [priv, player] = await Promise.all([
    db.from('player_private').select('*').eq('player_id', playerId).maybeSingle().then(must),
    db.from('players').select('*').eq('id', playerId).maybeSingle().then(must),
  ]);
  if (!priv || !player || priv.secret !== secret || player.room_code !== code) {
    throw new ApiError(401, 'Not signed in to this room');
  }
  return { player, priv };
}

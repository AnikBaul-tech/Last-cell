import { wrap, readBody, ApiError } from '@/lib/server/http';
import { authPlayer } from '@/lib/server/auth';
import { joinRoom, updateSettings, updateProfile, startGame, resetToLobby } from '@/lib/server/roomService';
import { submitAction, advance, getMe, leaveRoom } from '@/lib/server/gameService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// One handler per operation. Add new ops here (e.g. kick, rematch) without touching the rest.
const open = {
  join: (code, body) => joinRoom(code, body),
  tick: (code) => advance(code),
};

const authed = {
  me: (code, body, { player, priv }) => getMe(code, player, priv),
  action: (code, body, { player, priv }) => submitAction(code, player, priv, body),
  settings: (code, body, { player }) => updateSettings(code, player, body.settings),
  profile: (code, body, { player }) => updateProfile(code, player, body),
  start: (code, body, { player }) => startGame(code, player),
  reset: (code, body, { player }) => resetToLobby(code, player),
  leave: (code, body, { player }) => leaveRoom(code, player),
};

// POST /api/rooms/:code/:op
export const POST = wrap(async (req, { params }) => {
  const code = String(params.code || '').toUpperCase();
  const op = params.op;
  const body = await readBody(req);
  if (open[op]) return open[op](code, body);
  if (authed[op]) {
    const who = await authPlayer(code, body);
    return authed[op](code, body, who);
  }
  throw new ApiError(404, 'Unknown operation');
});

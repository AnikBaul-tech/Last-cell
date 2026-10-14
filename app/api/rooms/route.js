import { wrap, readBody } from '@/lib/server/http';
import { createRoom } from '@/lib/server/roomService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/rooms  { name, avatar, settings? } -> { code, playerId, secret }
export const POST = wrap(async (req) => createRoom(await readBody(req)));

# Last Cell

Multiplayer last-survivor game. No sign-in: create a room or join one with a 5-character code.
Everyone moves and aims in secret, all shots land at once, and the arena shrinks every round.

Stack: Next.js 14 (App Router, plain JS) + Supabase (Postgres + Realtime). No other dependencies, no CSS framework.

## 1. Set up Supabase (free tier)

1. Create a project at supabase.com.
2. SQL Editor -> paste and run `supabase/schema.sql`.
   (If the last two `alter publication` lines say "already member", that's fine.)
3. Project Settings -> API: copy the project URL, the `anon` key and the `service_role` key.

## 2. Run locally

```bash
cp .env.example .env.local     # fill in the 3 values
npm install
npm run dev                    # http://localhost:3000
```

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser (read + realtime) and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser, read-only via RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (`/api` routes). Never expose it. |

## 3. Deploy to Vercel

Push to GitHub, import the repo in Vercel, add the same 3 env vars, deploy. Hobby tier is enough.

## 4. Background music

Put your file at `public/audio/bgm.mp3`. It loops after the player's first click or tap and can be
muted from the speaker button (bottom right). Path and default volumes: `lib/audio/config.js`.
Sound effects (shot, death, fall, win, lose, clicks, countdown ticks) are synthesized in code.
To use your own files instead, drop them in `public/audio/` and set paths in `SFX_FILES` in the same config.

## Rules as implemented

- Round = **planning** (timer) -> **reveal** (animation) -> next round.
- Planning: move up to *move range* cells (diagonals allowed, default 1) and pick a direction, or hold fire.
  Others are hidden. Pending moves are stored server-side and never sent to other browsers.
- Reveal: everyone moves, then everyone fires simultaneously. A shot hits the **nearest** player in line:
  `A -> B` B dies, `A -> <- B` both die, `A -> B -> C` only B dies from A's shot.
  Players sharing the nearest cell are all hit; a player sharing the shooter's own cell is safe.
- After a reveal the outer edge collapses. Ending a round on a collapsed cell = you fall and die.
  Shrink style is a host setting: whole outer ring (8 -> 6 -> 4...) or one row/column (8 -> 7 -> 6...).
- Dead players spectate (they see survivors' positions). Last survivor wins.
  If everyone dies at once, or the arena shrinks to 1 cell with several alive, it's a draw.
- If the timer ends without a lock-in, the player stays put and does not shoot.
  A selection that was never locked is auto-submitted just before the timer ends.
- Host settings (lobby only): max players (2-16), grid size (4-12), planning time, reveal time, move range, shrink style.

## How it works

- **Writes** go through `app/api/rooms/**` using the service-role key. The browser can only read `rooms` and `players` (RLS).
- **Hidden info**: positions and pending moves live in `player_private` and `actions`, which have no read policy.
  Positions become public only through `rooms.last_result` at each reveal.
- **Realtime**: clients subscribe to `rooms` and `players` changes (plus a 4s fallback poll) so there are almost no Vercel calls while idle.
- **Phase timing without a server loop**: any client calls `/tick` when a deadline passes; the server only acts if it's truly due,
  and uses conditional updates so concurrent ticks can't resolve a round twice. A round also resolves instantly once everyone has locked in.
- **Guests**: `{playerId, secret}` per room in localStorage. Refreshing the page rejoins you.

## Code map

```
lib/game/engine.js        pure rules (move, shoot, shrink, win)        <- change gameplay here
lib/game/constants.js     defaults + limits for settings
lib/game/avatars.js       characters (emoji; swap for images later)
lib/server/roomService.js lobby ops: create/join/settings/start/reset
lib/server/gameService.js submit move, phase advance, resolve, leave
app/api/rooms/[code]/[op] one route, one handler per op (add new ops here)
hooks/useRoom.js          realtime state + phase ticker
components/Game.jsx       planning UI + reveal animation timeline
components/Board.jsx      presentational grid, pawns, beams
lib/audio/*               BGM + synthesized SFX
```

## Known limits / ideas

- No kick button, chat, or reconnect timer; idle players just stop acting.
- No rate limiting on the API. Add one (e.g. Upstash) before a public launch.
- Old rooms aren't purged automatically: see the commented `delete` at the bottom of `schema.sql`, or schedule it with pg_cron.
- Not yet run against a live Supabase project in the environment this was written in: the first thing to do is create a room with two browser tabs.

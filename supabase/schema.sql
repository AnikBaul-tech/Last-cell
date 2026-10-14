-- Last Cell : run this whole file once in Supabase -> SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS where possible).

create table if not exists public.rooms (
  code           text primary key,
  host_id        uuid,
  status         text not null default 'lobby'    check (status in ('lobby','playing','finished')),
  phase          text not null default 'lobby'    check (phase  in ('lobby','planning','resolving','reveal')),
  settings       jsonb not null default '{}'::jsonb,
  round          int  not null default 0,
  bounds         jsonb,                       -- {x0,y0,x1,y1}: cells still alive this round
  phase_ends_at  timestamptz,
  locked_count   int  not null default 0,     -- how many players locked in (count only, no details)
  last_result    jsonb,                       -- public result of the last reveal
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.players (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null references public.rooms(code) on delete cascade,
  name       text not null,
  avatar     text not null,
  is_alive   boolean not null default true,
  left_at    timestamptz,                     -- set when someone leaves mid-game
  joined_at  timestamptz not null default now()
);
alter table public.players add column if not exists left_at timestamptz;
create index if not exists players_room_idx on public.players(room_code);

-- Secrets + hidden positions. NOT readable by the browser (no RLS policy).
create table if not exists public.player_private (
  player_id  uuid primary key references public.players(id) on delete cascade,
  room_code  text not null,
  secret     text not null,
  x          int,
  y          int
);

-- Each player's hidden move for the current round. NOT readable by the browser.
create table if not exists public.actions (
  room_code  text not null references public.rooms(code) on delete cascade,
  round      int  not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  to_x       int  not null,
  to_y       int  not null,
  dir        text check (dir in ('up','down','left','right')),
  created_at timestamptz not null default now(),
  primary key (room_code, round, player_id)
);

-- Row level security: the browser may only READ rooms + players.
-- All writes go through the Next.js /api routes using the service-role key.
alter table public.rooms          enable row level security;
alter table public.players        enable row level security;
alter table public.player_private enable row level security;
alter table public.actions        enable row level security;

drop policy if exists "read rooms"   on public.rooms;
drop policy if exists "read players" on public.players;
create policy "read rooms"   on public.rooms   for select using (true);
create policy "read players" on public.players for select using (true);

-- Realtime (push updates to the browser). If you get "already member of publication", that's fine.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;

-- Optional housekeeping: delete rooms older than a day (run manually or schedule with pg_cron).
-- delete from public.rooms where created_at < now() - interval '1 day';

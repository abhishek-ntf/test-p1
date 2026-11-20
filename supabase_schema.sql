-- Neon Highway — Supabase schema for the global leaderboard.
-- Run ONCE in the Supabase SQL editor: Dashboard → SQL → New query → paste → Run.
-- Safe to re-run (idempotent). No auth: rows keyed by a client-generated device_id.

create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  device_id   text unique not null,
  name        text not null default 'Player',
  score       integer not null default 0,
  distance    integer not null default 0,
  level       integer not null default 1,
  updated_at  timestamptz not null default now()
);

-- Upsert that always keeps the BEST score/distance/level for a device.
create or replace function public.upsert_score(d text, n text, s int, dist int, lvl int)
returns void as $$
begin
  insert into public.scores (device_id, name, score, distance, level, updated_at)
  values (d, n, s, dist, lvl, now())
  on conflict (device_id) do update
    set name       = excluded.name,
        score      = greatest(public.scores.score, excluded.score),
        distance   = greatest(public.scores.distance, excluded.distance),
        level      = greatest(public.scores.level, excluded.level),
        updated_at = now();
end;
$$ language plpgsql;

-- Row Level Security: anon can read + insert + update, never delete.
alter table public.scores enable row level security;
drop policy if exists "scores_read"  on public.scores;
drop policy if exists "scores_insert" on public.scores;
drop policy if exists "scores_update" on public.scores;
create policy "scores_read"   on public.scores for select using (true);
create policy "scores_insert" on public.scores for insert with check (true);
create policy "scores_update" on public.scores for update using (true) with check (true);

-- Realtime: so every player sees live ranking changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end $$;

-- Saved AI music tracks (syncs across localhost and Vercel)
create table public.saved_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  drink_name text not null,
  audio_url text not null,
  emotion text,
  tempo numeric,
  playback_mode text not null default 'once',
  created_at timestamptz not null default now()
);

alter table public.saved_tracks enable row level security;

create policy "Anyone can read anonymous saved tracks"
  on public.saved_tracks for select
  using (user_id is null or auth.uid() = user_id);

create policy "Anyone can insert saved tracks"
  on public.saved_tracks for insert
  with check (user_id is null or auth.uid() = user_id);

create policy "Anyone can update anonymous saved tracks"
  on public.saved_tracks for update
  using (user_id is null or auth.uid() = user_id);

create policy "Anyone can delete anonymous saved tracks"
  on public.saved_tracks for delete
  using (user_id is null or auth.uid() = user_id);

create index saved_tracks_created_at_idx on public.saved_tracks(created_at desc);

-- Drink records table
create table public.drink_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  milk_tea_name text not null,
  sweetness_original int not null,
  sweetness_target int not null,
  sugar_saved_grams numeric not null,
  music_mode text not null,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.drink_records enable row level security;

-- Anonymous use allowed: user_id can be null for now (no-auth v1)
create policy "Anyone can read their own or anonymous records"
  on public.drink_records for select
  using (user_id is null or auth.uid() = user_id);

create policy "Anyone can insert records"
  on public.drink_records for insert
  with check (user_id is null or auth.uid() = user_id);

create index drink_records_created_at_idx on public.drink_records(created_at desc);

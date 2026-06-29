create table public.drink_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  milk_tea_name text not null,
  sweetness_original int not null,
  sweetness_target int not null,
  sugar_saved_grams numeric not null,
  music_mode text not null,
  duration_seconds int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.drink_records enable row level security;

-- Anonymous v1: allow public read & insert. Tighten when auth is added.
create policy "Public can read drink records"
  on public.drink_records for select
  using (true);

create policy "Public can insert drink records"
  on public.drink_records for insert
  with check (true);

create index drink_records_created_at_idx on public.drink_records(created_at desc);
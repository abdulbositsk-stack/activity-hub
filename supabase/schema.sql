-- Activity Hub: Supabase sozlamasi.
-- Supabase → SQL Editor → shu faylni to'liq joylab "Run" bosing.
-- Oxiridagi emailni o'zingiznikiga almashtirishni unutmang!

-- 1) Ustozlar ro'yxati (faqat shu emaillar kira oladi)
create table if not exists public.teachers (
  email text primary key,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) Materiallar katalogi
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  category text not null default 'other',
  subject text default '',
  grade text default '',
  tags text[] not null default '{}',
  kind text not null check (kind in ('link', 'bundle', 'pdf')),
  source text,
  url text,
  entry text,
  files jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Yordamchi funksiyalar
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where email = lower(auth.jwt() ->> 'email'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where email = lower(auth.jwt() ->> 'email') and is_admin);
$$;

-- 4) Ruxsatlar (Row Level Security)
alter table public.teachers enable row level security;
alter table public.items enable row level security;

drop policy if exists "teachers read" on public.teachers;
create policy "teachers read" on public.teachers for select
  using (public.is_teacher() or email = lower(auth.jwt() ->> 'email'));
drop policy if exists "admins write teachers" on public.teachers;
create policy "admins write teachers" on public.teachers for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "teachers all items" on public.items;
create policy "teachers all items" on public.items for all
  using (public.is_teacher()) with check (public.is_teacher());

-- 5) Fayllar ombori (yopiq)
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

drop policy if exists "teachers read files" on storage.objects;
create policy "teachers read files" on storage.objects for select
  using (bucket_id = 'materials' and public.is_teacher());
drop policy if exists "teachers insert files" on storage.objects;
create policy "teachers insert files" on storage.objects for insert
  with check (bucket_id = 'materials' and public.is_teacher());
drop policy if exists "teachers update files" on storage.objects;
create policy "teachers update files" on storage.objects for update
  using (bucket_id = 'materials' and public.is_teacher());
drop policy if exists "teachers delete files" on storage.objects;
create policy "teachers delete files" on storage.objects for delete
  using (bucket_id = 'materials' and public.is_teacher());

-- 6) Birinchi admin — EMAILNI O'ZINGIZNIKIGA ALMASHTIRING
insert into public.teachers (email, is_admin)
values ('sizning-emailingiz@gmail.com', true)
on conflict (email) do update set is_admin = true;

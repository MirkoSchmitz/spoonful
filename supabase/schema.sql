-- Spoonful – Datenbank für die eigenständige App
-- Einmal komplett im Supabase SQL Editor ausführen.

create extension if not exists pgcrypto;

-- Ein gemeinsames Kochbuch, dem man per Einladungscode beitritt
create table if not exists public.cookbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  cookbook_id uuid not null references public.cookbooks(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (cookbook_id, user_id)
);

-- Rezepte als JSON-Dokument (gleiches Format wie in der Testversion)
create table if not exists public.recipes (
  cookbook_id uuid not null references public.cookbooks(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (cookbook_id, id)
);

alter table public.cookbooks enable row level security;
alter table public.members enable row level security;
alter table public.recipes enable row level security;

create or replace function public.is_member(cb uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.members where cookbook_id = cb and user_id = auth.uid());
$$;

drop policy if exists "cookbooks lesen" on public.cookbooks;
create policy "cookbooks lesen" on public.cookbooks for select using (public.is_member(id));
drop policy if exists "cookbooks umbenennen" on public.cookbooks;
create policy "cookbooks umbenennen" on public.cookbooks for update using (public.is_member(id));

drop policy if exists "mitglieder lesen" on public.members;
create policy "mitglieder lesen" on public.members for select using (public.is_member(cookbook_id));
drop policy if exists "eigenen namen aendern" on public.members;
create policy "eigenen namen aendern" on public.members for update using (user_id = auth.uid());

drop policy if exists "rezepte mitglieder" on public.recipes;
create policy "rezepte mitglieder" on public.recipes for all
  using (public.is_member(cookbook_id)) with check (public.is_member(cookbook_id));

-- Kochbuch anlegen (Ersteller wird Mitglied)
create or replace function public.create_cookbook(p_name text, p_display text)
returns public.cookbooks language plpgsql security definer set search_path = public as $$
declare cb public.cookbooks;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  insert into public.cookbooks(name) values (coalesce(nullif(trim(p_name), ''), 'Unser Kochbuch')) returning * into cb;
  insert into public.members(cookbook_id, user_id, display_name) values (cb.id, auth.uid(), coalesce(nullif(trim(p_display), ''), 'Ich'));
  return cb;
end $$;

-- Mit Einladungscode beitreten
create or replace function public.join_cookbook(p_code text, p_display text)
returns public.cookbooks language plpgsql security definer set search_path = public as $$
declare cb public.cookbooks;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  select * into cb from public.cookbooks where invite_code = upper(trim(p_code));
  if cb.id is null then raise exception 'Code unbekannt'; end if;
  insert into public.members(cookbook_id, user_id, display_name)
    values (cb.id, auth.uid(), coalesce(nullif(trim(p_display), ''), 'Ich'))
    on conflict (cookbook_id, user_id) do update set display_name = excluded.display_name;
  return cb;
end $$;

grant execute on function public.create_cookbook(text, text) to authenticated;
grant execute on function public.join_cookbook(text, text) to authenticated;

-- Live-Abgleich
do $$ begin
  alter publication supabase_realtime add table public.recipes;
exception when duplicate_object then null; end $$;

-- Fotos: öffentlicher Bucket mit unratbaren Dateinamen; schreiben dürfen nur Mitglieder
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;

drop policy if exists "fotos hochladen" on storage.objects;
create policy "fotos hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "fotos loeschen" on storage.objects;
create policy "fotos loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_member(((storage.foldername(name))[1])::uuid));

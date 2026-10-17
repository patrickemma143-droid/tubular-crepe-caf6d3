-- FarmOS cloud backup & team sharing
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to re-run.

create extension if not exists pgcrypto;

-- ── Farms and people ───────────────────────────────────────────
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.farm_members (
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'worker')),
  created_at timestamptz not null default now(),
  primary key (farm_id, user_id)
);

create table if not exists public.farm_invites (
  farm_id uuid not null references public.farms(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'worker')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (farm_id, email)
);

-- ── Records: one row per record, per farm ──────────────────────
-- tbl = animals | milk | breeding | health | weights | transactions
create table if not exists public.farm_records (
  farm_id uuid not null references public.farms(id) on delete cascade,
  tbl text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,          -- when the record was edited on the phone
  deleted boolean not null default false,   -- tombstone so deletes reach other phones
  server_updated_at timestamptz not null default now(), -- server clock, used for pulling changes
  updated_by uuid default auth.uid(),
  primary key (farm_id, tbl, id)
);
create index if not exists farm_records_pull on public.farm_records (farm_id, server_updated_at);

-- Newest edit wins per record: an older copy never overwrites a newer one.
create or replace function public.farm_records_keep_newest() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists farm_records_keep_newest on public.farm_records;
create trigger farm_records_keep_newest before insert or update on public.farm_records
for each row execute function public.farm_records_keep_newest();

-- ── Helpers ────────────────────────────────────────────────────
create or replace function public.farm_role(f uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from farm_members where farm_id = f and user_id = auth.uid()
$$;

create or replace function public.create_farm(farm_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into farms (name, created_by) values (farm_name, auth.uid()) returning id into fid;
  insert into farm_members (farm_id, user_id, email, role)
    values (fid, auth.uid(), coalesce(auth.jwt() ->> 'email', ''), 'owner');
  return fid;
end $$;

-- Turns any invites for the signed-in email into memberships.
create or replace function public.accept_invites() returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or em = '' then return; end if;
  insert into farm_members (farm_id, user_id, email, role)
    select farm_id, auth.uid(), em, role from farm_invites where lower(email) = em
  on conflict (farm_id, user_id) do nothing;
  delete from farm_invites where lower(email) = em;
end $$;

-- ── Row level security ─────────────────────────────────────────
alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_invites enable row level security;
alter table public.farm_records enable row level security;

drop policy if exists "members read farm" on public.farms;
create policy "members read farm" on public.farms for select using (farm_role(id) is not null);
drop policy if exists "owner renames farm" on public.farms;
create policy "owner renames farm" on public.farms for update using (farm_role(id) = 'owner');

drop policy if exists "members see team" on public.farm_members;
create policy "members see team" on public.farm_members for select using (farm_role(farm_id) is not null);
drop policy if exists "owner manages team" on public.farm_members;
create policy "owner manages team" on public.farm_members for delete using (farm_role(farm_id) = 'owner' and user_id <> auth.uid());
drop policy if exists "owner changes roles" on public.farm_members;
create policy "owner changes roles" on public.farm_members for update using (farm_role(farm_id) = 'owner');

drop policy if exists "managers see invites" on public.farm_invites;
create policy "managers see invites" on public.farm_invites for select using (farm_role(farm_id) in ('owner', 'manager'));
drop policy if exists "managers invite" on public.farm_invites;
create policy "managers invite" on public.farm_invites for insert with check (farm_role(farm_id) in ('owner', 'manager') and (role = 'worker' or farm_role(farm_id) = 'owner'));
drop policy if exists "managers update invites" on public.farm_invites;
create policy "managers update invites" on public.farm_invites for update using (farm_role(farm_id) in ('owner', 'manager'));
drop policy if exists "managers cancel invites" on public.farm_invites;
create policy "managers cancel invites" on public.farm_invites for delete using (farm_role(farm_id) in ('owner', 'manager'));

-- Farm hands (worker) can't read or write money records.
drop policy if exists "members read records" on public.farm_records;
create policy "members read records" on public.farm_records for select
  using (farm_role(farm_id) in ('owner', 'manager') or (farm_role(farm_id) = 'worker' and tbl <> 'transactions'));
drop policy if exists "members add records" on public.farm_records;
create policy "members add records" on public.farm_records for insert
  with check (farm_role(farm_id) in ('owner', 'manager') or (farm_role(farm_id) = 'worker' and tbl <> 'transactions'));
drop policy if exists "members edit records" on public.farm_records;
create policy "members edit records" on public.farm_records for update
  using (farm_role(farm_id) in ('owner', 'manager') or (farm_role(farm_id) = 'worker' and tbl <> 'transactions'));
-- No delete policy: deletions are tombstones (deleted = true), so nothing is ever lost by accident.

-- ── Explicit grants (don't rely on project defaults) ────────────
revoke all on public.farms, public.farm_members, public.farm_invites, public.farm_records from anon;
grant select, update on public.farms to authenticated;
grant select, update, delete on public.farm_members to authenticated;
grant select, insert, update, delete on public.farm_invites to authenticated;
grant select, insert, update on public.farm_records to authenticated;
revoke execute on function public.create_farm(text), public.accept_invites(), public.farm_role(uuid) from public, anon;
grant execute on function public.create_farm(text), public.accept_invites(), public.farm_role(uuid) to authenticated;

-- ── Optional: readable views for analysis in Supabase / Metabase ─
create or replace view public.v_animals with (security_invoker = on) as
  select farm_id, id, data->>'tag' as tag, data->>'name' as name, data->>'sex' as sex, data->>'breed' as breed,
         (data->>'dob')::date as dob, data->>'status' as status, (data->>'exit_date')::date as exit_date
  from farm_records where tbl = 'animals' and not deleted;

create or replace view public.v_milk with (security_invoker = on) as
  select farm_id, id, data->>'animal_id' as animal_id, (data->>'date')::date as date, data->>'session' as session,
         (data->>'litres')::numeric as litres, data->>'method' as method
  from farm_records where tbl = 'milk' and not deleted;

create or replace view public.v_money with (security_invoker = on) as
  select farm_id, id, (data->>'date')::date as date, data->>'type' as type, data->>'category' as category,
         (data->>'amount')::numeric as amount, data->>'party' as party
  from farm_records where tbl = 'transactions' and not deleted;

revoke all on public.v_animals, public.v_milk, public.v_money from anon;
grant select on public.v_animals, public.v_milk, public.v_money to authenticated;

-- 放課後トラック部: ID/password accounts and revision-checked cloud saves.
-- Paste this entire file into Supabase SQL Editor, then Run once.
-- Re-running is safe; this migration only owns taf_* objects.
begin;

create schema if not exists taf_private;
revoke all on schema taf_private from public, anon, authenticated;
grant usage on schema taf_private to authenticated;

create table if not exists public.taf_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{4,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.taf_saves (
  user_id uuid primary key references public.taf_profiles(user_id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint taf_save_shape check (coalesce(
    jsonb_typeof(payload) = 'object'
    and payload->'version' = '2'::jsonb
    and jsonb_typeof(payload->'athletes') = 'array'
    and jsonb_typeof(payload->'schoolName') = 'string', false
  )),
  constraint taf_save_size check (octet_length(payload::text) <= 20971520)
);

alter table public.taf_profiles enable row level security;
alter table public.taf_saves enable row level security;

-- Tables are read-only to app users. All saves go through the CAS RPC below.
revoke all on table public.taf_profiles, public.taf_saves from public, anon, authenticated;
grant select on table public.taf_profiles, public.taf_saves to authenticated;
grant all on table public.taf_profiles, public.taf_saves to service_role;

drop policy if exists taf_profiles_read_self on public.taf_profiles;
create policy taf_profiles_read_self on public.taf_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists taf_saves_read_self on public.taf_saves;
create policy taf_saves_read_self on public.taf_saves
  for select to authenticated using ((select auth.uid()) = user_id);

-- Never trust editable user_metadata for identity. Only the exact, canonical
-- synthetic-email namespace creates a game profile. Other project users are ignored.
create or replace function taf_private.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email ~ '^[a-z0-9_]{4,20}@id[.]taf-game[.]invalid$' then
    insert into public.taf_profiles (user_id, username)
      values (new.id, split_part(new.email, '@', 1))
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function taf_private.create_profile() from public, anon, authenticated;
drop trigger if exists taf_create_profile_after_signup on auth.users;
create trigger taf_create_profile_after_signup
  after insert on auth.users for each row
  execute function taf_private.create_profile();

-- Covers accounts created shortly before SQL setup was completed.
insert into public.taf_profiles (user_id, username)
  select id, split_part(email, '@', 1) from auth.users
  where email ~ '^[a-z0-9_]{4,20}@id[.]taf-game[.]invalid$'
  on conflict (user_id) do nothing;

create or replace function taf_private.save_game(p_payload jsonb, p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  saved_revision bigint;
  saved_at timestamptz;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'TAF_AUTH_REQUIRED';
  end if;
  if not exists (select 1 from public.taf_profiles where user_id = caller_id) then
    raise exception using errcode = 'P0001', message = 'TAF_PROFILE_REQUIRED';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991 then
    raise exception using errcode = 'P0001', message = 'TAF_INVALID_REVISION';
  end if;
  if p_payload is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->'version' is distinct from '2'::jsonb
    or jsonb_typeof(p_payload->'athletes') is distinct from 'array'
    or jsonb_typeof(p_payload->'schoolName') is distinct from 'string'
    or octet_length(p_payload::text) > 20971520 then
    raise exception using errcode = 'P0001', message = 'TAF_INVALID_SAVE';
  end if;

  if p_expected_revision = 0 then
    insert into public.taf_saves (user_id, payload, revision, updated_at)
      values (caller_id, p_payload, 1, clock_timestamp())
      on conflict (user_id) do nothing
      returning revision, updated_at into saved_revision, saved_at;
  else
    update public.taf_saves
      set payload = p_payload, revision = revision + 1, updated_at = clock_timestamp()
      where user_id = caller_id and revision = p_expected_revision
      returning revision, updated_at into saved_revision, saved_at;
  end if;
  if not found then
    raise exception using errcode = 'P0001', message = 'TAF_SAVE_CONFLICT';
  end if;
  return jsonb_build_object('revision', saved_revision, 'updated_at', saved_at);
end;
$$;
revoke all on function taf_private.save_game(jsonb, bigint) from public, anon, authenticated;
grant execute on function taf_private.save_game(jsonb, bigint) to authenticated;

-- Expose only a security-invoker wrapper. The privileged implementation is in
-- a non-exposed schema and derives the user UUID itself; callers cannot pick one.
create or replace function public.taf_save_game(p_payload jsonb, p_expected_revision bigint)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select taf_private.save_game(p_payload, p_expected_revision);
$$;
revoke all on function public.taf_save_game(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.taf_save_game(jsonb, bigint) to authenticated;

comment on table public.taf_profiles is 'TAF game login IDs; only their owner can read through the Data API.';
comment on table public.taf_saves is 'One current save per TAF account, with atomic optimistic concurrency control.';
comment on function public.taf_save_game(jsonb, bigint) is 'Authenticated CAS save. Expected revision 0 creates; mismatch raises TAF_SAVE_CONFLICT.';

notify pgrst, 'reload schema';
commit;

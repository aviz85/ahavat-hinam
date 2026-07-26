-- "עין על מישהו": save interesting opposites for a future meetup.
create table public.saved_people (
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, saved_id),
  check (user_id <> saved_id)
);

alter table public.saved_people enable row level security;
create policy "save as yourself"
  on public.saved_people for insert to authenticated with check (user_id = auth.uid());
create policy "read own saves"
  on public.saved_people for select to authenticated using (user_id = auth.uid());
create policy "remove own saves"
  on public.saved_people for delete to authenticated using (user_id = auth.uid());

-- Enriched list (profiles are owner-only, so enrichment runs server-side):
-- name/emoji/bio/photo + live opposition % and current rounded distance.
create function public.my_saved_people()
returns table (
  id uuid,
  name text,
  emoji text,
  bio text,
  avatar_path text,
  opposition int,
  distance_m double precision,
  active boolean
)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then return; end if;
  return query
  select p.id, p.name, p.emoji, p.bio, p.avatar_path,
    (select coalesce(sum(abs(a.v - b.v)), 0)::int
       from unnest(me.answers) with ordinality as a(v, i)
       join unnest(p.answers) with ordinality as b(v, i) using (i)) as opposition,
    case when me.location is not null and p.location is not null
         then round(st_distance(p.location, me.location) / 100) * 100
         else null end as distance_m,
    (p.last_seen > now() - interval '7 days') as active
  from public.saved_people sp
  join public.profiles p on p.id = sp.saved_id
  where sp.user_id = me.id
  order by sp.created_at desc;
end;
$$;

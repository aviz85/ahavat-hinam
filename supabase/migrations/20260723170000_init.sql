-- אהבת חינם — initial schema
create extension if not exists postgis;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '🙂',
  answers int[] not null,
  location geography(point, 4326),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index profiles_location_idx on public.profiles using gist (location);

create table public.hugs (
  id uuid primary key default gen_random_uuid(),
  hugger_id uuid not null references public.profiles(id) on delete cascade,
  hugged_id uuid references public.profiles(id) on delete set null,
  hugged_name text,
  image_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.hugs enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

create policy "hugs readable by authenticated"
  on public.hugs for select to authenticated using (true);
create policy "insert own hug"
  on public.hugs for insert to authenticated with check (auth.uid() = hugger_id);

-- update my location + heartbeat
create or replace function public.update_location(p_lat double precision, p_lng double precision)
returns void
language sql security definer set search_path = public as $$
  update public.profiles
  set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      last_seen = now()
  where id = auth.uid();
$$;

-- find the most ideologically-opposite user within radius_m
create or replace function public.find_opposite(radius_m double precision default 50000)
returns table (
  id uuid,
  name text,
  emoji text,
  distance_m double precision,
  opposition int,
  lat double precision,
  lng double precision
)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null or me.location is null then
    return;
  end if;
  return query
  select p.id, p.name, p.emoji,
    st_distance(p.location, me.location) as distance_m,
    (select coalesce(sum(abs(a.v - b.v)), 0)::int
       from unnest(me.answers) with ordinality as a(v, i)
       join unnest(p.answers) with ordinality as b(v, i) using (i)) as opposition,
    st_y(p.location::geometry) as lat,
    st_x(p.location::geometry) as lng
  from public.profiles p
  where p.id <> me.id
    and p.location is not null
    and st_dwithin(p.location, me.location, radius_m)
  order by opposition desc, distance_m asc
  limit 1;
end;
$$;

-- storage bucket for hug selfies
insert into storage.buckets (id, name, public) values ('hugs', 'hugs', true);

create policy "authenticated can upload hugs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'hugs');

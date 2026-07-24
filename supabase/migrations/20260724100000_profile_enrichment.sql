-- Profile enrichment: photo + bio, shown to your matched opposite

alter table public.profiles
  add column avatar_path text,
  add column bio text,
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 140);

-- avatars bucket (public read, like hug selfies)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif']);

create policy "upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- find_opposite now also returns the match's photo + bio
drop function public.find_opposite(double precision);
create function public.find_opposite(radius_m double precision default 50000)
returns table (
  id uuid,
  name text,
  emoji text,
  distance_m double precision,
  opposition int,
  lat double precision,
  lng double precision,
  avatar_path text,
  bio text
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
    round(st_y(p.location::geometry)::numeric, 3)::double precision as lat,
    round(st_x(p.location::geometry)::numeric, 3)::double precision as lng,
    p.avatar_path,
    p.bio
  from public.profiles p
  where p.id <> me.id
    and p.location is not null
    and p.last_seen > now() - interval '7 days'
    and st_dwithin(p.location, me.location, radius_m)
  order by opposition desc, distance_m asc
  limit 1;
end;
$$;

-- Security hardening before going public

-- 1. Profiles: worldview answers + location are private.
--    Matching happens only through the security-definer RPC.
drop policy "profiles readable by authenticated" on public.profiles;
create policy "read own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);

-- 2. Feed needs no access to profiles: snapshot hugger identity on the post.
alter table public.hugs
  add column hugger_name text,
  add column hugger_emoji text;

update public.hugs h
set hugger_name = p.name, hugger_emoji = p.emoji
from public.profiles p
where p.id = h.hugger_id and h.hugger_name is null;

-- 3. Server-side length/shape limits
alter table public.profiles
  add constraint profiles_name_len check (char_length(name) between 1 and 30),
  add constraint profiles_emoji_len check (char_length(emoji) between 1 and 8),
  add constraint profiles_answers_shape check (array_length(answers, 1) between 1 and 12);

alter table public.hugs
  add constraint hugs_caption_len check (caption is null or char_length(caption) <= 280),
  add constraint hugs_hugged_name_len check (hugged_name is null or char_length(hugged_name) <= 30),
  add constraint hugs_hugger_name_len check (hugger_name is null or char_length(hugger_name) <= 30);

-- 4. find_opposite: return only ~100m-accurate coordinates (3 decimals),
--    and only users active in the last 7 days.
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
    round(st_y(p.location::geometry)::numeric, 3)::double precision as lat,
    round(st_x(p.location::geometry)::numeric, 3)::double precision as lng
  from public.profiles p
  where p.id <> me.id
    and p.location is not null
    and p.last_seen > now() - interval '7 days'
    and st_dwithin(p.location, me.location, radius_m)
  order by opposition desc, distance_m asc
  limit 1;
end;
$$;

-- 5. Storage: images only, max 10MB, each user writes only to their own folder
drop policy "authenticated can upload hugs" on storage.objects;
create policy "upload own hug selfies"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hugs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'hugs';

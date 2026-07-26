-- "מגלים בך עניין": saving someone now signals them. Who's interested in me,
-- enriched, with mutual-interest detection.
create function public.my_admirers()
returns table (
  id uuid,
  name text,
  emoji text,
  bio text,
  avatar_path text,
  opposition int,
  distance_m double precision,
  mutual boolean,
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
    exists (select 1 from public.saved_people r
            where r.user_id = me.id and r.saved_id = p.id) as mutual,
    (p.last_seen > now() - interval '7 days') as active
  from public.saved_people sp
  join public.profiles p on p.id = sp.user_id
  where sp.saved_id = me.id
  order by sp.created_at desc;
end;
$$;

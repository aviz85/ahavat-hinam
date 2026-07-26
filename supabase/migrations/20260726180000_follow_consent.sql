-- Save-for-later with consent-based random-proximity alerts.
-- The saved person must approve before the saver ever learns about proximity.
alter table public.saved_people
  add column approved boolean,          -- null=pending, true=approved, false=declined
  add column approved_at timestamptz,
  add column last_alert timestamptz;

-- the SAVED person responds to the interest (their row lives under the saver's
-- user_id, so RLS blocks direct update — definer RPC with auth.uid() guard)
create function public.respond_to_interest(p_follower uuid, p_approve boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  update public.saved_people
    set approved = p_approve, approved_at = now()
    where user_id = p_follower and saved_id = auth.uid()
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

-- recreate list RPCs with approval status
drop function public.my_admirers();
create function public.my_admirers()
returns table (
  id uuid, name text, emoji text, bio text, avatar_path text,
  opposition int, distance_m double precision, mutual boolean,
  active boolean, approved boolean
)
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then return; end if;
  return query
  select p.id, p.name, p.emoji, p.bio, p.avatar_path,
    (select coalesce(sum(abs(a.v - b.v)), 0)::int
       from unnest(me.answers) with ordinality as a(v, i)
       join unnest(p.answers) with ordinality as b(v, i) using (i)),
    case when me.location is not null and p.location is not null
         then round(st_distance(p.location, me.location) / 100) * 100
         else null end,
    exists (select 1 from public.saved_people r
            where r.user_id = me.id and r.saved_id = p.id),
    (p.last_seen > now() - interval '7 days'),
    sp.approved
  from public.saved_people sp
  join public.profiles p on p.id = sp.user_id
  where sp.saved_id = me.id
  order by sp.created_at desc;
end;
$$;

drop function public.my_saved_people();
create function public.my_saved_people()
returns table (
  id uuid, name text, emoji text, bio text, avatar_path text,
  opposition int, distance_m double precision, active boolean, approved boolean
)
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then return; end if;
  return query
  select p.id, p.name, p.emoji, p.bio, p.avatar_path,
    (select coalesce(sum(abs(a.v - b.v)), 0)::int
       from unnest(me.answers) with ordinality as a(v, i)
       join unnest(p.answers) with ordinality as b(v, i) using (i)),
    case when me.location is not null and p.location is not null
         then round(st_distance(p.location, me.location) / 100) * 100
         else null end,
    (p.last_seen > now() - interval '7 days'),
    -- kindness: a decline looks exactly like pending to the saver
    case when sp.approved is true then true else null end
  from public.saved_people sp
  join public.profiles p on p.id = sp.saved_id
  where sp.user_id = me.id
  order by sp.created_at desc;
end;
$$;

-- when someone moves: which approved followers should hear "they're near you
-- right now"? Atomically stamps the cooldown (6h per pair).
create function public.saved_proximity_alerts(p_mover uuid, p_radius double precision default 1500)
returns table (follower uuid, other_name text, distance_m double precision)
language sql security definer set search_path = public as $$
  with hits as (
    update public.saved_people sp
      set last_alert = now()
    from public.profiles f, public.profiles s
    where f.id = sp.user_id and s.id = sp.saved_id
      and sp.approved is true
      and (sp.user_id = p_mover or sp.saved_id = p_mover)
      and f.location is not null and s.location is not null
      and st_dwithin(f.location, s.location, p_radius)
      and (sp.last_alert is null or sp.last_alert < now() - interval '6 hours')
    returning sp.user_id, s.name,
      round(st_distance(f.location, s.location) / 100) * 100 as dist
  )
  select user_id, name, dist from hits;
$$;

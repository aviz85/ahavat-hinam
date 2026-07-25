-- Security review fixes:
-- 1. Referral awards only for real (non-anonymous) accounts + daily cap,
--    so anonymous self-farming earns nothing.
-- 2. Hide user ids from the hugs feed (column grants) so third parties
--    can't harvest uid pairs to spoof rendezvous channels.

create or replace function public.handle_referral()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_anon boolean;
  v_today int;
begin
  if new.referred_by is null or new.referred_by = new.id then
    return new;
  end if;
  select coalesce(is_anonymous, true) into v_is_anon
    from auth.users where id = new.id;
  if coalesce(v_is_anon, true) then
    return new; -- throwaway anonymous accounts award nothing
  end if;
  select count(*) into v_today from public.profiles p
    join auth.users u on u.id = p.id and coalesce(u.is_anonymous, true) = false
    where p.referred_by = new.referred_by
      and p.created_at > now() - interval '1 day';
  if v_today > 20 then
    return new; -- daily cap against coordinated farming
  end if;
  update public.profiles set score = score + 25 where id = new.referred_by;
  insert into public.app_events (user_id, event, props)
    values (new.referred_by, 'referral_completed',
            jsonb_build_object('new_user', new.id, 'points', 25));
  return new;
end;
$$;

-- referral stats must count the same way
create or replace function public.my_referral_stats()
returns table (invited int, points_earned int)
language sql security definer set search_path = public as $$
  select count(*)::int, (count(*) * 25)::int
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.referred_by = auth.uid()
    and coalesce(u.is_anonymous, true) = false;
$$;

-- feed no longer exposes hugger_id / hugged_id to clients
revoke select on table public.hugs from authenticated;
grant select (id, hugger_name, hugger_emoji, hugged_name, image_path,
              caption, points, verified, created_at)
  on table public.hugs to authenticated;

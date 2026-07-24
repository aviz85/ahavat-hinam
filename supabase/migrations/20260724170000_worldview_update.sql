-- Worldview updates: allowed once per 30 days, server-enforced,
-- so answers can't be gamed right before a planned meetup.

alter table public.profiles add column answers_updated_at timestamptz;

create function public.update_worldview(p_answers int[])
returns table (ok boolean, next_allowed timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then
    raise exception 'no profile';
  end if;
  if me.answers_updated_at is not null
     and me.answers_updated_at > now() - interval '30 days' then
    return query select false, me.answers_updated_at + interval '30 days';
    return;
  end if;
  if array_length(p_answers, 1) is distinct from array_length(me.answers, 1) then
    raise exception 'bad answers shape';
  end if;
  if exists (select 1 from unnest(p_answers) v where v < 1 or v > 5) then
    raise exception 'bad answer values';
  end if;
  update public.profiles
    set answers = p_answers, answers_updated_at = now()
    where id = me.id;
  return query select true, null::timestamptz;
end;
$$;

-- Lock the sensitive columns from direct client updates: answers only via
-- the RPC above; score/location/last_seen only via their own RPCs.
revoke update on table public.profiles from authenticated;
grant update (name, emoji, bio, avatar_path) on table public.profiles to authenticated;

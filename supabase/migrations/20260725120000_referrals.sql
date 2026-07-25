-- Referral engine: personal invite links award points when the invited
-- friend completes their profile. Server-side, tamper-proof.

alter table public.profiles
  add column referred_by uuid references public.profiles(id) on delete set null;

create function public.handle_referral()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null and new.referred_by <> new.id then
    update public.profiles
      set score = score + 25
      where id = new.referred_by;
    insert into public.app_events (user_id, event, props)
      values (new.referred_by, 'referral_completed',
              jsonb_build_object('new_user', new.id, 'points', 25));
  end if;
  return new;
end;
$$;

create trigger profiles_referral
  after insert on public.profiles
  for each row execute function public.handle_referral();

-- how many friends did I bring? (profiles are owner-read-only, so via RPC)
create function public.my_referral_stats()
returns table (invited int, points_earned int)
language sql security definer set search_path = public as $$
  select count(*)::int, (count(*) * 25)::int
  from public.profiles where referred_by = auth.uid();
$$;

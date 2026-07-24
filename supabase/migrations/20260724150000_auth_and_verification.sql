-- Mutual hug verification: QR handshake + GPS cross-check

create table public.hug_confirmations (
  id uuid primary key default gen_random_uuid(),
  initiator uuid not null references public.profiles(id) on delete cascade,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.hug_confirmations enable row level security;
create policy "initiator reads own confirmations"
  on public.hug_confirmations for select to authenticated
  using (auth.uid() = initiator);

-- Device A creates a short-lived handshake token (rendered as a QR)
create function public.start_hug_verification()
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'no profile';
  end if;
  insert into public.hug_confirmations (initiator) values (auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Device B scans the QR and confirms: must be a different user,
-- token fresh (<15 min), and both phones within 300m of each other.
create function public.confirm_hug_verification(p_id uuid)
returns table (ok boolean, reason text, initiator_name text)
language plpgsql security definer set search_path = public as $$
declare
  row_c public.hug_confirmations;
  a public.profiles;
  b public.profiles;
begin
  select * into row_c from public.hug_confirmations where id = p_id;
  if row_c.id is null then
    return query select false, 'not_found'::text, null::text; return;
  end if;
  if row_c.confirmed_at is not null then
    return query select false, 'already_used'::text, null::text; return;
  end if;
  if row_c.created_at < now() - interval '15 minutes' then
    return query select false, 'expired'::text, null::text; return;
  end if;
  if row_c.initiator = auth.uid() then
    return query select false, 'self'::text, null::text; return;
  end if;
  select * into a from public.profiles where id = row_c.initiator;
  select * into b from public.profiles where id = auth.uid();
  if b.id is null then
    return query select false, 'no_profile'::text, null::text; return;
  end if;
  if a.location is null or b.location is null
     or st_distance(a.location, b.location) > 300 then
    return query select false, 'too_far'::text, a.name; return;
  end if;
  update public.hug_confirmations
    set confirmed_by = b.id, confirmed_at = now()
    where id = p_id;
  return query select true, 'ok'::text, a.name;
end;
$$;

-- Verified flag on hugs
alter table public.hugs add column verified boolean not null default false;

-- record_hug now accepts the verification handshake
drop function public.record_hug(uuid, text, text, text);
create function public.record_hug(
  p_hugged_id uuid,
  p_hugged_name text,
  p_image_path text,
  p_caption text,
  p_verification_id uuid default null
)
returns table (hug_id uuid, points int, verified boolean)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  other public.profiles;
  v_opposition int := 0;
  v_points int := 0;
  v_id uuid;
  v_verified boolean := false;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then
    raise exception 'no profile';
  end if;

  if p_verification_id is not null then
    select true into v_verified
    from public.hug_confirmations c
    where c.id = p_verification_id
      and c.initiator = me.id
      and c.confirmed_at is not null
      and c.confirmed_at > now() - interval '30 minutes';
    v_verified := coalesce(v_verified, false);
    -- a verified handshake pins the hugged party to whoever confirmed
    if v_verified and p_hugged_id is null then
      select c.confirmed_by into p_hugged_id
      from public.hug_confirmations c where c.id = p_verification_id;
    end if;
  end if;

  if p_hugged_id is not null then
    select * into other from public.profiles where profiles.id = p_hugged_id;
    if other.id is not null then
      select coalesce(sum(abs(a.v - b.v)), 0)::int into v_opposition
      from unnest(me.answers) with ordinality as a(v, i)
      join unnest(other.answers) with ordinality as b(v, i) using (i);
      v_points := round(100.0 * v_opposition / (4 * array_length(me.answers, 1)));
      -- a verified real-world meeting is worth double
      if v_verified then v_points := v_points * 2; end if;
    end if;
  end if;

  insert into public.hugs
    (hugger_id, hugger_name, hugger_emoji, hugged_id, hugged_name,
     image_path, caption, points, verified)
  values
    (me.id, me.name, me.emoji, other.id, coalesce(other.name, p_hugged_name),
     p_image_path, nullif(trim(p_caption), ''), v_points, v_verified)
  returning id into v_id;

  update public.profiles set score = score + v_points where id = me.id;

  return query select v_id, v_points, v_verified;
end;
$$;

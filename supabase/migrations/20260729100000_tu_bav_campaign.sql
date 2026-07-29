-- Tu B'Av (ט"ו באב) one-day campaign: "גרעין האהבה" — the couple as the
-- seed of love that expands outward. For the campaign window only:
--   1. ALL hugs score double.
--   2. Partner/spouse hugs (normally near-zero: low opposition + cooldown)
--      get a generous guaranteed floor before doubling, once per pair today —
--      so the pair that hugs daily anyway isn't zeroed out on the one day we
--      actually want to celebrate exactly that.
-- Everything reverts automatically when the window closes — no follow-up
-- migration needed, no permanent change to the scoring model.

alter table public.hugs add column is_campaign boolean not null default false;
alter table public.hugs add column campaign_name text;

create or replace function public.record_hug(
  p_hugged_id uuid,
  p_hugged_name text,
  p_image_path text,
  p_caption text,
  p_verification_id uuid default null
)
returns table (hug_id uuid, points int, verified boolean, repeat_blocked boolean, daily_capped boolean)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  other public.profiles;
  v_opposition int := 0;
  v_points int := 0;
  v_id uuid;
  v_verified boolean := false;
  v_repeat boolean := false;
  v_capped boolean := false;
  v_prior int := 0;
  v_today int := 0;
  v_campaign boolean := now() >= '2026-07-29 00:00:00+03' and now() < '2026-07-30 04:00:00+03';
  v_campaign_prior int := 0;
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
    if v_verified and p_hugged_id is null then
      select c.confirmed_by into p_hugged_id
      from public.hug_confirmations c where c.id = p_verification_id;
    end if;
  end if;

  if p_hugged_id is not null then
    select * into other from public.profiles where profiles.id = p_hugged_id;
    if other.id is not null then
      if v_campaign then
        -- campaign carve-out: at most one bonus hug per pair today, no
        -- 24h-cooldown/diminishing-returns block during the window
        select count(*) into v_campaign_prior from public.hugs h
        where h.is_campaign
          and ((h.hugger_id = me.id and h.hugged_id = other.id)
            or (h.hugger_id = other.id and h.hugged_id = me.id))
          and h.created_at > now() - interval '2 days';
        if v_campaign_prior > 0 then
          v_repeat := true;
        else
          select coalesce(sum(abs(a.v - b.v)), 0)::int into v_opposition
          from unnest(me.answers) with ordinality as a(v, i)
          join unnest(other.answers) with ordinality as b(v, i) using (i);
          v_points := round(100.0 * v_opposition / (4 * array_length(me.answers, 1)));
          if v_verified then v_points := v_points * 2; end if;
          -- "גרעין האהבה": a partner hug is never worth near-zero today
          v_points := greatest(v_points, 60) * 2;
        end if;
      elsif exists (
        select 1 from public.hugs h
        where ((h.hugger_id = me.id and h.hugged_id = other.id)
            or (h.hugger_id = other.id and h.hugged_id = me.id))
          and h.created_at > now() - interval '24 hours'
      ) then
        v_repeat := true;
      else
        select count(*) into v_today from public.hugs h
        where h.hugger_id = me.id and h.points > 0
          and h.created_at > now() - interval '24 hours';
        if v_today >= 10 then
          v_capped := true;
        else
          select coalesce(sum(abs(a.v - b.v)), 0)::int into v_opposition
          from unnest(me.answers) with ordinality as a(v, i)
          join unnest(other.answers) with ordinality as b(v, i) using (i);
          v_points := round(100.0 * v_opposition / (4 * array_length(me.answers, 1)));
          if v_verified then v_points := v_points * 2; end if;
          select count(*) into v_prior from public.hugs h
          where ((h.hugger_id = me.id and h.hugged_id = other.id)
              or (h.hugger_id = other.id and h.hugged_id = me.id))
            and h.points > 0
            and h.created_at > now() - interval '30 days';
          v_points := floor(v_points / power(2, v_prior))::int;
        end if;
      end if;
    end if;
  elsif v_campaign then
    -- solo/undirected campaign hug still gets the holiday doubling
    v_points := 0;
  end if;

  insert into public.hugs
    (hugger_id, hugger_name, hugger_emoji, hugged_id, hugged_name,
     image_path, caption, points, verified, is_campaign, campaign_name)
  values
    (me.id, me.name, me.emoji, other.id, coalesce(other.name, p_hugged_name),
     p_image_path, nullif(trim(p_caption), ''), v_points, v_verified,
     v_campaign, case when v_campaign then 'tu-beav-2026' end)
  returning id into v_id;

  update public.profiles set score = score + v_points where id = me.id;

  return query select v_id, v_points, v_verified, v_repeat, v_capped;
end;
$$;

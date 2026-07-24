-- Scoring: the more opposite your hug, the more points you earn

alter table public.hugs add column points int not null default 0;
alter table public.profiles add column score int not null default 0;

-- Records a hug server-side: computes opposition honestly from both
-- profiles' answers, snapshots identity, awards points to the hugger.
create function public.record_hug(
  p_hugged_id uuid,
  p_hugged_name text,
  p_image_path text,
  p_caption text
)
returns table (hug_id uuid, points int)
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  other public.profiles;
  v_opposition int := 0;
  v_points int := 0;
  v_id uuid;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then
    raise exception 'no profile';
  end if;

  if p_hugged_id is not null then
    select * into other from public.profiles where profiles.id = p_hugged_id;
    if other.id is not null then
      select coalesce(sum(abs(a.v - b.v)), 0)::int into v_opposition
      from unnest(me.answers) with ordinality as a(v, i)
      join unnest(other.answers) with ordinality as b(v, i) using (i);
      -- 0..100: percent of the maximum possible opposition
      v_points := round(100.0 * v_opposition / (4 * array_length(me.answers, 1)));
    end if;
  end if;

  insert into public.hugs
    (hugger_id, hugger_name, hugger_emoji, hugged_id, hugged_name, image_path, caption, points)
  values
    (me.id, me.name, me.emoji, other.id, coalesce(other.name, p_hugged_name), p_image_path,
     nullif(trim(p_caption), ''), v_points)
  returning id into v_id;

  update public.profiles set score = score + v_points where id = me.id;

  return query select v_id, v_points;
end;
$$;

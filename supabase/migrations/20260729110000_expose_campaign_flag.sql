-- Feed needs to show the Tu B'Av campaign badge on qualifying hugs.
grant select (is_campaign) on table public.hugs to authenticated;

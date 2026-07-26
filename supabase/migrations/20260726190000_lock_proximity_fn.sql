-- saved_proximity_alerts takes an arbitrary p_mover and returns pair proximity
-- data — it must only ever be callable by the trusted edge function.
revoke execute on function public.saved_proximity_alerts(uuid, double precision)
  from public, anon, authenticated;
grant execute on function public.saved_proximity_alerts(uuid, double precision)
  to service_role;

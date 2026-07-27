-- Israeli anti-spam law (חוק הספאם, סעיף 30א לחוק התקשורת) compliance:
-- every non-transactional email needs a working, no-login, one-click
-- unsubscribe. This is the durable mechanism; sending scripts must honor it.

alter table public.profiles
  add column email_opt_out boolean not null default false;

-- Callable by anyone with the link, no login required (that's the point —
-- the law requires opt-out to be simple; the id is an opaque uuid, same
-- exposure level as our existing ?ref= links).
create function public.unsubscribe_email(p_uid uuid)
returns boolean
language sql security definer set search_path = public as $$
  update public.profiles set email_opt_out = true where id = p_uid
  returning true;
$$;

grant execute on function public.unsubscribe_email(uuid) to anon, authenticated;

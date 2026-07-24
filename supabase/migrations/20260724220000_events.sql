-- Product analytics: append-only event log.
-- Users can only INSERT their own events; reading is service-role only.
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_events_event_len check (char_length(event) between 1 and 60)
);

alter table public.app_events enable row level security;

create policy "insert own events"
  on public.app_events for insert to authenticated
  with check (user_id = auth.uid());

-- also allow pre-registration events (quiz funnel before sign-in)
create policy "insert anonymous events"
  on public.app_events for insert to anon
  with check (user_id is null);

create index app_events_event_time_idx on public.app_events (event, created_at desc);
create index app_events_user_idx on public.app_events (user_id, created_at desc);

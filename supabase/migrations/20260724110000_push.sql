-- Web Push: subscriptions + proximity-notification cooldown

create table public.push_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "manage own push subscription"
  on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cooldown so people aren't spammed every location update
alter table public.profiles add column last_proximity_push timestamptz;

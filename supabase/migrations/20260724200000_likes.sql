-- Likes on hug posts
create table public.hug_likes (
  hug_id uuid not null references public.hugs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hug_id, user_id)
);

alter table public.hug_likes enable row level security;

create policy "likes readable by authenticated"
  on public.hug_likes for select to authenticated using (true);
create policy "like as yourself"
  on public.hug_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "unlike your own like"
  on public.hug_likes for delete to authenticated using (auth.uid() = user_id);

create index hug_likes_hug_idx on public.hug_likes (hug_id);

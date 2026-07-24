-- Explicit marker for synthetic/demo data so it can always be told apart
alter table public.profiles add column is_synthetic boolean not null default false;
alter table public.hugs add column is_synthetic boolean not null default false;

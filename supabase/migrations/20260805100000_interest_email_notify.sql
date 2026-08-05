-- Track whether an interest-signal notification (push+email) was already
-- sent for a given (user_id, saved_id) pair, so re-invoking notify-interest
-- (e.g. a second click, or revisiting the same match) can't re-spam someone.
alter table public.saved_people add column notified_at timestamptz;

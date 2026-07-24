-- Fix: avatar upsert failed RLS — the update policy had no WITH CHECK,
-- so storage's update-or-insert path rejected the new row.
drop policy "update own avatar" on storage.objects;
create policy "update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- upsert also needs SELECT on the existing row to decide update-vs-insert
create policy "read own avatar objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

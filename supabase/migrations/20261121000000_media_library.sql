-- «مكتبة الوسائط» in the dashboard lists the uploaded images (storage list needs read access to storage.objects).
-- Anyone can already open an image by its public link; listing them is for the team that edits content.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Admins list media') then
    create policy "Admins list media" on storage.objects for select to authenticated
      using (bucket_id = 'media' and (select public.admin_role()) in ('owner', 'editor'));
  end if;
end $$;

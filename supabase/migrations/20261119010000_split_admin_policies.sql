-- STATUS: run by the owner in the SQL editor (it replaces policies, so it is not applied automatically).
-- Five content tables had two "read" rules for a signed-in person: "Admins manage …" (FOR ALL, which includes
-- reading) and "Published … are public" (which already lets the team read everything). Postgres checked both on
-- every read. The team rule now covers only adding, changing and deleting; reading stays with the public rule.
-- Who can do what does not change.

do $$
declare t text;
  q text := '((select public.admin_role()) = any (array[''owner'', ''editor'']))';
begin
  foreach t in array array['partners', 'posts', 'projects', 'services', 'testimonials'] loop
    execute format('drop policy if exists "Admins manage %s" on public.%I', t, t);
    execute format('drop policy if exists "Admins add %s" on public.%I', t, t);
    execute format('drop policy if exists "Admins change %s" on public.%I', t, t);
    execute format('drop policy if exists "Admins delete %s" on public.%I', t, t);
    execute format('create policy "Admins add %s" on public.%I for insert to authenticated with check %s', t, t, q);
    execute format('create policy "Admins change %s" on public.%I for update to authenticated using %s with check %s', t, t, q, q);
    execute format('create policy "Admins delete %s" on public.%I for delete to authenticated using %s', t, t, q);
  end loop;
end $$;

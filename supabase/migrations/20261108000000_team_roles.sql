-- Team access for the dashboard: roles (owner · editor · support) and invitations.
-- Invitations are created by the owner and accepted through the Worker, which calls the token-protected
-- functions below; nobody can make themselves a dashboard user.
-- Safe to run more than once.

-- 1) a role (and the email, for the team list) for each dashboard user; existing users stay owners
alter table public.admins add column if not exists role text not null default 'owner';
alter table public.admins add column if not exists email text not null default '';
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('owner', 'editor', 'support'));

-- 2) the signed-in user's role (null when not a dashboard user, or when the 2-step code is still needed)
create or replace function public.admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admins a where a.user_id = (select auth.uid()) and public.is_admin();
$$;
revoke all on function public.admin_role() from public;
grant execute on function public.admin_role() to anon, authenticated;

-- 3) changing the site's content and look: owners and content editors only (customer service cannot)
alter policy "Admins update settings" on public.site_settings
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins insert settings" on public.site_settings
  with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins manage projects" on public.projects
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins manage services" on public.services
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins manage partners" on public.partners
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins manage testimonials" on public.testimonials
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins manage posts" on public.posts
  using ((select public.admin_role()) in ('owner', 'editor')) with check ((select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins upload media" on storage.objects
  with check (bucket_id = 'media' and (select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins update media" on storage.objects
  using (bucket_id = 'media' and (select public.admin_role()) in ('owner', 'editor'));
alter policy "Admins delete media" on storage.objects
  using (bucket_id = 'media' and (select public.admin_role()) in ('owner', 'editor'));

-- 4) team management (called only by the Worker with WRITE_TOKEN)
create or replace function public.team_list(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'email', coalesce(nullif(a.email, ''), u.email), 'role', a.role,
      'added_at', a.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = a.user_id and f.status = 'verified')
    ) order by a.created_at)
    from public.admins a join auth.users u on u.id = a.user_id), '[]'::jsonb);
end;
$$;

create or replace function public.team_grant(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (p->>'user_id')::uuid; r text := p->>'role';
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r not in ('owner', 'editor', 'support') then raise exception 'bad role'; end if;
  -- never leave the site without an owner
  if r <> 'owner' and exists (select 1 from public.admins where user_id = uid and role = 'owner')
     and (select count(*) from public.admins where role = 'owner') <= 1 then
    raise exception 'last owner';
  end if;
  insert into public.admins (user_id, role, email) values (uid, r, coalesce(p->>'email', ''))
  on conflict (user_id) do update set role = excluded.role, email = coalesce(nullif(excluded.email, ''), public.admins.email);
end;
$$;

create or replace function public.team_remove(token text, uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = uid and role = 'owner')
     and (select count(*) from public.admins where role = 'owner') <= 1 then
    raise exception 'last owner';
  end if;
  delete from public.admins where user_id = uid;
end;
$$;

revoke all on function public.team_list(text) from public;
revoke all on function public.team_grant(text, jsonb) from public;
revoke all on function public.team_remove(text, uuid) from public;
grant execute on function public.team_list(text) to anon, authenticated;
grant execute on function public.team_grant(text, jsonb) to anon, authenticated;
grant execute on function public.team_remove(text, uuid) to anon, authenticated;

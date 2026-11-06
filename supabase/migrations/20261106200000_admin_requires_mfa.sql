-- When the owner turns on two-step verification, admin rights need a session that passed the code step (aal2).
-- Without it, a stolen password alone can't read messages or change the site.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    and (
      coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified')
    );
$fn$;

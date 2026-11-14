-- STATUS: applied on staging and production 2026-11-14 (by Claude, with the owner's approval).
-- Change log: who made a dashboard change was blank when the person's row in the team list had no email
-- (the owner's row, made before emails were stored there). Two fixes:
--  • the team list gets each person's email from their sign-in account where it is empty;
--  • the change-log trigger falls back to the sign-in account's email, so it can never be blank again.
-- (Earlier entries stay as they are — the log cannot be edited — and the dashboard shows their person by account.)

update public.admins a set email = u.email
  from auth.users u
  where u.id = a.user_id and coalesce(a.email, '') = '' and coalesce(u.email, '') <> '';

create or replace function private.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  r jsonb := coalesce(n, o);
  noise text[] := coalesce(tg_argv, '{}');   -- columns that change by themselves (typing, unread counters…)
  ch jsonb; k text; who record;
begin
  if uid is null then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select unnest(noise) loop o := o - k; n := n - k; end loop;
    ch := private.audit_diff(o, n);
    if ch = '{}'::jsonb then return null; end if;
  elsif tg_op = 'INSERT' then
    ch := private.audit_diff('{}'::jsonb, n - noise);
  else
    ch := private.audit_diff(o - noise, '{}'::jsonb);
  end if;
  -- the email from the team list, or from the sign-in account when the team list has none
  select coalesce(nullif(a.email, ''), u.email, '') as email, a.role into who
    from public.admins a left join auth.users u on u.id = a.user_id where a.user_id = uid;
  insert into public.audit_log (actor, actor_email, actor_role, area, action, target, changes)
  values (uid, coalesce(who.email, ''), coalesce(who.role, ''), tg_table_name, lower(tg_op),
          left(coalesce(r->>'number', r->>'title_ar', r->>'name', r->>'title_en', r->>'slug', r->>'key', r->>'email', r->>'id', ''), 160),
          ch);
  return null;
end;
$$;


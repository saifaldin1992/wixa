-- STATUS: applied on staging and production 2026-11-08 (by the owner in the SQL editor).
-- Runs once on a fresh database (no "drop … if exists": nothing to replace).
-- Change log («سجل التعديلات»): every change made from the dashboard — who (email + role at the time), what
-- (table, row, field: before → after) and when. Read by the owner only. Nobody can edit or delete an entry, not even
-- the owner: only the monthly clean-up removes entries older than 12 months.
--
-- Two ways in:
--  • dashboard edits that go straight to the database (content, projects, orders, customers…): row triggers below,
--    recorded only when a signed-in person made the change (auth.uid() is set) — customers' own orders and messages
--    are not dashboard changes;
--  • dashboard actions that go through the server (team, integrations, campaigns…): public.audit_add(token, p),
--    called by the Worker with the signed-in person's email and role.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text not null default '',
  actor_role text not null default '',
  area text not null,                     -- table or server area: projects, site_settings, team, integrations…
  action text not null,                   -- insert · update · delete · or a server action (invite, send…)
  target text not null default '',        -- the row: a title, a name, an order number
  summary text not null default '',       -- one line for people (server actions)
  changes jsonb not null default '{}'::jsonb, -- {"field": {"from": …, "to": …}}
  source text not null default 'dashboard'
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_area_at on public.audit_log (area, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy "Owner reads the change log" on public.audit_log for select to authenticated
  using ((select public.admin_role()) = 'owner');

-- entries cannot be changed or removed (only the clean-up below may delete old ones)
create or replace function private.audit_locked() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('wixa.audit_purge', true) = 'on' then return old; end if;
  raise exception 'the change log cannot be edited' using errcode = '42501';
end;
$$;
create trigger audit_log_locked before update or delete on public.audit_log for each row execute function private.audit_locked();

-- a value short enough to show: long text is cut, objects/arrays shown as compact JSON
create or replace function private.audit_short(v jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select case
    when v is null or jsonb_typeof(v) = 'null' then null
    when jsonb_typeof(v) = 'string' then to_jsonb(left(v #>> '{}', 300) || case when char_length(v #>> '{}') > 300 then '…' else '' end)
    when jsonb_typeof(v) in ('object', 'array') then to_jsonb(left(v::text, 300) || case when char_length(v::text) > 300 then '…' else '' end)
    else v end;
$$;

-- what changed between two objects: {"path": {"from", "to"}}; objects are compared one level deeper
-- (site settings keep everything in one JSON, so "content.ar.hero_title" says exactly what changed), at most 60 fields
create or replace function private.audit_diff(a jsonb, b jsonb, prefix text default '', depth int default 0)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare k text; out jsonb := '{}'::jsonb; va jsonb; vb jsonb; sub jsonb;
begin
  for k in select x from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) x union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) keys order by 1 loop
    continue when k in ('updated_at', 'created_at');
    va := a -> k; vb := b -> k;
    continue when va is not distinct from vb;
    if depth < 3 and jsonb_typeof(va) = 'object' and jsonb_typeof(vb) = 'object' then
      sub := private.audit_diff(va, vb, prefix || k || '.', depth + 1);
      out := out || sub;
    else
      out := out || jsonb_build_object(prefix || k, jsonb_build_object('from', private.audit_short(va), 'to', private.audit_short(vb)));
    end if;
    exit when (select count(*) from jsonb_object_keys(out)) >= 60;
  end loop;
  return out;
end;
$$;

-- row trigger: records dashboard changes (a signed-in person), skips visitors and the server
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
  select a.email, a.role into who from public.admins a where a.user_id = uid;
  insert into public.audit_log (actor, actor_email, actor_role, area, action, target, changes)
  values (uid, coalesce(who.email, ''), coalesce(who.role, ''), tg_table_name, lower(tg_op),
          left(coalesce(r->>'number', r->>'title_ar', r->>'name', r->>'title_en', r->>'slug', r->>'key', r->>'email', r->>'id', ''), 160),
          ch);
  return null;
end;
$$;

do $$
declare t text; noise text;
begin
  foreach t in array array['site_settings', 'projects', 'services', 'partners', 'testimonials', 'posts', 'orders', 'customer_notes', 'contact_messages', 'chats', 'admins'] loop
    noise := case t
      when 'chats' then '''staff_typing'', ''staff_typing_at'', ''visitor_typing_at'', ''unread'', ''visitor_unread'', ''last_at'', ''last_text'', ''last_from'', ''pushed_at'', ''emailed_at'', ''first_reply_at'', ''secret'''
      else '' end;
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row(%s)', t, noise);
  end loop;
end $$;

-- server actions (team, integrations, campaigns…): the Worker records who did what
create or replace function public.audit_add(token text, p jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.audit_log (actor, actor_email, actor_role, area, action, target, summary, changes, source)
  values (nullif(p->>'actor', '')::uuid, left(coalesce(p->>'email', ''), 200), left(coalesce(p->>'role', ''), 20),
          left(coalesce(p->>'area', 'server'), 40), left(coalesce(p->>'action', ''), 40), left(coalesce(p->>'target', ''), 160),
          left(coalesce(p->>'summary', ''), 500), coalesce(p->'changes', '{}'::jsonb), 'server');
end;
$$;
revoke all on function public.audit_add(text, jsonb) from public;
grant execute on function public.audit_add(text, jsonb) to anon, authenticated;

-- monthly clean-up: entries older than 12 months
create or replace function private.audit_purge() returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('wixa.audit_purge', 'on', true);
  delete from public.audit_log where at < now() - interval '12 months';
end;
$$;
select cron.schedule('wixa-audit-log-retention', '41 2 1 * *', 'select private.audit_purge()');

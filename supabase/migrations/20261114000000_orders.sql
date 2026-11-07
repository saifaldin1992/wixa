-- Orders: one place for every project request from the site (a package, a solution for a field, the cost
-- estimator, "a project like this one", a service, or "start your project"). Each has a number (WX-…),
-- what was chosen, the gifts and discount saved with it, and a status the team moves forward.
-- Only adds things; safe to run more than once.

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  number text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'quoted', 'in_progress', 'done', 'cancelled')),
  source text not null default 'start',     -- package | field | calc | similar | service | start
  item text not null default '',            -- what was chosen (package name, field, project…)
  details jsonb not null default '{}'::jsonb,
  price_hint text not null default '',
  name text not null,
  phone text not null,
  email text not null default '',
  note text not null default '',
  lang text not null default 'ar',
  marketing boolean not null default false,
  visit_source text not null default '',
  gifts jsonb not null default '[]'::jsonb,
  discount text not null default '',
  discount_until date,
  team_note text not null default ''
);
create index if not exists orders_created_idx on public.orders (created_at desc);

alter table public.orders enable row level security;
revoke all on public.orders from anon;
grant select, update on public.orders to authenticated;

-- owner and customer service only (content editors never see customers' data)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'Team reads orders') then
    create policy "Team reads orders" on public.orders for select to authenticated
      using ((select public.admin_role()) in ('owner', 'support'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'Team updates orders') then
    create policy "Team updates orders" on public.orders for update to authenticated
      using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
  end if;
end $$;

-- written only by the site's server (token-checked), never directly by visitors
create or replace function public.submit_order(token text, p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'name', '')) not between 1 and 120 or char_length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 7 then
    raise exception 'invalid';
  end if;
  insert into public.orders (number, source, item, details, price_hint, name, phone, email, note, lang, marketing, visit_source, gifts, discount, discount_until)
  values (
    left(p->>'number', 30), left(coalesce(p->>'source', 'start'), 20), left(coalesce(p->>'item', ''), 200),
    coalesce(p->'details', '{}'::jsonb), left(coalesce(p->>'price_hint', ''), 80),
    left(p->>'name', 120), left(p->>'phone', 40), left(coalesce(p->>'email', ''), 200), left(coalesce(p->>'note', ''), 3000),
    coalesce(nullif(p->>'lang', ''), 'ar'), coalesce((p->>'marketing')::boolean, false), left(coalesce(p->>'visit_source', ''), 60),
    coalesce(p->'gifts', '[]'::jsonb), left(coalesce(p->>'discount', ''), 200), nullif(p->>'discount_until', '')::date
  );
end;
$$;
revoke all on function public.submit_order(text, jsonb) from public;
grant execute on function public.submit_order(text, jsonb) to anon, authenticated;

-- the team sees new orders arrive without refreshing
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- the scheduled backup includes the orders
create or replace function public.export_backup(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'settings', (select data from public.site_settings where id = 1),
    'projects', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.projects t), '[]'),
    'services', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.services t), '[]'),
    'partners', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.partners t), '[]'),
    'testimonials', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.testimonials t), '[]'),
    'posts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.posts t), '[]'),
    'contact_messages', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.contact_messages t), '[]'),
    'orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.orders t), '[]')
  );
end;
$$;
revoke all on function public.export_backup(text) from public;
grant execute on function public.export_backup(text) to anon, authenticated;

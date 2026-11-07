-- WIXA — complete database setup for a NEW, EMPTY Supabase project (e.g. a new staging environment).
-- Generated from supabase/migrations/* in order. Paste it all into the SQL editor once and press Run.
-- Afterwards: create the first user (Authentication → Users → Add user) — the first account becomes the owner.
-- Then store the hash of this environment's WRITE_TOKEN (see docs/DEVELOPERS.md).


-- ===================== 20261105000000_contact_messages.sql =====================
-- Messages submitted from the website contact form.
create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200),
  phone       text check (phone is null or char_length(phone) <= 40),
  message     text not null check (char_length(message) between 1 and 4000),
  services    text[] not null default '{}' check (cardinality(services) <= 10),
  lang        text not null default 'ar' check (lang in ('ar', 'en')),
  handled     boolean not null default false
);

alter table public.contact_messages enable row level security;

-- Visitors (anon) may only submit new messages; they can never read, edit or delete them.
create policy "Anyone can submit a contact message"
  on public.contact_messages
  for insert
  to anon, authenticated
  with check (handled = false);

-- Column-level grant: anon can insert only these columns.
revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, phone, message, services, lang) on public.contact_messages to anon, authenticated;

-- ===================== 20261105010000_cms.sql =====================
-- WIXA CMS: admins, site settings, projects, services, partners, page views, media storage.

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "Admins can see admins" on public.admins
  for select to authenticated using ((select public.is_admin()));

-- The first account that signs up becomes the admin. Later sign-ups are plain users with no rights.
create or replace function public.make_first_user_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins) then
    insert into public.admins (user_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.make_first_user_admin() from public, anon, authenticated;

create trigger on_auth_user_created_make_admin
  after insert on auth.users
  for each row execute function public.make_first_user_admin();

-- ---------- Site settings (single row) ----------
create table if not exists public.site_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
create policy "Settings are public" on public.site_settings for select to anon, authenticated using (true);
create policy "Admins update settings" on public.site_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins insert settings" on public.site_settings for insert to authenticated
  with check ((select public.is_admin()));

insert into public.site_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ---------- Projects ----------
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  sort           int not null default 0,
  published      boolean not null default true,
  title_ar       text not null default '',
  title_en       text not null default '',
  summary_ar     text not null default '',
  summary_en     text not null default '',
  category_ar    text not null default '',
  category_en    text not null default '',
  image_url      text,
  mobile_image_url text,
  link           text,
  stats          jsonb not null default '[]'::jsonb
);
alter table public.projects enable row level security;
create policy "Published projects are public" on public.projects for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "Admins manage projects" on public.projects for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Services ----------
create table if not exists public.services (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sort       int not null default 0,
  published  boolean not null default true,
  icon       text not null default 'code',
  title_ar   text not null default '',
  title_en   text not null default '',
  summary_ar text not null default '',
  summary_en text not null default ''
);
alter table public.services enable row level security;
create policy "Published services are public" on public.services for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "Admins manage services" on public.services for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Partners ----------
create table if not exists public.partners (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sort       int not null default 0,
  published  boolean not null default true,
  name       text not null default '',
  logo_url   text,
  link       text
);
alter table public.partners enable row level security;
create policy "Published partners are public" on public.partners for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "Admins manage partners" on public.partners for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Contact messages: admins can read and mark handled ----------
create policy "Admins read messages" on public.contact_messages for select to authenticated
  using ((select public.is_admin()));
create policy "Admins update messages" on public.contact_messages for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete messages" on public.contact_messages for delete to authenticated
  using ((select public.is_admin()));
grant select, update, delete on public.contact_messages to authenticated;

-- ---------- Page views (written by the Worker with the publishable key) ----------
create table if not exists public.page_views (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  path         text not null check (char_length(path) <= 300),
  visitor_hash text not null check (char_length(visitor_hash) <= 64),
  referrer     text check (referrer is null or char_length(referrer) <= 300),
  country      text check (country is null or char_length(country) <= 2),
  device       text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  lang         text check (lang is null or lang in ('ar', 'en'))
);
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
alter table public.page_views enable row level security;
create policy "Anyone can record a page view" on public.page_views for insert to anon, authenticated with check (true);
create policy "Admins read page views" on public.page_views for select to authenticated using ((select public.is_admin()));
revoke all on public.page_views from anon, authenticated;
grant insert (path, visitor_hash, referrer, country, device, lang) on public.page_views to anon, authenticated;
grant select on public.page_views to authenticated;

-- Aggregated stats for the dashboard.
create or replace function public.admin_stats(days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := date_trunc('day', now()) - make_interval(days => greatest(days, 1) - 1);
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'views',        (select count(*) from public.page_views where created_at >= since),
    'visitors',     (select count(distinct visitor_hash) from public.page_views where created_at >= since),
    'today_views',  (select count(*) from public.page_views where created_at >= date_trunc('day', now())),
    'today_visitors', (select count(distinct visitor_hash) from public.page_views where created_at >= date_trunc('day', now())),
    'all_time_views', (select count(*) from public.page_views),
    'messages_new', (select count(*) from public.contact_messages where not handled),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(v.views, 0), 'visitors', coalesce(v.visitors, 0)) order by d)
      from generate_series(since, date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', created_at) as day, count(*) as views, count(distinct visitor_hash) as visitors
        from public.page_views where created_at >= since group by 1
      ) v on v.day = d
    ), '[]'::jsonb),
    'top_pages', coalesce((
      select jsonb_agg(t) from (
        select path as label, count(*) as value from public.page_views where created_at >= since
        group by path order by value desc limit 6) t
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(t) from (
        select coalesce(country, '??') as label, count(distinct visitor_hash) as value from public.page_views where created_at >= since
        group by 1 order by value desc limit 6) t
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(t) from (
        select coalesce(device, 'desktop') as label, count(distinct visitor_hash) as value from public.page_views where created_at >= since
        group by 1 order by value desc) t
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(t) from (
        select referrer as label, count(*) as value from public.page_views
        where created_at >= since and referrer is not null and referrer <> ''
        group by referrer order by value desc limit 6) t
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;

-- ---------- Media storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'])
on conflict (id) do nothing;

create policy "Admins upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()));
create policy "Admins update media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));
create policy "Admins delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

-- ===================== 20261106000000_testimonials_project_details.sql =====================
-- Testimonials + richer project pages.

create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sort        int not null default 0,
  published   boolean not null default true,
  name        text not null default '',
  role_ar     text not null default '',
  role_en     text not null default '',
  quote_ar    text not null default '',
  quote_en    text not null default '',
  avatar_url  text,
  rating      int not null default 5 check (rating between 1 and 5)
);
alter table public.testimonials enable row level security;
create policy "Published testimonials are public" on public.testimonials for select to anon, authenticated
  using (published or (select public.is_admin()));
create policy "Admins manage testimonials" on public.testimonials for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

alter table public.projects
  add column if not exists details_ar text not null default '',
  add column if not exists details_en text not null default '',
  add column if not exists gallery jsonb not null default '[]'::jsonb;

-- ===================== 20261106100000_secure_writes.sql =====================
-- Writes from the public site go through token-checked functions called by the Worker.
-- The Worker holds the token (WRITE_TOKEN secret); the database stores only its SHA-256:
--   insert into private.config(key, value) values ('write_token_sha256', '<hex sha256>')
--   on conflict (key) do update set value = excluded.value;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;

create or replace function private.token_ok(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.config
    where key = 'write_token_sha256'
      and value = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.token_ok(text) from public, anon, authenticated;

create or replace function public.submit_contact(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.contact_messages (name, email, phone, message, services, lang)
  values (
    p->>'name',
    p->>'email',
    nullif(p->>'phone', ''),
    p->>'message',
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb))), '{}'),
    coalesce(p->>'lang', 'ar')
  );
end;
$$;
revoke all on function public.submit_contact(text, jsonb) from public;
grant execute on function public.submit_contact(text, jsonb) to anon, authenticated;

create or replace function public.track_view(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.page_views (path, visitor_hash, referrer, country, device, lang)
  values (p->>'path', p->>'visitor_hash', p->>'referrer', p->>'country', p->>'device', p->>'lang');
end;
$$;
revoke all on function public.track_view(text, jsonb) from public;
grant execute on function public.track_view(text, jsonb) to anon, authenticated;

-- Uploaded media: raster images only (SVG can carry scripts).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'media';

-- Keep the visits table small: drop raw page views older than ~13 months, nightly.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'wixa-page-views-retention';
select cron.schedule('wixa-page-views-retention', '17 3 * * *',
  $$delete from public.page_views where created_at < now() - interval '400 days'$$);

-- ===================== 20261106100100_lock_direct_writes.sql =====================
-- Apply only after the Worker that calls submit_contact / track_view is deployed.
-- The public key can no longer insert rows directly; the token-checked functions
-- (security definer, run as the table owner) are the only way in.

alter policy "Anyone can submit a contact message" on public.contact_messages with check (false);
alter policy "Anyone can record a page view" on public.page_views with check (false);

-- ===================== 20261106200000_admin_requires_mfa.sql =====================
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

-- ===================== 20261106300000_retire_track_view.sql =====================
-- Visits are counted by Cloudflare Web Analytics now; the old in-database counter is no longer callable.
-- (The function and table stay for history; the retention job keeps clearing old rows.)
revoke execute on function public.track_view(text, jsonb) from anon, authenticated, public;

-- ===================== 20261107000000_posts_reviews_backup.sql =====================
-- Articles (blog), a details text for each service page, client reviews sent from a private link,
-- and a full backup the Worker can email on a schedule.

-- 1) service pages: a longer description per service
alter table public.services add column if not exists details_ar text not null default '';
alter table public.services add column if not exists details_en text not null default '';

-- 2) articles
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz,
  published    boolean not null default false,
  slug         text not null unique check (slug ~ '^[^/?#\s]{1,90}$'),
  title_ar     text not null default '',
  title_en     text not null default '',
  excerpt_ar   text not null default '',
  excerpt_en   text not null default '',
  body_ar      text not null default '',
  body_en      text not null default '',
  cover_url    text not null default ''
);
alter table public.posts enable row level security;
drop policy if exists "Published posts are public" on public.posts;
create policy "Published posts are public" on public.posts for select to anon, authenticated
  using (published or (select public.is_admin()));
drop policy if exists "Admins manage posts" on public.posts;
create policy "Admins manage posts" on public.posts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- 3) a client's review arrives hidden; the owner publishes it from the dashboard
create or replace function public.submit_testimonial(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.testimonials (published, sort, name, role_ar, role_en, quote_ar, quote_en, rating)
  values (
    false, 999,
    left(coalesce(p->>'name', ''), 120),
    case when p->>'lang' = 'en' then '' else left(coalesce(p->>'role', ''), 120) end,
    case when p->>'lang' = 'en' then left(coalesce(p->>'role', ''), 120) else '' end,
    case when p->>'lang' = 'en' then '' else left(coalesce(p->>'quote', ''), 1500) end,
    case when p->>'lang' = 'en' then left(coalesce(p->>'quote', ''), 1500) else '' end,
    greatest(1, least(5, coalesce((p->>'rating')::int, 5)))
  );
end;
$$;
revoke all on function public.submit_testimonial(text, jsonb) from public;
grant execute on function public.submit_testimonial(text, jsonb) to anon, authenticated;

-- 4) everything editable plus the messages, as one JSON document (for the scheduled backup email)
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
    'contact_messages', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.contact_messages t), '[]')
  );
end;
$$;
revoke all on function public.export_backup(text) from public;
grant execute on function public.export_backup(text) to anon, authenticated;

-- ===================== 20261108000000_team_roles.sql =====================
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

-- ===================== 20261109000000_live_chat.sql =====================
-- Live chat between site visitors and the team (owner + customer service).
-- Visitors never touch these tables directly: the Worker calls the token-protected functions below with a
-- per-chat secret key that only that visitor's browser holds. The team reads and replies from the dashboard
-- (row level security: owner and customer service only), with instant updates through Supabase Realtime.
-- Safe to run more than once.

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  secret text not null,                         -- sha-256 of the visitor's key
  name text not null,
  phone text not null default '',
  page text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  unread int not null default 0,                -- visitor messages the team has not read
  visitor_unread int not null default 0,        -- team replies the visitor has not seen
  last_text text not null default '',
  last_from text not null default 'visitor',
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  emailed_at timestamptz,
  pushed_at timestamptz
);
create index if not exists chats_last_at on public.chats (last_at desc);

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender text not null check (sender in ('visitor', 'staff')),
  body text not null check (char_length(body) between 1 and 2000),
  staff text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_chat on public.chat_messages (chat_id, id);

-- who of the team has the dashboard open (the site shows "online now" to visitors)
create table if not exists public.chat_presence (
  user_id uuid primary key default auth.uid(),
  seen_at timestamptz not null default now()
);

alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_presence enable row level security;
revoke all on public.chats from anon;
revoke all on public.chat_messages from anon;
revoke all on public.chat_presence from anon;

drop policy if exists "Team reads chats" on public.chats;
create policy "Team reads chats" on public.chats for select to authenticated
  using ((select public.admin_role()) in ('owner', 'support'));
drop policy if exists "Team updates chats" on public.chats;
create policy "Team updates chats" on public.chats for update to authenticated
  using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
drop policy if exists "Owner deletes chats" on public.chats;
create policy "Owner deletes chats" on public.chats for delete to authenticated
  using ((select public.admin_role()) = 'owner');

drop policy if exists "Team reads chat messages" on public.chat_messages;
create policy "Team reads chat messages" on public.chat_messages for select to authenticated
  using ((select public.admin_role()) in ('owner', 'support'));
drop policy if exists "Team replies" on public.chat_messages;
create policy "Team replies" on public.chat_messages for insert to authenticated
  with check (sender = 'staff' and (select public.admin_role()) in ('owner', 'support'));

drop policy if exists "Team presence" on public.chat_presence;
create policy "Team presence" on public.chat_presence for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.admin_role()) in ('owner', 'support'));

grant select, update, delete on public.chats to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert, update on public.chat_presence to authenticated;

-- a team reply updates the conversation's summary (and the visitor's unread count)
create or replace function private.chat_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender = 'staff' then
    update public.chats set last_at = new.created_at, last_text = left(new.body, 200), last_from = 'staff',
      visitor_unread = visitor_unread + 1, unread = 0, status = 'open'
    where id = new.chat_id;
  end if;
  return new;
end;
$$;
drop trigger if exists chat_after_message on public.chat_messages;
create trigger chat_after_message after insert on public.chat_messages
  for each row execute function private.chat_after_message();

-- the team member's name on a reply comes from the signed-in account, not from the browser
create or replace function private.chat_staff_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender = 'staff' then
    new.staff := coalesce((select split_part(email, '@', 1) from auth.users where id = auth.uid()), '');
  end if;
  return new;
end;
$$;
drop trigger if exists chat_staff_name on public.chat_messages;
create trigger chat_staff_name before insert on public.chat_messages
  for each row execute function private.chat_staff_name();

create or replace function private.chat_online()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.chat_presence where seen_at > now() - interval '90 seconds'); $$;

-- visitor functions (called only by the Worker with WRITE_TOKEN)
create or replace function public.chat_start(token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare cid uuid; online boolean := private.chat_online();
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'name', '')) not between 1 and 80 or char_length(coalesce(p->>'body', '')) not between 1 and 2000
     or char_length(coalesce(p->>'secret', '')) <> 64 then
    raise exception 'invalid';
  end if;
  -- keep six months of conversations
  delete from public.chats where last_at < now() - interval '180 days';
  insert into public.chats (secret, name, phone, page, unread, last_text, emailed_at, pushed_at)
  values (p->>'secret', p->>'name', left(coalesce(p->>'phone', ''), 30), left(coalesce(p->>'page', ''), 200), 1, left(p->>'body', 200), now(), now())
  returning id into cid;
  insert into public.chat_messages (chat_id, sender, body) values (cid, 'visitor', p->>'body');
  return jsonb_build_object('id', cid, 'online', online);
end;
$$;

create or replace function public.chat_send(token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c public.chats; online boolean := private.chat_online(); do_push boolean; do_mail boolean; mid bigint;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.chats where id = (p->>'id')::uuid and secret = p->>'secret';
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if char_length(coalesce(p->>'body', '')) not between 1 and 2000 then raise exception 'invalid'; end if;
  insert into public.chat_messages (chat_id, sender, body) values (c.id, 'visitor', p->>'body') returning id into mid;
  do_push := c.pushed_at is null or c.pushed_at < now() - interval '60 seconds';
  do_mail := not online and (c.emailed_at is null or c.emailed_at < now() - interval '15 minutes');
  update public.chats set last_at = now(), last_text = left(p->>'body', 200), last_from = 'visitor', unread = unread + 1, status = 'open',
    pushed_at = case when do_push then now() else pushed_at end,
    emailed_at = case when do_mail then now() else emailed_at end
  where id = c.id;
  return jsonb_build_object('id', mid, 'push', do_push, 'email', do_mail, 'online', online, 'name', c.name, 'phone', c.phone);
end;
$$;

create or replace function public.chat_poll(token text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare c public.chats;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.chats where id = (p->>'id')::uuid and secret = p->>'secret';
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if coalesce((p->>'seen')::boolean, false) and c.visitor_unread > 0 then
    update public.chats set visitor_unread = 0 where id = c.id;
  end if;
  return jsonb_build_object(
    'online', private.chat_online(),
    'status', c.status,
    'unread', c.visitor_unread,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'body', m.body, 'staff', m.staff, 'at', m.created_at) order by m.id)
      from (select * from public.chat_messages where chat_id = c.id and id > coalesce((p->>'after')::bigint, 0) order by id limit 200) m), '[]'::jsonb));
end;
$$;

-- only whether someone is online (for the chat button before a conversation starts)
create or replace function public.chat_status(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('online', private.chat_online());
end;
$$;

revoke all on function public.chat_start(text, jsonb) from public;
revoke all on function public.chat_send(text, jsonb) from public;
revoke all on function public.chat_poll(text, jsonb) from public;
revoke all on function public.chat_status(text) from public;
grant execute on function public.chat_start(text, jsonb) to anon, authenticated;
grant execute on function public.chat_send(text, jsonb) to anon, authenticated;
grant execute on function public.chat_poll(text, jsonb) to anon, authenticated;
grant execute on function public.chat_status(text) to anon, authenticated;
revoke all on function private.chat_online() from public;

-- instant updates in the dashboard
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chats') then
    alter publication supabase_realtime add table public.chats;
  end if;
end $$;

-- ===================== 20261110000000_chat_names_topics.sql =====================
-- Live chat, round 2: the name customers see for each team member, the conversation's topic,
-- and "typing…" indicators in both directions. Safe to run more than once.

alter table public.admins add column if not exists display_name text not null default '';
alter table public.chats add column if not exists topic text not null default '';
alter table public.chats add column if not exists staff_typing text not null default '';
alter table public.chats add column if not exists staff_typing_at timestamptz;
alter table public.chats add column if not exists visitor_typing_at timestamptz;

-- the signed-in team member's own display name
create or replace function public.my_display_name()
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select display_name from public.admins where user_id = (select auth.uid()) and public.is_admin()), ''); $$;

create or replace function public.set_display_name(p text)
returns text language plpgsql security definer set search_path = ''
as $$
declare n text := left(trim(coalesce(p, '')), 40);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.admins set display_name = n where user_id = (select auth.uid());
  return n;
end;
$$;
revoke all on function public.my_display_name() from public;
revoke all on function public.set_display_name(text) from public;
grant execute on function public.my_display_name() to authenticated;
grant execute on function public.set_display_name(text) to authenticated;

-- a reply carries the member's chosen name (never the email); empty → the site shows "فريق ويكسا"
create or replace function private.chat_staff_name()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.sender = 'staff' then
    new.staff := coalesce((select display_name from public.admins where user_id = auth.uid()), '');
  end if;
  return new;
end;
$$;
-- earlier test replies showed the email name: hide it
update public.chat_messages set staff = '' where sender = 'staff' and staff <> ''
  and staff not in (select display_name from public.admins where display_name <> '');

-- a reply also ends the "typing…" indicator
create or replace function private.chat_after_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.sender = 'staff' then
    update public.chats set last_at = new.created_at, last_text = left(new.body, 200), last_from = 'staff',
      visitor_unread = visitor_unread + 1, unread = 0, status = 'open', staff_typing_at = null
    where id = new.chat_id;
  end if;
  return new;
end;
$$;

create or replace function public.chat_start(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare cid uuid; online boolean := private.chat_online();
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'name', '')) not between 1 and 80 or char_length(coalesce(p->>'body', '')) not between 1 and 2000
     or char_length(coalesce(p->>'secret', '')) <> 64 then
    raise exception 'invalid';
  end if;
  delete from public.chats where last_at < now() - interval '180 days';
  insert into public.chats (secret, name, phone, page, topic, unread, last_text, emailed_at, pushed_at)
  values (p->>'secret', p->>'name', left(coalesce(p->>'phone', ''), 30), left(coalesce(p->>'page', ''), 200), left(coalesce(p->>'topic', ''), 120), 1, left(p->>'body', 200), now(), now())
  returning id into cid;
  insert into public.chat_messages (chat_id, sender, body) values (cid, 'visitor', p->>'body');
  return jsonb_build_object('id', cid, 'online', online);
end;
$$;

create or replace function public.chat_send(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.chats; online boolean := private.chat_online(); do_push boolean; do_mail boolean; mid bigint;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.chats where id = (p->>'id')::uuid and secret = p->>'secret';
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if char_length(coalesce(p->>'body', '')) not between 1 and 2000 then raise exception 'invalid'; end if;
  insert into public.chat_messages (chat_id, sender, body) values (c.id, 'visitor', p->>'body') returning id into mid;
  do_push := c.pushed_at is null or c.pushed_at < now() - interval '60 seconds';
  do_mail := not online and (c.emailed_at is null or c.emailed_at < now() - interval '15 minutes');
  update public.chats set last_at = now(), last_text = left(p->>'body', 200), last_from = 'visitor', unread = unread + 1, status = 'open',
    visitor_typing_at = null,
    pushed_at = case when do_push then now() else pushed_at end,
    emailed_at = case when do_mail then now() else emailed_at end
  where id = c.id;
  return jsonb_build_object('id', mid, 'push', do_push, 'email', do_mail, 'online', online, 'name', c.name, 'phone', c.phone, 'topic', c.topic);
end;
$$;

create or replace function public.chat_poll(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.chats;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.chats where id = (p->>'id')::uuid and secret = p->>'secret';
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if coalesce((p->>'seen')::boolean, false) and c.visitor_unread > 0 then
    update public.chats set visitor_unread = 0 where id = c.id;
  end if;
  if coalesce((p->>'typing')::boolean, false) then
    update public.chats set visitor_typing_at = now() where id = c.id;
  end if;
  return jsonb_build_object(
    'online', private.chat_online(),
    'status', c.status,
    'unread', c.visitor_unread,
    'typing', case when c.staff_typing_at > now() - interval '7 seconds' then coalesce(nullif(c.staff_typing, ''), '-') else null end,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'body', m.body, 'staff', m.staff, 'at', m.created_at) order by m.id)
      from (select * from public.chat_messages where chat_id = c.id and id > coalesce((p->>'after')::bigint, 0) order by id limit 200) m), '[]'::jsonb));
end;
$$;

-- ===================== 20261111000000_customers.sql =====================
-- Customers: everyone who wrote through the contact form or the live chat, with their consent to receive offers,
-- plus private notes and an opt-out per customer (owner and customer service only). Safe to run more than once.

alter table public.contact_messages add column if not exists marketing boolean not null default false;
alter table public.chats add column if not exists marketing boolean not null default false;

create or replace function public.submit_contact(token text, p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.contact_messages (name, email, phone, message, services, lang, marketing)
  values (
    p->>'name',
    p->>'email',
    nullif(p->>'phone', ''),
    p->>'message',
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb))), '{}'),
    coalesce(p->>'lang', 'ar'),
    coalesce((p->>'marketing')::boolean, false)
  );
end;
$$;

create or replace function public.chat_start(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare cid uuid; online boolean := private.chat_online();
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'name', '')) not between 1 and 80 or char_length(coalesce(p->>'body', '')) not between 1 and 2000
     or char_length(coalesce(p->>'secret', '')) <> 64 then
    raise exception 'invalid';
  end if;
  delete from public.chats where last_at < now() - interval '180 days';
  insert into public.chats (secret, name, phone, page, topic, marketing, unread, last_text, emailed_at, pushed_at)
  values (p->>'secret', p->>'name', left(coalesce(p->>'phone', ''), 30), left(coalesce(p->>'page', ''), 200), left(coalesce(p->>'topic', ''), 120),
    coalesce((p->>'marketing')::boolean, false), 1, left(p->>'body', 200), now(), now())
  returning id into cid;
  insert into public.chat_messages (chat_id, sender, body) values (cid, 'visitor', p->>'body');
  return jsonb_build_object('id', cid, 'online', online);
end;
$$;

-- private notes per customer (key = phone or email), and "do not send offers"
create table if not exists public.customer_notes (
  key text primary key,
  note text not null default '',
  opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.customer_notes enable row level security;
revoke all on public.customer_notes from anon;
drop policy if exists "Team manages customer notes" on public.customer_notes;
create policy "Team manages customer notes" on public.customer_notes for all to authenticated
  using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
grant select, insert, update, delete on public.customer_notes to authenticated;

-- customer messages: owner and customer service only (content editors never see customers' data)
alter policy "Admins read messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support'));
alter policy "Admins update messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
alter policy "Admins delete messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support'));

-- ===================== 20261112000000_sales.sql =====================
-- Sales and customer experience: where each customer came from, chat ratings, the sales pipeline
-- (stage, follow-up date, deal value), case studies on projects, reminders and email campaigns.
-- Needs 20261110 (chat names/topics) and 20261111 (customers). Safe to run more than once.

-- 1) where the customer came from (Google, Instagram, a friend's link…)
alter table public.contact_messages add column if not exists source text not null default '';
alter table public.chats add column if not exists source text not null default '';

-- 2) the customer's rating after a chat
alter table public.chats add column if not exists rating int check (rating between 1 and 5);
alter table public.chats add column if not exists rating_note text not null default '';
alter table public.chats add column if not exists first_reply_at timestamptz;

-- 3) the sales pipeline, per customer
alter table public.customer_notes add column if not exists stage text not null default 'new';
alter table public.customer_notes add column if not exists follow_at date;
alter table public.customer_notes add column if not exists value numeric not null default 0;
alter table public.customer_notes drop constraint if exists customer_notes_stage_check;
alter table public.customer_notes add constraint customer_notes_stage_check check (stage in ('new', 'contacted', 'quoted', 'won', 'lost'));

-- 4) case studies on projects: the problem, the solution, the result
alter table public.projects add column if not exists problem_ar text not null default '';
alter table public.projects add column if not exists problem_en text not null default '';
alter table public.projects add column if not exists solution_ar text not null default '';
alter table public.projects add column if not exists solution_en text not null default '';
alter table public.projects add column if not exists result_ar text not null default '';
alter table public.projects add column if not exists result_en text not null default '';

-- one form for phone numbers (same rule as the dashboard): 07… / 009647… / +9647… → 9647…
create or replace function private.norm_phone(p text)
returns text language sql immutable set search_path = ''
as $$
  select case when d like '00%' then substr(d, 3) when d like '0%' and length(d) >= 10 then '964' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x;
$$;

-- the contact form and the chat keep the source
create or replace function public.submit_contact(token text, p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.contact_messages (name, email, phone, message, services, lang, marketing, source)
  values (
    p->>'name', p->>'email', nullif(p->>'phone', ''), p->>'message',
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb))), '{}'),
    coalesce(p->>'lang', 'ar'), coalesce((p->>'marketing')::boolean, false), left(coalesce(p->>'source', ''), 60)
  );
end;
$$;

create or replace function public.chat_start(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare cid uuid; online boolean := private.chat_online();
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(coalesce(p->>'name', '')) not between 1 and 80 or char_length(coalesce(p->>'body', '')) not between 1 and 2000
     or char_length(coalesce(p->>'secret', '')) <> 64 then
    raise exception 'invalid';
  end if;
  delete from public.chats where last_at < now() - interval '180 days';
  insert into public.chats (secret, name, phone, page, topic, marketing, source, unread, last_text, emailed_at, pushed_at)
  values (p->>'secret', p->>'name', left(coalesce(p->>'phone', ''), 30), left(coalesce(p->>'page', ''), 200), left(coalesce(p->>'topic', ''), 120),
    coalesce((p->>'marketing')::boolean, false), left(coalesce(p->>'source', ''), 60), 1, left(p->>'body', 200), now(), now())
  returning id into cid;
  insert into public.chat_messages (chat_id, sender, body) values (cid, 'visitor', p->>'body');
  return jsonb_build_object('id', cid, 'online', online);
end;
$$;

-- the first team reply is remembered (for "how fast do we answer")
create or replace function private.chat_after_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.sender = 'staff' then
    update public.chats set last_at = new.created_at, last_text = left(new.body, 200), last_from = 'staff',
      visitor_unread = visitor_unread + 1, unread = 0, status = 'open', staff_typing_at = null,
      first_reply_at = coalesce(first_reply_at, new.created_at)
    where id = new.chat_id;
  end if;
  return new;
end;
$$;

-- the visitor rates a chat (once it is closed)
create or replace function public.chat_rate(token text, p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare r int := (p->>'rating')::int;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if r is null or r not between 1 and 5 then raise exception 'invalid'; end if;
  update public.chats set rating = r, rating_note = left(coalesce(p->>'note', ''), 500)
  where id = (p->>'id')::uuid and secret = p->>'secret';
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end;
$$;

-- daily reminder: follow-ups due today, and conversations waiting for a reply for more than a day
create or replace function public.sales_due(token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'follow', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'note', note, 'stage', stage, 'at', follow_at) order by follow_at)
      from public.customer_notes where follow_at is not null and follow_at <= (now() at time zone 'Asia/Baghdad')::date and stage not in ('won', 'lost')), '[]'::jsonb),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'phone', phone, 'text', last_text, 'at', last_at) order by last_at)
      from public.chats where status = 'open' and last_from = 'visitor' and last_at < now() - interval '1 day'), '[]'::jsonb),
    'names', coalesce((select jsonb_object_agg(k, n) from (
      select 'p:' || private.norm_phone(phone) k, max(name) n from public.contact_messages where coalesce(phone, '') <> '' group by 1
      union all select 'e:' || lower(email), max(name) from public.contact_messages where coalesce(email, '') <> '' group by 1
      union all select 'p:' || private.norm_phone(phone), max(name) from public.chats where phone <> '' group by 1) x), '{}'::jsonb)
  );
end;
$$;

-- email campaigns go only to people who agreed and did not unsubscribe
create or replace function public.campaign_audience(token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('email', e, 'name', n)) from (
    select lower(trim(email)) e, (array_agg(name order by created_at desc))[1] n
    from public.contact_messages
    where marketing and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    group by 1) a
    where not exists (select 1 from public.customer_notes c where c.opt_out and (c.key = 'e:' || a.e))
      and not exists (select 1 from public.contact_messages m join public.customer_notes c on c.opt_out
        and c.key = 'p:' || private.norm_phone(m.phone) where lower(trim(m.email)) = a.e)), '[]'::jsonb);
end;
$$;

-- "unsubscribe" links in campaign emails
create or replace function public.campaign_optout(token text, email text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.customer_notes (key, opt_out, updated_at) values ('e:' || lower(trim(email)), true, now())
  on conflict (key) do update set opt_out = true, updated_at = now();
end;
$$;

revoke all on function public.chat_rate(text, jsonb) from public;
revoke all on function public.sales_due(text) from public;
revoke all on function public.campaign_audience(text) from public;
revoke all on function public.campaign_optout(text, text) from public;
grant execute on function public.chat_rate(text, jsonb) to anon, authenticated;
grant execute on function public.sales_due(text) to anon, authenticated;
grant execute on function public.campaign_audience(text) to anon, authenticated;
grant execute on function public.campaign_optout(text, text) to anon, authenticated;

-- ===================== 20261113000000_token_per_environment.sql =====================
-- One write key per environment: each Worker (production, staging) holds only its own token,
-- and the database keeps the sha-256 of each under a key starting with "write_token_sha256".
create or replace function private.token_ok(token text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.config
    where key like 'write_token_sha256%'
      and value = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.token_ok(text) from public, anon, authenticated;
-- visitors never upload files directly
revoke insert on storage.objects from anon;

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

-- Defence in depth: visitors (the anon role) may only READ published content. Row-level security already blocked
-- every write, but the role still held write privileges (insert, update, truncate…) it never needs.
-- Writes from the site go through token-checked SECURITY DEFINER functions, which are unaffected.
-- Safe to run more than once.
revoke all on public.partners, public.posts, public.projects, public.services, public.site_settings, public.testimonials, public.admins from anon;
grant select on public.partners, public.posts, public.projects, public.services, public.site_settings, public.testimonials to anon;

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

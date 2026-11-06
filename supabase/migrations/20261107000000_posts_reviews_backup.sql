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

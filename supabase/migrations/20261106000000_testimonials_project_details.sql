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

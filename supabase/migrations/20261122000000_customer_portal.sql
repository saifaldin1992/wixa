-- «بوابة العميل»: the customer signs in with an order number + the phone it was placed with, then sees every order
-- placed with that phone, each with its stage and the updates the team chose to share (text + an optional link).
-- The Worker keeps the sign-in (a signed token); these functions only answer with the service token.

create table if not exists public.order_updates (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  body text not null default '' check (char_length(body) <= 2000),
  link text not null default '' check (char_length(link) <= 500),
  by_email text not null default ''
);
create index if not exists order_updates_order_idx on public.order_updates (order_id, created_at desc);
alter table public.order_updates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_updates' and policyname = 'Team reads order updates') then
    create policy "Team reads order updates" on public.order_updates for select to authenticated
      using ((select public.admin_role()) in ('owner', 'support'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_updates' and policyname = 'Team adds order updates') then
    create policy "Team adds order updates" on public.order_updates for insert to authenticated
      with check ((select public.admin_role()) in ('owner', 'support'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_updates' and policyname = 'Owner removes order updates') then
    create policy "Owner removes order updates" on public.order_updates for delete to authenticated
      using ((select public.admin_role()) = 'owner');
  end if;
end $$;
grant select, insert, delete on public.order_updates to authenticated;

-- the last 10 digits of a phone number: 07701234567, +9647701234567 and 7701234567 are the same customer
create or replace function private.phone10(v text) returns text language sql immutable set search_path = '' as $$
  select right(regexp_replace(coalesce(v, ''), '\D', '', 'g'), 10)
$$;

-- sign-in: the order number and its phone must match; answers the phone key the portal lists orders by
create or replace function public.portal_login(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  num text := upper(regexp_replace(coalesce(p->>'number', ''), '\s', '', 'g'));
  ph text := private.phone10(p->>'phone');
  r record;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(num) < 6 or char_length(ph) < 9 then return null; end if;
  select o.name, private.phone10(o.phone) as ph into r from public.orders o
   where o.number = num and private.phone10(o.phone) = ph limit 1;
  if not found then return null; end if;
  return jsonb_build_object('phone', r.ph, 'name', split_part(btrim(r.name), ' ', 1));
end $$;

-- the portal: every order placed with this phone (newest first, at most 20) and the updates shared on each
create or replace function public.portal_orders(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ph text := private.phone10(p->>'phone');
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(ph) < 9 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', o.number, 'status', o.status, 'item', o.item, 'created_at', o.created_at, 'updated_at', o.updated_at,
      'updates', coalesce((select jsonb_agg(jsonb_build_object('at', u.created_at, 'body', u.body, 'link', u.link) order by u.created_at desc)
                            from public.order_updates u where u.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc)
    from (select * from public.orders o where private.phone10(o.phone) = ph order by o.created_at desc limit 20) o
  ), '[]'::jsonb);
end $$;

revoke all on function public.portal_login(text, jsonb) from public;
revoke all on function public.portal_orders(text, jsonb) from public;
grant execute on function public.portal_login(text, jsonb) to anon, authenticated;
grant execute on function public.portal_orders(text, jsonb) to anon, authenticated;

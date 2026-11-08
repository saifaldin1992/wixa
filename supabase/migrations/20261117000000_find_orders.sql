-- "I forgot my order number" (live chat): the phone the order was placed with + the customer's name → their recent
-- order numbers. Both must match (last 7 digits of the phone, and the first word of the name appears in the order's
-- name), so a phone or a name alone reveals nothing. Server-only (token-gated); returns numbers, dates and statuses.
create or replace function public.find_orders(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  tail text := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 7);
  first_name text := lower(split_part(btrim(coalesce(p->>'name', '')), ' ', 1));
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(tail) < 7 or char_length(first_name) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('number', o.number, 'status', o.status, 'created_at', o.created_at, 'item', o.item) order by o.created_at desc)
      from (select * from public.orders o
             where right(regexp_replace(o.phone, '\D', '', 'g'), 7) = tail
               and position(first_name in lower(o.name)) > 0
             order by o.created_at desc limit 5) o
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.find_orders(text, jsonb) from public;
grant execute on function public.find_orders(text, jsonb) to anon, authenticated;

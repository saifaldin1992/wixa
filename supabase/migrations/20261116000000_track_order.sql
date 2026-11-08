-- "Track your order" (/track): a visitor types their order number and the phone they ordered with and sees where
-- the order stands. Only the server calls it (token-gated); it returns the status and the date, nothing personal,
-- and only when both the number and the phone's last 7 digits match.
create or replace function public.track_order(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  num text := upper(regexp_replace(coalesce(p->>'number', ''), '\s', '', 'g'));
  tail text := right(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g'), 7);
  r record;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(num) < 6 or char_length(tail) < 7 then return null; end if;
  select o.number, o.status, o.created_at, o.updated_at, o.item into r
    from public.orders o
   where o.number = num and right(regexp_replace(o.phone, '\D', '', 'g'), 7) = tail
   limit 1;
  if not found then return null; end if;
  return jsonb_build_object('number', r.number, 'status', r.status, 'created_at', r.created_at, 'updated_at', r.updated_at, 'item', r.item);
end;
$$;
revoke all on function public.track_order(text, jsonb) from public;
grant execute on function public.track_order(text, jsonb) to anon, authenticated;

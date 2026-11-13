-- STATUS: applied on staging and production 2026-11-13 (additive: one new table, two new functions).
-- Sales funnel counters (calculator used, WhatsApp clicked, form opened…), one row per day and event.
-- They used to be kept in Cloudflare KV as one object per day, read, added to and written back by each server
-- instance — two instances flushing at once lost one of the two updates. Here every flush is a single atomic
-- "add n" in the database, so nothing is lost. Only the Worker writes and reads them (token-checked functions);
-- nobody can read or write the table directly.

create table if not exists public.event_counts (
  day date not null,
  event text not null check (event ~ '^[a-z_]{1,40}$'),
  n integer not null default 0 check (n >= 0),
  primary key (day, event)
);
alter table public.event_counts enable row level security;   -- no policies: closed to the Data API
revoke all on public.event_counts from anon, authenticated;

-- add a batch of counts for one day: p = {"day": "2026-11-13", "counts": {"calc_used": 3, "wa_click": 1}}
create or replace function public.events_add(token text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare d date := (p->>'day')::date;
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  if d is null or d < current_date - 2 or d > current_date + 1 then raise exception 'invalid day'; end if;
  insert into public.event_counts as e (day, event, n)
  select d, k, least(greatest(v::int, 0), 100000)
  from jsonb_each_text(coalesce(p->'counts', '{}'::jsonb)) as x(k, v)
  where k ~ '^[a-z_]{1,40}$' and v ~ '^\d{1,6}$'
  on conflict (day, event) do update set n = e.n + excluded.n;
end $$;

-- totals per event since a day: p = {"since": "2026-10-15"} → {"calc_used": 120, …}
create or replace function public.events_total(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(event, total) from (
    select event, sum(n)::bigint total from public.event_counts
    where day >= coalesce((p->>'since')::date, current_date - 29) group by event) t), '{}'::jsonb);
end $$;

revoke all on function public.events_add(text, jsonb) from public;
revoke all on function public.events_total(text, jsonb) from public;
grant execute on function public.events_add(text, jsonb) to anon, authenticated;
grant execute on function public.events_total(text, jsonb) to anon, authenticated;

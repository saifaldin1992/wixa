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

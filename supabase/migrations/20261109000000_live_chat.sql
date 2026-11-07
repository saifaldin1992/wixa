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

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

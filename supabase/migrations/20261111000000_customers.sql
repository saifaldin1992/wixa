-- Customers: everyone who wrote through the contact form or the live chat, with their consent to receive offers,
-- plus private notes and an opt-out per customer (owner and customer service only). Safe to run more than once.

alter table public.contact_messages add column if not exists marketing boolean not null default false;
alter table public.chats add column if not exists marketing boolean not null default false;

create or replace function public.submit_contact(token text, p jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.contact_messages (name, email, phone, message, services, lang, marketing)
  values (
    p->>'name',
    p->>'email',
    nullif(p->>'phone', ''),
    p->>'message',
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb))), '{}'),
    coalesce(p->>'lang', 'ar'),
    coalesce((p->>'marketing')::boolean, false)
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
  insert into public.chats (secret, name, phone, page, topic, marketing, unread, last_text, emailed_at, pushed_at)
  values (p->>'secret', p->>'name', left(coalesce(p->>'phone', ''), 30), left(coalesce(p->>'page', ''), 200), left(coalesce(p->>'topic', ''), 120),
    coalesce((p->>'marketing')::boolean, false), 1, left(p->>'body', 200), now(), now())
  returning id into cid;
  insert into public.chat_messages (chat_id, sender, body) values (cid, 'visitor', p->>'body');
  return jsonb_build_object('id', cid, 'online', online);
end;
$$;

-- private notes per customer (key = phone or email), and "do not send offers"
create table if not exists public.customer_notes (
  key text primary key,
  note text not null default '',
  opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.customer_notes enable row level security;
revoke all on public.customer_notes from anon;
drop policy if exists "Team manages customer notes" on public.customer_notes;
create policy "Team manages customer notes" on public.customer_notes for all to authenticated
  using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
grant select, insert, update, delete on public.customer_notes to authenticated;

-- customer messages: owner and customer service only (content editors never see customers' data)
alter policy "Admins read messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support'));
alter policy "Admins update messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support')) with check ((select public.admin_role()) in ('owner', 'support'));
alter policy "Admins delete messages" on public.contact_messages
  using ((select public.admin_role()) in ('owner', 'support'));

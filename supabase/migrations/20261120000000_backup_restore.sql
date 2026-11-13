-- STATUS: applied on staging and production 2026-11-13 (replaces export_backup, adds restore_records; nothing is dropped).
-- Backups now carry everything needed after losing the database, and a restore brings it all back:
--  • export_backup adds live chats, their messages and the customer notes (sales stage, follow-ups, opt-outs);
--  • restore_records puts back the orders, messages, chats and customer notes that are MISSING — rows that are
--    already there are never changed or deleted (new orders may have arrived since the backup).
-- Only the Worker calls restore_records (token), for the owner, from the dashboard's restore button.

create or replace function public.export_backup(token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'settings', (select data from public.site_settings where id = 1),
    'projects', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.projects t), '[]'),
    'services', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.services t), '[]'),
    'partners', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.partners t), '[]'),
    'testimonials', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort) from public.testimonials t), '[]'),
    'posts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.posts t), '[]'),
    'contact_messages', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.contact_messages t), '[]'),
    'orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.orders t), '[]'),
    'chats', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.chats t), '[]'),
    'chat_messages', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.chat_messages t), '[]'),
    'customer_notes', coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from public.customer_notes t), '[]')
  );
end $$;

create or replace function public.restore_records(token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  res jsonb := '{}'::jsonb;
  n int;
  chat_ids uuid[] := '{}';
  msg_ids bigint[] := '{}';
begin
  if not private.token_ok(token) then raise exception 'forbidden' using errcode = '42501'; end if;

  -- each table on its own: a problem in one (an old backup missing a column) does not stop the others
  begin
    with ins as (insert into public.orders overriding system value
      select * from jsonb_populate_recordset(null::public.orders, coalesce(p->'orders', '[]')) on conflict do nothing returning 1)
    select count(*) into n from ins;
    res := res || jsonb_build_object('orders', n);
  exception when others then res := res || jsonb_build_object('orders_error', sqlerrm);
  end;

  begin
    with ins as (insert into public.contact_messages overriding system value
      select * from jsonb_populate_recordset(null::public.contact_messages, coalesce(p->'contact_messages', '[]')) on conflict do nothing returning 1)
    select count(*) into n from ins;
    res := res || jsonb_build_object('contact_messages', n);
  exception when others then res := res || jsonb_build_object('contact_messages_error', sqlerrm);
  end;

  begin
    with ins as (insert into public.chats
      select * from jsonb_populate_recordset(null::public.chats, coalesce(p->'chats', '[]')) on conflict do nothing returning id)
    select coalesce(array_agg(id), '{}') into chat_ids from ins;
    -- messages only for the chats that were missing (an existing chat is left exactly as it is)
    with ins as (insert into public.chat_messages overriding system value
      select * from jsonb_populate_recordset(null::public.chat_messages, coalesce(p->'chat_messages', '[]')) m
      where m.chat_id = any(chat_ids) on conflict do nothing returning id)
    select coalesce(array_agg(id), '{}') into msg_ids from ins;
    -- the message triggers rewrite the staff name and the chat summary for a new message: put the backup's values back
    update public.chat_messages m set staff = b.staff
      from jsonb_populate_recordset(null::public.chat_messages, coalesce(p->'chat_messages', '[]')) b
      where m.id = b.id and m.id = any(msg_ids);
    update public.chats c set last_at = b.last_at, last_text = b.last_text, last_from = b.last_from, unread = b.unread,
        visitor_unread = b.visitor_unread, status = b.status, staff_typing_at = b.staff_typing_at, first_reply_at = b.first_reply_at
      from jsonb_populate_recordset(null::public.chats, coalesce(p->'chats', '[]')) b
      where c.id = b.id and c.id = any(chat_ids);
    res := res || jsonb_build_object('chats', cardinality(chat_ids), 'chat_messages', cardinality(msg_ids));
  exception when others then res := res || jsonb_build_object('chats_error', sqlerrm);
  end;

  begin
    with ins as (insert into public.customer_notes
      select * from jsonb_populate_recordset(null::public.customer_notes, coalesce(p->'customer_notes', '[]')) on conflict do nothing returning 1)
    select count(*) into n from ins;
    res := res || jsonb_build_object('customer_notes', n);
  exception when others then res := res || jsonb_build_object('customer_notes_error', sqlerrm);
  end;

  -- new rows after a restore continue after the highest restored number
  perform setval(pg_get_serial_sequence('public.orders', 'id'), coalesce((select max(id) from public.orders), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.contact_messages', 'id'), coalesce((select max(id) from public.contact_messages), 0) + 1, false);
  perform setval(pg_get_serial_sequence('public.chat_messages', 'id'), coalesce((select max(id) from public.chat_messages), 0) + 1, false);
  return res;
end $$;

revoke all on function public.restore_records(text, jsonb) from public;
grant execute on function public.restore_records(text, jsonb) to anon, authenticated;

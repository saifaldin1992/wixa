-- Writes from the public site go through token-checked functions called by the Worker.
-- The Worker holds the token (WRITE_TOKEN secret); the database stores only its SHA-256:
--   insert into private.config(key, value) values ('write_token_sha256', '<hex sha256>')
--   on conflict (key) do update set value = excluded.value;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;

create or replace function private.token_ok(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.config
    where key = 'write_token_sha256'
      and value = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.token_ok(text) from public, anon, authenticated;

create or replace function public.submit_contact(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.contact_messages (name, email, phone, message, services, lang)
  values (
    p->>'name',
    p->>'email',
    nullif(p->>'phone', ''),
    p->>'message',
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb))), '{}'),
    coalesce(p->>'lang', 'ar')
  );
end;
$$;
revoke all on function public.submit_contact(text, jsonb) from public;
grant execute on function public.submit_contact(text, jsonb) to anon, authenticated;

create or replace function public.track_view(token text, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.token_ok(token) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.page_views (path, visitor_hash, referrer, country, device, lang)
  values (p->>'path', p->>'visitor_hash', p->>'referrer', p->>'country', p->>'device', p->>'lang');
end;
$$;
revoke all on function public.track_view(text, jsonb) from public;
grant execute on function public.track_view(text, jsonb) to anon, authenticated;

-- Uploaded media: raster images only (SVG can carry scripts).
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'media';

-- Keep the visits table small: drop raw page views older than ~13 months, nightly.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'wixa-page-views-retention';
select cron.schedule('wixa-page-views-retention', '17 3 * * *',
  $$delete from public.page_views where created_at < now() - interval '400 days'$$);

-- One write key per environment: each Worker (production, staging) holds only its own token,
-- and the database keeps the sha-256 of each under a key starting with "write_token_sha256".
create or replace function private.token_ok(token text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.config
    where key like 'write_token_sha256%'
      and value = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex')
  );
$$;
revoke all on function private.token_ok(text) from public, anon, authenticated;
-- visitors never upload files directly
revoke insert on storage.objects from anon;

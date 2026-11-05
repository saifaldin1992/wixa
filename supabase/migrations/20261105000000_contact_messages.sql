-- Messages submitted from the website contact form.
create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200),
  phone       text check (phone is null or char_length(phone) <= 40),
  message     text not null check (char_length(message) between 1 and 4000),
  services    text[] not null default '{}' check (cardinality(services) <= 10),
  lang        text not null default 'ar' check (lang in ('ar', 'en')),
  handled     boolean not null default false
);

alter table public.contact_messages enable row level security;

-- Visitors (anon) may only submit new messages; they can never read, edit or delete them.
create policy "Anyone can submit a contact message"
  on public.contact_messages
  for insert
  to anon, authenticated
  with check (handled = false);

-- Column-level grant: anon can insert only these columns.
revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, phone, message, services, lang) on public.contact_messages to anon, authenticated;

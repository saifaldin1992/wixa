-- Least privilege (review of Nov 2026): visitors and signed-in users never need to empty a table (TRUNCATE), add
-- triggers or reference keys; row security does not cover TRUNCATE, so it is taken away from both roles on every
-- table. The client portal's updates table had kept the default visitor rights: visitors get nothing on it (the
-- Worker reads it through portal_orders, the team through its own policies).
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on public.order_updates from anon;
revoke update on public.order_updates from authenticated;
-- tables created later by migrations start without these rights too
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;

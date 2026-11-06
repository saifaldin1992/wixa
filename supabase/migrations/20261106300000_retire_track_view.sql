-- Visits are counted by Cloudflare Web Analytics now; the old in-database counter is no longer callable.
-- (The function and table stay for history; the retention job keeps clearing old rows.)
revoke execute on function public.track_view(text, jsonb) from anon, authenticated, public;

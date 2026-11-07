-- Defence in depth: visitors (the anon role) may only READ published content. Row-level security already blocked
-- every write, but the role still held write privileges (insert, update, truncate…) it never needs.
-- Writes from the site go through token-checked SECURITY DEFINER functions, which are unaffected.
-- Safe to run more than once.
revoke all on public.partners, public.posts, public.projects, public.services, public.site_settings, public.testimonials, public.admins from anon;
grant select on public.partners, public.posts, public.projects, public.services, public.site_settings, public.testimonials to anon;

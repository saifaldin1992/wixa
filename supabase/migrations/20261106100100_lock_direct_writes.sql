-- Apply only after the Worker that calls submit_contact / track_view is deployed.
-- From now on the public key can no longer insert rows directly.

drop policy if exists "Anyone can submit a contact message" on public.contact_messages;
revoke insert on public.contact_messages from anon, authenticated;

drop policy if exists "Anyone can record a page view" on public.page_views;
revoke insert on public.page_views from anon, authenticated;

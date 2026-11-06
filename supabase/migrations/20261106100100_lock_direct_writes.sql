-- Apply only after the Worker that calls submit_contact / track_view is deployed.
-- The public key can no longer insert rows directly; the token-checked functions
-- (security definer, run as the table owner) are the only way in.

alter policy "Anyone can submit a contact message" on public.contact_messages with check (false);
alter policy "Anyone can record a page view" on public.page_views with check (false);

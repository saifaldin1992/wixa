-- Clean-up (Nov 2026). Nothing the site or the dashboard shows changes.
--
-- 1. The in-house visit counter (page_views + track_view + its nightly clean-up) stopped being filled when visitor
--    statistics moved to Cloudflare Web Analytics; the table is empty in both databases. admin_stats (the dashboard's
--    fallback when Cloudflare cannot be reached) keeps exactly the same answer it gives today with the empty table:
--    zero visits, a day-by-day series of zeros, empty lists, and the real number of unread messages.
-- 2. make_first_user_admin: the first account ever created became the owner. The owner exists; left in place, an
--    emptied admins table would hand the dashboard to whoever signs up next. New team members are invited from the
--    dashboard (team_grant), which does not depend on it.

select cron.unschedule(jobid) from cron.job where jobname = 'wixa-page-views-retention';

create or replace function public.admin_stats(days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  since timestamptz := date_trunc('day', now()) - make_interval(days => greatest(days, 1) - 1);
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'views', 0, 'visitors', 0, 'today_views', 0, 'today_visitors', 0, 'all_time_views', 0,
    'messages_new', (select count(*) from public.contact_messages where not handled),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'views', 0, 'visitors', 0) order by d)
      from generate_series(since, date_trunc('day', now()), interval '1 day') d
    ), '[]'::jsonb),
    'top_pages', '[]'::jsonb, 'countries', '[]'::jsonb, 'devices', '[]'::jsonb, 'referrers', '[]'::jsonb
  );
end;
$function$;

drop function if exists public.track_view(text, jsonb);
drop table if exists public.page_views;

drop trigger if exists on_auth_user_created_make_admin on auth.users;
drop function if exists public.make_first_user_admin();

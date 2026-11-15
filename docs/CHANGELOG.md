# سجل التغييرات — موقع ويكسا (WIXA)

ما تغيّر ولماذا، بالترتيب الذي حدث به. الدليل المرجعي للوضع الحالي في `docs/DEVELOPERS.md`.

---

## First paint, caching and the project request (Nov 2026)
- **Server-rendered page:** `handleHome` fills every `[data-c]` / `[data-t]` text, the theme colours (`WIXA.themeVars`) and hidden sections in the HTML itself, using `public/shared.js` (loaded in the Worker through `src/window-shim.js`). There is no loading screen; the hero plays its entrance from CSS (`.hero.in-hero`).
- **Site content copy in KV:** `site-data` in the PRIVATE namespace holds the last good content, so a cold edge location never waits for the database. Written only when the content changed.
- **Built files:** `scripts/build.mjs` writes `public/build/manifest.json` (a fingerprint per file). Pages ask for `/build/site.js?v=<fingerprint>`; the Worker serves those with a one-year immutable cache, anything else with `no-cache`.
- **Project request:** `public/js/site/request.js` (opened by `.nav-cta`, `[data-start]`, `#start`, and the contact page's “request a project” card) posts to `/api/contact` with `kind: "project"`. The Worker gives it a number `WX-YYMMDD-XXXX`, stores a readable summary as a message, alerts the team and emails the client a confirmation (`sendRequestConfirmation`).
- **Chat reviews:** a 4–5★ chat rating with “share my review” ticked arrives in client reviews **hidden** until the owner publishes it.

## Orders (one order page, Nov 2026)
- Every order button (hero, top menu, packages, “solution for your field”, the estimator, “a project like this one”, service and project pages) goes to **`/order`** (`public/js/site/order.js`). The choice travels in `sessionStorage` (`wixa-order`) or the link (`?pkg=`, `?project=`, `?svc=`, `?field=`). Nothing chosen → the page opens on the packages.
- The page posts to **`POST /api/order`** (`handleOrder`): name + phone required, **email optional everywhere on the site**. The Worker numbers it (`WX-YYMMDD-XXXX`), adds the gifts/discount from the dashboard settings (`requestOffer`), writes it with `submit_order` into **`public.orders`** (migration `20261114000000_orders.sql`), alerts the team and emails the client when an email was given.
- Dashboard → **Orders** (`views/orders.js`): status (new → contacted → quoted → in progress → done / cancelled), private team note, call / WhatsApp / email, “quote” (pre-filled with the gifts and discount), and which buttons bring orders.

**Manual orders:** the round «+» on the Orders page opens «طلب يدوي» → `POST /api/admin/order` (`handleAdminOrder`,
owner and customer service). Same `WX-…` number (`newOrderNumber()` in `lib/core.js`) and `submit_order`, `source = manual`,
the channel (phone / WhatsApp / visit / social / email / other) in `visit_source`; the current gifts and discount only when
ticked. Nothing is emailed; the action is written to the audit log.

## Dashboard organisation (Nov 2026)

The sidebar has seven groups, each page in one place only:

| Group | Pages |
|---|---|
| الرئيسية | overview (ملخص اليوم · الزيارات · سلوك الزوار والسرعة) |
| خدمة الزبائن | orders · messages · chats (المحادثات · الإعدادات) · customers |
| المبيعات والتسويق | sales · campaigns · seo — invoices go here when built |
| محتوى الموقع | content «صفحات الموقع» (الصفحة الرئيسية · الصفحات المستقلة · القوائم والأزرار · بيانات الشركة) · projects · services · partners · testimonials · posts |
| التصميم | appearance · brand «UI / UX» |
| الإعدادات | notify · integrations · protect · backup · team · account |
| النظام | diagnose · devguide — the audit log goes here when built |

**Long pages are sub-menus.** In `public/admin/js/shell.js`, `SECTIONS[view]` lists the page's sections and which cards
belong to each (`["#cardId" | ".class" | "start of the card title", "section"]`); the router calls `sectionize()` after
the page is drawn. A new card is placed by adding one rule. Pages with branches (UI / UX, the developer guide, صفحات
الموقع) call `sectionTabs()` themselves. A page's own filters/periods stay as extra rows under the section rows.

**Pages made of other pages' cards** use `composeView(view, [[renderFn, ["#cardId", "title start", "*"]], …])` — the
cards keep their own buttons and saving (notify, integrations, protect, backup, diagnose and account do this).

## Fixed sizes (dashboard + site)

One set of sizes for every page — no page sets its own width. Tokens live at the end of `public/admin/admin.css`
(`--page`, `--gutter`, `--card-pad`, `--gap`, `--r-lg`) and in `public/styles.css` (`--max`, `--gutter`, `--card-pad`, `--radius`).

| | phone | tablet | computer |
|---|---|---|---|
| dashboard breakpoints | ≤600 | 601–960 | ≥961 |
| site breakpoints | ≤767 | 768–1199 | ≥1200 |
| content width | dashboard 1120 · site 1240 | | |
| side gutter | 16 | 24 | 32 |
| card padding (dashboard / site) | 16 / 18 | 20 / 22 | 24 / 26 |
| gap between cards | 12 | 16 | 16 |
| radius | controls 14 · cards 22 · large panels 28 | | |
| panel padding (site forms, order) | 20 | 28 | 36 |
| first title under the header bar (site inner pages) | 40 | 48 | 64 |

Site content widths (box including gutters, centred): wide `--max` 1240 · reading `--read` 820 · narrow `--narrow` 560.
The site block is at the end of `public/styles.css` ("FIXED SIZES"); standalone pages (`simplePage` in `src/routes/pages.js`)
use the same tokens.

`tests/site-layout.mjs` (part of `npm test`) opens every site page on a phone, a tablet and a computer and fails on
sideways scrolling, a corner size outside the three, a row of cards not centred at one of the three widths, or an inner
page whose first title is not at the standard distance under the header bar.

`tests/admin-layout.mjs` (part of `npm test`) opens every dashboard page on an iPhone 13 and at 1440×900 and fails if
the page is wider than the screen, if a card on its own is narrower than the page, or if a row of cards does not start
at the page edge. Spacing between cards comes from the container's `gap` only.


## Third-party libraries (Nov 2026)

supabase-js 2.45.4 (dashboard), gsap 3.12.5 + ScrollTrigger and lenis 1.1.13 (site effects) are served from
`public/vendor/`, one file per version — never from a CDN. The CSP allows scripts only from the site itself, Cloudflare
Insights and Turnstile. To upgrade: add the new file with its version in the name, point the page at it, delete the old.

## Dashboard speed (Nov 2026)

- **Visitor numbers** (`services/stats.js`): Cloudflare can take ~6 s to answer a query it has not seen for a while.
  The last numbers are kept in the edge cache and in KV (`stats:<days>`) and shown at once; when older than 5 minutes
  they are refreshed in the background. Only the very first query of an environment waits.
- **Sign-in check** (`lib/auth.js`): the role of a dashboard session is remembered for one minute (by a fingerprint of
  the token, never past its expiry), so the several API calls of one page do not each ask the database. A role change or
  removal takes effect within that minute.
- **Home page** (`views/overview.js`): the numbers, the «today» card and the visitor-behaviour card are requested
  together.
- **Request logs**: Workers observability is on for both environments (Cloudflare → Workers → wixa / wixa-staging →
  Observability) to read real timings per path.

## Reliability on weak connections (Nov 2026)

Nothing may leave a white page or wait for ever (`tests/no-white-page.mjs`, `tests/admin-netfail.mjs`):

| Where | Rule | File |
|---|---|---|
| Home page | `#boot` loading screen (logo + «جارٍ التحميل», the same as the dashboard) while `html.booting` is set and `html.site-ready` is not; after 10 s «التحميل يتأخر» + «إعادة المحاولة» (reload). Without scripts the screen never shows | `public/home-pre.js`, `public/index.html`, `styles.css` |
| Stand-alone pages (terms, articles, services…) | the same `#boot` screen is painted first (`BOOT_CSS` + `bootHtml()` in `routes/pages.js`; the stylesheets come right after it in `<body>`), `site.css` hides it as soon as it arrives; after 10 s «إعادة المحاولة» | `routes/pages.js`, `public/theme-pre.js` |
| Dashboard start | `#boot` loading screen until `#auth` or `#app` shows (CSS `:has`); after 10 s «التحميل يتأخر» + reload button | `public/admin/boot.js`, `admin.css` |
| Dashboard → Supabase | every request gives up after 20 s (uploads excepted) — the client's `global.fetch` | `public/admin/admin.js` |
| Dashboard → `/api/admin/*` | `timedFetch()`: 20 s for reads, 60 s for sending; a toast says the connection is slow | `public/admin/js/core.js` |
| Start-up network failure | `connectionFailed()` retry box; the session is kept (a network error is never «no admin permission») | `public/admin/js/auth.js` |
| Settings not loaded | `saveSettings()` refuses, so defaults never overwrite the real settings | `public/admin/js/settings.js` |

**Every dashboard button responds** (`tests/admin-buttons.mjs`): each page is opened with sample data and every button is clicked; one that changes nothing fails the test. It caught the round «+» add button of projects / services / partners / reviews, whose handler had ended up in unreachable code.

**Event handlers:** read `e.currentTarget` into a variable *before* the first `await` — after it the event is gone
(`null`), which broke «رابط رأي لعميل».

## Security and load tests (Nov 2026)

Penetration test on staging, 61 attempts, all refused: dashboard API without/with forged tokens, server files
(`/src`, `/.git`, `/.env`, `wrangler.toml`, schema), path traversal, open redirect, cross-site reads, the public
Supabase key against every private table and token function, form floods, SQL injection and script payloads.
One finding fixed: new live chats are capped at **6 a day per address** (`routes/chat.js`, KV `chatday:<date>:<fp>`,
the address kept only as a salted fingerprint for one day).

Load test on staging: 600 requests in 3.6 s and 2,000 in 14.1 s, all 200, no errors.

**To repeat them** (this sandbox cannot reach the sites directly; the staging database can): from the Supabase SQL
editor of the **staging** project, `select net.http_get('https://staging.wixa.dev/…')` for each request, then read
`net._http_response` (status, body, `created`). Never against production, and never with valid form data (it would
create real orders or chats).


## Audit log — سجل التعديلات (Nov 2026)

Who changed what and when, for the owner only (dashboard → النظام → «سجل التعديلات», `views/audit.js`).
Migration `20261118000000_audit_log.sql` (**apply on staging, then production**; until then the page says «السجل غير مفعّل بعد»).

- **Table `public.audit_log`**: `at, actor, actor_email, actor_role, area, action, target, summary, changes (jsonb {field: {from, to}}), source`.
  RLS: owners read only. A trigger refuses every update/delete — nobody (owner included) can edit or remove entries.
- **Dashboard edits** (saved straight to the database) are recorded by the trigger `private.audit_row` on
  `site_settings, projects, services, partners, testimonials, posts, orders, customer_notes, contact_messages, chats, admins`.
  Only changes made by a signed-in person (`auth.uid()` set) are logged; only the changed fields are stored; noisy chat columns are ignored.
- **Server actions** (team, integrations, publish, notify, bookings, review links, campaigns, clearing errors) call
  `audit(env, session, {area, action, target, summary, changes})` from `src/services/audit.js` → token RPC `audit_add`.
  It never throws: a logging failure never breaks the action. `adminSession` now returns `user {id, email}` for this.
  **Never put secrets in `changes`** — for integrations only the names of changed keys are stored.
- **Retention**: 12 months, removed by the monthly job `private.audit_purge()` (pg_cron `41 2 1 * *`).
- New table edited from the dashboard → add `create trigger … execute function private.audit_row()` in a new migration.
  New server action → add one `await audit(…)` line.

## Site pages, links and company pages (Nov 2026)

Dashboard → صفحات الموقع:
- **«كل الروابط»** (`views/sitepages.js` → `renderLinks`): every address of the site in one list — basic pages, pages added
  here, service / project / article pages and the private ones (/review, /unsubscribe) — with open, copy and **extra
  addresses** (`settings.aliases = [{from, to}]`, answered by the Worker with a 301). Basic addresses stay fixed because
  the site, emails and links in the wild depend on them.
- **«صفحات مضافة»** (`renderCustom`): stand-alone text pages kept in `settings.pages` (`public/js/site-pages.js`:
  `{id, path, title_*, desc_*, published, footer, updated, ar:[{h,p}], en:[{h,p}]}`), until saved the defaults
  **/terms** and **/payment** (general wording — finish when the company details are final). `{email}` → contact link.
  An address must match `PATH_RE` (one segment, a–z 0–9 -) and not be in `RESERVED_PATHS`.
- **«فريقنا»** → `settings.team` (`/team`, 404 until switched on). The services status page (/status) was removed in Nov 2026.

Routing: `wrangler.toml` `not_found_handling = "none"`, so an address that is not a file reaches the Worker
(`src/index.js` end: custom page → extra address → the site's 404 page via `notFound()`). Published pages are added to
the sitemap and, when `footer` is on, to the small `.footer__legal` row (`footerLegal()` in `routes/pages.js`, also on the
home page).

**Article looks:** dashboard → المقالات → «شكل صفحات المقالات»: `settings.blog.theme` (classic | magazine | minimal) for
all articles, `settings.blog.per[<post id>]` for one article (chosen in the article editor). `handleBlog` wraps the
article in `.art.art--<look>`; the styles are in `simplePage`.

**Footer links** are one three-column grid (`.footer__nav`); company pages are appended to it with `order: 100+`.
**Sub-menu**: `setSubnav()` keeps each row's scroll position and keeps the chosen item in view.

## Payments — Wayl (Nov 2026, contract not signed yet)

Dashboard → التكاملات → «الإضافات» / «Webhooks» / «المفاتيح».
- Config `payments: { on, mode: test|live, webhook_on, webhook_token }` (`services/data.js`, `cleanConfig`). `on` is refused
  (`no_key`) until a key is saved.
- **The API key** goes to KV `secret:wayl_key` through `PUT /api/admin/integrations {wayl_key}` (owner only, audited). The
  browser only ever gets `{ has_key, key_hint }` (last 4 characters).
- **Webhooks:** `POST /api/pay/wayl/<webhook_token>` (`handlePayWebhook`): answered only while `webhook_on` and with the right
  token (else 404), rate limited, body ≤ 32 KB. Each notification is stored (KV `pay:events`, last 30) and shown in the
  dashboard; nothing changes an order automatically until Wayl's message format is confirmed after signing.
  «رابط جديد» replaces the token (the old address stops at once).
- Still to do after signing: create the payment link from an order / quote, show «ادفع الآن», verify Wayl's signature on
  notifications, and mark the order paid.

## Apple-style details (Nov 2026)

- **Dashboard dark mode:** `public/admin/theme.js` (in `<head>`, before paint) sets `html[data-theme]` from the choice saved
  on the device (`wixa-admin-theme`: auto | light | dark; auto follows the device). The sidebar «المظهر» button cycles it.
  Colours are the tokens at the top of `admin.css`, overridden under `html[data-theme="dark"]` at the end.
- **Bottom sheets:** on phones (≤ 640px) `.modal` slides up from the bottom; dragging the handle or the title down 90px
  closes it (`setupShell` in `shell.js`).
- **Continuous corners:** `corner-shape: squircle` inside `@supports`, same three corner sizes (14 / 22 / 28 — `tests/site-layout.mjs` checks them); other browsers keep round corners.
- **Large title:** `.top--compact` once the page has scrolled 24px (title 17px, description, actions and sub-menu hidden on phones).
- **Page changes:** the dashboard uses `document.startViewTransition` only for the switch itself (never while a page
  loads); the site uses cross-document `@view-transition { navigation: auto }` with the header kept in place.

## Look option «ناعم ثلاثي الأبعاد» and one highlight colour (Nov 2026)
- `settings.look`: `"flat"` (default) or `"soft"`, chosen in المظهر → حجم الخط والشكل → شكل الواجهة.
  The server writes it as `<html data-look>` (no flash), and `applyTheme` in `public/shared.js` sets it again for the live preview.
- All the soft styles live in one block at the end of `public/styles.css` (`html[data-look="soft"] …`):
  page gradient, cards with a white top rim and a wide soft shadow, capsules, raised icon tiles, sphere-like round buttons.
  Colours are unchanged; only depth changes.
- Highlight colour: icon tiles and the last word of the main headline use `--hl`
  (the accent; on light backgrounds its darker tone `--accent-ink`, for readability). WhatsApp keeps its green.
- Footer links: three equal columns, each column centred, names on one line.

## Dashboard top bar: no shaking while scrolling (Nov 2026)
- On phones the large title shrinks when the page scrolls, and the description and tabs hide, so the bar gets ~150px shorter.
  This used to make the page shake: the page got shorter, the browser pulled the scroll back (scroll anchoring / clamping),
  the bar grew again, and so on, many times a second.
- Now (`public/admin/js/shell.js`): the height the bar gives up is kept as a margin under it, so nothing below moves;
  the space is held before the bar shrinks (no moment where the page is shorter); it shrinks past 40px and grows back only under 4px.
  `public/admin/admin.css` turns scroll anchoring off (`overflow-anchor: none`) and the title size no longer animates.
- `tests/admin-scroll.mjs` scrolls each long page slowly on a phone: the bar may change once each way, and the content may not jump.

## Funnel counters in the database (Nov 2026)
- The sales funnel events (calculator used, WhatsApp clicked, form opened…) are added with `public.events_add` — one atomic
  "add n" per event and day in `public.event_counts` — instead of read-add-write on a KV object (two server instances
  flushing at once used to lose one update). If the database can't be reached, a flush falls back to KV (`ev:<day>`).
  The funnel (`/api/admin/funnel`) adds `public.events_total` and the KV days. Migration: `20261119000000_event_counts.sql`.
- `20261119010000_split_admin_policies.sql`: the five content tables keep one read rule each (the public one, which already
  lets the team read everything); the team rule covers only add / change / delete.

## Backup and restore: customers' records too (Nov 2026)
- `export_backup` (the daily email and the dashboard's backup) also holds live chats with their messages and the customer
  notes (sales stage, follow-ups, opt-outs), besides settings, content, orders and messages.
- The dashboard's «استرجاع» makes the content exactly like the backup (as before) and then calls `POST /api/admin/restore`
  (owner only) → `public.restore_records`: orders, messages, chats (with their messages) and customer notes that are
  **missing** are added back; rows already there are never changed or deleted. Each table is restored on its own
  (an error in one is reported, the others still come back); the chat triggers' changes are undone so a restored chat
  looks as it did; the id counters continue after the restored rows. Migration: `20261120000000_backup_restore.sql`.

## بنية الموقع — Site structure (Nov 2026, phase 1 of the structure study)
One list of the site's pages, the sections each page is made of, and where every menu link goes:
`public/js/site-structure.js` (shared by the server, the site's script and, from phase 3, the dashboard).
- **Pages built from sections** (`SECTION_PAGES`: home, about, careers, faq, contact, order, track) all come from
  `public/index.html`, where every section is wrapped once in `<!--s:key--> … <!--/s-->`.
- **A page is an ordered list of sections** (`DEFAULT_LAYOUTS`, or `settings.layout[page]` = `[{k, on}]` when saved).
  `layoutFor()` merges a saved list with the defaults: unknown, repeated and not-allowed sections are dropped; a switched-off
  section keeps its place; a section the saved list doesn't know yet (added to the code later) goes after its default neighbour.
  So adding or removing sections in the code never breaks a saved order.
- **The server arranges the page** (`src/lib/arrange.js → arrangeSections`): the page's sections first, in order, marked
  `data-pages="<page>"`; every other section after them with `data-pages=""` (hidden by the stylesheet, but still in the
  page because the site's script fills all of them).
- **One header and one footer for every page**: `src/routes/pages.js → siteShell()` builds them for the home page and its
  sister pages (it replaces the empty `<header>`/`<footer>` in index.html) and for every server-built page (services,
  projects, articles, policies, status, pages added from the dashboard). There is no second copy anywhere.
- **Menu links point at a page or a section by key** (`NAV_TARGETS` → `navLink()`): a section link goes to the first page
  where that section is on (home first) and hides when the section is off or empty; a page link hides with its page's main
  section. The server and the site's script use the same function, so they never disagree.
- **Adding a section**: add its HTML to index.html wrapped in `<!--s:key-->…<!--/s-->` with `data-section="key"`, add it to
  `SECTIONS` (with the pages it may appear on) and, if it should show by default, to `DEFAULT_LAYOUTS`.
  **Adding a page built from sections**: add it to `SECTION_PAGES` and `DEFAULT_LAYOUTS`, a route in src/index.js
  (`handleHome(…, key)`), and its line in the `html[data-page=…]` rule in styles.css.
- `tests/site-structure.mjs` checks all of this (merge rules, arranging, links; and on the running site: every page opens,
  has one main heading, shows only its own sections, has the same header and footer as the home page, and every visible
  menu link opens a real page).

## Dashboard menus (Nov 2026): four levels
- **Levels 1 and 2 — the sidebar** (`#sideNav` in `public/admin/index.html`): «الرئيسية», then five main items (خدمة الزبائن، المبيعات والتسويق، محتوى الموقع، المظهر، الإعدادات), each with its pages under it. A main item folds (`.side__sec`); the one holding the page being shown opens by itself; a folded one shows a red dot when a page inside has a counter. «الحساب ← واجهة اللوحة» (`views/prefs.js`) switches this device between «قابلة للطي» (default) and «مفتوحة دائماً» (`localStorage wixa-side-mode`, `sideMode()` in `shell.js`).
- **Levels 3 and 4 — strips at the top of the page**, as before (`SECTIONS` in `shell.js`, `sectionTabs` in `core.js`): a page's sections; where a page has branches (صفحات الموقع، دليل الهوية) the branches are the first strip and their sections the second. Filters (status, period) stay a strip under them.
- «الرسائل» is part of «الوارد». Older addresses still work: #messages → «الوارد»; #settings, #reports, #look, #reputation → the first page of that group (`HUBS` in `shell.js`).

## Customer care batch (Nov 2026): notifications, reviews, reminders, client portal, inbox
- **Notifications on the team's phones:** `pushTeam(env, kind, label)` (`src/routes/chat.js`) for chat, order, message, booking, job and the booking reminder. A push has no text; the dashboard's service worker (`public/admin/sw.js`) asks `GET /api/push/last?endpoint=…` (answers only a subscribed device) and shows the right title and opens the right page. «الإشعارات والبريد → التطبيق والإشعارات» (`views/device.js`) installs the dashboard as an app and turns the notifications on.
- **Review after delivery:** marking an order «مكتمل» calls `POST /api/admin/order-notify {kind:"done"}` (`src/routes/portal.js`): one review link per order (KV `review-order:<id>`), emailed when the customer left an address, and shown to copy. On `/review`, 4–5 stars invite the customer to Google too when «رابط تقييمك على Google» (`settings.contact.google_review`) is set.
- **Booking reminders:** a booking saves `remind:<date>` in KV; `runBookingReminders` (every 15 minutes with the health check) emails the customer a day and two hours before, and pushes + emails the team an hour before. Cancelling a booking removes its reminder.
- **Client portal `/portal`:** sign in with an order number + its phone (`portal_login`), a token signed by the Worker (HMAC, key in KV `portal_key`, 30 days, holds only the phone's last 10 digits), then `portal_orders` lists every order with that phone and the updates the team shared (`order_updates`, added in «الطلبات» → «تحديثات يراها الزبون», optionally emailed). Migration `20261122000000_customer_portal.sql`. Linked from the footer («الدعم») and the order confirmation email.
- **«الوارد» (`views/inbox.js`):** chats, orders, messages, bookings and job applications in one list, what needs an answer first; a tap opens it in its own page (a chat opens directly).

## The live chat instead of WhatsApp (Nov 2026)
When the live chat is on (`settings.chat.on`), it is the way to talk to us everywhere: no WhatsApp bubble, card or button is shown.
- Any element with `data-open-chat` opens the chat (`chat.js`), with `data-topic` («svc», «quote», «other», «track»…) and `data-service` pre-filled.
- Pages the server builds alone (service, project, article, policies) load `/build/chat.js` (`public/js/chat-page.js`, ~33KB) only when the chat is on.
- Service page: «اسأل عن هذه الخدمة في المحادثة المباشرة»; calculator: «ناقش التقدير في المحادثة» (topic quote + the chosen type); contact form: «أو تحدث معنا مباشرة»; contact page: no WhatsApp card; footer: the number calls (tel:) instead of opening WhatsApp.
- With the chat off, every WhatsApp link comes back as before.

## «مكتبة الوسائط» — the media library (Nov 2026)
- `public/admin/js/views/media.js`: lists every image in the Supabase Storage bucket `media` (each editor uploads to its own folder; the library uploads to `library/`), several uploads at once with the same compression as the image fields, copy link, delete.
- «مستخدمة / غير مستخدمة»: a file is «used» when its path appears in a saved row of `site_settings`, `projects`, `services`, `partners`, `testimonials` or `posts`. Deleting a used image asks first and names where it is used.
- `pickMedia()` opens the library as a picker on its own layer (works from inside an editor modal); every image field has «من المكتبة».
- Listing needs read access to `storage.objects`: migration `20261121000000_media_library.sql` (owner and editor only; the support role does not see the page).

## Inner pages: breadcrumbs, endings, one contact button, more counts (Nov 2026)
- `simplePage(..., { crumbs, startLabel })`: `crumbs` is a list of `[ui key or label, path]` after «الرئيسية»; the page title is the last step. It also adds a `BreadcrumbList` for search engines. Used by service, project and article pages.
- Service page ending: «اطلب هذه الخدمة» (the order form opens with the service chosen). Project page: «مشاريع مشابهة» (same category first), «اطلب مشروعاً مشابهاً», and previous / next only when the similar cards do not already list every other project.
- One floating contact button: when live chat is on (`html.has-chat`) the WhatsApp bubble is hidden; WhatsApp is offered inside the chat's first screen.
- New counted actions (`EVENTS` in `src/routes/forms.js`, shown in «نظرة عامة → ماذا فعل الزوار»): `start_click` (any «ابدأ مشروعك»), `more_services`, `more_projects`, `more_calc` (the home page's «see all» links).

## «ترتيب الأقسام» in the dashboard (Nov 2026, phase 3 of the structure study)
- Dashboard → صفحات الموقع → **ترتيب الأقسام** (`public/admin/js/views/layout.js`): pick a page (home, about, careers,
  FAQ, contact), move its sections with the arrows, switch any off, add a section allowed on that page, remove an added
  one (default sections are switched off rather than removed), go back to the default order, or open a section's own editor.
- It writes `settings.layout[page]` (`[{k, on}]`), saved with «حفظ ونشر» like every other setting. Rows warn when a
  section is hidden on every page (إظهار الأقسام) or empty (it shows once it has content).
- The live preview opens the chosen page and follows every unsaved change: the site's script arranges the sections the
  same way the server does (`render.js → arrangeSections`, using `data-s` written by `src/lib/arrange.js`); on a normal
  visit the page already is in that order, so nothing moves.
- `tests/admin-layout-order.mjs` checks the screen on a phone and a computer.

## The new site structure (Nov 2026, phase 2 of the structure study)
- **Hub pages** built from sections like /about: `/services` (services + «by field» tab), `/projects` (all our work),
  `/pricing` (packages + the cost calculator; used to redirect to the home page). Their section title is the page's H1.
- **The home page is a summary**: the services, our work and packages sections end with a link to their page
  (`.sec-more`, shown on the home page only; `a[data-more]` gets its address from `navLink`, so it follows the page or
  section). The calculator left the home page (default layout); the hero's second button follows it to /pricing.
- **Top bar**: six links (services, our work, pricing, about, articles, contact) + «ابدأ مشروعك». The old default menus,
  if saved unchanged, are replaced by the new ones (`shared.js → NAV_V1`); menus the owner changed are kept.
  On phones «ابدأ مشروعك» stays the first item of the ☰ menu (no room in the bar next to menu/theme/language).
- **Footer**: titled groups (`FOOTER_GROUPS`: الخدمات · الشركة · الدعم, and «قانوني» as one small line), each link in
  the group of `LINK_GROUP` unless the owner chose another one (dashboard → القوائم → `g` on the link); pages added from
  the dashboard choose their group (`page.group`, «قانوني» by default); team → الشركة, status → الدعم. A contact line
  (WhatsApp/phone, email, address) from بيانات الشركة. On phones the groups fold (a tap on the title opens one).
- **Endings**: the contact block ends the home, hubs, about and FAQ pages (the FAQ page with its own words:
  `faq_cta_title` / `faq_cta_sub`); careers ends with its own «send your CV», the contact page with nothing extra; the
  policies and status pages have no «ابدأ مشروعك» buttons (`simplePage(…, { ending: false })`).

## Front-end and identity review (Nov 2026)
- **/services and /projects** show their whole list, one card under another, on phones and tablets (`html[data-page]` rules at the end of `styles.css`; `FLAT` in `public/js/site/carousel.js` keeps the dots off). The home page keeps the swipe rows.
- **Brand font weight:** the Arabic files of Noto Sans Arabic keep only the letters used in Arabic and Kurdish text (U+0600–06FF, joiners, the few presentation forms in use). That is about 23 KB per weight instead of 50 KB. To add letters, run `pyftsubset` again on the full files with a wider `--unicodes`, and update the matching `unicode-range` in `public/fonts/noto-sans-arabic.css`.
- **Story cards:** on computers (1000px and wider) the three cards sit side by side in one row.
- **Round chat button (phones):** it steps aside while the page scrolls down (`html.fab-away`, `ui.js`) and comes back on scroll up or after a short pause.
- **Heading outline:** on an inner page made of one home section, the card titles under the page's h1 get `aria-level` one lower (`outline()` in `render.js`).
- **Consistency:**
  - The numbers band has the same content width as the other sections, and partner tiles use the small corner (14px).
  - Previews in «خدمات أخرى / من أعمالنا / مقالات أخرى» are cut at a whole word with «…» (`snip()` in `pages.js`).
  - The filled live-chat button keeps its white text.
- **404:**
  - Missing pages render through `pageNotFound()` / `handleNotFound()` (`pages.js`), with the site header and footer, the brand colour and links to the main pages.
  - Missing files (images, scripts) still get the plain `public/404.html`.

## Review of everything left (Nov 2026)
- **Search engines:**
  - Every page names its own language version as canonical (`?lang=ar` / `?lang=en`). The bare address is only the x-default.
  - The sitemap lists both versions of every page, with `xhtml:link` alternates. `/order`, `/terms` and `/payment` are included; `/blog` is listed only once an article is published.
  - The empty blog page is `noindex`.
  - Simple pages carry the site's share picture (`og.jpg` or the dashboard one), `og:locale` and x-default.
- **Files:** `/apple-touch-icon.png` (iPhone home-screen icon) and `/.well-known/security.txt`.
- **Emails:**
  - All of them use the same purple palette.
  - With the live chat on, the request email offers «اسألنا عن طلبك في المحادثة المباشرة» (`/track?chat=track&ref=<number>`) instead of WhatsApp. Any page opened with `?chat=<topic>&ref=<…>` opens the chat (`chat.js`).
- **Keyboard:**
  - «تخطَّ إلى المحتوى» is the first stop on every page (`.skip` → `#content`).
  - The phone menu moves focus to its first link and closes with Escape. This is in `ui.js` and, for the simple pages, in `theme-pre.js`.
  - Wrong form fields get `aria-invalid`.
- **Dashboard dark mode:** violet text is `#9B74F8`; filled violet buttons use `#7C3AED` (both pass AA).
- **Order form:** when the request can't be sent, it points to the live chat (when on) instead of WhatsApp.

## Site pages tidied, and «صفحات الموقع» reorganised (Nov 2026)
- **Site:**
  - Order tracking now lives in «بوابة العملاء»: `/track` redirects to `/portal` (301) and keeps `?n=`, `?lang=`, `?chat=` and `?ref=`.
  - The footer's «تتبع طلبك» button opens the portal.
  - `/status` is removed: no route, no footer link, no settings.
  - «حلول حسب مجالك» and «احسب تكلفة مشروعك» are no longer menu links: they are not in `DEFAULTS.nav`, and older saved menus drop them. They stay in `NAV_TARGETS` for the in-page buttons (`data-more`).
  - «لماذا ويكسا» is one section (`story`, with `guarantees` as its part): its title, the three cards, «ما نلتزم به معك», and quick facts. The quick facts are the lowest package price, the reply time and a calculator link; they are built in `sales.js`, so nothing there is typed by hand.
- **Dashboard «صفحات الموقع»:** the tabs are grouped by the site page they show on, with one place per setting:
  - **الرئيسية:** الواجهة الأولى · لماذا ويكسا · كيف نعمل · الأرقام · الشركاء والآراء · الخاتمة والتذييل
  - **الخدمات والأسعار:** الخدمات والأعمال · حلول حسب المجال · الباقات · حاسبة التكلفة
  - **من نحن والمزيد:** من نحن · الأسئلة الشائعة · الوظائف
  - **الصفحات:** كل الصفحات والروابط · الصفحات القانونية (privacy, terms, payment) · صفحات مضافة · فريقنا
  - **ترتيب الأقسام:** includes «إخفاء من كل الصفحات» per section; the separate «إظهار الأقسام» tab is gone.
  - **القوائم والأزرار:** each link's name sits in «القوائم».
  - **بيانات الشركة:** الاسم والشعار · التواصل والمواعيد · لغة الموقع
- **Code notes:**
  - A section's title and description sit at the top of its own tab (`HEADS`, `TEXT_TABS` in `content.js`).
  - Old tab names (`story`, `guarantees`, `sections`, `privacy`, `booking`, `status`) open their new place (`OLD_TABS`).

## Supabase hardening (Nov 2026, free plan)
- **Postgres:** 17.11.0.019 on both projects (updated 14 Nov; about 6 minutes of downtime each).
- **Database access:** SSL is enforced on direct database connections. Legacy JWT API keys (anon, service_role) are **disabled**; the site and the dashboard use only the publishable key (`SUPABASE_PUBLISHABLE_KEY`).
- **Minimum password length:** 8 on both projects.
- **Dashboard sign-in check (Cloudflare Turnstile):**
  - Widget «WIXA dashboard sign-in» (site key in `public/admin/js/auth.js`).
  - Supabase verifies it (Authentication → Attack protection) on sign-in, the password-reset email and sign-up/invitations.
  - The widget is mostly invisible. If it can't load, the form still sends, so a failed script never locks anyone out by itself.
- **Secure password change:** Supabase asks for re-authentication when the last sign-in isn't recent. «الحساب ← تغيير كلمة المرور» then sends a code by email (`reauthenticate()`) and resends the change with `nonce`.
- **Rollout order for the last two:** code first, then the Supabase settings. Both are on staging and live (14 Nov).
- **Email links (live):** password reset, email confirmation and email change link to
  `{{ .SiteURL }}/admin/?type=…&token_hash={{ .TokenHash }}`. The dashboard spends the one-time code only when «متابعة» is pressed (`showLinkStep` in `auth.js`), so an email app that opens a link twice can't spend it first. Staging keeps Supabase's default emails, which can't be edited on the free plan.
- **Password boxes:** every password box of the dashboard has an eye button to show or hide what was typed (`pw-eye.js`).

## Design review fixes (Nov 2026)
- Calculator: the «ناقش التقدير في المحادثة» button on the dark panel is light-on-glass (it was white on white).
- Phone menu is solid (no page showing through); on phones the chat button is a small tab on the screen's left edge.
- «المقالات» is hidden from the menus while no article is published (`postsSeen` in `src/services/data.js`; server marks the link `data-empty`, the page script keeps it hidden).
- About page default layout: about, partners, stats, testimonials, contact («لماذا ويكسا» and «كيف نعمل» stay on the home page).
- Footer «تتبع طلبك» is not shown on /portal itself.
- Wave line only above «خدماتنا», «كيف نعمل», the closing call and the footer.
- Hero tracing light hidden when motion is reduced; larger dot tap areas; desktop h2 2.375rem; softer partner tiles in dark mode; order page packages 3 × 2 on desktop; project figures smaller on phones with the cyan mark per line.

## Dashboard review (Nov 2026)
- Change log: the person is never blank. `admins.email` was empty for the owner; migration `20261124000000_audit_actor_email.sql` fills it from the sign-in account and makes the trigger fall back to `auth.users.email`. Older entries (the log cannot be edited) show their person through the team list (`audit.js` → `emailOf`).
- Every text box, list and search box in the dashboard shares one look (`:where(#view …)` rule at the end of `admin.css`), including those not wrapped in `.f`.
- Developer guide tables scroll sideways on phones; small labels (inbox kinds, stages, tags, character counters) are 12px and clearer in dark mode.
- Live preview on a phone: the pane takes the scaled computer page's height (`fitPreview` in `settings.js`).
- Pages opened now and then (brand guide, developer guide, diagnostics, change log, sales, campaigns) load on demand: `scripts/build.mjs` splits the dashboard (`adm-<hash>.js`, cached for a year by `serveBuild`).
- SEO sub-tab «Google Search Console» is now «أدوات Google».

## Review links and the loading screen (Nov 2026)
- Review links are `16 random hex + 8 hex HMAC` (`reviewSig` in `src/lib/core.js`). A link the private store has not yet received in a location (KV can take up to a minute) is still accepted, without the prefilled name; `review-used:<code>` stops a signed link from being used twice. Older 16-character links work as before.
- The loading screen's text fades in with `animation-fill-mode: backwards` (opacity 1 by default), so it is never invisible on a browser where animations do not run.
- Review form: the hidden anti-spam box and the star radio buttons are clipped 1px boxes. They used to take the form's `width:100%` while absolutely placed, and in Arabic they spread far to the left, so phones zoomed the whole page out.

## Apple redesign — phase 1 (Nov 2026)
- **One token file:** `public/css/tokens.css`, imported at the top of `public/styles.css` and `public/admin/admin.css` (the build inlines it). It holds the font stack, Apple's type scale (`--t-*`), the corner scale (`--r-xs` 8 · `--r-sm` 12 · `--r-md` 16 · `--r-lg` 22 · `--r-xl` 28 · `--r-pill`), the 8-point spacing grid (`--sp-1`…`--sp-10`), Apple's neutral greys (`--apple-*`) and motion curves. Every literal corner radius in both stylesheets now points at the scale.
- **Colours:** neutral Apple greys (text #1D1D1F, secondary #6E6E73); dark mode is pure black with #1C1C1E / #2C2C2E surfaces (`darkPalette` in `public/shared.js`, admin `html[data-theme=dark]`). Purple stays for anything pressable, cyan as a rare highlight. A saved theme still holding the old purple-tinted greys is mapped to the new ones by `upgradeTheme()` (the owner's own colours are kept).
- **Font:** Apple devices use their own San Francisco / SF Arabic (`-apple-system, BlinkMacSystemFont` first); everyone else gets the hosted Noto Sans Arabic. Applies when the dashboard font is the brand font.
- **Type and spacing:** body 17px (Apple's size), titles from Apple's scale (28 → 34 → 40 for section titles), sections 64 / 96 / 128px apart. The site has one scale (the block under «Apple redesign»); two older duplicate scales were removed.
- **Corners:** concentric radii inside the «لماذا ويكسا» panel; squircle corners on more surfaces where supported. `tests/site-layout.mjs` checks corners against the token scale and accepts concentric inner radii.
- **Decorations kept:** the wave lines between sections, the turning globe, the line round the hero logo (now a quarter of the outline) and a soft glow. **Removed:** custom cursor (and its dashboard switch), particles, scroll progress bar, «scroll» hint, logo tilt, logo float and shine sweep. All the logo's rules are one block in `styles.css`.
- **Clean-up:** about 60 selectors no page used any more were removed (old order form `rq__*`, old tracking page `track__*`, `totop`, `pulse`, the removed decorations…), plus seven stacked overrides of the logo line. styles.css went from 2147 to about 1990 lines.

## Apple redesign — phase 2 (Nov 2026)
- **Buttons (site):** one `.btn` definition — flat capsule, semibold, 48px (phone) / 50px (computer). `.btn--primary` = filled purple, no glow or shine sweep; `.btn--ghost` = Apple's «tinted» button (11% purple wash, purple text, no outline). The header, menu and «تتبع طلبك» pills lost their glows too.
- **Buttons (dashboard):** `.b` = Apple grey button (`rgba(118,118,128,.12)`, capsule, no border), `.b--primary` filled purple, `.b--danger` red tint, `.b--ghost` plain; 44px on phones.
- **Links:** «اعرف المزيد» and «عرض التفاصيل» are Apple text links: purple semibold text with a chevron (no underline bar).
- **Fields:** Apple filled fields on the site (contact, portal, chat, review, exit offer) and in the dashboard: grey fill, no border until focus, then a purple ring; 16px text so iPhones don't zoom.
- **Shadows:** barely visible in light mode (hairline + faint lift), none in dark mode (a fine light edge instead).
- **Icons:** one stroke weight, 1.75.
- **Glass:** only the floating top bar (blur + saturation, light top edge); content stays solid; «Reduce transparency» makes it opaque.
- **Increase contrast** (`prefers-contrast: more`): darker greys, real lines instead of hairlines, outlined tinted buttons.

## Apple redesign — phase 3 (Nov 2026)
- **Tiles:** services, projects, packages, reviews, contact ways, articles and «more» links are apple.com tiles — the soft grey surface (#1C1C1E on black), no border, no shadow, a 1–1.5% zoom on hover with a mouse (none with reduced motion). The old hover lifts, purple borders and the tilting service icon were removed. The featured package keeps its purple outline.
- **Headings and hero:** semibold titles with slightly tighter letter spacing; the hero line under the title is muted at the lead size, max 34em wide.
- **Local bar** on service and project pages (`simplePage` → `localNav`, shown by `/theme-pre.js` once the page title has scrolled away): the page's name and its one action («اطلب هذه الخدمة» / «اطلب مشروعاً مشابهاً») in a glass capsule under the top bar.

## Apple redesign — phase 4 (Nov 2026): the dashboard as an iPhone / iPad app
- **Tab bar (phones):** a floating glass capsule at the bottom (`buildTabbar` / `paintTabbar` in `public/admin/js/shell.js`) with الرئيسية · الوارد · الطلبات · المحادثات and «المزيد» (opens the full menu). Built from the sidebar links, so icons and role rules match, and the red counters copy the sidebar ones. Hidden while signing in, while a sheet is open or the menu is open.
- **Sidebar (iPad / computer):** grey sidebar, purple icons, the chosen page as a filled purple row (deeper violet in dark mode), bold section names, «عرض الموقع» as a grey capsule.
- **Segmented controls:** iOS style — grey track, white thumb (grey #636366 in dark mode); purple is kept for actions. Three older, overlapping segment styles were removed.
- **Switches:** iOS size 51 × 31 with a 27 knob and a spring.
- **Lists:** iOS «inset grouped» — rows in one rounded group with hairline dividers.
- **Sheets:** a grabber on top of every sheet on phones.

## Apple redesign — phase 5 (Nov 2026): final check
- The brand guide in the dashboard (`public/admin/js/views/brand.js`) shows the new values: Apple type scale (17 body, 28 → 40 section titles, smallest 12), the 8-point spacing, the six-step corner scale with the concentric rule, the button kinds (filled, tinted, link, grey), the near-invisible shadows, Liquid Glass on floating bars only, the device font on Apple devices, the longer logo line.
- Contrast of every new colour pair checked: 26/26 meet WCAG AA (4.5:1), lowest 4.66 (secondary grey on the light grey tiles).

## Apple closeness (Nov 2026)
- **Shorter copy:** section subtitles, the process steps, guarantees and about points are one line per idea. Staging DB already has it; production gets the same keys when it is published (an UPDATE that merges into `site_settings.data.content.ar/en`).
- **Hero showcase:** `#heroShow` in `public/index.html` is filled by the server (`handleHome` in `src/routes/pages.js`) with the first project that has a screenshot and a slug, plus its phone screenshot when there is one, linking to the project page. With no such project it stays hidden.
- **Scroll motion:** blocks on inner pages and the cards on the home page rise and fade in as they scroll into view, and the hero screens grow into place. This is pure CSS (`animation-timeline: view()`), only with `prefers-reduced-motion: no-preference`; browsers without support show everything at once.
- **Settings rows:** in dashboard cards, one-line fields and switches read like iOS Settings rows: the label at the start, the value or switch at the end, hairlines between rows. On phones the label sits above the field. Text areas and multi-part fields stay stacked (`public/admin/admin.css`, last block).

## Menus, apple.com style (Nov 2026)
- **Top bar:** «الرئيسية» is out of the default menu (the logo is the way home); short names («أعمالنا», «الأسعار»). A saved menu equal to an older default follows the new one (`NAV_V1/V2/V3` in `public/shared.js`).
- **Services drop-down (computers):** `#svcFly`, built by `siteShell` (`src/routes/pages.js`) from the published services: every service, «كل الخدمات», and quick links (الأسعار, احسب التكلفة, ابدأ مشروعك). Opens on hover, ↓ on «خدماتنا», closes on Esc / leaving it. Behaviour in `public/menus.js` (loaded on every page).
- **Phone menu:** full screen, large type, links arriving one after another; «خدماتنا ›» (`.mlink[data-sub]`) opens the second panel `#menuSvc` with «رجوع». The current page's link is in the text colour and bolder (no accent colour).
- **Footer:** the site map in small grey type. «الخدمات» lists each service by name (`settings.nav.footer_services`, on by default), then «كل الخدمات» and «الأسعار»; «أعمالنا» moved to «الشركة»; «تتبع طلبك» is a plain link in «الدعم». The calculator and «حلول حسب مجالك» stay out of the footer (owner's decision).
- **Service pages:** the local bar carries the page's parts (نظرة عامة · التفاصيل · من أعمالنا · خدمات أخرى), the one being read marked.
- **Dashboard → القوائم** (`public/admin/js/views/menus.js`, also in the sidebar as `#menus`): iOS rows (name, place · group, «مخفي تلقائياً» with the reason), drag the handle or ↑↓ to reorder, tap to edit in a sheet; «إضافة رابط» (a service by id, an added page by path, or an https:// or /path address → `settings.nav.items` entries `{ k: "x-…", kind, ref | url, label_ar, label_en, at, g }`); «ابدأ مشروعك» name and destination (`settings.nav.cta = { to: order | contact | calc | whatsapp | url, url }` → `ctaTarget()`; a non-order destination is marked `data-free` so the order script leaves it alone); footer groups renamed / added / reordered (`settings.footer_groups`, «قانوني» always last → `footerGroups()`). The preview turns to the phone with its menu open while this tab is on screen, and added links show in it before saving.
- Shared rules live in `public/js/site-structure.js`: `footerGroups`, `groupOf(x, settings)`, `customLink`, `ctaTarget`.

## Apple review batch (Nov 2026)
**Site**
- Type: every plain `font-size` in `styles.css` is on one scale (12 · 13 · 14 · 15 · 16 · 17 · 20 · 24 · 28 · 34 · 40 px); weights 400 / 500 / 600 / 700 only (800 is gone). Corners: `--radius-sm` = `--r-sm` (12), `--radius-lg` = the owner's radius (28 by default).
- Tap targets ≥ 44px: carousel dots (8px dot, 44px touch area), «اسألنا», «عرض التفاصيل», the local bar's button, footer links on phones.
- Page and section titles are the menu's names: «أعمالنا», «الأسعار» (EN «Services», «Pricing»). Staging DB updated; production gets `titles.sql` (only where the old default wording was kept) when published.
- On their own pages (/services, /projects, /pricing) lists are whole, one card under another (two columns on tablets); the swiping rows stay on the home page. The home page shows three packages and «كل الباقات».
- Calmer decoration: no halo on the «كيف نعمل» steps, no glow on the figures tile.
- Chat button: always whole (no edge tab, no sliding away while scrolling), 44px on phones, 48px on computers.
- Header on narrow phones (≤ 380px): the round buttons keep 44px; the logo shrinks (≤ 330px: the mark only).

**Dashboard**
- Tab rows show five at most; the rest wait under «المزيد» (a menu). Done once for every page in `core.js → setSubnav/compactSeg`; the hidden tabs stay in place so each page's handlers keep working.
- Lists (services, projects, testimonials, partners): ≡ to drag (shared `public/admin/js/sortable.js`, also used by «القوائم»), a tap on the row opens the item, delete is inside the item's sheet.
- «صفحات الموقع» opens on a grouped list of everything editable (iOS Settings); a row opens its editor with «‹ كل الأقسام» and that group's tabs.
- «اليوم في خدمة الزبائن»: neutral cards, red number + dot when something waits. The «رسائل جديدة» card is one link.
- Dates use Western digits like the rest of the dashboard (`ar-IQ-u-nu-latn`).

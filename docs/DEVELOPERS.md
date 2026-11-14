# دليل المطوّر — موقع ويكسا (WIXA)

مرجع لأي مطوّر يعمل على المشروع: كيف بُني، أين يوجد كل جزء، وكيف تطوّر وتختبر وتنشر بأمان.
يظهر هذا الدليل داخل لوحة التحكم فقط (لا يُنشر في الموقع)، ونسخته الأصلية في المستودع: `docs/DEVELOPERS.md`.

---

## 1. نظرة عامة

| الجزء | الخدمة | الدور |
|---|---|---|
| الاستضافة والخادم | **Cloudflare Workers** (مع Static Assets) | يقدّم الصفحات، يبني الصفحة الرئيسية بالمحتوى، وكل واجهات `/api/*` |
| قاعدة البيانات والدخول | **Supabase** (Postgres + Auth + Storage) | المحتوى، الرسائل، المقالات، حساب المالك، الصور المرفوعة |
| البريد الصادر | **Resend** (من `notify@wixa.dev` و`noreply@wixa.dev`) | تنبيهات الرسائل، الرد التلقائي، التقارير، النسخ الاحتياطية |
| البريد الوارد | **Cloudflare Email Routing** | `info@` و`sales@` و`support@` و`noreply@` ← Gmail الشركة |
| الكود | **GitHub** `saifaldin1992/wixa` | فرع `main` = الموقع الرئيسي، فرع `staging` = النسخة التجريبية |
| النشر | **Cloudflare Workers Builds** | كل دفع (push) لفرع يبني وينشر تلقائياً |
| الإحصاءات | **Cloudflare Web Analytics** | زيارات بلا ملفات تعريف ارتباط؛ تُقرأ عبر GraphQL للوحة التحكم |
| الحماية | **Cloudflare Turnstile** + حدود طلبات | نموذج التواصل والتوظيف والحجز |

**مبدأ التصميم:** الزائر لا ينتظر قاعدة البيانات أبداً. المحتوى يُقرأ من Supabase مرة كل دقيقة على الأكثر لكل منطقة، ويُحفظ في ذاكرة Cloudflare، ويُحقن داخل HTML الصفحة الرئيسية مباشرة (عنصر `#wixa-data`).

---

## 2. البيئتان

| | الرئيسي | التجريبي |
|---|---|---|
| الرابط | https://wixa.dev | https://staging.wixa.dev |
| فرع Git | `main` | `staging` |
| الـ Worker | `wixa` | `wixa-staging` |
| Supabase | `sdtsoppvyogdfamotrvx` | `jcxzghfgvqjdkwdlrbfl` |
| KV (التخزين الخاص) | `16bfe7325d144e87a3fe12e9a6cbd744` | `1dc19bbb96cb4834af33d9b2c90e86a6` |
| المهام المجدولة | تعمل | موقوفة عمداً |

**قاعدة العمل:** كل تغيير يُدفع أولاً إلى `staging` ويُجرَّب، ثم يُدمج في `main`. لا تدفع مباشرة إلى `main`.

قاعدتا البيانات منفصلتان: أي تحديث على البنية (migration) يُطبَّق على **الاثنتين**.

---

## 3. هيكل المشروع

```
src/                          الخادم (Worker) — طبقات، كل طبقة تستورد مما قبلها فقط:
  lib/core.js                 الأساسيات: رؤوس الأمان، ردود JSON، الاتصال بـ Supabase، حدود الطلبات، دوال النص واللغة
  lib/auth.js                 التحقق من دخول لوحة التحكم وصلاحية الشخص
  lib/window-shim.js          يجعل public/shared.js يعمل داخل الخادم
  services/data.js            محتوى الموقع وإعداداته: القراءة، التخزين المؤقت، إعادة النشر بعد تعديل اللوحة
  services/mail.js            الرسائل البريدية: تنبيهات الفريق وتأكيدات الزبائن
  services/stats.js           أرقام الزيارات من Cloudflare: نسخة محفوظة تظهر فوراً وتُحدَّث في الخلفية
  jobs/scheduled.js           المهام المجدولة: المراقبة، التقرير الأسبوعي، النسخ الاحتياطي، تذكيرات المبيعات
  routes/pages.js             الصفحات المبنية في الخادم: الرئيسية، الخدمات، المشاريع، المقالات، الخصوصية
  routes/forms.js             النماذج العامة: الطلب، تتبع الطلب، التواصل، الحجز، التقييم، الأحداث، إلغاء الاشتراك
  routes/chat.js              الدردشة المباشرة وإشعارات الفريق (Web Push)
  routes/errors.js            سجل الأعطال (المتصفح والخادم)
  routes/admin.js             واجهات لوحة التحكم: الإحصاءات، الإعدادات، التكاملات، الفريق، الحملات
  routes/diagnose.js          صفحة الفحص والتشخيص
  index.js                    نقطة البدء: توجيه كل طلب إلى معالجه + تشغيل المهام المجدولة
public/                       الملفات الثابتة
  index.html                  الصفحة الرئيسية (قالب يُكمِل الخادمُ محتواه)
  styles.css                  تصميم الموقع (آخره «نظام الأحجام» للجوال/التابلت/الكمبيوتر)
  shared.js                   القيم الافتراضية + الألوان + الخط (يُستخدم في الموقع واللوحة)
  js/main.js                  نقطة بدء الموقع
  js/site/*.js                أجزاء الموقع: render, contact, calculator, extras (حجز/PDF/إحصاءات)…
  js/tags.js                  أدوات القياس الخارجية (GA4/Meta/Clarity/TikTok) عند تفعيلها
  js/privacy-defaults.js      نص سياسة الخصوصية الافتراضي (يقرؤه الخادم واللوحة)
  admin/                      لوحة التحكم
    index.html, admin.css, admin.js
    js/core.js, auth.js, shell.js (القائمة والتنقل), settings.js, fields.js (رفع الصور وضغطها)
    js/views/*.js             صفحة لكل قسم في اللوحة
  fonts/                      خط الهوية Noto Sans Arabic (وAlexandria) مستضافان محلياً (SIL OFL)
  icons/, logo.svg, wordmark.svg, favicon.*
  build/                      ناتج البناء (لا يُعدَّل يدوياً)
scripts/build.mjs             البناء بـ esbuild ← public/build
supabase/migrations/*.sql     كل تغييرات قاعدة البيانات بالترتيب
tests/                        الفحوص الآلية (npm test يشغّلها كلها بالترتيب):
  structure.mjs               بنية الخادم: الطبقات، لا حلقات استيراد، لا استيراد لملف غير موجود
  stats-cache.mjs             أرقام الزيارات لا تنتظر Cloudflare بعد أول مرة (نسخة فورية + تحديث في الخلفية)
  admin-netfail.mjs           لوحة التحكم بلا اتصال: رسالة «إعادة المحاولة» بدل الانتظار أو تسجيل الخروج
  no-white-page.mjs           لا صفحة بيضاء: الموقع بلا كوده، واللوحة بلا رد من قاعدة البيانات
  smoke.mjs                   الصفحات والروابط والحماية الأساسية تعمل (Playwright)
  admin-phone.mjs             كل صفحات اللوحة تفتح على الجوال بلا أخطاء
  admin-layout.mjs            قياسات اللوحة على الجوال والكمبيوتر
  site-layout.mjs             قياسات الموقع على الجوال والتابلت والكمبيوتر
  supabase-stub.js            بديل Supabase في الفحوص
docs/DEVELOPERS.md            هذا الدليل
wrangler.toml                 إعدادات Cloudflare (البيئتان، KV، الحدود، الجداول الزمنية)
```

ملفات المصدر `public/js/`, `public/admin/js/`, `styles.css`… **لا تُنشر** كما هي (انظر `public/.assetsignore`)؛ يُنشر الناتج المدمج في `public/build/`.

---

## 4. التشغيل محلياً

```bash
npm ci
npx wrangler dev --port 8787          # يبني الواجهة تلقائياً ثم يشغّل الموقع على http://localhost:8787
npm test                              # الاختبارات الآلية (في نافذة أخرى، والموقع يعمل)
node scripts/build.mjs                # بناء الواجهة يدوياً
```

- للعمل دون قاعدة بيانات: ملف `.dev.vars` فيه `SUPABASE_URL="http://127.0.0.1:9"` — يعرض الموقع المحتوى الافتراضي.
- للعمل على قاعدة التجريبي: ضع قيم التجريبي في `.dev.vars` (لا تضع هذا الملف في Git).
- لوحة التحكم محلياً: `http://localhost:8787/admin/` (الاختبارات تستعمل `tests/supabase-stub.js` بدل Supabase الحقيقي).

---

## 5. الإعدادات والمفاتيح

### متغيرات عامة (في `wrangler.toml` → `[vars]` لكل بيئة)
`SITE_ENV`, `CF_ACCOUNT_ID`, `CF_SITE_TAG`, `CF_BEACON_TOKEN`, `TURNSTILE_SITE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`

### مفاتيح سرية (Cloudflare ← Worker ← Settings ← Variables and Secrets)
| الاسم | الغرض |
|---|---|
| `WRITE_TOKEN` | يسمح للخادم وحده بحفظ الرسائل والآراء وتصدير النسخة الاحتياطية (يُقارن بـ `private.config.write_token_sha256`) |
| `RESEND_API_KEY` | إرسال البريد |
| `TURNSTILE_SECRET` | التحقق من الزوار |
| `CF_ANALYTICS_TOKEN` | قراءة الإحصاءات (صلاحية Account Analytics: Read) |
| `NOTIFY_EMAIL` | (احتياطي) بريد التنبيهات إن لم يُحدَّد من اللوحة |

**لا تضع أي مفتاح سري في الكود أو في Git.** صفحة «الفحص والتشخيص» في اللوحة تخبرك إن كان مفتاح ناقصاً أو مرفوضاً.

### الربط (Bindings)
`ASSETS` (الملفات)، `PRIVATE` (KV)، `CONTACT_LIMITER` (5 طلبات/دقيقة لكل جهاز)، `TRACK_LIMITER` (30/دقيقة)، `CF_VERSION` (رقم النسخة المنشورة).

### مفاتيح التخزين الخاص (KV `PRIVATE`)
| المفتاح | المحتوى |
|---|---|
| `config` | إعدادات «التكاملات»: التنبيهات، الرد التلقائي، الحماية، أدوات القياس، الصيانة، التقارير، النسخ الاحتياطي، الردود الجاهزة |
| `notify_email` | بريد التنبيهات |
| `msgmeta` | حالة وملاحظات كل رسالة |
| `count:YYYY-MM-DD` | عدد الرسائل يومياً (للتقرير الأسبوعي) |
| `ev:YYYY-MM-DD` | أفعال الزوار يومياً (حاسبة، واتساب، نموذج…) |
| `book:YYYY-MM-DD` | أوقات المواعيد المحجوزة |
| `review:<code>` | روابط آراء العملاء (مرة واحدة، 60 يوماً) |
| `monitor` | آخر نتيجة لمراقبة الموقع |
| `backup:last` | آخر نسخة احتياطية |
| `errors` | سجل الأعطال (آخر 50) |

---

## 6. قاعدة البيانات (Supabase)

### الجداول (schema `public`)
| الجدول | المحتوى | من يقرأ / يكتب |
|---|---|---|
| `site_settings` (صف واحد `id=1`، عمود `data` JSON) | كل إعدادات ونصوص الموقع | الجميع يقرأ · المالك يكتب |
| `projects`, `services`, `partners`, `testimonials` | المحتوى | الجميع يقرأ المنشور · المالك يدير |
| `posts` | المقالات | الجميع يقرأ المنشور · المالك يدير |
| `contact_messages` | الرسائل والتوظيف والحجوزات | المالك فقط · الإدخال عبر `submit_contact` |
| `admins` | من هو المالك | — |

### الدوال
- `is_admin()` — هل المستخدم الحالي مالك (ويشترط التحقق بخطوتين إن كان مفعّلاً).
- `submit_contact(token, p)`, `submit_testimonial(token, p)`, `export_backup(token)` — `security definer` ومحمية بـ `WRITE_TOKEN`؛ الخادم وحده يستدعيها.

### الصلاحيات (RLS)
مفعّلة على كل الجداول. لا أحد يكتب مباشرة من المتصفح إلا المالك المسجّل (`is_admin()`).

### تغيير البنية (migration)
1. أنشئ ملفاً جديداً في `supabase/migrations/` باسم يبدأ بالتاريخ: `YYYYMMDDHHMMSS_وصف.sql`.
2. اجعله آمناً للتكرار (`if not exists`، `create or replace`، `drop policy if exists`).
3. طبّقه على **التجريبي** ثم جرّب، ثم على **الرئيسي** — من Supabase ← SQL Editor.
4. لا تحذف أعمدة أو بيانات دون نسخة احتياطية (اللوحة ← الإعدادات ← النسخ الاحتياطي ← «أرسل نسخة الآن»).
5. **سجل تغييرات القاعدة:** طبّق كل ملف بأداة الترحيل (Supabase MCP `apply_migration` أو `supabase db push`) لا بلصقه في SQL Editor،
   حتى يُسجَّل في `supabase_migrations.schema_migrations` على **القاعدتين** (اسم + تاريخ). إن طُبِّق يدوياً فاكتب في أول سطر من الملف
   `-- STATUS: applied on staging <التاريخ>, production <التاريخ>`. اعرض السجل بـ `select version, name from supabase_migrations.schema_migrations order by version;`.

---

### إعداد بيئة جديدة (مشروع Supabase فارغ)
1. أنشئ المشروع في **Central EU (Frankfurt)**.
2. افتح `supabase/schema.sql` في GitHub ← زر **Copy raw file** ← الصقه كاملاً في SQL Editor ← Run.
3. **Authentication ← Users ← Add user** (Auto Confirm): أول حساب يصبح المالك تلقائياً.
4. **Authentication ← URL Configuration**: Site URL و Redirect URLs (`https://wixa.dev/**` و `https://staging.wixa.dev/**`).
5. **Authentication ← Emails ← SMTP**: `smtp.resend.com` · 465 · `resend` · مفتاح Resend جديد (Sending access).
6. مفتاح الكتابة: اختر نصاً عشوائياً طويلاً، ضعه في الـ Worker باسم `WRITE_TOKEN`، وشغّل:
   `insert into private.config (key, value) values ('write_token_sha256', encode(extensions.digest('النص نفسه', 'sha256'), 'hex'));`
7. حدّث `SUPABASE_URL` و`SUPABASE_PUBLISHABLE_KEY` للبيئة في `wrangler.toml`.

## 7. الخادم (`src/`)

### البنية: طبقات باتجاه واحد
```
lib/  →  services/  →  jobs/  →  routes/  →  index.js
```
| الطبقة | ماذا فيها | تستورد من |
|---|---|---|
| `lib/` | أدوات عامة بلا منطق عمل: الأمان، JSON، Supabase، حدود الطلبات، النص، التحقق من الدخول | لا شيء من الخادم |
| `services/` | منطق العمل والخدمات الخارجية: المحتوى والإعدادات، البريد | `lib/` |
| `jobs/` | عمليات الخلفية: يشغّلها المؤقت، ويمكن لزر في اللوحة تشغيلها (أرسل نسخة الآن) | `lib/`، `services/` |
| `routes/` | معالجات الطلبات: صفحة أو واجهة لكل مسار | ما سبق، وملف آخر في `routes/` |
| `index.js` | التوجيه فقط: أي مسار يذهب لأي معالج، والمهام المجدولة | الكل |

**القواعد (يفحصها `tests/structure.mjs` قبل كل نشر):**
1. لا يستورد ملف من طبقة أعلى منه، ولا يستورد أحد `index.js`.
2. لا حلقات استيراد (أ يستورد ب و ب يستورد أ)، حتى داخل الطبقة نفسها.
3. كل استيراد يشير إلى ملف موجود.

**إضافة شيء جديد:**
- أداة عامة (تنسيق، تحقق) ← `lib/core.js`.
- قراءة/كتابة بيانات أو خدمة خارجية ← `services/`.
- مسار جديد ← دالة `handleX` في ملف `routes/` المناسب، ثم سطر في `switch` داخل `index.js`.
- مهمة مجدولة ← `jobs/scheduled.js`، ثم ربطها بالتوقيت في `index.js` و`wrangler.toml` (`crons`).

القيمة التي تتغير أثناء العمل (التخزين المؤقت للمحتوى والإعدادات، دفعات الأحداث والأعطال) تبقى في الملف الذي يغيّرها
فقط: الاستيراد في JavaScript للقراءة، ولا يمكن تعديل قيمة مستوردة من ملف آخر.

### الصفحات
`/` · `/projects/<slug>` · `/services/<slug>` · `/blog` · `/blog/<slug>` · `/privacy` · `/review?c=` · `/robots.txt` · `/sitemap.xml` · `/health` · `/admin/`

### الواجهات العامة
| المسار | الغرض |
|---|---|
| `GET /api/site` | المحتوى كاملاً (JSON) |
| `POST /api/contact` | رسالة / طلب توظيف (`kind:"job"`) / حجز (`kind:"booking"`) |
| `GET /api/slots?date=` | الأوقات المتاحة للحجز |
| `POST /api/event` | أفعال الزوار (دفعة واحدة لكل زيارة) |
| `POST /api/client-error` | أخطاء المتصفح ← سجل الأعطال |
| `POST /api/chat/start` · `/send` · `/poll` · `/status` · `/rate` | الدردشة المباشرة (مفتاح سري لكل محادثة في متصفح الزائر) وتقييمها |
| `GET /unsubscribe?e=&s=` | إلغاء الاشتراك من الحملات البريدية (توقيع HMAC بمفتاح WRITE_TOKEN) |

### واجهات المالك (تتطلب جلسة دخول + `is_admin`)
`/api/admin/stats` · `/funnel` · `/status` · `/diagnose` · `/errors` · `/devguide` · `/integrations` (+`/test`) · `/notify` · `/msgmeta` · `/refresh` · `/review-link`

`/api/admin/team` (المالك) · `/api/admin/push` (المالك وخدمة العملاء: إشعارات الدردشة) · `/api/invite/claim` (المدعو بعد إنشاء حسابه)

### الدردشة المباشرة
- الجداول: `chats` · `chat_messages` · `chat_presence` (ملف `20261109000000_live_chat.sql`). الزائر لا يلمسها مباشرة: يمر عبر الخادم بدوال `chat_*` المحمية بـ `WRITE_TOKEN`.
- اللوحة تقرأ وترد مباشرة (RLS: المالك وخدمة العملاء) وتستقبل الجديد فوراً عبر Supabase Realtime (`js/chat-live.js`)، وتسجّل «متصل» كل 45 ثانية.
- الإشعارات: Web Push بلا محتوى (توقيع VAPID فقط، المفتاح يُنشأ مرة ويُحفظ في KV باسم `vapid`، والأجهزة في `push_subs`). عامل الخدمة: `public/admin/sw.js`. على iPad/iPhone يلزم تثبيت اللوحة على الشاشة الرئيسية.
- البريد: عند بدء محادثة، وعند رسالة جديدة إن لم يكن أحد متصلاً (مرة كل 15 دقيقة لكل محادثة). تُحذف المحادثات بعد 180 يوماً من آخر رسالة.

### المبيعات (ملف `20261112000000_sales.sql`)
- مصدر الزائر (`source`) يُحفظ في المتصفح أول زيارة (`js/site/source.js`) ويُرسل مع النموذج والدردشة.
- مراحل البيع وموعد المتابعة وقيمة الصفقة في `customer_notes`. صفحات: الزبائن (قائمة/مراحل)، لوحة المبيعات، العروض والحملات.
- `/api/admin/campaign` (المالك): يرسل عبر Resend batch لمن وافق فقط (`campaign_audience`). سجل الحملات في KV باسم `campaigns`.
- تذكير صباحي (cron اليومي 06:23 بغداد، الرئيسي فقط): `sales_due` ← بريد للمالك.

### المهام المجدولة (`[triggers]` في wrangler.toml)
| الجدول | المهمة |
|---|---|
| `*/15 * * * *` | مراقبة قاعدة البيانات والملفات؛ بريد عند التوقف والعودة |
| `17 6 * * SUN` | التقرير الأسبوعي (الأحد 9:17 بغداد) |
| `23 3 * * *` | النسخة الاحتياطية (يومية/أسبوعية/شهرية حسب الإعداد) |

ملاحظة: Cloudflare يقبل أيام الأسبوع بالأسماء (`SUN`) وليس `0`.

### الذاكرة المؤقتة
- المحتوى: `getSiteData()` — نسخة في الذاكرة + `caches.default`، عمرها 60 ثانية، تُحدَّث في الخلفية.
- زر «تحديث الآن» وكل حفظ في اللوحة يستدعي `publishNow()` فيظهر التعديل فوراً.

---

## 8. الواجهة

- **الموقع:** `public/js/main.js` ← `render()` يبني كل الأقسام من `state.settings` (الإعدادات مدموجة فوق `DEFAULTS` في `shared.js`).
- **إضافة إعداد جديد:** ضع قيمته الافتراضية في `DEFAULTS` (`shared.js`)، استخدمه في `render.js`، وأضف حقله في `admin/js/views/content.js` (أو الصفحة المناسبة).
- **إضافة قسم جديد:** HTML في `index.html` بـ `data-section="اسم"`، نصوصه في `DEFAULTS.content.ar/en`، مفتاح إظهاره في `DEFAULTS.sections` وفي قائمة «إظهار الأقسام».
- **إضافة صفحة في اللوحة:** ملف في `admin/js/views/`، سطر في `VIEWS` داخل `admin/js/shell.js`، ورابط في `admin/index.html` ضمن المجموعة المناسبة.
- **الأحجام:** استعمل متغيرات «نظام الأحجام» آخر `styles.css` (`--fs-h1`, `--btn-h`, `--sec`…) بدل أرقام ثابتة.
- **الحركة:** مكتبات GSAP/Lenis تُحمَّل على الكمبيوتر فقط؛ الجوال والتابلت يعتمدان تمرير الجهاز.
- **اللمس:** لا تضع عنصراً شفافاً كبيراً فوق الأزرار (حدث سابقاً مع رأس الصفحة — الحل `pointer-events: none` على الحاوية).

---

## 9. الأمان

- سياسة المحتوى (CSP) في `src/lib/core.js` (`CSP`) وفي `public/_headers` — **حدّثهما معاً** عند إضافة نطاق خارجي.
- **لا كود مضمّن (inline script) في أي صفحة:** السياسة لا تسمح به. كود يجب أن يعمل قبل أول رسم يوضع في ملف مستقل صغير (`public/home-pre.js`، `public/theme-pre.js`، `public/admin/boot.js`).
- كل كتابة عامة تمر بالخادم: حدّ طلبات + Turnstile + فخ للبرامج الآلية + دالة محمية بـ `WRITE_TOKEN`.
- لوحة التحكم: دخول Supabase + `is_admin()` + التحقق بخطوتين (مستحسن).
- الصور المرفوعة: PNG/JPEG/WebP/GIF فقط (SVG ممنوع لأنه قد يحمل برمجيات).

---

## 10. الاختبار والنشر

1. `npm test` محلياً — يجب أن تنجح كل الفحوص.
2. ادفع إلى `staging` ← انتظر نجاح البناء (Cloudflare ← Workers ← `wixa-staging` ← Deployments).
3. جرّب على https://staging.wixa.dev، ثم افتح اللوحة ← **الفحص والتشخيص** ← «افحص الآن».
4. ادمج في `main` (تقديم سريع fast-forward) ← يُنشر wixa.dev تلقائياً.
5. افحص الرئيسي من اللوحة بنفس الطريقة.

**التراجع عن نشر سيئ:** Cloudflare ← Workers ← `wixa` ← Deployments ← اختر النسخة السابقة ← Rollback (فوري)، ثم أصلح في Git.

---

## 11. تشخيص الأعطال

ابدأ دائماً من **لوحة التحكم ← الفحص والتشخيص**: تفحص كل جزء وتقول أين العطل وماذا تفعل، وفيها سجل أخطاء الموقع والخادم.

| العَرَض | المكان الأرجح |
|---|---|
| الموقع لا يفتح إطلاقاً | Cloudflare (حالة الـ Worker، النطاق، تجاوز حد الطلبات اليومي في الخطة المجانية) |
| الموقع يفتح بلا محتوى أو بالمحتوى الافتراضي | Supabase متوقف أو `SUPABASE_URL` خطأ |
| التعديلات لا تظهر | الذاكرة المؤقتة ← «تحديث الموقع» في النظام ← الفحص والتشخيص |
| النموذج يقول «تعذّر الإرسال» | `WRITE_TOKEN`، أو Turnstile، أو حد الطلبات |
| لا يصل بريد التنبيه | Resend (المفتاح، توثيق النطاق) أو بريد التنبيهات غير محدد |
| لا أستطيع الدخول للوحة | Supabase Auth، أو التحقق بخطوتين |
| الأرقام في «الرئيسية» لا تظهر | `CF_ANALYTICS_TOKEN` أو حد طلبات Cloudflare المؤقت |
| تصميم مكسور بعد نشر | فشل البناء ← سجل البناء في Cloudflare |

سجلات الخادم المباشرة: Cloudflare ← Workers ← `wixa` ← Logs (أو `npx wrangler tail`).

---

## 12. الحدود الحالية (خطة مجانية)

- Cloudflare Workers المجاني: **100,000 طلب للخادم يومياً** (الملفات الثابتة لا تُحسب) — نحو 50 ألف زيارة. خطة Workers المدفوعة (5$ شهرياً) ترفعها إلى 10 ملايين.
- Supabase المجاني: يتوقف المشروع بعد أسبوع بلا نشاط — المراقبة كل 15 دقيقة تبقيه نشطاً.
- KV المجاني: 1,000 كتابة يومياً — لذلك تُجمَّع الإحصاءات والأخطاء وتُكتب كل 30 ثانية كحد أقصى.
- Resend المجاني: 100 بريد يومياً، 3,000 شهرياً.

---

## 13. اصطلاحات

- رسائل Git بالإنجليزية تصف **ماذا ولماذا**.
- النصوص الظاهرة للمستخدم بالعربية والإنجليزية دائماً (`*_ar` / `*_en`).
- لا أرقام أو آراء أو مشاريع وهمية في المحتوى.
- التعليقات في الكود تشرح **السبب** وليس ما يفعله السطر.

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
- **Rollout order for the last two:** code first, then the Supabase settings. Staging is done; live is turned on after the code is published.

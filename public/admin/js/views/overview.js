/* Overview: visitors from Cloudflare Web Analytics, messages */
import { $, setSubnav, $$, I, esc, fmt, sb, adminApi, role, timedFetch } from "../core.js";
import { route } from "../shell.js";
import { textFixesCard } from "../textfixes.js";

// ---------------- view: overview ----------------
export let period = 30;
let pre = {}; // requests started as soon as the page opens
export async function viewOverview(view) {
  setSubnav(`<div class="seg" id="period">${[7, 30, 90].map((d) => `<button data-d="${d}" class="${d === period ? "on" : ""}">${d} يوم</button>`).join("")}</div>`);
  $$("#period button").forEach((b) => (b.onclick = () => { period = +b.dataset.d; route(); }));
  // the last numbers seen in this tab appear at once; fresh ones replace them a moment later
  const cacheKey = `wixa-stats-${period}`;
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch {}
  // the three parts of this page are asked for together, not one after the other
  pre = { days: period, funnel: adminApi(`funnel?days=${period}`).catch(() => null), today: role !== "editor" ? todayData() : null };
  if (cached) paintOverview(view, cached);
  let s;
  try {
    const { data: ses } = await sb.auth.getSession();
    const r = await timedFetch(`/api/admin/stats?days=${period}`, { headers: { authorization: `Bearer ${ses.session?.access_token || ""}` } });
    if (!r.ok) throw new Error(r.status);
    s = await r.json();
    try { sessionStorage.setItem(cacheKey, JSON.stringify(s)); } catch {}
  } catch (e) {
    if (cached) return; // keep showing the last numbers
    // fallback: the older in-database counter
    const { data, error } = await sb.rpc("admin_stats", { days: period });
    if (error) throw error;
    s = { ...data, source: "database", views_90d: data.all_time_views };
  }
  if (location.hash.slice(1) && location.hash.slice(1) !== "overview") return; // the user moved on
  paintOverview(view, s);
  if (role !== "editor") todayCard(view).catch(() => {});
  if (role !== "support" && !sessionStorage.getItem("wixa-fixes-checked")) { textFixesCard(view); try { sessionStorage.setItem("wixa-fixes-checked", "1"); } catch {} }
}

function paintOverview(view, s) {
  const kpi = (label, val, foot, ic) => `<div class="kpi"><div class="kpi__label"><i>${ic}</i>${label}</div><div class="kpi__value">${fmt(val)}</div><div class="kpi__foot">${foot}</div></div>`;
  const flag = (cc) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) + " " : "🌐 ");
  const DEV = { mobile: "جوال", desktop: "كمبيوتر", tablet: "تابلت" };
  const bars = (rows, label = (r) => r.label) => {
    if (!rows?.length) return '<div class="nodata">لا توجد بيانات بعد</div>';
    const max = Math.max(...rows.map((r) => r.value));
    return `<div class="bars">${rows.map((r) => `<div class="bar"><div class="bar__top"><span>${esc(label(r))}</span><b>${fmt(r.value)}</b></div><div class="bar__track"><div class="bar__fill" style="width:${(r.value / max) * 100}%"></div></div></div>`).join("")}</div>`;
  };
  view.innerHTML = `
    <div class="kpis">
      ${kpi("زيارات اليوم", s.today_visitors, `${fmt(s.today_views)} مشاهدة صفحة اليوم`, I.users)}
      ${kpi(`الزيارات (${period} يوم)`, s.visitors, s.source === "cloudflare" ? "عبر Cloudflare Web Analytics" : "زائر فريد يومياً", I.users)}
      ${kpi(`المشاهدات (${period} يوم)`, s.views, `${fmt(s.views_90d)} خلال 90 يوماً`, I.views)}
      ${kpi("رسائل جديدة", s.messages_new, `<a href="#inbox" style="color:var(--brand)">افتح الوارد ←</a>`, I.mail)}
    </div>
    <div class="two">
      <div class="card"><div class="card__head"><div><h3>الزيارات اليومية</h3><p>آخر ${period} يوم</p></div><div class="legend"><span><i></i>مشاهدات</span><span><i class="u"></i>زيارات</span></div></div><div id="chart"></div></div>
      <div class="card"><div class="card__head"><h3>الأجهزة</h3></div>${bars(s.devices, (r) => DEV[r.label] || r.label)}
        <div class="card__head" style="margin-top:22px"><h3>الدول</h3></div>${bars(s.countries, (r) => flag(r.label) + r.label)}</div>
    </div>
    <div class="twohalf">
      <div class="card"><div class="card__head"><h3>أكثر الصفحات زيارة</h3></div>${bars(s.top_pages)}</div>
      <div class="card"><div class="card__head"><h3>مصادر الزيارات</h3><p>المواقع التي جاء منها الزوار</p></div>${bars(s.referrers)}</div>
    </div>
    ${speedCard(s.speed, s.source)}`;
  drawChart($("#chart"), s.by_day || []);
  funnelCard(view, s);
}

// What visitors did on the site (counted anonymously, once per visit)
async function funnelCard(view, s) {
  if ($("#funnel")) return;
  const days = period;
  let f;
  try { f = pre.days === days && pre.funnel ? await pre.funnel : await adminApi(`funnel?days=${days}`); } catch { return; }
  if (!f) return;
  const t = f.total || {};
  const rows = [
    ["زيارات الموقع", s.visitors ?? null],
    ["استخدموا حاسبة التكلفة", t.calc_used], ["طلبوا عرض سعر من الحاسبة", t.calc_quote], ["حفظوا التقدير PDF", t.calc_pdf],
    ["أرسلوا التقدير عبر واتساب", t.calc_wa], ["ضغطوا واتساب", t.wa_click], ["فتحوا نموذج التواصل", t.form_open],
    ["أرسلوا رسالة", t.form_sent], ["فتحوا حجز موعد", t.booking_open], ["حجزوا موعداً", t.booking_sent],
    ["فتحوا التقديم على وظيفة", t.job_open], ["قرأوا سؤالاً شائعاً", t.faq_open],
    ["ضغطوا «ابدأ مشروعك»", t.start_click], ["فتحوا «كل الخدمات» من الرئيسية", t.more_services], ["فتحوا «كل أعمالنا» من الرئيسية", t.more_projects], ["فتحوا الحاسبة من الرئيسية", t.more_calc],
  ].filter(([, v]) => v != null);
  const max = Math.max(1, ...rows.map(([, v]) => Number(v) || 0));
  view.insertAdjacentHTML("beforeend", `<div class="card" id="funnel"><div class="card__head"><div><h3>ماذا فعل الزوار (آخر ${days} يوماً)</h3><p>يُحسب كل فعل مرة واحدة لكل زيارة، دون أي بيانات شخصية. بدأ العدّ مع هذا التحديث.</p></div></div>
    <div class="funnel">${rows.map(([k, v]) => `<div class="funnel__row"><span>${k}</span><div class="funnel__bar"><i style="width:${Math.round(((Number(v) || 0) / max) * 100)}%"></i></div><b>${fmt(v || 0)}</b></div>`).join("")}</div></div>`);
}

export function drawChart(el, rows) {
  const W = 760, H = 260, P = { t: 16, r: 12, b: 28, l: 40 };
  const max = Math.max(4, ...rows.map((r) => r.views));
  const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, rows.length - 1);
  const y = (v) => H - P.b - (v / top) * (H - P.t - P.b);
  const pts = (k) => rows.map((r, i) => `${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`);
  const smooth = (arr) => arr.length ? "M" + arr.join(" L") : "";
  const area = rows.length ? `${smooth(pts("views"))} L${x(rows.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(top * k));
  const every = Math.ceil(rows.length / 8);
  const day = (d) => new Date(d).toLocaleDateString("ar", { day: "numeric", month: "short" });
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="direction:ltr">
    <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5B21B6" stop-opacity=".2"/><stop offset="1" stop-color="#5B21B6" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
    <g class="axis">${ticks.map((t) => `<text x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("")}
      ${rows.map((r, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${day(r.day)}</text>` : "")).join("")}</g>
    <path class="area" d="${area}"/><path class="lineV" d="${smooth(pts("views"))}"/><path class="lineU" d="${smooth(pts("visitors"))}"/>
    ${rows.map((r, i) => `<g class="pt" data-i="${i}"><rect class="hit" x="${x(i) - (W / rows.length) / 2}" y="${P.t}" width="${W / rows.length}" height="${H - P.t - P.b}" fill="transparent"/><circle class="dot" cx="${x(i)}" cy="${y(r.views)}" r="4.5"/></g>`).join("")}
  </svg>`;
  let tip = $(".tip"); if (!tip) { tip = document.createElement("div"); tip.className = "tip"; document.body.append(tip); }
  $$(".pt", el).forEach((g) => {
    const r = rows[+g.dataset.i];
    g.addEventListener("mousemove", (e) => { tip.innerHTML = `<b>${day(r.day)}</b><br>${fmt(r.views)} مشاهدة · ${fmt(r.visitors)} زائر`; tip.style.left = `${e.clientX + 12}px`; tip.style.top = `${e.clientY - 40}px`; tip.style.opacity = 1; });
    g.addEventListener("mouseleave", () => (tip.style.opacity = 0));
  });
}

// Site speed for real visitors (Core Web Vitals), synced from Cloudflare Web Analytics.
const VITALS = [
  { k: "lcp", name: "سرعة ظهور المحتوى (LCP)", help: "متى يظهر أكبر عنصر في الصفحة", val: (s) => s.lcp_ms, fmt: (v) => `${(v / 1000).toFixed(1)} ث`, good: 2500, poor: 4000, share: (s) => s.lcp },
  { k: "inp", name: "سرعة الاستجابة (INP)", help: "الوقت بين ضغطة الزائر وردّ الصفحة", val: (s) => s.inp_ms, fmt: (v) => `${Math.round(v)} م.ث`, good: 200, poor: 500, share: (s) => s.inp },
  { k: "cls", name: "ثبات الصفحة (CLS)", help: "هل تتحرك العناصر أثناء التحميل", val: (s) => s.cls, fmt: (v) => v.toFixed(2), good: 0.1, poor: 0.25, share: (s) => s.cls_share },
];
export function speedCard(s, source) {
  if (source !== "cloudflare") return "";
  const head = `<div class="card__head"><div><h3>سرعة الموقع للزوار</h3><p>من أجهزة الزوار الحقيقيين عبر Cloudflare · القيمة التي يعتمدها Google (75٪ من الزيارات أفضل منها)</p></div></div>`;
  if (!s) return `<div class="card" style="margin-top:16px">${head}<p class="muted" style="margin:0">لا توجد بيانات كافية بعد. تظهر الأرقام بعد أول زيارات حقيقية.</p></div>`;
  const tiles = VITALS.map((m) => {
    const v = m.val(s);
    if (v == null) return "";
    const st = v <= m.good ? "good" : v <= m.poor ? "mid" : "poor";
    const label = { good: "جيد", mid: "يحتاج تحسين", poor: "ضعيف" }[st];
    const sh = m.share(s);
    const bar = sh ? `<div class="vbar"><i class="g" style="width:${sh.good * 100}%"></i><i class="m" style="width:${sh.mid * 100}%"></i><i class="p" style="width:${sh.poor * 100}%"></i></div><small>${Math.round(sh.good * 100)}٪ من الزيارات جيدة</small>` : "";
    return `<div class="vital ${st}"><span>${m.name}</span><b>${m.fmt(v)}</b><em>${label}</em><p>${m.help}</p>${bar}</div>`;
  }).join("");
  const load = s.load_ms != null ? `<p class="muted" style="margin:14px 0 0">التحميل الكامل للصفحة: ${(s.load_ms / 1000).toFixed(1)} ث · عدد القياسات: ${fmt(s.samples)}</p>` : "";
  return `<div class="card" style="margin-top:16px">${head}<div class="vitals">${tiles}</div>${load}</div>`;
}

// "Today": who is waiting for a reply and whose follow-up is due (owner and customer service)
function todayData() {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  return Promise.all([
    sb.from("chats").select("id,name,last_at").eq("status", "open").eq("last_from", "visitor").order("last_at").limit(50),
    sb.from("customer_notes").select("key,follow_at,stage").lte("follow_at", today).not("stage", "in", "(won,lost)").limit(50),
    sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false),
  ]);
}
async function todayCard(view) {
  const [ch, fu, msg] = await (pre.today || todayData());
  pre.today = null; // used once: a later visit to this page asks again
  const waiting = ch.error ? [] : ch.data || [], due = fu.error ? [] : fu.data || [], fresh = msg.count || 0;
  const old = document.getElementById("todayCard"); if (old) old.parentNode.removeChild(old);
  if (!waiting.length && !due.length && !fresh) return;
  const el = document.createElement("div");
  el.id = "todayCard"; el.className = "card today";
  el.innerHTML = `<div class="card__head"><div><h3>اليوم في خدمة الزبائن</h3><p>ما ينتظرك الآن</p></div></div>
    <div class="today__grid">
      <a href="#chats" class="today__item ${waiting.length ? "hot" : ""}"><b>${waiting.length}</b><span>محادثة تنتظر ردك</span>${waiting[0] ? `<small>أقدمها: ${esc(waiting[0].name)}</small>` : ""}</a>
      <a href="#customers" class="today__item ${due.length ? "hot" : ""}"><b>${due.length}</b><span>زبون حان موعد متابعته</span></a>
      <a href="#inbox" class="today__item ${fresh ? "hot" : ""}"><b>${fresh}</b><span>رسالة جديدة لم تُعالج</span></a>
    </div>`;
  view.prepend(el);
}

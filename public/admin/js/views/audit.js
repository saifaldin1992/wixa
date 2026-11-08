/* النظام → سجل التعديلات: who changed what and when (owner only). Entries come from database triggers (dashboard edits
   saved straight to the database) and from the server (team, integrations, campaigns…). Nobody can edit or delete
   them; entries older than 12 months are removed by a monthly job. */
import { $, $$, esc, sb, setSubnav, ROLE_AR, toast } from "../core.js";

const AREA = {
  site_settings: "إعدادات وصفحات الموقع", projects: "المشاريع", services: "الخدمات", partners: "الشركاء", testimonials: "آراء العملاء",
  posts: "المقالات", orders: "الطلبات", customer_notes: "الزبائن", contact_messages: "الرسائل", messages: "الرسائل", chats: "المحادثات",
  admins: "الفريق", team: "الفريق", integrations: "التكاملات", notify: "الإشعارات", bookings: "المواعيد", campaigns: "الحملات",
  diagnose: "النظام", site: "الموقع",
};
const ACTION = {
  insert: "إضافة", update: "تعديل", delete: "حذف", publish: "تحديث الموقع", invite: "دعوة", invite_cancel: "إلغاء دعوة", role: "تغيير صلاحية",
  remove: "إزالة", send: "إرسال", send_test: "إرسال تجريبي", cancel: "إلغاء", review_link: "رابط رأي", clear_errors: "مسح السجل",
};
const PAGE = 100;
let period = 30, person = "", area = "", query = "", shown = 0;

const when = (t) => new Date(t).toLocaleString("ar-IQ-u-nu-latn", { timeZone: "Asia/Baghdad", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const val = (v) => (v === null || v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
const changesTable = (ch) => {
  const rows = Object.entries(ch || {});
  if (!rows.length) return "";
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="التغييرات"><table class="audit__ch"><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead><tbody>${rows.map(([k, v]) =>
    `<tr><td dir="ltr"><code>${esc(k)}</code></td><td>${esc(val(v?.from))}</td><td>${esc(val(v?.to))}</td></tr>`).join("")}</tbody></table></div>`;
};

async function load(from) {
  let q = sb.from("audit_log").select("*").order("at", { ascending: false }).range(from, from + PAGE - 1);
  if (period) q = q.gte("at", new Date(Date.now() - period * 864e5).toISOString());
  if (person) q = q.eq("actor_email", person);
  if (area) q = q.in("area", Object.keys(AREA).filter((k) => AREA[k] === AREA[area]));
  if (query) { const s = query.replace(/[%,()]/g, " "); q = q.or(`target.ilike.%${s}%,summary.ilike.%${s}%`); }
  return q;
}

export async function viewAudit(view) {
  setSubnav(`<div class="seg" id="aPeriod">${[[7, "7 أيام"], [30, "30 يوماً"], [90, "90 يوماً"], [0, "الكل"]].map(([d, l]) => `<button type="button" data-d="${d}" class="${d === period ? "on" : ""}">${l}</button>`).join("")}</div>`);
  view.innerHTML = `<div class="card audit__filters">
      <div class="audit__bar">
        <label>الشخص<select id="aPerson"><option value="">الكل</option></select></label>
        <label>القسم<select id="aArea"><option value="">الكل</option>${[...new Set(Object.values(AREA))].map((l) => `<option value="${esc(Object.keys(AREA).find((k) => AREA[k] === l))}">${esc(l)}</option>`).join("")}</select></label>
        <label class="audit__q">بحث<input id="aQuery" type="search" placeholder="اسم، رقم طلب، عنوان…" value="${esc(query)}"></label>
      </div>
      <p class="muted" style="margin:0;font-size:13px">لا يمكن لأحد تعديل السجل أو حذفه، حتى المالك. يُحفظ 12 شهراً.</p>
    </div>
    <div id="aList" class="audit__list"></div>
    <div style="text-align:center"><button type="button" class="b" id="aMore" hidden>عرض المزيد</button></div>`;
  $("#aArea").value = area;
  $$("#aPeriod button").forEach((b) => (b.onclick = () => { period = +b.dataset.d; viewAudit(view); }));
  $("#aArea").onchange = (e) => { area = e.target.value; render(true); };
  $("#aPerson").onchange = (e) => { person = e.target.value; render(true); };
  let t; $("#aQuery").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { query = e.target.value.trim(); render(true); }, 350); };
  $("#aMore").onclick = () => render(false);

  // the people who appear in the log (for the filter)
  sb.from("audit_log").select("actor_email").order("at", { ascending: false }).limit(1000).then(({ data }) => {
    const sel = $("#aPerson"); if (!sel || !data) return;
    for (const e of [...new Set(data.map((r) => r.actor_email).filter(Boolean))]) sel.insertAdjacentHTML("beforeend", `<option value="${esc(e)}" dir="ltr">${esc(e)}</option>`);
    sel.value = person;
  });

  async function render(reset) {
    const list = $("#aList"); if (!list) return;
    if (reset) { shown = 0; list.innerHTML = '<div class="empty">جارٍ التحميل…</div>'; }
    const { data, error } = await load(shown);
    if (error) {
      list.innerHTML = /PGRST205|audit_log/.test(`${error.code} ${error.message}`)
        ? '<div class="empty"><b>السجل غير مفعّل بعد.</b><br>يبدأ التسجيل بعد تطبيق ملف قاعدة البيانات الخاص به (supabase/migrations/20261118000000_audit_log.sql).</div>'
        : `<div class="empty">تعذّر تحميل السجل: ${esc(error.message)}</div>`;
      $("#aMore").hidden = true;
      return;
    }
    if (reset) list.innerHTML = "";
    if (!data.length && !shown) { list.innerHTML = '<div class="empty">لا توجد تعديلات في هذه الفترة.</div>'; $("#aMore").hidden = true; return; }
    list.insertAdjacentHTML("beforeend", data.map((r) => {
      const n = Object.keys(r.changes || {}).length;
      return `<details class="card audit__row">
        <summary>
          <span class="audit__when">${esc(when(r.at))}</span>
          <span class="audit__who" dir="ltr">${esc(r.actor_email || (r.source === "server" ? "الخادم" : "—"))}</span>
          ${r.actor_role ? `<span class="pill">${esc(ROLE_AR[r.actor_role] || r.actor_role)}</span>` : ""}
          <b class="audit__what">${esc(ACTION[r.action] || r.action)} · ${esc(AREA[r.area] || r.area)}</b>
          ${r.target ? `<span class="audit__target">${esc(r.target)}</span>` : ""}
          ${n ? `<span class="muted audit__n">${n} ${n === 1 ? "حقل" : "حقول"}</span>` : ""}
        </summary>
        ${r.summary ? `<p class="audit__sum">${esc(r.summary)}</p>` : ""}
        ${changesTable(r.changes)}
      </details>`;
    }).join(""));
    shown += data.length;
    $("#aMore").hidden = data.length < PAGE;
  }
  await render(true).catch((e) => toast(`تعذّر تحميل السجل: ${e.message}`, "err"));
}

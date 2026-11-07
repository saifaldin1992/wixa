/* Sales dashboard (owner): how many people reached out, how many became customers, what they ask for most,
   where they come from, how fast the team answers and how customers rate the chat. Built from the dashboard's own data. */
import { $, $$, esc } from "../core.js";
import { STAGES, loadCustomers } from "./customers.js";

let days = 30;
const money = (v) => Number(v || 0).toLocaleString("en");
const bars = (rows, empty) => {
  if (!rows.length) return `<p class="muted" style="margin:0">${empty}</p>`;
  const max = Math.max(...rows.map((r) => r[1]));
  return `<div class="bars">${rows.map(([k, v, extra]) => `<div class="bars__row"><span>${esc(k)}</span><i style="--w:${Math.max(4, (v / max) * 100)}%"></i><b>${v}${extra ? ` <small>${extra}</small>` : ""}</b></div>`).join("")}</div>`;
};
const count = (arr) => { const m = new Map(); arr.forEach((x) => x && m.set(x, (m.get(x) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
const dur = (min) => (min < 1 ? "أقل من دقيقة" : min < 60 ? `${Math.round(min)} دقيقة` : min < 1440 ? `${(min / 60).toFixed(1)} ساعة` : `${(min / 1440).toFixed(1)} يوم`);

export async function viewSales(view) {
  $("#topActions").innerHTML = `<div class="seg" id="sPeriod">${[[7, "7 أيام"], [30, "30 يوماً"], [90, "3 أشهر"], [365, "سنة"]].map(([d, l]) => `<button data-d="${d}" class="${d === days ? "on" : ""}">${l}</button>`).join("")}</div>`;
  $$("#sPeriod button").forEach((b) => (b.onclick = () => { days = +b.dataset.d; viewSales(view); }));
  let data;
  try { data = await loadCustomers(); } catch (e) { view.innerHTML = `<div class="empty"><p>تعذّر تحميل البيانات (${esc(e.message)})</p></div>`; return; }
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const all = data.all, fresh = all.filter((c) => c.first >= since);
  const touches = all.flatMap((c) => c.history).filter((h) => h.at >= since);
  const chats = data.chats.filter((c) => c.created_at >= since);
  const won = fresh.filter((c) => c.stage === "won"), lost = fresh.filter((c) => c.stage === "lost");
  const wonValue = all.filter((c) => c.stage === "won").reduce((a, c) => a + c.value, 0);
  const replies = chats.filter((c) => c.first_reply_at).map((c) => (new Date(c.first_reply_at) - new Date(c.created_at)) / 60000).sort((a, b) => a - b);
  const median = replies.length ? replies[Math.floor(replies.length / 2)] : null;
  const rated = chats.filter((c) => c.rating);
  const avg = rated.length ? rated.reduce((a, c) => a + c.rating, 0) / rated.length : 0;
  const conv = fresh.length ? Math.round((won.length / fresh.length) * 100) : 0;

  view.innerHTML = `<div class="sales">
    <div class="cust__kpis sales__kpis">
      <div class="card cust__kpi"><b>${fresh.length}</b><span>زبون جديد تواصل معك</span></div>
      <div class="card cust__kpi"><b>${conv}%</b><span>نسبة التحويل إلى بيع (${won.length} من ${fresh.length})</span></div>
      <div class="card cust__kpi"><b>${money(wonValue)}</b><span>قيمة كل المبيعات المسجّلة</span></div>
      <div class="card cust__kpi"><b>${median === null ? "—" : dur(median)}</b><span>متوسط سرعة أول رد في الدردشة</span></div>
      <div class="card cust__kpi"><b>${rated.length ? `${avg.toFixed(1)} ★` : "—"}</b><span>تقييم الدردشة (${rated.length} تقييم)</span></div>
      <div class="card cust__kpi"><b>${touches.length}</b><span>تواصل (رسائل + محادثات + مواعيد)</span></div>
    </div>
    <div class="sales__grid">
      <div class="card"><div class="card__head"><div><h3>مراحل البيع</h3><p>كل الزبائن حسب المرحلة الحالية — غيّرها من صفحة الزبائن</p></div></div>
        ${bars(STAGES.map(([k, n]) => [n, all.filter((c) => c.stage === k).length, k === "won" && wonValue ? money(wonValue) : ""]).filter((r) => r[1]), "لا يوجد زبائن بعد.")}</div>
      <div class="card"><div class="card__head"><div><h3>من أين يأتي الزبائن</h3><p>أول مصدر لكل زبون جديد في هذه الفترة</p></div></div>
        ${bars(count(fresh.map((c) => c.origin || "غير معروف")), "يظهر هنا بعد أول تواصل.")}
        <p class="muted" style="font-size:12px;margin:10px 0 0">لتمييز حملاتك: أضف للرابط ‎?utm_source=instagram‎ مثلاً، فيظهر الاسم هنا كما كتبته.</p></div>
      <div class="card"><div class="card__head"><div><h3>أكثر ما يطلبه الزبائن</h3><p>الخدمات والمواضيع في هذه الفترة</p></div></div>
        ${bars(count(touches.map((h) => h.interest)).slice(0, 8), "لا يوجد طلبات في هذه الفترة.")}</div>
      <div class="card"><div class="card__head"><div><h3>طرق التواصل</h3><p>من أين وصلتك الطلبات</p></div></div>
        ${bars(count(touches.map((h) => ({ form: "نموذج التواصل", chat: "الدردشة", booking: "حجز موعد" })[h.source])), "لا يوجد تواصل في هذه الفترة.")}</div>
      <div class="card"><div class="card__head"><div><h3>لماذا نخسر؟</h3><p>الزبائن الذين خسرناهم في هذه الفترة وملاحظاتك عنهم</p></div></div>
        ${lost.length ? `<ul class="sales__lost">${lost.slice(0, 8).map((c) => `<li><b>${esc(c.name)}</b>${c.note ? ` — <span class="muted">${esc(c.note)}</span>` : ""}</li>`).join("")}</ul>` : '<p class="muted" style="margin:0">لا يوجد — ممتاز 👏</p>'}</div>
      <div class="card"><div class="card__head"><div><h3>آخر التقييمات</h3><p>ما قاله الزبائن بعد المحادثة</p></div></div>
        ${rated.length ? `<ul class="sales__lost">${rated.slice(0, 8).map((c) => `<li><span class="stars">${"★".repeat(c.rating)}</span> <b>${esc(c.name)}</b>${c.rating_note ? ` — <span class="muted">${esc(c.rating_note)}</span>` : ""}</li>`).join("")}</ul>` : '<p class="muted" style="margin:0">لا يوجد تقييمات بعد — تظهر بعد إغلاق المحادثات.</p>'}</div>
    </div></div>`;
}

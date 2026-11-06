/* Connections: which domain, hosting, database, email and code repository the site is linked to, checked live */
import { $, esc, sb } from "../core.js";

const ICON = { ok: "✓", warn: "!", err: "✕", info: "i" };

export async function viewStatus(view) {
  view.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  let d;
  try {
    const { data: ses } = await sb.auth.getSession();
    const r = await fetch("/api/admin/status", { headers: { authorization: `Bearer ${ses.session?.access_token || ""}` } });
    if (!r.ok) throw new Error(r.status === 403 ? "لا تملك صلاحية" : `HTTP ${r.status}`);
    d = await r.json();
  } catch (e) {
    view.innerHTML = `<div class="empty">تعذّر فحص الاتصالات: ${esc(e.message)}</div>`;
    return;
  }
  const card = (c) => `<div class="conn conn--${c.state}">
      <div class="conn__head"><span class="conn__ico">${ICON[c.state]}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.role)}</p></div></div>
      <dl>${c.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
      ${c.link ? `<a class="b b--sm" href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.linkText || "فتح لوحة الإدارة")} ↗</a>` : ""}
    </div>`;
  const okN = d.items.filter((c) => c.state === "ok").length;
  view.innerHTML = `
    <div class="card conn-sum"><div><h3>${okN} من ${d.items.length} خدمات تعمل بشكل سليم</h3>
      <p class="muted">آخر فحص: ${new Date(d.checked_at).toLocaleString("ar-IQ")} · النسخة: <b>${d.env === "staging" ? "التجريبية" : "الرئيسية"}</b></p></div>
      <button class="b" id="recheck">إعادة الفحص</button></div>
    <div class="conns">${d.items.map(card).join("")}</div>
    <div class="card"><div class="card__head"><div><h3>كيف تعمل معاً</h3></div></div>
      <ol class="steps">
        <li><b>GitHub</b> يحفظ كود الموقع. كل تحديث على فرع <code>main</code> يُنشر على wixa.dev، وعلى <code>staging</code> يُنشر على النسخة التجريبية.</li>
        <li><b>Cloudflare</b> يستضيف الموقع ويوزّعه من أقرب خادم للزائر، ويدير النطاق والبريد الوارد ويحسب الزيارات.</li>
        <li><b>Supabase</b> قاعدة البيانات: المحتوى الذي تعدّله من هنا، الرسائل، وحساب الدخول.</li>
        <li><b>Resend</b> يرسل لك بريد «رسالة جديدة» من <code dir="ltr">notify@wixa.dev</code>.</li>
        <li><b>Google</b> يقرأ الموقع ليظهره في البحث (من صفحة «البحث والمشاركة»).</li>
      </ol></div>`;
  $("#recheck").onclick = () => viewStatus(view);
}

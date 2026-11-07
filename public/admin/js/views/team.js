/* Team & permissions (owner only): who can use the dashboard, with which role, and invitations.
   An invited person opens the sign-in page → «لدي دعوة» → email + code + a new password. */
import { $, $$, I, ROLE_AR, adminApi, confirmBox, esc, toast } from "../core.js";

const ROLE_DESC = {
  owner: "كل شيء: المحتوى والتصميم والرسائل والتكاملات والفريق والنسخ الاحتياطي.",
  editor: "المحتوى والنصوص والمشاريع والخدمات والشركاء والآراء والمقالات والمظهر والبحث. لا يرى الرسائل ولا الإعدادات.",
  support: "الرسائل وطلبات التوظيف والمواعيد فقط: يرد ويتابع ويلغي المواعيد. لا يغيّر شيئاً في الموقع.",
};
const when = (t) => (t ? new Date(t).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" }) : "لم يدخل بعد");

export async function viewTeam(view) {
  $("#topActions").innerHTML = "";
  let d;
  try { d = await adminApi("team"); } catch (e) {
    view.innerHTML = `<div class="empty"><p>${e.data?.error === "migration_missing" ? "يلزم تطبيق تحديث قاعدة البيانات الخاص بالفريق أولاً (ملف supabase/migrations/20261108000000_team_roles.sql)." : `تعذّر تحميل الفريق (${esc(e.message)})`}</p></div>`;
    return;
  }
  view.innerHTML = `<div class="team">
    <div class="card"><div class="card__head"><div><h3>دعوة شخص جديد</h3><p>يصله بريد فيه رمز الدعوة. يدخل من صفحة تسجيل الدخول ← «لدي دعوة». الدعوة صالحة 7 أيام ولمرة واحدة، ولا يستطيع أحد الدخول دون دعوة.</p></div></div>
      <form id="inviteForm" class="stack">
        <label class="f"><span>البريد الإلكتروني</span><input name="email" type="email" required dir="ltr" placeholder="name@example.com"></label>
        <div class="roles">${Object.keys(ROLE_AR).map((r, i) => `<label class="role"><input type="radio" name="role" value="${r}" ${i === 2 ? "checked" : ""}><span><b>${ROLE_AR[r]}</b><small>${ROLE_DESC[r]}</small></span></label>`).join("")}</div>
        <button class="b b--primary" style="justify-self:start">${I.mail}إرسال الدعوة</button>
      </form>
      <div id="inviteOut"></div></div>

    <div class="card"><div class="card__head"><div><h3>أعضاء الفريق (${d.members.length})</h3><p>غيّر الصلاحية أو أزل العضو. لا يمكن إزالة آخر مالك.</p></div></div>
      <div class="members">${d.members.map((m) => `<div class="member">
        <div class="member__av">${esc((m.email || "?")[0].toUpperCase())}</div>
        <div class="member__info"><b dir="ltr">${esc(m.email)}</b>${m.user_id === d.me ? ' <span class="pill ok">أنت</span>' : ""}
          <span class="muted">آخر دخول: ${when(m.last_sign_in_at)} · ${m.mfa ? "التحقق بخطوتين مفعّل ✓" : "بدون تحقق بخطوتين"}</span></div>
        <select class="member__role" data-uid="${m.user_id}" ${m.user_id === d.me ? "disabled" : ""}>${Object.keys(ROLE_AR).map((r) => `<option value="${r}" ${m.role === r ? "selected" : ""}>${ROLE_AR[r]}</option>`).join("")}</select>
        ${m.user_id === d.me ? "" : `<button class="b b--icon b--ghost b--danger" data-remove="${m.user_id}" data-email="${esc(m.email)}" title="إزالة">${I.trash}</button>`}
      </div>`).join("")}</div></div>

    <div class="card"><div class="card__head"><div><h3>دعوات بانتظار القبول (${d.invites.length})</h3></div></div>
      ${d.invites.length ? `<div class="members">${d.invites.map((v) => `<div class="member">
        <div class="member__av member__av--wait">…</div>
        <div class="member__info"><b dir="ltr">${esc(v.email)}</b><span class="muted">${ROLE_AR[v.role] || v.role} · أُرسلت ${when(v.at)} · تنتهي بعد 7 أيام من الإرسال</span></div>
        <button class="b b--sm" data-copy="${location.origin}/admin/#invite=${esc(v.code)}">نسخ الرابط</button>
        <button class="b b--icon b--ghost b--danger" data-cancel="${esc(v.code)}" title="إلغاء الدعوة">${I.x}</button></div>`).join("")}</div>` : '<p class="muted" style="margin:0">لا توجد دعوات معلّقة.</p>'}</div>
  </div>`;

  $("#inviteForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button"); btn.disabled = true;
    try {
      const r = await adminApi("team", "POST", { action: "invite", email: f.email.value.trim(), role: f.role.value });
      $("#inviteOut").innerHTML = `<div class="invite-done"><p>${r.sent ? `✓ أُرسلت الدعوة إلى <b dir="ltr">${esc(r.email)}</b>.` : `أُنشئت الدعوة لكن تعذّر إرسال البريد — أرسل الرابط والرمز بنفسك:`}</p>
        <p>رمز الدعوة: <code dir="ltr" style="font-size:16px;letter-spacing:1px">${esc(r.code)}</code></p>
        <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="b b--sm" data-copy="${esc(r.link)}">نسخ الرابط</button>
        <a class="b b--sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`دعوة للانضمام إلى لوحة تحكم ويكسا (${ROLE_AR[r.role]}). الرمز: ${r.code}\n${r.link}`)}">إرسال عبر واتساب</a></div></div>`;
      bindCopy(view); f.reset(); toast("أُنشئت الدعوة ✓");
      setTimeout(() => viewTeam(view), 4000);
    } catch (err) { toast(err.message === "invalid" ? "تحقق من البريد" : "تعذّر إنشاء الدعوة", "err"); }
    finally { btn.disabled = false; }
  };
  $$(".member__role", view).forEach((s) => (s.onchange = async () => {
    try { await adminApi("team", "POST", { action: "role", user_id: s.dataset.uid, role: s.value }); toast(`صارت الصلاحية: ${ROLE_AR[s.value]} ✓`); }
    catch (e) { toast(e.data?.error === "last_owner" ? "لا يمكن: يجب أن يبقى مالك واحد على الأقل" : "تعذّر التغيير", "err"); viewTeam(view); }
  }));
  $$("[data-remove]", view).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("إزالة عضو", `سيفقد ${b.dataset.email} الدخول إلى لوحة التحكم فوراً.`, "إزالة"))) return;
    try { await adminApi("team", "POST", { action: "remove", user_id: b.dataset.remove }); toast("أُزيل العضو"); viewTeam(view); }
    catch (e) { toast(e.data?.error === "last_owner" ? "لا يمكن إزالة آخر مالك" : "تعذّرت الإزالة", "err"); }
  }));
  $$("[data-cancel]", view).forEach((b) => (b.onclick = async () => { await adminApi("team", "POST", { action: "cancel", code: b.dataset.cancel }).catch(() => {}); toast("أُلغيت الدعوة"); viewTeam(view); }));
  bindCopy(view);
}
function bindCopy(root) {
  $$("[data-copy]", root).forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("تم النسخ ✓"); } catch { prompt("انسخ الرابط:", b.dataset.copy); } }));
}

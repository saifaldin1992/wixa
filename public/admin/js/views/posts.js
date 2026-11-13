/* Articles (blog): write, publish and edit. Shown at /blog and /blog/<link>. */
import { $, $$, I, closeModal, confirmBox, esc, openModal, publishNow, sb, settings, toast } from "../core.js";
import { imageField } from "../fields.js";
import { quietly, saveSettings } from "../settings.js";

// How an article page looks (settings.blog.theme for all, settings.blog.per[id] for one article; same keys in routes/pages.js)
export const POST_THEMES = [
  ["classic", "كلاسيكي", "العنوان ثم الغلاف، وعمود قراءة متوسط"],
  ["magazine", "مجلة", "غلاف كبير أعلى الصفحة وعنوان عريض — للمقالات المصوّرة"],
  ["minimal", "بسيط", "بلا صورة غلاف، عمود ضيق مريح للقراءة الطويلة"],
];
const blog = () => { if (!settings.blog || typeof settings.blog !== "object") quietly(() => { settings.blog = {}; }); return settings.blog; };

const slugify = (t) => String(t || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export async function viewPosts(view) {
  $("#topActions").innerHTML = `<a class="b" href="/blog" target="_blank" rel="noopener">عرض صفحة المقالات</a>`;
  const { data, error } = await sb.from("posts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const theme = blog().theme || "classic";
  const bar = `<div class="toolbar"><p class="muted toolbar__hint" style="margin:0">${data.length} مقال</p><button type="button" class="add-fab" id="addPost" aria-label="مقال جديد" title="مقال جديد">${I.plus}</button></div>
    <div class="card" style="margin-bottom:14px"><div class="card__head"><div><h3>شكل صفحات المقالات</h3><p>يُطبَّق على كل المقالات، ويمكن اختيار شكل مختلف لمقال واحد من «تعديل».</p></div></div>
      <div class="themes" id="postTheme">${POST_THEMES.map(([k, n, d]) => `<button type="button" data-theme="${k}" class="theme-opt ${theme === k ? "on" : ""}" aria-pressed="${theme === k}"><span class="theme-opt__pic theme-opt__pic--${k}" aria-hidden="true"><i></i><b></b><b></b><b></b></span><strong>${n}</strong><small>${d}</small></button>`).join("")}</div></div>`;
  const wire = () => {
    $("#addPost").onclick = () => editPost(null);
    $$("#postTheme [data-theme]").forEach((b) => (b.onclick = async () => {
      if (b.classList.contains("on")) return;
      blog().theme = b.dataset.theme;
      $$("#postTheme [data-theme]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
      await saveSettings();
    }));
  };
  if (!data.length) {
    view.innerHTML = `${bar}<div class="empty">${I.edit}<p>لا توجد مقالات بعد. المقالات المفيدة تساعد الناس على إيجاد موقعك في Google.</p><p class="muted" style="font-size:13px">أفكار: «كم تكلفة تطبيق جوال في العراق؟»، «متى تحتاج شركتك نظاماً إدارياً؟»، «كيف تختار شركة برمجة؟»</p></div>`;
    wire();
    return;
  }
  const when = (d) => (d ? new Date(d).toLocaleDateString("ar", { dateStyle: "medium" }) : "");
  view.innerHTML = `${bar}
    <div class="items">${data.map((p) => `<div class="item">
      <div class="item__thumb" style="${p.cover_url ? `background-image:url('${esc(p.cover_url)}')` : ""}">${p.cover_url ? "" : I.edit}</div>
      <div class="item__main"><b>${esc(p.title_ar || p.title_en || "بدون عنوان")}</b><span>${p.published ? `منشور · ${when(p.published_at)}` : "مسودة"} · <span dir="ltr">/blog/${esc(p.slug)}</span></span></div>
      <div class="item__actions">
        ${p.published ? `<a class="b b--sm b--ghost" href="/blog/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${I.eye}</a>` : ""}
        <button class="b b--sm" data-pub="${p.id}">${p.published ? "إخفاء" : "نشر"}</button>
        <button class="b b--icon b--ghost" data-edit="${p.id}" title="تعديل">${I.edit}</button>
        <button class="b b--icon b--ghost b--danger" data-del="${p.id}" title="حذف">${I.trash}</button></div></div>`).join("")}</div>`;
  wire();
  $$("[data-edit]", view).forEach((b) => (b.onclick = () => editPost(data.find((x) => x.id === b.dataset.edit))));
  $$("[data-pub]", view).forEach((b) => (b.onclick = async () => {
    const p = data.find((x) => x.id === b.dataset.pub);
    const patch = { published: !p.published, updated_at: new Date().toISOString(), ...(!p.published && !p.published_at ? { published_at: new Date().toISOString() } : {}) };
    const { error: e } = await sb.from("posts").update(patch).eq("id", p.id);
    if (e) return toast(e.message, "err");
    publishNow(); toast(p.published ? "تم الإخفاء" : "تم النشر ✓"); viewPosts(view);
  }));
  $$("[data-del]", view).forEach((b) => (b.onclick = async () => {
    const p = data.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox("حذف المقال", `هل تريد حذف «${p.title_ar || p.title_en}» نهائياً؟`, "حذف"))) return;
    const { error: e } = await sb.from("posts").delete().eq("id", p.id);
    if (e) return toast(e.message, "err");
    publishNow(); toast("تم الحذف"); viewPosts(view);
  }));
}

function editPost(row) {
  const rec = row ? { ...row } : { title_ar: "", title_en: "", slug: "", excerpt_ar: "", excerpt_en: "", body_ar: "", body_en: "", cover_url: "", published: false };
  let slugTouched = !!row;
  const body = document.createElement("div"); body.className = "stack";
  body.innerHTML = `
    <div class="grid2"><label class="f"><span>العنوان — عربي</span><input data-k="title_ar"></label><label class="f"><span>Title — English</span><input data-k="title_en" dir="ltr"></label></div>
    <label class="f"><span>رابط المقال <small class="muted">(يُكتب تلقائياً من العنوان)</small></span><div style="display:flex;align-items:center;gap:6px" dir="ltr"><span class="muted">/blog/</span><input data-k="slug" dir="auto" style="flex:1"></div></label>
    <div class="grid2"><label class="f"><span>مقدمة قصيرة — عربي (تظهر في القائمة وفي Google)</span><textarea data-k="excerpt_ar" rows="3"></textarea></label><label class="f"><span>Excerpt — English</span><textarea data-k="excerpt_en" rows="3" dir="ltr"></textarea></label></div>
    <p class="muted" style="margin:0;font-size:13px">في النص: افصل الفقرات بسطر فارغ · ابدأ السطر بـ <code>## </code> ليصبح عنواناً · ابدأ بـ <code>- </code> لقائمة نقاط · ضع الكلام بين <code>**نجمتين**</code> ليصبح عريضاً · الروابط تصبح قابلة للضغط تلقائياً.</p>
    <div class="grid2"><label class="f"><span>نص المقال — عربي</span><textarea data-k="body_ar" rows="16"></textarea></label><label class="f"><span>Article — English (optional)</span><textarea data-k="body_en" rows="16" dir="ltr"></textarea></label></div>
    <div class="f"><span>صورة الغلاف (اختياري — أفقية)</span><div id="coverField"></div></div>
    <label class="f"><span>شكل هذا المقال</span><select id="postLook"><option value="">مثل باقي المقالات (${esc((POST_THEMES.find(([k]) => k === (blog().theme || "classic")) || POST_THEMES[0])[1])})</option>${POST_THEMES.map(([k, n]) => `<option value="${k}" ${row && blog().per?.[row.id] === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
    <label class="switch"><input type="checkbox" data-k="published"><i></i>منشور ويظهر في الموقع</label>`;
  $$("[data-k]", body).forEach((el) => {
    const k = el.dataset.k;
    if (el.type === "checkbox") { el.checked = !!rec[k]; el.onchange = () => (rec[k] = el.checked); return; }
    el.value = rec[k] ?? "";
    el.oninput = () => {
      rec[k] = el.value;
      if (k === "slug") slugTouched = true;
      if (!slugTouched && (k === "title_en" || k === "title_ar")) { rec.slug = slugify(rec.title_en || rec.title_ar); $('[data-k="slug"]', body).value = rec.slug; }
    };
  });
  $("#coverField", body).append(imageField(rec.cover_url, "posts", (u) => (rec.cover_url = u)));
  const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
  foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-save>${I.save}${row ? "حفظ التعديلات" : "حفظ المقال"}</button>`;
  openModal(row ? "تعديل مقال" : "مقال جديد", body, foot);
  $("[data-save]", foot).onclick = async (e) => {
    if (!(rec.title_ar || rec.title_en).trim()) return toast("اكتب عنوان المقال", "err");
    if (!(rec.body_ar || rec.body_en).trim()) return toast("اكتب نص المقال", "err");
    rec.slug = slugify(rec.slug || rec.title_en || rec.title_ar);
    if (!rec.slug) return toast("اكتب رابطاً صحيحاً للمقال", "err");
    const btn = e.currentTarget; btn.disabled = true;
    const { id, created_at, ...payload } = rec; // eslint-disable-line no-unused-vars
    payload.updated_at = new Date().toISOString();
    if (payload.published && !payload.published_at) payload.published_at = payload.updated_at;
    const res = row ? await sb.from("posts").update(payload).eq("id", row.id) : await sb.from("posts").insert(payload).select("id").single();
    btn.disabled = false;
    if (res.error) return toast(/duplicate|unique/i.test(res.error.message) ? "هذا الرابط مستخدم لمقال آخر، غيّره قليلاً" : `فشل الحفظ: ${res.error.message}`, "err");
    // this article's own look (kept in the site settings by the article's id)
    const look = $("#postLook", body).value, pid = row?.id || res.data?.id, per = { ...(blog().per || {}) };
    if (pid && (per[pid] || "") !== look) { if (look) per[pid] = look; else delete per[pid]; blog().per = per; await saveSettings(); }
    publishNow(); closeModal(); toast(payload.published ? "تم الحفظ والنشر ✓" : "تم حفظ المقال كمسودة ✓");
    viewPosts($("#view"));
  };
}

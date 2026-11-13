/* «مكتبة الوسائط»: every image uploaded to the site (Supabase Storage, bucket «media») in one place —
   upload several at once, copy a link, see where each image is used, and delete the ones nothing uses.
   pickMedia() opens the same library as a picker from any image field (fields.js → «من المكتبة»). */
import { $, $$, I, confirmBox, esc, sb, toast } from "../core.js";
import { shrinkImage } from "../fields.js";

const BUCKET = "media";
// where an image can be used: the table and its name in the dashboard
const USED_IN = [["site_settings", "صفحات الموقع والمظهر"], ["projects", "المشاريع"], ["services", "الخدمات"], ["partners", "الشركاء"], ["testimonials", "آراء العملاء"], ["posts", "المقالات"]];
const FOLDER_AR = { library: "المكتبة", projects: "المشاريع", services: "الخدمات", partners: "الشركاء", testimonials: "آراء العملاء", posts: "المقالات", brand: "الهوية", seo: "البحث والمشاركة", team: "الفريق", story: "قصتنا", hero: "الواجهة" };
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const urlOf = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// every file: the root holds folders (one per editor) and maybe loose files; each folder is listed on its own
export async function listMedia() {
  const opts = { limit: 1000, sortBy: { column: "created_at", order: "desc" } };
  const { data: top, error } = await sb.storage.from(BUCKET).list("", opts);
  if (error) throw error;
  const files = [], folders = [];
  for (const x of top || []) (x.id ? files.push({ ...x, path: x.name }) : folders.push(x.name));
  const lists = await Promise.all(folders.map((f) => sb.storage.from(BUCKET).list(f, opts).then(({ data }) => (data || []).filter((x) => x.id).map((x) => ({ ...x, path: `${f}/${x.name}` })))));
  return [...files, ...lists.flat()]
    .filter((x) => x.name !== ".emptyFolderPlaceholder")
    .map((x) => ({ path: x.path, folder: x.path.includes("/") ? x.path.split("/")[0] : "", url: urlOf(x.path), size: x.metadata?.size || 0, type: x.metadata?.mimetype || "", at: x.created_at }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// where each file is used: its path appears in a saved row (settings, projects, services…)
async function usesOf(files) {
  const texts = await Promise.all(USED_IN.map(([t]) => sb.from(t).select("*").then(({ data }) => JSON.stringify(data || [])).catch(() => "")));
  const out = new Map();
  for (const f of files) out.set(f.path, USED_IN.filter((_, i) => texts[i].includes(f.path)).map(([, n]) => n));
  return out;
}

export async function uploadFiles(fileList, folder = "library") {
  const done = [];
  for (let file of [...fileList]) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { toast(`«${file.name}»: صور PNG أو JPG أو WebP أو GIF فقط`, "err"); continue; }
    if (file.size > 20 * 1024 * 1024) { toast(`«${file.name}» أكبر من 20MB`, "err"); continue; }
    file = await shrinkImage(file).catch(() => file);
    if (file.size > 5 * 1024 * 1024) { toast(`«${file.name}» أكبر من 5MB حتى بعد الضغط`, "err"); continue; }
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: "31536000", contentType: file.type });
    if (error) { toast(`فشل رفع «${file.name}»: ${error.message}`, "err"); continue; }
    done.push(urlOf(path));
  }
  return done;
}

// copy a link: the clipboard when the browser allows it, else the old way through a hidden text box
async function copyText(t) {
  let done = false;
  try { await Promise.race([navigator.clipboard.writeText(t), new Promise((_, no) => setTimeout(no, 800))]); done = true; } catch { /* below */ }
  if (!done) { const x = document.createElement("textarea"); x.value = t; x.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(x); x.select(); try { done = document.execCommand("copy"); } catch { /* none */ } x.remove(); }
  toast(done ? "نُسخ الرابط ✓" : `انسخ الرابط: ${t}`, done ? "" : "err");
}

const card = (f, uses, pick) => `<div class="media__item" data-path="${esc(f.path)}">
    <button type="button" class="media__thumb" ${pick ? "data-pick" : "data-open"} style="background-image:url('${esc(f.url)}')" aria-label="${pick ? "اختيار هذه الصورة" : "فتح الصورة"}"></button>
    <div class="media__meta"><b title="${esc(f.path)}">${esc(FOLDER_AR[f.folder] || f.folder || "بدون مجلد")}</b><span>${kb(f.size)} · ${f.at ? new Date(f.at).toLocaleDateString("ar", { day: "numeric", month: "short" }) : ""}</span>
      ${uses ? (uses.length ? `<span class="tag on" title="${esc(uses.join("، "))}">مستخدمة: ${esc(uses.join("، "))}</span>` : '<span class="tag off">غير مستخدمة</span>') : ""}</div>
    ${pick ? "" : `<div class="media__acts"><button type="button" class="b b--sm b--ghost" data-copy>${I.copy || ""}نسخ الرابط</button><button type="button" class="b b--icon b--ghost b--danger" data-del aria-label="حذف">${I.trash || "×"}</button></div>`}
  </div>`;

export async function viewMedia(view) {
  $("#topActions").innerHTML = "";
  view.innerHTML = '<p class="muted">جارٍ تحميل الصور…</p>';
  let files = await listMedia(), uses = await usesOf(files), filter = "all", q = "";
  const paint = () => {
    const total = files.reduce((s, f) => s + f.size, 0), unused = files.filter((f) => !uses.get(f.path)?.length).length;
    const shown = files.filter((f) => (filter === "unused" ? !uses.get(f.path)?.length : true) && (!q || f.path.toLowerCase().includes(q) || (FOLDER_AR[f.folder] || "").includes(q)));
    view.innerHTML = `<div class="toolbar"><p class="muted toolbar__hint" style="margin:0">${files.length} صورة · ${kb(total)}${unused ? ` · ${unused} غير مستخدمة` : ""}</p>
        <label class="b b--primary">${I.upload}<span>رفع صور</span><input type="file" id="mUp" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></label></div>
      <div class="media__bar"><input type="search" id="mQ" placeholder="ابحث باسم القسم أو الملف" value="${esc(q)}">
        <div class="seg" id="mF"><button type="button" data-f="all" class="${filter === "all" ? "on" : ""}">الكل</button><button type="button" data-f="unused" class="${filter === "unused" ? "on" : ""}">غير المستخدمة</button></div></div>
      <div class="media drop" id="mDrop">${shown.length ? shown.map((f) => card(f, uses.get(f.path), false)).join("") : `<div class="empty">${I.upload}<p>${files.length ? "لا توجد صور بهذا البحث." : "لا توجد صور بعد. ارفع صورك هنا لتستخدمها في أي مكان بالموقع."}</p></div>`}</div>
      <p class="muted" style="font-size:12px">تُضغط الصور الكبيرة تلقائياً قبل الرفع. «غير مستخدمة» تعني أنها ليست في أي صفحة أو مشروع أو خدمة أو مقال — يمكن حذفها بأمان.</p>`;
    const up = async (list) => { if (!list?.length) return; toast("جارٍ الرفع…"); const n = await uploadFiles(list); if (n.length) { toast(`تم رفع ${n.length} صورة ✓`); files = await listMedia(); uses = await usesOf(files); paint(); } };
    $("#mUp").onchange = (e) => up(e.target.files);
    const drop = $("#mDrop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); up(e.dataTransfer.files); });
    $("#mQ").oninput = (e) => { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; paint(); const i = $("#mQ"); i.focus(); i.setSelectionRange(pos, pos); };
    $$("#mF [data-f]").forEach((b) => (b.onclick = () => { filter = b.dataset.f; paint(); }));
    $$(".media__item", view).forEach((el) => {
      const f = files.find((x) => x.path === el.dataset.path);
      $("[data-open]", el).onclick = () => window.open(f.url, "_blank", "noopener");
      $("[data-copy]", el).onclick = () => copyText(f.url);
      $("[data-del]", el).onclick = async () => {
        const u = uses.get(f.path) || [];
        const ok = await confirmBox("حذف الصورة", u.length ? `هذه الصورة مستخدمة في: ${u.join("، ")}. إذا حذفتها ستختفي من هناك. هل تريد حذفها؟` : "ستُحذف الصورة نهائياً. هل أنت متأكد؟", "حذف");
        if (!ok) return;
        const { data, error } = await sb.storage.from(BUCKET).remove([f.path]);
        if (error || !data?.length) return toast(`لم تُحذف الصورة${error ? `: ${error.message}` : " (لا تملك صلاحية الحذف)"}`, "err");
        files = files.filter((x) => x !== f); toast("حُذفت الصورة"); paint();
      };
    });
  };
  paint();
}

// The library as a picker: resolves with the chosen image's link, or "" when closed.
// It has its own layer, so it works from inside an editor that is already open in the modal.
export function pickMedia() {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "mpick";
    box.innerHTML = `<div class="mpick__box" role="dialog" aria-modal="true" aria-label="اختر صورة من المكتبة">
      <header><b>اختر صورة من المكتبة</b><label class="b b--sm">${I.upload}<span>رفع</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></label><button type="button" class="b b--icon b--ghost" data-x aria-label="إغلاق">${I.x}</button></header>
      <div class="media media--pick"><p class="muted">جارٍ تحميل الصور…</p></div></div>`;
    document.body.appendChild(box);
    const done = (v) => { box.remove(); removeEventListener("keydown", esc_); resolve(v || ""); };
    const esc_ = (e) => { if (e.key === "Escape") done(""); };
    addEventListener("keydown", esc_);
    box.onclick = (e) => { if (e.target === box || e.target.closest("[data-x]")) done(""); };
    const grid = $(".media", box);
    const load = async () => {
      try {
        const files = await listMedia();
        grid.innerHTML = files.length ? files.map((f) => card(f, null, true)).join("") : `<div class="empty"><p>لا توجد صور بعد — ارفع صورة من الزر أعلاه.</p></div>`;
        $$("[data-pick]", grid).forEach((b) => (b.onclick = () => done(files.find((x) => x.path === b.closest(".media__item").dataset.path).url)));
      } catch (err) { grid.innerHTML = `<p class="muted">تعذّر تحميل المكتبة: ${esc(err.message)}</p>`; }
    };
    $("input[type=file]", box).onchange = async (e) => { const n = await uploadFiles(e.target.files); if (n.length === 1) return done(n[0]); load(); };
    load();
  });
}

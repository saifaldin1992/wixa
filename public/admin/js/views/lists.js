/* Projects, services, partners and testimonials editors */
import { $, $$, adminApi, cache, clone, closeModal, confirmBox, esc, I, ICONS, openModal, publishNow, sb, toast } from "../core.js";
import { imageField } from "../fields.js";

// ---------------- generic lists: projects / services / partners ----------------
export const ENTITIES = {
  projects: {
    one: "مشروع", empty: "لا توجد مشاريع بعد. أضف أول مشروع لعرضه في قسم الإنجازات.",
    title: (r) => r.title_ar || r.title_en || "بدون عنوان", sub: (r) => r.category_ar || r.summary_ar || "",
    thumb: (r) => r.image_url, blank: { title_ar: "", title_en: "", category_ar: "", category_en: "", summary_ar: "", summary_en: "", link: "", image_url: "", mobile_image_url: "", stats: [], published: true },
    fields: [
      ["sec", "العنوان والتصنيف"], ["pair", "title", "اسم المشروع"], ["pair", "category", "التصنيف (مثل: منصة حكومية)"],
      ["sec", "الوصف"], ["pairArea", "summary", "وصف مختصر"],
      ["url", "link", "رابط المشروع (اختياري)"],
      ["sec", "الصور"], ["image", "image_url", "صورة الشاشة (لوحة تحكم أو موقع) — أفقية 16:10", "projects"], ["image", "mobile_image_url", "صورة شاشة الجوال (اختياري) — عمودية", "projects"],
      ["sec", "دراسة الحالة (اختياري)"], ["note", "أقوى ما يقنع الزبون: ما المشكلة التي كانت عند العميل، وماذا بنيتم، وما النتيجة بالأرقام. تظهر في صفحة المشروع ونافذة التفاصيل كثلاث بطاقات."],
      ["pairArea", "problem", "التحدي (المشكلة قبلكم)"], ["pairArea", "solution", "الحل (ماذا بنيتم)"], ["pairArea", "result", "النتيجة (مثال: زادت الطلبات 40%)"],
      ["sec", "صفحة التفاصيل"], ["note", "تظهر عند الضغط على «عرض التفاصيل». افصل الفقرات بسطر فارغ، السطر القصير في أول الفقرة يصبح عنواناً، وابدأ النقاط بـ •"], ["pairArea", "details", "التفاصيل"],
      ["gallery", "gallery", "صور إضافية للمعرض", "projects"],
      ["sec", "أرقام المشروع"], ["stats", "stats"],
      ["sec", "النشر"], ["toggle", "published", "منشور ويظهر في الموقع"],
    ],
  },
  services: {
    one: "خدمة", empty: "لا توجد خدمات بعد.",
    title: (r) => r.title_ar || r.title_en, sub: (r) => r.summary_ar, icon: (r) => r.icon,
    blank: { icon: "web", title_ar: "", title_en: "", summary_ar: "", summary_en: "", published: true },
    fields: [["icon", "icon", "الأيقونة"], ["pair", "title", "اسم الخدمة"], ["pairArea", "summary", "الوصف المختصر (يظهر في بطاقة الخدمة)"],
      ["sec", "صفحة الخدمة"], ["note", "تظهر في صفحة الخدمة الخاصة (اعرف المزيد). افصل الفقرات بسطر فارغ، السطر القصير في أول الفقرة يصبح عنواناً، وابدأ النقاط بـ •"], ["pairArea", "details", "تفاصيل الخدمة"],
      ["toggle", "published", "منشورة"]],
  },
  testimonials: {
    one: "رأي", empty: "لا توجد آراء بعد. أضف آراء عملائك لتظهر في شريط متحرك على الموقع.",
    title: (r) => r.name, sub: (r) => r.quote_ar, thumb: (r) => r.avatar_url,
    blank: { name: "", role_ar: "", role_en: "", quote_ar: "", quote_en: "", avatar_url: "", rating: 5, published: true },
    fields: [["text", "name", "اسم العميل"], ["pair", "role", "المنصب أو الشركة"], ["pairArea", "quote", "نص الرأي"], ["rating", "rating", "التقييم"], ["image", "avatar_url", "صورة العميل (اختياري — مربعة)", "testimonials"], ["toggle", "published", "منشور"]],
  },
  partners: {
    one: "شريك", empty: "لا يوجد شركاء بعد. أضف شعارات عملائك وشركائك.",
    title: (r) => r.name, sub: (r) => r.link || "", thumb: (r) => r.logo_url, contain: true,
    blank: { name: "", logo_url: "", link: "", published: true },
    fields: [["text", "name", "اسم الشريك"], ["image", "logo_url", "الشعار (PNG شفاف أو SVG يفضّل)", "partners", true], ["url", "link", "رابط الموقع (اختياري)"], ["toggle", "published", "منشور"]],
  },
};

export async function viewList(table) {
  const E = ENTITIES[table];
  $("#topActions").innerHTML = "";
  if (table === "testimonials") {
    $("#topActions").insertAdjacentHTML("afterbegin", `<button class="b" id="reviewLink">${I.mail}رابط رأي لعميل</button>`);
    $("#reviewLink").onclick = reviewLinkDialog;
  }
  const { data, error } = await sb.from(table).select("*").order("sort").order("created_at");
  if (error) throw error;
  cache[table] = data;
  const view = $("#view");
  if (!data.length) {
    view.innerHTML = `<div class="empty">${I.img}<p>${E.empty}</p><button class="b b--primary" id="addFirst">${I.plus}إضافة ${E.one}</button></div>`;
    $("#addFirst").onclick = () => editItem(table, null); return;
  }
  view.innerHTML = `<div class="toolbar"><div class="search">${I.search}<input id="q" placeholder="بحث…"></div><button type="button" class="add-fab" id="addBtn" aria-label="إضافة ${E.one}" title="إضافة ${E.one}">${I.plus}</button></div>
    <p class="muted toolbar__hint">${data.length} عنصر · رتّب بالأسهم</p>
    <div class="items" id="items">${data.map((r, i) => {
      const th = E.thumb?.(r);
      return `<div class="item" data-id="${r.id}" data-q="${esc((E.title(r) + " " + (r.title_en || r.name || "")).toLowerCase())}">
        <div class="order"><button data-mv="-1" data-i="${i}" title="أعلى" ${i === 0 ? "disabled" : ""}>${I.up}</button><button data-mv="1" data-i="${i}" title="أسفل" ${i === data.length - 1 ? "disabled" : ""}>${I.down}</button></div>
        <div class="item__thumb ${E.contain ? "contain" : ""}" style="${th ? `background-image:url('${esc(th)}')` : ""}">${th ? "" : E.icon ? ICONS[E.icon(r)] || ICONS.code : I.img}</div>
        <div class="item__main"><b>${esc(E.title(r))}</b><span>${esc(E.sub(r))}</span></div>
        <div class="item__actions"><span class="tag ${r.published ? "" : "off"}">${r.published ? "منشور" : "مخفي"}</span>
          <button class="b b--icon b--ghost" data-pub="${r.id}" title="${r.published ? "إخفاء" : "نشر"}">${I.eye}</button>
          <button class="b b--icon b--ghost" data-edit="${r.id}" title="تعديل">${I.edit}</button>
          <button class="b b--icon b--ghost b--danger" data-del="${r.id}" title="حذف">${I.trash}</button></div></div>`;
  $("#addBtn").onclick = () => editItem(table, null);
    }).join("")}</div>`;
  $("#q").oninput = (e) => { const q = e.target.value.trim().toLowerCase(); $$(".item").forEach((it) => (it.hidden = q && !it.dataset.q.includes(q))); };
  $$("[data-edit]").forEach((b) => (b.onclick = () => editItem(table, data.find((r) => r.id === b.dataset.edit))));
  $$("[data-pub]").forEach((b) => (b.onclick = async () => {
    const r = data.find((x) => x.id === b.dataset.pub);
    const { error } = await sb.from(table).update({ published: !r.published }).eq("id", r.id);
    if (error) return toast(error.message, "err");
    publishNow(); toast(r.published ? "تم الإخفاء" : "تم النشر ✓"); viewList(table);
  }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    const r = data.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`حذف ${E.one}`, `هل تريد حذف "${E.title(r)}" نهائياً؟`, "حذف"))) return;
    const { error } = await sb.from(table).delete().eq("id", r.id);
    if (error) return toast(error.message, "err");
    publishNow(); toast("تم الحذف"); viewList(table);
  }));
  $$("[data-mv]").forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.i, j = i + +b.dataset.mv;
    const arr = [...data]; [arr[i], arr[j]] = [arr[j], arr[i]];
    const updates = arr.map((r, k) => ({ id: r.id, sort: k })).filter((u, k) => data.findIndex((r) => r.id === u.id) !== k || data[k].sort !== k);
    const results = await Promise.all(updates.map((u) => sb.from(table).update({ sort: u.sort }).eq("id", u.id)));
    const err = results.find((r) => r.error); if (err) toast(err.error.message, "err"); else publishNow();
    viewList(table);
  }));
}

export function editItem(table, row) {
  const E = ENTITIES[table];
  const rec = row ? clone(row) : clone(E.blank);
  const body = document.createElement("div"); body.className = "stack";
  const bindText = (el, key) => { el.value = rec[key] ?? ""; el.oninput = () => (rec[key] = el.value); };
  for (const [type, key, label, folder, contain] of E.fields) {
    if (type === "sec") { body.insertAdjacentHTML("beforeend", `<div class="sec-title">${key}</div>`); continue; }
    if (type === "note") { body.insertAdjacentHTML("beforeend", `<p class="muted" style="margin:-6px 0 0;font-size:13px">${key}</p>`); continue; }
    if (type === "pair" || type === "pairArea") {
      const area = type === "pairArea";
      const g = document.createElement("div"); g.className = "grid2";
      const rows = key === "details" ? 9 : 3;
      g.innerHTML = `<label class="f"><span>${label} — عربي</span>${area ? `<textarea rows=${rows}></textarea>` : "<input>"}</label><label class="f"><span>${label} — English</span>${area ? `<textarea rows=${rows} dir="ltr"></textarea>` : '<input dir="ltr">'}</label>`;
      const [a, b] = $$("input, textarea", g); bindText(a, `${key}_ar`); bindText(b, `${key}_en`);
      body.append(g);
    } else if (type === "text" || type === "url") {
      const l = document.createElement("label"); l.className = "f";
      l.innerHTML = `<span>${label}</span><input ${type === "url" ? 'type="url" dir="ltr" placeholder="https://"' : ""}>`;
      bindText($("input", l), key); body.append(l);
    } else if (type === "toggle") {
      const l = document.createElement("label"); l.className = "switch";
      l.innerHTML = `<input type="checkbox" ${rec[key] ? "checked" : ""}><i></i>${label}`;
      $("input", l).onchange = (e) => (rec[key] = e.target.checked); body.append(l);
    } else if (type === "image") {
      const d = document.createElement("div"); d.className = "f"; d.innerHTML = `<span>${label}</span>`;
      d.append(imageField(rec[key], folder, (u) => (rec[key] = u), contain)); body.append(d);
    } else if (type === "icon") {
      const d = document.createElement("div"); d.className = "f";
      d.innerHTML = `<span>${label}</span><div class="icons">${Object.keys(ICONS).map((k) => `<button type="button" data-ic="${k}" class="${rec.icon === k ? "on" : ""}" title="${k}">${ICONS[k]}</button>`).join("")}</div>`;
      $$("[data-ic]", d).forEach((b) => (b.onclick = () => { rec.icon = b.dataset.ic; $$("[data-ic]", d).forEach((x) => x.classList.toggle("on", x === b)); }));
      body.append(d);
    } else if (type === "rating") {
      const d = document.createElement("div"); d.className = "f";
      const draw = () => { d.innerHTML = `<span>${label}</span><div style="display:flex;gap:4px;font-size:28px;cursor:pointer;color:#D9A441">${[1, 2, 3, 4, 5].map((n) => `<span data-n="${n}" style="opacity:${n <= (rec.rating || 5) ? 1 : .25}">★</span>`).join("")}</div>`;
        $$("[data-n]", d).forEach((st) => (st.onclick = () => { rec.rating = +st.dataset.n; draw(); })); };
      draw(); body.append(d);
    } else if (type === "gallery") {
      const d = document.createElement("div"); d.className = "f";
      const draw = () => {
        rec.gallery = Array.isArray(rec.gallery) ? rec.gallery : [];
        d.innerHTML = `<span>${label}</span><div class="stack" style="gap:10px"></div><button type="button" class="b b--sm" style="justify-self:start">${I.plus}إضافة صورة</button>`;
        const list = $(".stack", d);
        rec.gallery.forEach((u, i) => {
          const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;align-items:center";
          row.append(imageField(u, folder, (url) => { if (url) rec.gallery[i] = url; else { rec.gallery.splice(i, 1); draw(); } }));
          list.append(row);
        });
        $("button.b--sm", d).onclick = () => { rec.gallery.push(""); draw(); };
      };
      draw(); body.append(d);
    } else if (type === "stats") {
      const d = document.createElement("div");
      const draw = () => {
        d.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 8px">أرقام تظهر تحت وصف المشروع (مثل: 1,500+ جهة مستفيدة)</p><div class="stats-rep">${(rec.stats || []).map((s, i) => `<div class="stats-rep__row">
          <input data-i="${i}" data-k="value" value="${esc(s.value)}" placeholder="الرقم" dir="ltr"><input data-i="${i}" data-k="label_ar" value="${esc(s.label_ar)}" placeholder="الوصف بالعربي">
          <input data-i="${i}" data-k="label_en" value="${esc(s.label_en)}" placeholder="English" dir="ltr"><button type="button" class="b b--icon b--ghost b--danger" data-rm="${i}">${I.trash}</button></div>`).join("")}</div>
          <button type="button" class="b b--sm" data-add style="margin-top:8px">${I.plus}إضافة رقم</button>`;
        $$("input", d).forEach((el) => { el.style.cssText = "height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0"; el.oninput = () => (rec.stats[el.dataset.i][el.dataset.k] = el.value); });
        $$("[data-rm]", d).forEach((b) => (b.onclick = () => { rec.stats.splice(+b.dataset.rm, 1); draw(); }));
        $("[data-add]", d).onclick = () => { (rec.stats ||= []).push({ value: "", label_ar: "", label_en: "" }); draw(); };
      };
      draw(); body.append(d);
    }
  }
  const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
  foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--primary" data-save>${I.save}${row ? "حفظ التعديلات" : `إضافة ${E.one}`}</button>`;
  openModal(row ? `تعديل ${E.one}` : `إضافة ${E.one}`, body, foot);
  $("[data-save]", foot).onclick = async (e) => {
    const name = E.title(rec);
    if (!name || name === "بدون عنوان") return toast("يرجى كتابة الاسم/العنوان أولاً", "err");
    const saveBtn = e.currentTarget; saveBtn.disabled = true;
    const { id, created_at, ...payload } = rec;
    if (payload.stats) payload.stats = payload.stats.filter((s) => String(s.value).trim());
    if (payload.gallery) payload.gallery = payload.gallery.filter(Boolean);
    let res;
    if (row) res = await sb.from(table).update(payload).eq("id", row.id);
    else res = await sb.from(table).insert({ ...payload, sort: (cache[table]?.length || 0) });
    saveBtn.disabled = false;
    if (res.error) return toast(`فشل الحفظ: ${res.error.message}`, "err");
    publishNow(); closeModal(); toast(row ? "تم حفظ التعديلات ✓" : `تمت إضافة ${E.one} ✓`); viewList(table);
  };
}

// A one-time link the owner sends to a client; the review arrives hidden until it is published here.
function reviewLinkDialog() {
  const body = document.createElement("div"); body.className = "stack";
  body.innerHTML = `<p class="muted" style="margin:0">أنشئ رابطاً خاصاً وأرسله لعميلك. يكتب رأيه وتقييمه، ويصلك تنبيه بالبريد، ويظهر هنا <b>مخفياً</b> حتى تضغط «نشر». الرابط يعمل مرة واحدة ولمدة 60 يوماً.</p>
    <div class="grid2"><label class="f"><span>اسم العميل (اختياري — يظهر جاهزاً في النموذج)</span><input id="rlName"></label>
    <label class="f"><span>لغة الصفحة</span><select id="rlLang"><option value="ar">العربية</option><option value="en">English</option></select></label></div>
    <button class="b b--primary" id="rlMake" style="justify-self:start">إنشاء الرابط</button>
    <div id="rlOut" hidden class="stack" style="gap:8px"><input id="rlUrl" readonly dir="ltr">
      <div style="display:flex;flex-wrap:wrap;gap:8px"><button class="b b--sm" id="rlCopy">نسخ الرابط</button><a class="b b--sm" id="rlWa" target="_blank" rel="noopener">إرسال عبر واتساب</a></div></div>`;
  openModal("رابط رأي لعميل", body, "", true);
  $("#rlMake").onclick = async (e) => {
    const btn = e.currentTarget; // the event's target is gone once the request returns
    btn.disabled = true;
    try {
      const r = await adminApi("review-link", "POST", { name: $("#rlName").value.trim(), lang: $("#rlLang").value });
      $("#rlUrl").value = r.url; $("#rlOut").hidden = false;
      const msg = $("#rlLang").value === "en" ? `Thank you for working with WIXA! We'd love your feedback: ${r.url}` : `شكراً لثقتك بويكسا! يسعدنا أن تكتب رأيك في تجربتك معنا من هنا: ${r.url}`;
      $("#rlWa").href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    } catch { toast("تعذّر إنشاء الرابط", "err"); }
    finally { btn.disabled = false; }
  };
  $("#rlCopy").onclick = async () => { try { await navigator.clipboard.writeText($("#rlUrl").value); toast("تم النسخ ✓"); } catch { $("#rlUrl").select(); } };
}

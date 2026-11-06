/* WIXA admin dashboard */
const { DEFAULTS, FONTS, merge, ICONS } = window.WIXA;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => structuredClone(o);
const fmt = (n) => Number(n || 0).toLocaleString("en");

let sb, user, settings, savedJSON;
const cache = {};

// ---------------- boot ----------------
// links from Supabase emails (password reset, email change) land here with details in the URL hash
const LINK = (() => {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  return { recovery: h.get("type") === "recovery" || q.get("type") === "recovery", emailChange: h.get("type") === "email_change",
    message: h.get("message"), error: h.get("error_description") || q.get("error_description") };
})();

(async function boot() {
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    window.WIXA.markEnv(cfg.env);
    if (cfg.env === "staging") document.title = `[تجريبي] ${document.title}`;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch (e) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center">تعذّر الاتصال بالخادم. حدّث الصفحة.</p>';
    return;
  }
  sb.auth.onAuthStateChange((evt) => {
    if (evt === "PASSWORD_RECOVERY") { LINK.recovery = true; showAuth("reset"); }
    else if (evt === "SIGNED_OUT") showAuth();
  });
  const { data } = await sb.auth.getSession();
  if (LINK.message || LINK.emailChange || LINK.error) history.replaceState(null, "", location.pathname);
  if (LINK.recovery && data.session) return showAuth("reset");
  if (data.session) await afterSignIn(data.session.user); else showAuth();
  if (LINK.error) authMsg(/expired|invalid/i.test(LINK.error) ? "انتهت صلاحية الرابط. اطلب رابطاً جديداً." : LINK.error, "err");
  if (LINK.message) toast("تم قبول الرابط. أكّد أيضاً الرابط المرسل إلى البريد الآخر لإتمام التغيير.");
  if (LINK.emailChange) toast("تم تغيير البريد الإلكتروني ✓");
})();

// ---------------- auth ----------------
// modes: login · forgot (send reset link) · reset (set a new password from the link) · mfa (6-digit code)
const authMsg = (text, type = "") => { const m = $("#authMsg"); m.className = `auth__msg ${type}`; m.textContent = text; };
const needsCode = async () => { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return data?.nextLevel === "aal2" && data.currentLevel !== "aal2"; };
async function verifyCode(code) {
  const { data } = await sb.auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === "verified");
  if (!f) throw new Error("no factor");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.replace(/\s/g, "") });
  if (error) throw new Error("bad code");
}
const codeField = `<label class="f"><span>رمز التحقق من تطبيق المصادقة</span><input name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code" dir="ltr" placeholder="000000"></label>`;

async function showAuth(mode = "login") {
  user = null;
  $("#app").hidden = true; $("#auth").hidden = false;
  const form = $("#authForm"), sw = $("#authSwitch");
  const withCode = mode === "reset" && (await needsCode().catch(() => false));
  const M = {
    login: ["تسجيل الدخول", "أدخل بريدك وكلمة المرور للدخول إلى لوحة التحكم.", "دخول", "نسيت كلمة المرور؟",
      `<label class="f"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
       <label class="f"><span>كلمة المرور</span><input name="password" type="password" required minlength="8" autocomplete="current-password" dir="ltr"></label>`],
    forgot: ["استعادة كلمة المرور", "أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.", "إرسال الرابط", "رجوع لتسجيل الدخول",
      `<label class="f"><span>البريد الإلكتروني</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>`],
    reset: ["كلمة مرور جديدة", "اختر كلمة مرور قوية (8 أحرف على الأقل).", "حفظ والدخول", "إلغاء",
      `<label class="f"><span>كلمة المرور الجديدة</span><input name="p1" type="password" required minlength="8" autocomplete="new-password" dir="ltr"></label>
       <label class="f"><span>تأكيد كلمة المرور</span><input name="p2" type="password" required minlength="8" autocomplete="new-password" dir="ltr"></label>${withCode ? codeField : ""}`],
    mfa: ["التحقق بخطوتين", "افتح تطبيق المصادقة في هاتفك وأدخل الرمز المكوّن من 6 أرقام.", "تحقق", "تسجيل الخروج", codeField],
  }[mode];
  $("#authTitle").textContent = M[0]; $("#authHint").textContent = M[1];
  $("#authSubmit").textContent = M[2]; sw.textContent = M[3];
  $("#authFields").innerHTML = M[4];
  authMsg("");
  setTimeout(() => $("#authFields input")?.focus(), 30);
  sw.onclick = async () => {
    if (mode === "login") return showAuth("forgot");
    if (mode === "forgot") return showAuth("login");
    await sb.auth.signOut(); showAuth("login");
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const v = (n) => form.elements[n]?.value || "";
    $("#authSubmit").disabled = true; authMsg("لحظة…");
    try {
      if (mode === "login") {
        const { data, error } = await sb.auth.signInWithPassword({ email: v("email").trim(), password: v("password") });
        if (error) throw error;
        await afterSignIn(data.user);
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(v("email").trim(), { redirectTo: `${location.origin}/admin/` });
        if (error) throw error;
        authMsg("إذا كان البريد مسجّلاً فسيصلك رابط خلال دقائق. افتحه من نفس الجهاز.", "ok");
      } else if (mode === "reset") {
        if (v("p1") !== v("p2")) throw new Error("mismatch");
        if (withCode) await verifyCode(v("code"));
        const { data, error } = await sb.auth.updateUser({ password: v("p1") });
        if (error) throw error;
        LINK.recovery = false;
        toast("تم تعيين كلمة المرور الجديدة ✓");
        await afterSignIn(data.user);
      } else if (mode === "mfa") {
        await verifyCode(v("code"));
        const { data } = await sb.auth.getUser();
        await enter(data.user);
      }
    } catch (err) {
      const t = err.message || "";
      authMsg(/Invalid login/i.test(t) ? "البريد أو كلمة المرور غير صحيحة."
        : /not confirmed/i.test(t) ? "لم يتم تأكيد البريد بعد. افتح رسالة التأكيد في بريدك."
        : /bad code|invalid totp|code/i.test(t) ? "الرمز غير صحيح أو انتهت مدته. جرّب الرمز الحالي."
        : t === "mismatch" ? "كلمتا المرور غير متطابقتين."
        : /rate limit|too many|seconds/i.test(t) ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة."
        : /same.*password|different from the old/i.test(t) ? "اختر كلمة مرور مختلفة عن السابقة."
        : t, "err");
    } finally { $("#authSubmit").disabled = false; }
  };
}

// after a password sign-in: ask for the 2FA code when the account has it turned on
async function afterSignIn(u) {
  if (await needsCode().catch(() => false)) return showAuth("mfa");
  await enter(u);
}

async function enter(u) {
  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error || !isAdmin) {
    await sb.auth.signOut();
    showAuth();
    const msg = $("#authMsg"); msg.className = "auth__msg err";
    msg.textContent = "هذا الحساب ليس لديه صلاحية المدير.";
    return;
  }
  user = u;
  $("#auth").hidden = true; $("#app").hidden = false;
  await loadSettings();
  setupShell();
  route();
  refreshMsgCount();
}

// ---------------- shell / router ----------------
const VIEWS = {
  overview: { title: "نظرة عامة", sub: "زوار الموقع ونشاطه", render: viewOverview },
  appearance: { title: "المظهر والخطوط", sub: "الألوان ونوع الخط وحجمه والحركة — مع معاينة مباشرة", render: viewAppearance },
  content: { title: "المحتوى والنصوص", sub: "نصوص الموقع بالعربي والإنجليزي، الأرقام، الأقسام وبيانات التواصل", render: viewContent },
  projects: { title: "المشاريع", sub: "أضف مشاريعك واعرضها في قسم الإنجازات", render: () => viewList("projects") },
  services: { title: "الخدمات", sub: "الخدمات التي تظهر في الموقع", render: () => viewList("services") },
  partners: { title: "الشركاء", sub: "شعارات العملاء والشركاء", render: () => viewList("partners") },
  testimonials: { title: "آراء العملاء", sub: "بطاقات الآراء المتحركة في الموقع", render: () => viewList("testimonials") },
  messages: { title: "الرسائل", sub: "رسائل نموذج التواصل", render: viewMessages },
  account: { title: "الحساب", sub: "بيانات الدخول والأمان", render: viewAccount },
};
let current = null;

function setupShell() {
  if (setupShell.done) return; setupShell.done = true;
  addEventListener("hashchange", route);
  const side = $("#side"), scrim = $("#scrim");
  const close = () => { side.classList.remove("open"); scrim.classList.remove("open"); };
  $("#menuBtn").onclick = () => { side.classList.add("open"); scrim.classList.add("open"); };
  scrim.onclick = close;
  $$("#sideNav a").forEach((a) => a.addEventListener("click", close));
  addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
}

async function route() {
  const name = location.hash.slice(1) || "overview";
  const v = VIEWS[name] || VIEWS.overview;
  if (current && ["appearance", "content"].includes(current) && !["appearance", "content"].includes(name) && isDirty()) {
    if (!(await confirmBox("لديك تغييرات غير محفوظة", "هل تريد المغادرة دون حفظ؟", "مغادرة"))) { history.replaceState(null, "", `#${current}`); return; }
    settings = merge(DEFAULTS, JSON.parse(savedJSON));
  }
  current = VIEWS[name] ? name : "overview";
  $$("#sideNav a").forEach((a) => a.classList.toggle("on", a.dataset.view === current));
  $("#viewTitle").textContent = v.title; $("#viewSub").textContent = v.sub;
  $("#topActions").innerHTML = "";
  const view = $("#view");
  view.style.animation = "none"; view.offsetHeight; view.style.animation = "";
  view.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  try { await v.render(view); } catch (e) { console.error(e); view.innerHTML = `<div class="empty">حدث خطأ: ${esc(e.message)}</div>`; }
}

// ---------------- helpers ----------------
function toast(text, type = "") {
  const t = document.createElement("div"); t.className = `toast ${type}`; t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, 2800);
}
function openModal(title, body, foot, small = false) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = ""; $("#modalFoot").innerHTML = "";
  if (typeof body === "string") $("#modalBody").innerHTML = body; else $("#modalBody").append(body);
  if (typeof foot === "string") $("#modalFoot").innerHTML = foot; else if (foot) $("#modalFoot").append(foot);
  $(".modal__box").classList.toggle("sm", small);
  $("#modal").hidden = false;
  setTimeout(() => $("#modalBody input, #modalBody textarea")?.focus(), 50);
}
function closeModal() { $("#modal").hidden = true; }
function confirmBox(title, text, okLabel = "تأكيد", danger = true) {
  return new Promise((resolve) => {
    openModal(title, `<p style="margin:0">${esc(text)}</p>`, `<button class="b" data-x>إلغاء</button><button class="b ${danger ? "b--danger" : "b--primary"}" data-ok>${esc(okLabel)}</button>`, true);
    const done = (v) => { closeModal(); resolve(v); };
    $("#modalFoot [data-x]").onclick = () => done(false);
    $("#modalFoot [data-ok]").onclick = () => done(true);
    $(".modal [data-close]").onclick = () => done(false);
  });
}
const icon = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const I = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'), edit: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  up: icon('<path d="M6 15l6-6 6 6"/>'), down: icon('<path d="M6 9l6 6 6-6"/>'), eye: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  save: icon('<path d="M5 13l4 4L19 7"/>'), upload: icon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'), x: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'), img: icon('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  users: icon('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 010 8M22 21c0-3-2-5.5-4-6.5"/>'), views: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  mail: icon('<path d="M4 5h16v14H4z"/><path d="M4 6l8 7 8-7"/>'), reset: icon('<path d="M4 4v6h6M4 10a8 8 0 112 6"/>'), out: icon('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
};

// ---------------- settings ----------------
async function loadSettings() {
  const { data, error } = await sb.from("site_settings").select("data").eq("id", 1).maybeSingle();
  if (error) toast("تعذّر تحميل الإعدادات", "err");
  settings = merge(DEFAULTS, data?.data || {});
  savedJSON = JSON.stringify(settings);
}
const isDirty = () => settings && JSON.stringify(settings) !== savedJSON;
async function saveSettings() {
  const btn = $("#saveBtn"); if (btn) btn.disabled = true;
  const { error } = await sb.from("site_settings").upsert({ id: 1, data: settings, updated_at: new Date().toISOString() });
  if (btn) btn.disabled = false;
  if (error) { toast(`فشل الحفظ: ${error.message}`, "err"); return; }
  savedJSON = JSON.stringify(settings);
  markDirty(); toast("تم الحفظ ونُشرت التغييرات على الموقع ✓");
}
function markDirty() {
  const d = $("#dirtyFlag"); if (d) d.hidden = !isDirty();
  const b = $("#saveBtn"); if (b) b.disabled = !isDirty();
  const r = $("#revertBtn"); if (r) r.disabled = !isDirty();
}
function settingsActions() {
  $("#topActions").innerHTML = `<span class="dirty" id="dirtyFlag" hidden>تغييرات غير محفوظة</span>
    <button class="b" id="revertBtn" disabled>${I.reset}تراجع</button>
    <button class="b b--primary" id="saveBtn" disabled>${I.save}حفظ ونشر</button>`;
  $("#saveBtn").onclick = saveSettings;
  $("#revertBtn").onclick = () => { settings = merge(DEFAULTS, JSON.parse(savedJSON)); route(); };
  markDirty();
}
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, val) { const ks = path.split("."); const last = ks.pop(); const t = ks.reduce((o, k) => (o[k] ??= {}), obj); t[last] = val; }

// ---------------- preview ----------------
let previewLang = "ar", previewTimer;
function previewPane() {
  return `<div class="preview" id="preview">
    <div class="preview__bar"><b>معاينة مباشرة</b>
      <div style="display:flex;gap:6px">
        <div class="seg" id="pvLang"><button data-v="ar" class="${previewLang === "ar" ? "on" : ""}">ع</button><button data-v="en" class="${previewLang === "en" ? "on" : ""}">EN</button></div>
        <div class="seg" id="pvDev"><button data-v="desk" class="on">سطح المكتب</button><button data-v="mob">جوال</button></div>
      </div></div>
    <div class="preview__stage"><iframe id="pvFrame" src="/?preview=1" title="معاينة"></iframe></div></div>`;
}
function bindPreview() {
  const frame = $("#pvFrame");
  if (!bindPreview.listening) { addEventListener("message", onPreviewMsg); bindPreview.listening = true; }
  $$("#pvDev button").forEach((b) => (b.onclick = () => { $$("#pvDev button").forEach((x) => x.classList.toggle("on", x === b)); $("#preview").classList.toggle("mobile", b.dataset.v === "mob"); fitPreview(); }));
  new ResizeObserver(fitPreview).observe($(".preview__stage"));
  fitPreview();
  $$("#pvLang button").forEach((b) => (b.onclick = () => { previewLang = b.dataset.v; $$("#pvLang button").forEach((x) => x.classList.toggle("on", x === b)); pushPreview(true); }));
  frame.addEventListener("load", () => pushPreview(true));
}
// Render the real desktop (1280px) or phone (390px) layout and scale it down to fit the pane.
function fitPreview() {
  const st = $(".preview__stage"), fr = $("#pvFrame"); if (!st || !fr) return;
  const mob = $("#preview").classList.contains("mobile");
  const W = mob ? 390 : 1280, H = st.clientHeight;
  const s = Math.min(1, (st.clientWidth - (mob ? 24 : 0)) / W, mob ? (H - 24) / 844 : 1);
  fr.style.width = `${W}px`;
  fr.style.height = `${mob ? 844 : H / s}px`;
  fr.style.transform = `scale(${s})`;
  fr.style.left = `${(st.clientWidth - W * s) / 2}px`;
  fr.style.top = mob ? `${(H - 844 * s) / 2}px` : "0px";
}
function onPreviewMsg(e) { if (e.origin === location.origin && e.data?.type === "wixa-preview-ready") pushPreview(true); }
function pushPreview(now) {
  clearTimeout(previewTimer);
  const send = () => $("#pvFrame")?.contentWindow?.postMessage({ type: "wixa-preview", payload: { settings, lang: previewLang } }, location.origin);
  now ? send() : (previewTimer = setTimeout(send, 120));
}
function changed() { markDirty(); pushPreview(); }

// ---------------- view: overview ----------------
let period = 30;
async function viewOverview(view) {
  $("#topActions").innerHTML = `<div class="seg" id="period">${[7, 30, 90].map((d) => `<button data-d="${d}" class="${d === period ? "on" : ""}">${d} يوم</button>`).join("")}</div>`;
  $$("#period button").forEach((b) => (b.onclick = () => { period = +b.dataset.d; route(); }));
  let s;
  try {
    const { data: ses } = await sb.auth.getSession();
    const r = await fetch(`/api/admin/stats?days=${period}`, { headers: { authorization: `Bearer ${ses.session?.access_token || ""}` } });
    if (!r.ok) throw new Error(r.status);
    s = await r.json();
  } catch (e) {
    // fallback: the older in-database counter
    const { data, error } = await sb.rpc("admin_stats", { days: period });
    if (error) throw error;
    s = { ...data, source: "database", views_90d: data.all_time_views };
  }
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
      ${kpi("رسائل جديدة", s.messages_new, `<a href="#messages" style="color:var(--brand)">عرض الرسائل ←</a>`, I.mail)}
    </div>
    <div class="two">
      <div class="card"><div class="card__head"><div><h3>الزيارات اليومية</h3><p>آخر ${period} يوم</p></div><div class="legend"><span><i></i>مشاهدات</span><span><i class="u"></i>زيارات</span></div></div><div id="chart"></div></div>
      <div class="card"><div class="card__head"><h3>الأجهزة</h3></div>${bars(s.devices, (r) => DEV[r.label] || r.label)}
        <div class="card__head" style="margin-top:22px"><h3>الدول</h3></div>${bars(s.countries, (r) => flag(r.label) + r.label)}</div>
    </div>
    <div class="twohalf">
      <div class="card"><div class="card__head"><h3>أكثر الصفحات زيارة</h3></div>${bars(s.top_pages)}</div>
      <div class="card"><div class="card__head"><h3>مصادر الزيارات</h3><p>المواقع التي جاء منها الزوار</p></div>${bars(s.referrers)}</div>
    </div>`;
  drawChart($("#chart"), s.by_day || []);
}

function drawChart(el, rows) {
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
    <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#570622" stop-opacity=".2"/><stop offset="1" stop-color="#570622" stop-opacity="0"/></linearGradient></defs>
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

// ---------------- view: appearance ----------------
const PRESETS = [
  { name: "ويكسا تقني", theme: { primary: "#570622", primaryInk: "#FFFFFF", accent: "#1FC8E3", bg: "#F7F6F8", surface: "#FFFFFF", text: "#140C12", muted: "#665C64", dark: "#12070C" } },
  { name: "هوية ويكسا", theme: { primary: "#570622", primaryInk: "#FFFFFF", accent: "#D9A441", bg: "#FAF7F6", surface: "#FFFFFF", text: "#1A0E12", muted: "#6E5F64", dark: "#2A0711" } },
  { name: "أزرق", theme: { primary: "#1F5BFF", primaryInk: "#FFFFFF", accent: "#FFC83D", bg: "#F5F7FB", surface: "#FFFFFF", text: "#0B1220", muted: "#5E6878", dark: "#0B1220" } },
  { name: "زمردي", theme: { primary: "#0E9F6E", primaryInk: "#FFFFFF", accent: "#F5B83D", bg: "#F4F8F6", surface: "#FFFFFF", text: "#0C1A14", muted: "#5B6B63", dark: "#0C1A14" } },
  { name: "بنفسجي", theme: { primary: "#6D4AFF", primaryInk: "#FFFFFF", accent: "#FF8AB3", bg: "#F7F6FC", surface: "#FFFFFF", text: "#141127", muted: "#655F7A", dark: "#141127" } },
  { name: "غروب", theme: { primary: "#F2542D", primaryInk: "#FFFFFF", accent: "#1F2A44", bg: "#FBF7F2", surface: "#FFFFFF", text: "#1D1A16", muted: "#6E665C", dark: "#1D1A16" } },
  { name: "ذهبي فاخر", theme: { primary: "#B08D57", primaryInk: "#0E0E0E", accent: "#E9D8B4", bg: "#F7F4EE", surface: "#FFFFFF", text: "#151310", muted: "#6F685D", dark: "#151310" } },
  { name: "ليلي", theme: { primary: "#4F8CFF", primaryInk: "#FFFFFF", accent: "#22D3EE", bg: "#0B1020", surface: "#121A30", text: "#E8ECF6", muted: "#93A0BC", dark: "#050814" } },
];
const COLOR_FIELDS = [
  ["primary", "اللون الرئيسي", "الأزرار والعناوين المميزة"], ["primaryInk", "نص الأزرار", "لون الكتابة فوق اللون الرئيسي"],
  ["accent", "لون التمييز", "الأرقام والإشارات"], ["bg", "الخلفية", "خلفية الصفحة"],
  ["surface", "البطاقات", "خلفية البطاقات والنماذج"], ["text", "النص", "لون الكتابة الأساسي"],
  ["muted", "النص الثانوي", "الأوصاف والتفاصيل"], ["dark", "القسم الداكن", "خلفية قسم الأرقام"],
];

async function viewAppearance(view) {
  settingsActions();
  const t = settings.theme, f = settings.font;
  view.innerHTML = `<div class="split">
    <div>
      <div class="card"><div class="card__head"><div><h3>قوالب ألوان جاهزة</h3><p>اختر قالباً ثم عدّل عليه كما تحب</p></div></div>
        <div class="presets">${PRESETS.map((p, i) => `<button class="preset" data-p="${i}"><i style="background:linear-gradient(135deg,${p.theme.primary} 50%,${p.theme.accent} 50%)"></i>${p.name}</button>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>الألوان</h3><p>كل لون في الموقع قابل للتغيير</p></div></div>
        <div class="colors">${COLOR_FIELDS.map(([k, label, hint]) => `<label class="color"><input type="color" data-color="${k}" value="${esc(t[k])}"><div><b style="font-size:13px">${label}</b><span>${hint}</span></div><input type="text" data-hex="${k}" value="${esc(t[k])}" maxlength="7" spellcheck="false"></label>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>نوع الخط</h3><p>خطوط عربية احترافية من Google Fonts</p></div></div>
        <div class="fonts">${Object.keys(FONTS).map((name) => `<button class="font-opt ${name === f.family ? "on" : ""}" data-font="${esc(name)}"><b style="font-family:'${esc(name)}'">ويكسا Wixa</b><span>${esc(name)}</span></button>`).join("")}</div></div>
      <div class="card"><div class="card__head"><div><h3>حجم الخط والشكل</h3></div></div>
        <div class="stack">
          <label class="f"><span>حجم الخط العام</span><div class="range-row"><input type="range" min="80" max="130" step="5" id="scale" value="${Math.round(f.scale * 100)}"><output id="scaleOut">${Math.round(f.scale * 100)}%</output></div></label>
          <label class="f"><span>سماكة العناوين</span><div class="range-row"><input type="range" min="400" max="800" step="100" id="hw" value="${f.headingWeight}"><output id="hwOut">${f.headingWeight}</output></div></label>
          <label class="f"><span>استدارة الزوايا</span><div class="range-row"><input type="range" min="0" max="36" step="2" id="radius" value="${t.radius}"><output id="radiusOut">${t.radius}px</output></div></label>
          <label class="switch"><input type="checkbox" id="anim" ${settings.animations !== false ? "checked" : ""}><i></i>تفعيل الحركات والتأثيرات</label>
          <label class="f"><span>الوضع الافتراضي للزائر الجديد (يستطيع الزائر تغييره من زر 🌙)</span>
            <div class="seg" id="modeSeg">${[["auto", "حسب جهاز الزائر"], ["light", "فاتح"], ["dark", "ليلي"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(settings.mode || "auto") === v ? "on" : ""}">${l}</button>`).join("")}</div></label>
        </div></div>
      <div class="card"><div class="card__head"><div><h3>إعادة الضبط</h3><p>استرجاع الألوان والخط الافتراضية</p></div><button class="b b--danger b--sm" id="resetTheme">${I.reset}إعادة الافتراضي</button></div></div>
    </div>
    ${previewPane()}
  </div>`;
  bindPreview();

  const setColor = (k, v) => {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return;
    settings.theme[k] = v.toUpperCase();
    $(`[data-color="${k}"]`).value = v; $(`[data-hex="${k}"]`).value = v.toUpperCase();
    changed();
  };
  $$("[data-color]").forEach((i) => (i.oninput = () => setColor(i.dataset.color, i.value)));
  $$("[data-hex]").forEach((i) => (i.oninput = () => setColor(i.dataset.hex, i.value.startsWith("#") ? i.value : `#${i.value}`)));
  $$("[data-p]").forEach((b) => (b.onclick = () => {
    const pr = PRESETS[b.dataset.p];
    Object.entries(pr.theme).forEach(([k, v]) => setColor(k, v));
    if (pr.mode) { settings.mode = pr.mode; $$("#modeSeg button").forEach((x) => x.classList.toggle("on", x.dataset.v === pr.mode)); changed(); }
  }));
  $$("[data-font]").forEach((b) => {
    window.WIXA.loadFont && loadPreviewFont(b.dataset.font);
    b.onclick = () => { settings.font.family = b.dataset.font; $$("[data-font]").forEach((x) => x.classList.toggle("on", x === b)); changed(); };
  });
  const range = (id, fn, out) => { const el = $(`#${id}`); el.oninput = () => { fn(+el.value); $(`#${id}Out`).textContent = out(+el.value); changed(); }; };
  range("scale", (v) => (settings.font.scale = v / 100), (v) => `${v}%`);
  range("hw", (v) => (settings.font.headingWeight = v), (v) => v);
  range("radius", (v) => (settings.theme.radius = v), (v) => `${v}px`);
  $("#anim").onchange = (e) => { settings.animations = e.target.checked; changed(); };
  $$("#modeSeg button").forEach((b) => (b.onclick = () => { settings.mode = b.dataset.v; $$("#modeSeg button").forEach((x) => x.classList.toggle("on", x === b)); changed(); }));
  $("#resetTheme").onclick = async () => {
    if (!(await confirmBox("إعادة الافتراضي", "سيتم استرجاع الألوان والخط الافتراضية (لن يُحفظ حتى تضغط حفظ).", "استرجاع", false))) return;
    settings.theme = clone(DEFAULTS.theme); settings.font = clone(DEFAULTS.font); settings.animations = true; route();
  };
}
const loadedFonts = new Set();
function loadPreviewFont(name) {
  if (loadedFonts.has(name)) return; loadedFonts.add(name);
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@700&display=swap&text=${encodeURIComponent("ويكسا Wixa")}`;
  document.head.append(l);
}

// ---------------- view: content ----------------
let contentTab = "texts", contentLang = "ar";
const TEXT_FIELDS = [
  ["القسم الرئيسي (أعلى الصفحة)", [["hero_badge", "الشارة الصغيرة"], ["hero_title", "العنوان الرئيسي"], ["hero_sub", "الوصف", true], ["hero_cta", "زر 1"], ["hero_cta2", "زر 2"]]],
  ["قسم الإنجازات", [["projects_title", "العنوان"], ["projects_sub", "الوصف", true]]],
  ["قسم الخدمات", [["services_title", "العنوان"], ["services_sub", "الوصف", true]]],
  ["قسم كيف نعمل", [["process_title", "العنوان"], ["process_sub", "الوصف", true]]],
  ["قسم الأرقام", [["stats_title", "العنوان"]]],
  ["قسم آراء العملاء", [["testimonials_title", "العنوان"], ["testimonials_sub", "الوصف", true]]],
  ["حاسبة التكلفة", [["calc_title", "العنوان"], ["calc_sub", "الوصف", true], ["calc_type", "عنوان نوع المشروع"], ["calc_features", "عنوان الميزات"], ["calc_speed", "عنوان المدة"], ["calc_normal", "مدة عادية"], ["calc_rush", "مدة مستعجلة"], ["calc_result", "عنوان النتيجة"], ["calc_note", "الملاحظة", true], ["calc_cta", "نص الزر"]]],
  ["تفاصيل المشاريع", [["details", "زر عرض التفاصيل"], ["similar", "زر طلب مشروع مشابه"]]],
  ["قسم الشركاء", [["partners_title", "العنوان"], ["partners_sub", "الوصف", true]]],
  ["قسم التواصل", [["cta_title", "العنوان"], ["cta_sub", "الوصف", true], ["cta_button", "نص الزر"]]],
  ["التذييل", [["footer_text", "النص"]]],
];

async function viewContent(view) {
  settingsActions();
  const tabs = [["texts", "النصوص"], ["story", "القصة (المميزات)"], ["process", "خطوات العمل"], ["stats", "الأرقام"], ["calc", "حاسبة التكلفة"], ["sections", "إظهار الأقسام"], ["brand", "الهوية"], ["contact", "التواصل"]];
  view.innerHTML = `<div class="split"><div><div class="card">
      <div class="tabs" id="ctTabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === contentTab ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="ctBody"></div></div></div>${previewPane()}</div>`;
  bindPreview();
  $$("#ctTabs button").forEach((b) => (b.onclick = () => { contentTab = b.dataset.k; $$("#ctTabs button").forEach((x) => x.classList.toggle("on", x === b)); renderContentTab(); }));
  renderContentTab();
}

function langSeg() {
  return `<div class="seg" id="ctLang" style="margin-bottom:14px"><button data-v="ar" class="${contentLang === "ar" ? "on" : ""}">العربية</button><button data-v="en" class="${contentLang === "en" ? "on" : ""}">English</button></div>`;
}
function bindLangSeg() {
  $$("#ctLang button").forEach((b) => (b.onclick = () => {
    contentLang = b.dataset.v; previewLang = contentLang;
    $$("#pvLang button").forEach((x) => x.classList.toggle("on", x.dataset.v === previewLang)); pushPreview(true); renderContentTab();
  }));
}
function bindPathInputs(root) {
  $$("[data-path]", root).forEach((el) => {
    const ev = el.type === "checkbox" ? "change" : "input";
    el.addEventListener(ev, () => { setPath(settings, el.dataset.path, el.type === "checkbox" ? el.checked : el.value); changed(); });
  });
}
function renderContentTab() {
  const body = $("#ctBody"), L = contentLang, dir = L === "ar" ? "rtl" : "ltr";
  const input = (path, label, area = false, attrs = "") => {
    const v = esc(getPath(settings, path) ?? "");
    return `<label class="f"><span>${label}</span>${area ? `<textarea data-path="${path}" rows="3" ${attrs}>${v}</textarea>` : `<input data-path="${path}" value="${v}" ${attrs}>`}</label>`;
  };
  if (contentTab === "texts") {
    body.innerHTML = langSeg() + `<div class="stack">${TEXT_FIELDS.map(([title, fields]) => `<div class="sec-title">${title}</div>${fields.map(([k, l, a]) => input(`content.${L}.${k}`, l, a, `dir="${dir}"`)).join("")}`).join("")}</div>`;
    bindLangSeg();
  } else if (contentTab === "story") {
    const items = settings.content[L].story;
    body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">ثلاث بطاقات تظهر تحت القسم الرئيسي مع رسوم متحركة.</p><div class="stack">${items.map((_, i) => `<div class="sec-title">البطاقة ${i + 1}</div>${input(`content.${L}.story.${i}.title`, "العنوان", false, `dir="${dir}"`)}${input(`content.${L}.story.${i}.text`, "النص", true, `dir="${dir}"`)}`).join("")}</div>`;
    bindLangSeg();
  } else if (contentTab === "stats") {
    const draw = () => {
      body.innerHTML = `<p class="muted" style="margin-top:0">الأرقام التي تظهر في القسم الداكن مع عدّاد متحرك.</p>
        <div class="stats-rep">${settings.stats.map((s, i) => `<div class="stats-rep__row wide">
          <input class="fi" data-i="${i}" data-k="value" type="number" value="${esc(s.value)}" placeholder="الرقم">
          <input class="fi" data-i="${i}" data-k="suffix" value="${esc(s.suffix)}" placeholder="+ أو %" dir="ltr">
          <input class="fi" data-i="${i}" data-k="label_ar" value="${esc(s.label_ar)}" placeholder="الوصف بالعربي">
          <input class="fi" data-i="${i}" data-k="label_en" value="${esc(s.label_en)}" placeholder="English label" dir="ltr">
          <button class="b b--icon b--ghost b--danger" data-del="${i}" title="حذف">${I.trash}</button></div>`).join("")}</div>
        <button class="b b--sm" id="addStat" style="margin-top:12px">${I.plus}إضافة رقم</button>`;
      $$(".fi", body).forEach((el) => { el.classList.add("f"); el.style.cssText = "height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0"; el.oninput = () => { settings.stats[el.dataset.i][el.dataset.k] = el.dataset.k === "value" ? Number(el.value) : el.value; changed(); }; });
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { settings.stats.splice(+b.dataset.del, 1); changed(); draw(); }));
      $("#addStat").onclick = () => { settings.stats.push({ value: 0, suffix: "+", label_ar: "", label_en: "" }); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "process") {
    const draw = () => {
      const items = settings.content[L].process || (settings.content[L].process = []);
      body.innerHTML = langSeg() + `<p class="muted" style="margin-top:0">خطوات تضيء واحدة تلو الأخرى مع التمرير. يُفضّل 3 إلى 5 خطوات.</p><div class="stack">${items.map((_, i) => `<div class="sec-title">الخطوة ${i + 1} <button class="b b--sm b--ghost b--danger" data-del="${i}">${I.trash}</button></div>${input(`content.${L}.process.${i}.title`, "العنوان", false, `dir="${dir}"`)}${input(`content.${L}.process.${i}.text`, "النص", true, `dir="${dir}"`)}`).join("")}</div>
        <button class="b b--sm" id="addStep" style="margin-top:12px">${I.plus}إضافة خطوة</button>`;
      bindLangSeg(); bindPathInputs(body);
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); changed(); draw(); }));
      $("#addStep").onclick = () => { items.push({ title: "", text: "" }); changed(); draw(); };
    };
    draw(); return;
  } else if (contentTab === "calc") {
    const c = settings.calculator;
    const draw = () => {
      const row = (kind, x, i) => `<div class="stats-rep__row wide" style="grid-template-columns:${kind === "types" ? "78px " : ""}1.5fr 1.5fr 74px 74px 34px;gap:6px">
        ${kind === "types" ? `<select class="fi" data-kind="${kind}" data-i="${i}" data-k="icon">${Object.keys(ICONS).map((k) => `<option ${x.icon === k ? "selected" : ""}>${k}</option>`).join("")}</select>` : ""}
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="label_ar" value="${esc(x.label_ar)}" placeholder="الاسم بالعربي">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="label_en" value="${esc(x.label_en)}" placeholder="English" dir="ltr">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="min" type="number" value="${esc(x.min)}" placeholder="من" dir="ltr">
        <input class="fi" data-kind="${kind}" data-i="${i}" data-k="max" type="number" value="${esc(x.max)}" placeholder="إلى" dir="ltr">
        <button class="b b--icon b--ghost b--danger" data-kind="${kind}" data-del="${i}">${I.trash}</button></div>`;
      body.innerHTML = `<p class="muted" style="margin-top:0">⚠️ الأسعار هنا تقديرية تظهر للزوار — راجعها وضع أسعار شركتك قبل النشر على الموقع الرئيسي. كل سعر هو نطاق (من — إلى).</p>
        <div class="grid2"><label class="f"><span>رمز العملة</span><input class="fi" data-root="currency" value="${esc(c.currency)}" dir="ltr"></label>
        <label class="f"><span>معامل التنفيذ المستعجل (مثلاً 1.3 = +30%)</span><input class="fi" data-root="rush" type="number" step="0.05" value="${esc(c.rush)}" dir="ltr"></label></div>
        <div class="sec-title">أنواع المشاريع (السعر الأساسي)</div><div class="stats-rep">${c.types.map((x, i) => row("types", x, i)).join("")}</div>
        <button class="b b--sm" data-add="types" style="margin-top:8px">${I.plus}إضافة نوع</button>
        <div class="sec-title" style="margin-top:18px">الميزات الإضافية (تُضاف للسعر)</div><div class="stats-rep">${c.features.map((x, i) => row("features", x, i)).join("")}</div>
        <button class="b b--sm" data-add="features" style="margin-top:8px">${I.plus}إضافة ميزة</button>`;
      $$(".fi", body).forEach((el) => {
        el.style.cssText = "height:38px;padding:0 10px;border:1px solid var(--line-2);border-radius:10px;width:100%;min-width:0;background:#fff";
        el.oninput = el.onchange = () => {
          const num = el.type === "number";
          if (el.dataset.root) c[el.dataset.root] = num ? Number(el.value) : el.value;
          else c[el.dataset.kind][el.dataset.i][el.dataset.k] = num ? Number(el.value) : el.value;
          changed();
        };
      });
      $$("[data-del]", body).forEach((b) => (b.onclick = () => { c[b.dataset.kind].splice(+b.dataset.del, 1); changed(); draw(); }));
      $$("[data-add]", body).forEach((b) => (b.onclick = () => { c[b.dataset.add].push(b.dataset.add === "types" ? { icon: "web", label_ar: "", label_en: "", min: 0, max: 0 } : { label_ar: "", label_en: "", min: 0, max: 0 }); changed(); draw(); }));
    };
    draw(); return;
  } else if (contentTab === "sections") {
    const names = { story: "القصة (المميزات)", projects: "الإنجازات (المشاريع)", services: "الخدمات", process: "كيف نعمل", stats: "الأرقام", testimonials: "آراء العملاء", calculator: "حاسبة التكلفة", partners: "الشركاء", contact: "التواصل" };
    body.innerHTML = `<p class="muted" style="margin-top:0">أخفِ أي قسم لا تحتاجه. (قسما الشركاء وآراء العملاء يختفيان تلقائياً إذا كانا فارغين.)</p><div class="stack">${Object.entries(names).map(([k, l]) => `<label class="switch"><input type="checkbox" data-path="sections.${k}" ${settings.sections[k] ? "checked" : ""}><i></i>${l}</label>`).join("")}</div>`;
  } else if (contentTab === "brand") {
    body.innerHTML = `<div class="stack"><div class="grid2">${input("brand.name_ar", "اسم الشركة بالعربي")}${input("brand.name_en", "اسم الشركة بالإنجليزي", false, 'dir="ltr"')}</div>
      <div class="f"><span>الشعار (اختياري — يُفضّل مربع PNG أو SVG)</span><div id="logoField"></div></div></div>`;
    $("#logoField").append(imageField(settings.brand.logo_url, "brand", (url) => { settings.brand.logo_url = url; changed(); }, true));
  } else if (contentTab === "contact") {
    body.innerHTML = `<div class="stack">
      <div class="grid2">${input("contact.email", "البريد الإلكتروني", false, 'dir="ltr" type="email"')}${input("contact.phone", "رقم الهاتف", false, 'dir="ltr" placeholder="+964 7xx xxx xxxx"')}</div>
      ${input("contact.whatsapp", "رقم واتساب (بالصيغة الدولية بدون + أو أصفار، مثل 9647701234567)", false, 'dir="ltr"')}
      <div class="grid2">${input("contact.address_ar", "العنوان بالعربي")}${input("contact.address_en", "العنوان بالإنجليزي", false, 'dir="ltr"')}</div>
      <div class="sec-title">روابط التواصل الاجتماعي</div>
      <div class="grid2">${input("contact.instagram", "Instagram", false, 'dir="ltr" placeholder="https://instagram.com/..."')}${input("contact.x", "X (Twitter)", false, 'dir="ltr" placeholder="https://x.com/..."')}
      ${input("contact.linkedin", "LinkedIn", false, 'dir="ltr"')}${input("contact.facebook", "Facebook", false, 'dir="ltr"')}</div></div>`;
  }
  bindPathInputs(body);
}

// ---------------- image upload field ----------------
function imageField(url, folder, onChange, contain = false) {
  const wrap = document.createElement("div");
  wrap.className = "img-field drop";
  wrap.innerHTML = `<div class="img-field__prev ${contain ? "contain" : ""}"></div>
    <div><div class="img-field__btns"><label class="b b--sm">${I.upload}<span>رفع صورة</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
    <button class="b b--sm b--ghost b--danger" type="button" data-rm>${I.x}إزالة</button></div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">أو اسحب الصورة وأفلتها هنا · حتى 5MB</p></div>`;
  const prev = $(".img-field__prev", wrap), rm = $("[data-rm]", wrap);
  const show = (u) => { url = u; prev.style.backgroundImage = u ? `url("${u}")` : ""; prev.textContent = u ? "" : "لا توجد صورة"; rm.hidden = !u; };
  show(url);
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("حجم الصورة أكبر من 5MB", "err");
    wrap.classList.add("uploading"); $(".img-field__btns span", wrap).textContent = "جارٍ الرفع…";
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from("media").upload(path, file, { cacheControl: "31536000", contentType: file.type });
    wrap.classList.remove("uploading"); $(".img-field__btns span", wrap).textContent = "رفع صورة";
    if (error) return toast(`فشل رفع الصورة: ${error.message}`, "err");
    const { data } = sb.storage.from("media").getPublicUrl(path);
    show(data.publicUrl); onChange(data.publicUrl);
  };
  $("input[type=file]", wrap).onchange = (e) => upload(e.target.files[0]);
  rm.onclick = () => { show(""); onChange(""); };
  wrap.addEventListener("dragover", (e) => { e.preventDefault(); wrap.classList.add("over"); });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("over"));
  wrap.addEventListener("drop", (e) => { e.preventDefault(); wrap.classList.remove("over"); upload(e.dataTransfer.files[0]); });
  return wrap;
}

// ---------------- generic lists: projects / services / partners ----------------
const ENTITIES = {
  projects: {
    one: "مشروع", empty: "لا توجد مشاريع بعد. أضف أول مشروع لعرضه في قسم الإنجازات.",
    title: (r) => r.title_ar || r.title_en || "بدون عنوان", sub: (r) => r.category_ar || r.summary_ar || "",
    thumb: (r) => r.image_url, blank: { title_ar: "", title_en: "", category_ar: "", category_en: "", summary_ar: "", summary_en: "", link: "", image_url: "", mobile_image_url: "", stats: [], published: true },
    fields: [
      ["sec", "العنوان والتصنيف"], ["pair", "title", "اسم المشروع"], ["pair", "category", "التصنيف (مثل: منصة حكومية)"],
      ["sec", "الوصف"], ["pairArea", "summary", "وصف مختصر"],
      ["url", "link", "رابط المشروع (اختياري)"],
      ["sec", "الصور"], ["image", "image_url", "صورة الشاشة (لوحة تحكم أو موقع) — أفقية 16:10", "projects"], ["image", "mobile_image_url", "صورة شاشة الجوال (اختياري) — عمودية", "projects"],
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
    fields: [["icon", "icon", "الأيقونة"], ["pair", "title", "اسم الخدمة"], ["pairArea", "summary", "الوصف"], ["toggle", "published", "منشورة"]],
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

async function viewList(table) {
  const E = ENTITIES[table];
  $("#topActions").innerHTML = `<button class="b b--primary" id="addBtn">${I.plus}إضافة ${E.one}</button>`;
  $("#addBtn").onclick = () => editItem(table, null);
  const { data, error } = await sb.from(table).select("*").order("sort").order("created_at");
  if (error) throw error;
  cache[table] = data;
  const view = $("#view");
  if (!data.length) {
    view.innerHTML = `<div class="empty">${I.img}<p>${E.empty}</p><button class="b b--primary" id="addFirst">${I.plus}إضافة ${E.one}</button></div>`;
    $("#addFirst").onclick = () => editItem(table, null); return;
  }
  view.innerHTML = `<div class="toolbar"><div class="search">${I.search}<input id="q" placeholder="بحث…"></div><span class="muted" style="font-size:13px">${data.length} عنصر · رتّب بالأسهم</span></div>
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
    }).join("")}</div>`;
  $("#q").oninput = (e) => { const q = e.target.value.trim().toLowerCase(); $$(".item").forEach((it) => (it.hidden = q && !it.dataset.q.includes(q))); };
  $$("[data-edit]").forEach((b) => (b.onclick = () => editItem(table, data.find((r) => r.id === b.dataset.edit))));
  $$("[data-pub]").forEach((b) => (b.onclick = async () => {
    const r = data.find((x) => x.id === b.dataset.pub);
    const { error } = await sb.from(table).update({ published: !r.published }).eq("id", r.id);
    if (error) return toast(error.message, "err");
    toast(r.published ? "تم الإخفاء" : "تم النشر ✓"); viewList(table);
  }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    const r = data.find((x) => x.id === b.dataset.del);
    if (!(await confirmBox(`حذف ${E.one}`, `هل تريد حذف "${E.title(r)}" نهائياً؟`, "حذف"))) return;
    const { error } = await sb.from(table).delete().eq("id", r.id);
    if (error) return toast(error.message, "err");
    toast("تم الحذف"); viewList(table);
  }));
  $$("[data-mv]").forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.i, j = i + +b.dataset.mv;
    const arr = [...data]; [arr[i], arr[j]] = [arr[j], arr[i]];
    const updates = arr.map((r, k) => ({ id: r.id, sort: k })).filter((u, k) => data.findIndex((r) => r.id === u.id) !== k || data[k].sort !== k);
    const results = await Promise.all(updates.map((u) => sb.from(table).update({ sort: u.sort }).eq("id", u.id)));
    const err = results.find((r) => r.error); if (err) toast(err.error.message, "err");
    viewList(table);
  }));
}

function editItem(table, row) {
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
    closeModal(); toast(row ? "تم حفظ التعديلات ✓" : `تمت إضافة ${E.one} ✓`); viewList(table);
  };
}

// ---------------- view: messages ----------------
let msgFilter = "new";
async function viewMessages(view) {
  $("#topActions").innerHTML = `<div class="seg" id="mf"><button data-v="new" class="${msgFilter === "new" ? "on" : ""}">الجديدة</button><button data-v="all" class="${msgFilter === "all" ? "on" : ""}">الكل</button></div>`;
  $$("#mf button").forEach((b) => (b.onclick = () => { msgFilter = b.dataset.v; route(); }));
  let q = sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  if (msgFilter === "new") q = q.eq("handled", false);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) { view.innerHTML = `<div class="empty">${I.mail}<p>${msgFilter === "new" ? "لا توجد رسائل جديدة 🎉" : "لا توجد رسائل بعد."}</p></div>`; return; }
  const when = (d) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  view.innerHTML = data.map((m) => `<div class="msg ${m.handled ? "" : "new"}" data-id="${m.id}">
    <div class="msg__head"><div class="msg__avatar">${esc((m.name || "?").trim()[0])}</div>
      <div class="msg__who"><b>${esc(m.name)}</b><span>${esc(m.message)}</span></div>
      <div class="msg__meta"><span>${when(m.created_at)}</span>${m.services?.length ? `<span class="tag off">${esc(m.services.join("، "))}</span>` : ""}</div></div>
    <div class="msg__body"><p>${esc(m.message)}</p>
      <div class="msg__info"><span>البريد: <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>${m.phone ? `<span>الهاتف: <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></span>` : ""}<span>اللغة: ${m.lang === "en" ? "English" : "العربية"}</span></div>
      <div class="msg__actions">
        <a class="b b--sm b--primary" href="mailto:${esc(m.email)}?subject=${encodeURIComponent("رد من WIXA")}">${I.mail}رد بالبريد</a>
        ${m.phone ? `<a class="b b--sm" href="https://wa.me/${esc(m.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">واتساب</a>` : ""}
        <button class="b b--sm" data-h="${m.id}">${m.handled ? "إرجاع كجديدة" : `${I.save}تمت المعالجة`}</button>
        <button class="b b--sm b--danger" data-d="${m.id}">${I.trash}حذف</button></div></div></div>`).join("");
  $$(".msg__head").forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("open")));
  $$("[data-h]").forEach((b) => (b.onclick = async () => {
    const m = data.find((x) => String(x.id) === b.dataset.h);
    const { error } = await sb.from("contact_messages").update({ handled: !m.handled }).eq("id", m.id);
    if (error) return toast(error.message, "err");
    refreshMsgCount(); route();
  }));
  $$("[data-d]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("حذف الرسالة", "هل تريد حذف هذه الرسالة نهائياً؟", "حذف"))) return;
    const { error } = await sb.from("contact_messages").delete().eq("id", b.dataset.d);
    if (error) return toast(error.message, "err");
    toast("تم الحذف"); refreshMsgCount(); route();
  }));
}
async function refreshMsgCount() {
  const { count } = await sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("handled", false);
  const el = $("#msgCount"); el.hidden = !count; el.textContent = count || "";
}

// ---------------- view: account ----------------
// Download everything editable as one JSON file (content backup).
async function exportBackup(btn) {
  btn.disabled = true;
  try {
    const tables = ["projects", "services", "partners", "testimonials"];
    const [s, ...rows] = await Promise.all([
      sb.from("site_settings").select("data").eq("id", 1).maybeSingle(),
      ...tables.map((t) => sb.from(t).select("*").order("sort")),
    ]);
    const err = [s, ...rows].find((r) => r.error); if (err) throw err.error;
    const dump = { exported_at: new Date().toISOString(), site: location.host, settings: s.data?.data || {} };
    tables.forEach((t, i) => (dump[t] = rows[i].data));
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `wixa-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("تم تنزيل النسخة الاحتياطية ✓");
  } catch (e) { toast(`فشل التصدير: ${e.message}`, "err"); }
  finally { btn.disabled = false; }
}

async function viewAccount(view) {
  const { data: { user: u } } = await sb.auth.getUser();
  if (u) user = u;
  const { data: fx } = await sb.auth.mfa.listFactors();
  const totp = fx?.totp?.find((x) => x.status === "verified");
  const card = (body) => `<div class="card" style="max-width:560px">${body}</div>`;
  view.innerHTML = card(`<div class="card__head"><div><h3>الحساب</h3><p dir="ltr" style="text-align:right">${esc(user.email)}</p></div>
      <button class="b b--danger" id="logout">${I.out}تسجيل الخروج</button></div>`)
    + card(`<div class="card__head"><div><h3>تغيير البريد الإلكتروني</h3><p>سنرسل رابط تأكيد إلى البريد الحالي والجديد، ويتم التغيير بعد تأكيدهما.</p></div></div>
      ${user.new_email ? `<p class="muted" style="margin:0 0 12px">بانتظار التأكيد: <b dir="ltr">${esc(user.new_email)}</b></p>` : ""}
      <form id="emailForm" class="stack"><label class="f"><span>البريد الجديد</span><input name="email" type="email" required autocomplete="email" dir="ltr"></label>
      <button class="b b--primary" style="justify-self:start">${I.mail}إرسال رابط التأكيد</button></form>`)
    + card(`<div class="card__head"><div><h3>التحقق بخطوتين ${totp ? '<span class="pill ok">مفعّل</span>' : ""}</h3>
      <p>${totp ? "عند الدخول يُطلب رمز من تطبيق المصادقة في هاتفك، فلا يكفي معرفة كلمة المرور وحدها." : "حماية إضافية: بعد كلمة المرور يُطلب رمز من تطبيق في هاتفك مثل Google Authenticator أو Microsoft Authenticator."}</p></div>
      <button class="b ${totp ? "b--danger" : "b--primary"}" id="mfaBtn">${totp ? "إيقاف" : "تفعيل"}</button></div><div id="mfaSetup"></div>`)
    + card(`<div class="card__head"><h3>تغيير كلمة المرور</h3></div>
      <form id="pwForm" class="stack"><label class="f"><span>كلمة المرور الجديدة</span><input name="p1" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>
      <label class="f"><span>تأكيد كلمة المرور</span><input name="p2" type="password" minlength="8" required autocomplete="new-password" dir="ltr"></label>
      <button class="b b--primary" style="justify-self:start">${I.save}تحديث</button></form>`)
    + card(`<div class="card__head"><div><h3>نسخة احتياطية للمحتوى</h3><p>نزّل كل النصوص والمشاريع والخدمات والشركاء والآراء في ملف واحد. يُنصح بتنزيلها بعد كل تعديل كبير.</p></div>
      <button class="b b--primary" id="backupBtn">${I.upload}تنزيل</button></div>`);

  $("#backupBtn").onclick = (e) => exportBackup(e.currentTarget);
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.hash = ""; };
  $("#pwForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    if (f.p1.value !== f.p2.value) return toast("كلمتا المرور غير متطابقتين", "err");
    const { error } = await sb.auth.updateUser({ password: f.p1.value });
    if (error) return toast(/different from the old/i.test(error.message) ? "اختر كلمة مرور مختلفة عن السابقة" : error.message, "err");
    f.reset(); toast("تم تحديث كلمة المرور ✓");
  };
  $("#emailForm").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, email = f.email.value.trim();
    if (email.toLowerCase() === user.email.toLowerCase()) return toast("هذا هو بريدك الحالي", "err");
    const btn = f.querySelector("button"); btn.disabled = true;
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/admin/` });
    btn.disabled = false;
    if (error) return toast(/rate limit|seconds/i.test(error.message) ? "محاولات كثيرة، انتظر قليلاً" : /already/i.test(error.message) ? "هذا البريد مستخدم في حساب آخر" : error.message, "err");
    toast("أرسلنا رابط التأكيد. افتح البريدين واضغط الرابط في كل منهما.");
    route();
  };
  $("#mfaBtn").onclick = async () => {
    if (totp) {
      if (!(await confirmBox("إيقاف التحقق بخطوتين", "سيصبح الدخول بكلمة المرور فقط. هل أنت متأكد؟", "إيقاف"))) return;
      const { error } = await sb.auth.mfa.unenroll({ factorId: totp.id });
      if (error) return toast(error.message, "err");
      await sb.auth.refreshSession();
      toast("تم إيقاف التحقق بخطوتين"); return route();
    }
    // clear any half-finished setup, then start a new one
    for (const x of fx?.all || []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `WIXA ${Date.now()}`, issuer: "WIXA" });
    if (error) return toast(error.message, "err");
    $("#mfaBtn").hidden = true;
    $("#mfaSetup").innerHTML = `<ol class="mfa">
        <li>ثبّت تطبيق مصادقة في هاتفك (Google Authenticator أو Microsoft Authenticator).</li>
        <li>امسح هذا الرمز من التطبيق:<div class="mfa__qr"><img alt="رمز QR" src="${esc(data.totp.qr_code)}" width="180" height="180"></div>
          أو أدخل المفتاح يدوياً: <code dir="ltr" class="mfa__secret">${esc(data.totp.secret)}</code></li>
        <li>أدخل الرمز الذي يظهر في التطبيق:</li></ol>
      <form id="mfaForm" class="stack">${codeField}
        <div class="row" style="gap:8px"><button class="b b--primary">${I.save}تأكيد التفعيل</button><button class="b" type="button" id="mfaCancel">إلغاء</button></div></form>`;
    $("#mfaSetup input").focus();
    $("#mfaCancel").onclick = async () => { await sb.auth.mfa.unenroll({ factorId: data.id }); route(); };
    $("#mfaForm").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: e.target.code.value.replace(/\s/g, "") });
      if (error) return toast("الرمز غير صحيح، جرّب الرمز الحالي في التطبيق", "err");
      toast("تم تفعيل التحقق بخطوتين ✓"); route();
    };
  };
}

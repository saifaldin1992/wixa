/* "Start your project": three short steps (what to build → about the project → your details), with two gifts
   promised at the start and revealed as surprise cards at the end (free brand identity + a free year of support).
   The visitor gets a request number on screen and by email; the team gets a clear summary in the messages. */
import { $, $$, esc, state, lang, C, L, ICONS } from "./core.js";
import { ensureTurnstile, turnstileToken, resetTurnstile, check, liveCheck } from "./contact.js";
import { visitSource } from "./source.js";

const T = {
  ar: {
    title: "ابدأ مشروعك", step: "الخطوة", of: "من", next: "التالي", back: "رجوع", send: "أرسل الطلب", sending: "جارٍ الإرسال…", skip: "تخطَّ",
    q: ["ماذا تريد أن نبني لك؟", "أخبرنا عن مشروعك", "آخر خطوة: تفاصيلك"],
    hint: ["اختر الأقرب، ويمكن تعديله لاحقاً مع الفريق.", "اختر مجالك، والباقي اختياري يساعدنا على اقتراح الأنسب.", "نرسل لك رقم الطلب على بريدك، ونعود إليك خلال يوم عمل."],
    other: "شيء آخر", field: "مجال عملك", feats: "ميزات تحتاجها (اختياري)", budget: "الميزانية التقريبية (اختياري)", time: "متى تريد الإطلاق؟ (اختياري)",
    giftTop: "هديتان مع كل طلب مشروع", giftTopSub: "أكمل طلبك واكشف هداياك في النهاية",
    gifts: [["هوية بصرية", "تصميم هوية بصرية لمشروعك مجاناً"], ["دعم لمدة سنة", "صيانة ودعم فني مجاني لمدة 12 شهراً"]],
    tap: "اضغط لكشف الهدية", won: "مبروك! حصلت على هديتين", wonSub: "تُضاف الهديتان إلى مشروعك عند البدء بالعمل.", free: "مجاناً",
    budgets: ["أقل من 1,000$", "1,000$ – 3,000$", "3,000$ – 7,000$", "أكثر من 7,000$", "لم أحدد بعد"],
    times: ["خلال شهر", "خلال 1–3 أشهر", "مرن"],
    details: "صف فكرتك باختصار", detailsPh: "ماذا تريد أن يفعل المشروع؟ من سيستخدمه؟ هل لديك موقع أو تطبيق حالي؟",
    link: "رابط ملفات أو أمثلة (اختياري)", linkPh: "Google Drive، أو موقع يعجبك…",
    name: "الاسم", email: "البريد الإلكتروني", phone: "رقم الهاتف", marketing: "أرغب باستلام العروض والأخبار من ويكسا",
    pick: "اختر خياراً للمتابعة", err: "تعذّر الإرسال، حاول مرة أخرى أو راسلنا على واتساب.",
    done: "وصلنا طلبك", doneSub: "رقم طلبك:", doneMail: "أرسلنا نسخة إلى بريدك. سيتواصل معك فريقنا خلال يوم عمل.", copy: "نسخ الرقم", copied: "نُسخ ✓", wa: "تابع طلبك على واتساب", close: "إغلاق",
  },
  en: {
    title: "Start your project", step: "Step", of: "of", next: "Next", back: "Back", send: "Send request", sending: "Sending…", skip: "Skip",
    q: ["What would you like us to build?", "Tell us about your project", "Last step: your details"],
    hint: ["Pick the closest — you can refine it with the team later.", "Pick your field; the rest is optional and helps us suggest the right fit.", "We'll email you a request number and reply within one working day."],
    other: "Something else", field: "Your field", feats: "Features you need (optional)", budget: "Rough budget (optional)", time: "When would you like to launch? (optional)",
    giftTop: "Two gifts with every project request", giftTopSub: "Finish your request and reveal your gifts at the end",
    gifts: [["Brand identity", "Brand identity design for your project, free"], ["A year of support", "Free maintenance and support for 12 months"]],
    tap: "Tap to reveal", won: "Congratulations! You've won two gifts", wonSub: "Both gifts are added to your project when work begins.", free: "Free",
    budgets: ["Under $1,000", "$1,000 – $3,000", "$3,000 – $7,000", "Over $7,000", "Not sure yet"],
    times: ["Within a month", "In 1–3 months", "Flexible"],
    details: "Describe your idea briefly", detailsPh: "What should it do? Who will use it? Do you have a current site or app?",
    link: "Link to files or examples (optional)", linkPh: "Google Drive, or a site you like…",
    name: "Name", email: "Email", phone: "Phone number", marketing: "Send me offers and news from WIXA",
    pick: "Pick an option to continue", err: "Couldn't send. Please try again or message us on WhatsApp.",
    done: "Request received", doneSub: "Your request number:", doneMail: "We've emailed you a copy. Our team will contact you within one working day.", copy: "Copy number", copied: "Copied ✓", wa: "Follow up on WhatsApp", close: "Close",
  },
};
const t = (k) => (T[lang] || T.ar)[k];
const STEPS = 3;
let step = 0, ans = { type: "", field: "", features: [], budget: "", timeline: "" };

function options() {
  const s = state.settings, c = C();
  const types = (s.calculator?.types || []).map((x) => ({ label: L(x, "label"), icon: x.icon })).filter((x) => x.label);
  const fields = (c.industries || []).map((x) => x.title).filter(Boolean);
  const feats = (s.calculator?.features || []).map((x) => L(x, "label")).filter((f) => f && !/هوية|identity|صيانة|support/i.test(f)); // both come free
  return { types, fields, feats };
}

const chip = (group, value, label, on, icon = "") => `<button type="button" class="rq__chip${icon ? " rq__chip--big" : ""}${on ? " on" : ""}" data-g="${group}" data-v="${esc(value)}" aria-pressed="${on}">${icon ? `<span class="rq__ico">${ICONS[icon] || ICONS.code}</span>` : ""}<span>${esc(label)}</span></button>`;

function paint() {
  const box = $("#rqBody"), o = options();
  $("#rqStep").textContent = `${t("step")} ${step + 1} ${t("of")} ${STEPS}`;
  $("#rqBar").style.width = `${((step + 1) / STEPS) * 100}%`;
  $("#rqQ").textContent = t("q")[step]; $("#rqHint").textContent = t("hint")[step];
  $("#rqBack").hidden = step === 0;
  $("#rqNext").hidden = step === STEPS - 1; $("#rqSend").hidden = step !== STEPS - 1;
  $("#rqNext").textContent = t("next");
  $("#rqErr").textContent = "";
  if (step === 0) box.innerHTML = `<div class="rq__gift"><span class="rq__gift-ico" aria-hidden="true">🎁</span><div><b>${t("giftTop")}</b><small>${t("gifts").map((g) => g[0]).join(" + ")} — ${t("giftTopSub")}</small></div></div>
    <div class="rq__grid rq__grid--big">${[...o.types.map((x) => chip("type", x.label, x.label, ans.type === x.label, x.icon)), chip("type", t("other"), t("other"), ans.type === t("other"), "code")].join("")}</div>`;
  if (step === 1) box.innerHTML = `<p class="rq__label">${t("field")}</p><div class="rq__grid">${[...o.fields, t("other")].map((f) => chip("field", f, f, ans.field === f)).join("")}</div>
    ${o.feats.length ? `<p class="rq__label">${t("feats")}</p><div class="rq__grid">${o.feats.map((f) => chip("features", f, f, ans.features.includes(f))).join("")}</div>` : ""}
    <p class="rq__label">${t("budget")}</p><div class="rq__grid">${t("budgets").map((b) => chip("budget", b, b, ans.budget === b)).join("")}</div>
    <p class="rq__label">${t("time")}</p><div class="rq__grid">${t("times").map((b) => chip("timeline", b, b, ans.timeline === b)).join("")}</div>`;
  $("#rqForm").hidden = step !== STEPS - 1; box.hidden = step === STEPS - 1;
  if (step === STEPS - 1) { ensureTurnstile("#turnstileReq"); setTimeout(() => $("#rqForm").elements.message.focus(), 60); }
}

function valid() {
  if (step === 0 && !ans.type) return false;
  if (step === 1 && !ans.field) return false;
  return true;
}

export function openRequest(preset = {}) {
  const m = $("#rqModal"); if (!m) return;
  if (preset.type) ans.type = preset.type;
  step = 0; $("#rqDone").hidden = true; $(".rq__main").hidden = false; paint();
  m.hidden = false; document.body.style.overflow = "hidden"; window.__lenis?.stop();
  setTimeout(() => $(".rq__chip", m)?.focus(), 60);
}
function closeRequest() { $("#rqModal").hidden = true; document.body.style.overflow = ""; window.__lenis?.start(); }

export function setupRequest() {
  if ($("#rqModal")) return;
  let me = {}; try { me = JSON.parse(localStorage.getItem("wixa-chat-me") || "{}"); } catch {}
  document.body.insertAdjacentHTML("beforeend", `<div class="pmodal rq" id="rqModal" hidden>
    <div class="pmodal__scrim" data-close></div>
    <div class="pmodal__box rq__box" role="dialog" aria-modal="true" aria-labelledby="rqQ">
      <button class="pmodal__x" type="button" data-close aria-label="${t("close")}">✕</button>
      <div class="rq__main">
        <div class="rq__top"><span class="rq__title">${t("title")}</span><span class="rq__step" id="rqStep"></span></div>
        <div class="rq__progress"><i id="rqBar"></i></div>
        <h2 class="rq__q" id="rqQ"></h2><p class="rq__hint" id="rqHint"></p>
        <div id="rqBody"></div>
        <form id="rqForm" class="form__grid rq__form" novalidate hidden>
          <label class="field field--full"><span>${t("details")} <em>*</em></span><textarea name="message" required maxlength="3000" rows="4" placeholder="${esc(t("detailsPh"))}"></textarea></label>
          <label class="field field--full"><span>${t("link")}</span><input name="link" type="url" maxlength="300" dir="ltr" placeholder="${esc(t("linkPh"))}"></label>
          <label class="field"><span>${t("name")} <em>*</em></span><input name="name" required maxlength="120" autocomplete="name" value="${esc(me.name || "")}"></label>
          <label class="field"><span>${t("phone")} <em>*</em></span><input name="phone" type="tel" inputmode="tel" required maxlength="40" autocomplete="tel" dir="ltr" placeholder="07XX XXX XXXX" value="${esc(me.phone || "")}"></label>
          <label class="field field--full"><span>${t("email")} <em>*</em></span><input name="email" type="email" required maxlength="200" autocomplete="email" dir="ltr"></label>
          <label class="consent field--full"><input type="checkbox" name="marketing"><span>${t("marketing")}</span></label>
          <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div id="turnstileReq" class="turnstile field--full"></div>
        </form>
        <p class="rq__err" id="rqErr" role="alert"></p>
        <div class="rq__nav"><button type="button" class="btn btn--ghost" id="rqBack">${t("back")}</button><button type="button" class="btn btn--primary" id="rqNext">${t("next")}</button><button type="button" class="btn btn--primary" id="rqSend" hidden>${t("send")}</button></div>
      </div>
      <div class="rq__done" id="rqDone" hidden></div>
    </div></div>`);
  const m = $("#rqModal"), form = $("#rqForm");
  liveCheck(form);
  m.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeRequest();
    const c = e.target.closest(".rq__chip"); if (!c) return;
    const g = c.dataset.g, v = c.dataset.v;
    if (g === "features") ans.features = ans.features.includes(v) ? ans.features.filter((x) => x !== v) : [...ans.features, v];
    else ans[g] = ans[g] === v && g !== "type" && g !== "field" ? "" : v; // optional choices can be un-picked
    const sc = $(".rq__box", m), y = sc.scrollTop;
    paint(); sc.scrollTop = y; // picking an option never jumps the sheet back to the top
    if (step === 0) setTimeout(() => { step++; paint(); sc.scrollTop = 0; }, 180); // the first step moves on by itself
    $(`.rq__chip[data-g="${g}"][data-v="${CSS.escape(v)}"]`, m)?.focus();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) closeRequest(); });
  $("#rqBack").onclick = () => { if (step > 0) { step--; paint(); } };
  $("#rqNext").onclick = () => { if (!valid()) { $("#rqErr").textContent = t("pick"); return; } step++; paint(); };
  $("#rqSend").onclick = async () => {
    const msg = check(form, ["message", "name", "phone", "email"]);
    if (msg) { $("#rqErr").textContent = msg; return; }
    const btn = $("#rqSend"); btn.disabled = true; btn.textContent = t("sending"); $("#rqErr").textContent = "";
    const f = form.elements;
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        kind: "project", lang, source: visitSource(), website: f.website.value, turnstile: turnstileToken("#turnstileReq"),
        name: f.name.value, email: f.email.value, phone: f.phone.value, message: f.message.value, marketing: f.marketing.checked,
        project: { ...ans, link: f.link.value },
      }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status);
      dispatchEvent(new Event("wixa:lead"));
      try { localStorage.setItem("wixa-chat-me", JSON.stringify({ ...me, name: f.name.value.trim(), phone: f.phone.value.trim() })); } catch {}
      done(d.number || "");
      form.reset(); ans = { type: "", field: "", features: [], budget: "", timeline: "" };
    } catch { $("#rqErr").textContent = t("err"); }
    finally { btn.disabled = false; btn.textContent = t("send"); resetTurnstile("#turnstileReq"); }
  };
  function done(no) {
    const wa = (state.settings.contact?.whatsapp || "").replace(/\D/g, "");
    $(".rq__main").hidden = true;
    const box = $("#rqDone"); box.hidden = false;
    box.innerHTML = `<h2>${t("done")}</h2><p class="rq__hint">${t("tap")}</p>
      <div class="rq__gifts">${t("gifts").map(([h, p], i) => `<button type="button" class="gcard" data-gift="${i}" aria-label="${t("tap")}">
        <span class="gcard__in"><span class="gcard__front"><span class="gcard__box" aria-hidden="true">🎁</span><small>${t("tap")}</small></span>
        <span class="gcard__back"><span class="gcard__tag">${t("free")}</span><b>${esc(h)}</b><small>${esc(p)}</small></span></span></button>`).join("")}</div>
      <div class="rq__won" hidden><p class="rq__wonT">🎉 ${t("won")}</p><p class="muted">${t("wonSub")}</p></div>
      ${no ? `<div class="rq__ticket"><span class="muted">${t("doneSub")}</span><div class="rq__no" dir="ltr">${esc(no)}</div><button type="button" class="btn btn--ghost rq__copy">${t("copy")}</button></div>` : ""}
      <p class="rq__hint">${t("doneMail")}</p>
      <div class="rq__nav">${wa ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent((lang === "ar" ? "مرحباً، بخصوص طلبي رقم " : "Hello, about my request ") + no)}">${t("wa")}</a>` : ""}<button type="button" class="btn btn--primary" data-close>${t("close")}</button></div>`;
    const reveal = (c) => { if (c.classList.contains("open")) return; c.classList.add("open"); c.setAttribute("aria-label", c.querySelector(".gcard__back b").textContent); if (!$(".gcard:not(.open)", box)) $(".rq__won", box).hidden = false; };
    $$(".gcard", box).forEach((c) => c.addEventListener("click", () => reveal(c)));
    // if they don't tap, the cards turn over by themselves
    setTimeout(() => $$(".gcard:not(.open)", box).forEach((c, i) => setTimeout(() => reveal(c), i * 450)), 4000);
    $(".rq__copy", box)?.addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(no); e.target.textContent = t("copied"); } catch {} });
  }
  // every "start your project" button opens it; the link still works without scripts
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-start], .nav-cta");
    if (!a) return;
    e.preventDefault(); openRequest({ type: a.dataset.start || "" });
  });
  if (location.hash === "#start") openRequest();
}

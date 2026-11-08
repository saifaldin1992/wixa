/* Site settings (load / save / unsaved changes) and the live preview */
import { $, $$, DEFAULTS, I, merge, publishNow, savedJSON, sb, setSaved, setSettings, settings, toast } from "./core.js";
import { route } from "./shell.js";

// ---------------- settings ----------------
// true only after the real settings arrived: saving defaults over the site's settings must never happen
let loaded = false;
export async function loadSettings() {
  const { data, error } = await sb.from("site_settings").select("data").eq("id", 1).maybeSingle();
  loaded = !error;
  if (error) toast("تعذّر تحميل الإعدادات", "err");
  setSettings(merge(DEFAULTS, data?.data || {}));
  setSaved(JSON.stringify(settings));
  return { error };
}
export const isDirty = () => settings && JSON.stringify(settings) !== savedJSON;
export async function saveSettings() {
  if (!loaded) { toast("لم تُحمَّل إعدادات الموقع بعد — حدّث الصفحة ثم احفظ، حتى لا تُستبدل إعداداتك بالقيم الافتراضية.", "err"); return false; }
  const btn = $("#saveBtn"); if (btn) btn.disabled = true;
  const { error } = await sb.from("site_settings").upsert({ id: 1, data: settings, updated_at: new Date().toISOString() });
  if (btn) btn.disabled = false;
  if (error) { toast(`فشل الحفظ: ${error.message}`, "err"); return; }
  setSaved(JSON.stringify(settings));
  publishNow();
  markDirty(); toast("تم الحفظ ونُشرت التغييرات على الموقع ✓");
}
export function markDirty() {
  const d = $("#dirtyFlag"); if (d) d.hidden = !isDirty();
  const b = $("#saveBtn"); if (b) b.disabled = !isDirty();
  const r = $("#revertBtn"); if (r) r.disabled = !isDirty();
}
export function settingsActions() {
  $("#topActions").innerHTML = `<span class="dirty" id="dirtyFlag" hidden>تغييرات غير محفوظة</span>
    <button class="b" id="revertBtn" disabled>${I.reset}تراجع</button>
    <button class="b b--primary" id="saveBtn" disabled>${I.save}حفظ ونشر</button>`;
  $("#saveBtn").onclick = saveSettings;
  $("#revertBtn").onclick = () => { setSettings(merge(DEFAULTS, JSON.parse(savedJSON))); route(); };
  markDirty();
}
export function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
export function setPath(obj, path, val) { const ks = path.split("."); const last = ks.pop(); const t = ks.reduce((o, k) => (o[k] ??= {}), obj); t[last] = val; }

// ---------------- preview ----------------
export let previewLang = "ar", previewTimer;
export const setPreviewLang = (v) => { previewLang = v; };
export function previewPane() {
  return `<div class="preview" id="preview">
    <div class="preview__bar"><b>معاينة مباشرة</b>
      <div style="display:flex;gap:6px">
        <div class="seg" id="pvLang"><button data-v="ar" class="${previewLang === "ar" ? "on" : ""}">ع</button><button data-v="en" class="${previewLang === "en" ? "on" : ""}">EN</button></div>
        <div class="seg" id="pvDev"><button data-v="desk" class="on">سطح المكتب</button><button data-v="mob">جوال</button></div>
      </div></div>
    <div class="preview__stage"><iframe id="pvFrame" src="/?preview=1" title="معاينة"></iframe></div></div>`;
}
export function bindPreview() {
  const frame = $("#pvFrame");
  if (!bindPreview.listening) { addEventListener("message", onPreviewMsg); bindPreview.listening = true; }
  $$("#pvDev button").forEach((b) => (b.onclick = () => { $$("#pvDev button").forEach((x) => x.classList.toggle("on", x === b)); $("#preview").classList.toggle("mobile", b.dataset.v === "mob"); fitPreview(); }));
  new ResizeObserver(fitPreview).observe($(".preview__stage"));
  fitPreview();
  $$("#pvLang button").forEach((b) => (b.onclick = () => { previewLang = b.dataset.v; $$("#pvLang button").forEach((x) => x.classList.toggle("on", x === b)); pushPreview(true); }));
  frame.addEventListener("load", () => pushPreview(true));
}
// Render the real desktop (1280px) or phone (390px) layout and scale it down to fit the pane.
export function fitPreview() {
  const st = $(".preview__stage"), fr = $("#pvFrame"); if (!st || !fr) return;
  const mob = $("#preview").classList.contains("mobile");
  // a real screen size (phone 390×844, computer 1280×up to 900), scaled to fit; the page scrolls inside it
  const W = mob ? 390 : 1280, H = st.clientHeight;
  const s = Math.min(1, (st.clientWidth - (mob ? 24 : 0)) / W, mob ? (H - 24) / 844 : 1);
  const FH = mob ? 844 : Math.min(900, H / s);
  fr.style.width = `${W}px`;
  fr.style.height = `${FH}px`;
  fr.style.transform = `scale(${s})`;
  fr.style.left = `${(st.clientWidth - W * s) / 2}px`;
  fr.style.top = `${Math.max(0, (H - FH * s) / 2)}px`;
}
export function onPreviewMsg(e) { if (e.origin === location.origin && e.data?.type === "wixa-preview-ready") pushPreview(true); }
export function pushPreview(now) {
  clearTimeout(previewTimer);
  const send = () => $("#pvFrame")?.contentWindow?.postMessage({ type: "wixa-preview", payload: { settings, lang: previewLang } }, location.origin);
  now ? send() : (previewTimer = setTimeout(send, 120));
}
export function changed() { markDirty(); pushPreview(); }

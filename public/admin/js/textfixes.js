/* One-time text corrections (wording + English spelling), applied with the admin's own session from the dashboard.
   The card appears only while old wording is still found, and disappears once everything is updated. */
import { $, esc, sb, settings, toast } from "./core.js";
import { saveSettings } from "./settings.js";

const SETTINGS_FIXES = [
  ["جاهزون لإنجاز مشروعكم القادم", "جاهزون لإنجاز مشروعك القادم"],
  ["وتبقى معنا بعدها.", "ونبقى معك بعدها."],
  ["from idea to operation.", "from idea to launch."],
  ['"From idea to operation"', '"From idea to launch"'],
  ["We analyse, design, build and run —", "We analyze, design, build and run it —"],
  ["Ready to deliver your next project", "Ready to build your next project"],
  ["on a staging copy.", "on a test version."],
  ['"services_title":"Services"', '"services_title":"Our services"'],
  ['"partners_title":"Partners"', '"partners_title":"Our partners"'],
  ['"صيانة ودعم لسنة"', '"صيانة ودعم لمدة سنة"'],
  ['"1-year support"', '"1 year of support"'],
];
const ROW_FIXES = [["catalogue", "catalog"], ["centre", "center"], ["analyse", "analyze"]];
const fixText = (t, list) => list.reduce((s, [a, b]) => s.split(a).join(b), t || "");

async function pendingRows() {
  const out = [];
  for (const table of ["projects", "services"]) {
    const { data } = await sb.from(table).select("id, summary_en, details_en");
    for (const r of data || []) {
      const patch = {};
      for (const k of ["summary_en", "details_en"]) if (r[k] != null && fixText(r[k], ROW_FIXES) !== r[k]) patch[k] = fixText(r[k], ROW_FIXES);
      if (Object.keys(patch).length) out.push({ table, id: r.id, patch });
    }
  }
  return out;
}

export async function textFixesCard(host) {
  const json = JSON.stringify(settings);
  const fixed = fixText(json, SETTINGS_FIXES);
  const rows = await pendingRows().catch(() => []);
  const n = SETTINGS_FIXES.filter(([a]) => json.includes(a)).length + rows.length;
  if (!n) return;
  host.insertAdjacentHTML("afterbegin", `<div class="card fixes" id="fixesCard">
    <div class="card__head"><div><h3>تصحيحات مقترحة للنصوص (${n})</h3>
      <p>صياغة أوضح بالعربي («مشروعك» بدل «مشروعكم»، «ونبقى معك بعدها»…) وإنجليزي موحّد (launch, analyze, catalog, Our services…). اضغط مرة واحدة لتطبيقها على الموقع.</p></div>
      <button class="b b--primary" id="applyFixes">تطبيق التصحيحات</button></div></div>`);
  $("#applyFixes").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      const next = JSON.parse(fixed);
      for (const k of Object.keys(next)) settings[k] = next[k];
      await saveSettings();
      for (const r of rows) {
        const { error } = await sb.from(r.table).update(r.patch).eq("id", r.id);
        if (error) throw error;
      }
      toast("تم تطبيق التصحيحات ✓ تظهر على الموقع خلال دقيقة");
      $("#fixesCard")?.remove();
    } catch (err) {
      toast(`تعذّر التطبيق: ${esc(err.message || "")}`, "err");
      e.currentTarget.disabled = false;
    }
  };
}

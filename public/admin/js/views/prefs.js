/* «الحساب ← واجهة اللوحة»: how this device shows the sidebar's main items — folding (the one holding the page is
   open, the others close; the default) or all always open. Kept on this device only. */
import { $$ } from "../core.js";
import { setSideMode, sideMode } from "../shell.js";

export async function viewPrefs(box) {
  const cur = sideMode();
  box.innerHTML = `<div class="card" id="cPrefs"><div class="card__head"><div><h3>واجهة اللوحة</h3>
      <p>كيف تظهر القوائم الرئيسية في القائمة الجانبية على هذا الجهاز.</p></div></div>
    <div class="prefs__opts" role="radiogroup" aria-label="القائمة الجانبية">
      <label class="prefs__opt"><input type="radio" name="sideMode" value="fold" ${cur === "fold" ? "checked" : ""}><span><b>قابلة للطي</b><small>القائمة التي أنت فيها مفتوحة، والبقية مطوية — تفتحها بضغطة.</small></span></label>
      <label class="prefs__opt"><input type="radio" name="sideMode" value="open" ${cur === "open" ? "checked" : ""}><span><b>مفتوحة دائماً</b><small>كل القوائم الرئيسية وفروعها ظاهرة طوال الوقت.</small></span></label>
    </div></div>`;
  $$("input[name=sideMode]", box).forEach((r) => (r.onchange = () => setSideMode(r.value)));
}

/* Restore the site's content from a backup file (the JSON sent by email or downloaded from the dashboard).
   Content tables are made exactly like the backup; messages are never deleted (new ones may have arrived since).
   A fresh backup of the current content is downloaded first, so a restore can always be undone. */
import { $, adminApi, closeModal, confirmBox, esc, openModal, publishNow, sb, setSaved, setSettings, settings, toast, DEFAULTS, merge } from "./core.js";
import { exportBackup } from "./views/account.js";

const TABLES = [["projects", "مشاريع"], ["services", "خدمات"], ["partners", "شركاء"], ["testimonials", "آراء"], ["posts", "مقالات"]];
// customers' records: only the missing ones are added back (through the server), nothing already there changes
const RECORDS = [["orders", "طلبات"], ["contact_messages", "رسائل"], ["chats", "محادثات"], ["customer_notes", "ملاحظات العملاء"]];

export function restoreDialog() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" });
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast("الملف ليس نسخة احتياطية صالحة", "err"); }
    if (!data || typeof data !== "object" || !data.settings || !TABLES.some(([t]) => Array.isArray(data[t]))) return toast("الملف لا يحتوي محتوى موقع ويكسا", "err");
    const date = data.exported_at ? new Date(data.exported_at).toLocaleString("ar-IQ", { dateStyle: "long", timeStyle: "short" }) : "غير معروف";
    const body = `<p style="margin:0 0 10px">نسخة بتاريخ: <b>${esc(date)}</b></p>
      <ul style="margin:0 0 10px;padding-inline-start:20px;line-height:2">${TABLES.map(([t, n]) => `<li>${n}: ${Array.isArray(data[t]) ? data[t].length : "—"}</li>`).join("")}${RECORDS.filter(([t]) => Array.isArray(data[t])).map(([t, n]) => `<li>${n}: ${data[t].length} <span class="muted">(يُضاف الناقص فقط)</span></li>`).join("")}<li>الإعدادات والنصوص والألوان</li></ul>
      <p class="muted" style="margin:0;font-size:13px">سيصبح محتوى الموقع مطابقاً لهذه النسخة. تُنزَّل أولاً نسخة من المحتوى الحالي لتستطيع التراجع. الرسائل لا تُحذف.</p>`;
    const foot = document.createElement("div"); foot.style.cssText = "display:flex;gap:8px";
    foot.innerHTML = `<button class="b" data-close>إلغاء</button><button class="b b--danger" data-go>استرجاع النسخة</button>`;
    openModal("استرجاع من نسخة احتياطية", body, foot, true);
    $("[data-go]", foot).onclick = async (e) => {
      if (!(await confirmBox("تأكيد الاسترجاع", "سيُستبدل المحتوى الحالي بمحتوى النسخة. متابعة؟", "استرجاع"))) return;
      e.target.disabled = true;
      try {
        await exportBackup(document.createElement("button")); // safety copy of what is there now
        const { error: se } = await sb.from("site_settings").upsert({ id: 1, data: data.settings, updated_at: new Date().toISOString() });
        if (se) throw se;
        for (const [t] of TABLES) {
          if (!Array.isArray(data[t])) continue;
          const keep = new Set(data[t].map((r) => r.id));
          const { data: cur, error: ce } = await sb.from(t).select("id");
          if (ce) throw ce;
          const gone = (cur || []).map((r) => r.id).filter((id) => !keep.has(id));
          if (gone.length) { const { error } = await sb.from(t).delete().in("id", gone); if (error) throw error; }
          if (data[t].length) { const { error } = await sb.from(t).upsert(data[t]); if (error) throw error; }
        }
        // orders, messages, chats and customer notes: the missing ones come back through the server (owner only)
        let added = "";
        if (RECORDS.some(([t]) => Array.isArray(data[t]) && data[t].length)) {
          const r = await adminApi("restore", "POST", Object.fromEntries(RECORDS.concat([["chat_messages"]]).map(([t]) => [t, Array.isArray(data[t]) ? data[t] : []])));
          const n = RECORDS.map(([t, l]) => (r[t] ? `${r[t]} ${l}` : "")).filter(Boolean);
          added = n.length ? ` — وأُضيف: ${n.join("، ")}` : "";
          const bad = RECORDS.filter(([t]) => r[`${t}_error`]).map(([, l]) => l);
          if (bad.length) toast(`تعذّر استرجاع: ${bad.join("، ")}`, "err");
        }
        setSettings(merge(DEFAULTS, data.settings)); setSaved(JSON.stringify(settings));
        publishNow();
        closeModal(); toast(`تم الاسترجاع ✓ الموقع يعرض محتوى النسخة الآن${added}`);
      } catch (err) { toast(`تعذّر الاسترجاع: ${err.message || err}`, "err"); e.target.disabled = false; }
    };
  };
  input.click();
}

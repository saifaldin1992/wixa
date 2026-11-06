/* Image upload field shared by the editors */
import { $, I, sb, toast } from "./core.js";

// ---------------- image upload field ----------------
export function imageField(url, folder, onChange, contain = false) {
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

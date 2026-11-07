/* Image upload field shared by the editors */
import { $, I, sb, toast } from "./core.js";

// Large photos are resized and converted to WebP before upload, so the site stays fast whatever is uploaded.
// GIFs (may be animated) and small images are uploaded as they are.
export async function shrinkImage(file, maxSide = 2000) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 300 * 1024) { bmp.close?.(); return file; }
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
}

// ---------------- image upload field ----------------
export function imageField(url, folder, onChange, contain = false) {
  const wrap = document.createElement("div");
  wrap.className = "img-field drop";
  wrap.innerHTML = `<div class="img-field__prev ${contain ? "contain" : ""}"></div>
    <div><div class="img-field__btns"><label class="b b--sm">${I.upload}<span>رفع صورة</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
    <button class="b b--sm b--ghost b--danger" type="button" data-rm>${I.x}إزالة</button></div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">أو اسحب الصورة وأفلتها هنا · تُضغط الصور الكبيرة تلقائياً</p></div>`;
  const prev = $(".img-field__prev", wrap), rm = $("[data-rm]", wrap);
  const show = (u) => { url = u; prev.style.backgroundImage = u ? `url("${u}")` : ""; prev.textContent = u ? "" : "لا توجد صورة"; rm.hidden = !u; };
  show(url);
  const upload = async (file) => { // eslint-disable-line no-param-reassign
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast("حجم الصورة أكبر من 20MB", "err");
    wrap.classList.add("uploading"); $(".img-field__btns span", wrap).textContent = "جارٍ التجهيز…";
    const before = file.size;
    file = await shrinkImage(file).catch(() => file);
    if (file.size > 5 * 1024 * 1024) { wrap.classList.remove("uploading"); $(".img-field__btns span", wrap).textContent = "رفع صورة"; return toast("حجم الصورة أكبر من 5MB حتى بعد الضغط", "err"); }
    $(".img-field__btns span", wrap).textContent = "جارٍ الرفع…";
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from("media").upload(path, file, { cacheControl: "31536000", contentType: file.type });
    wrap.classList.remove("uploading"); $(".img-field__btns span", wrap).textContent = "رفع صورة";
    if (error) return toast(`فشل رفع الصورة: ${error.message}`, "err");
    const { data } = sb.storage.from("media").getPublicUrl(path);
    show(data.publicUrl); onChange(data.publicUrl);
    if (file.size < before) toast(`تم ضغط الصورة من ${(before / 1024).toFixed(0)}KB إلى ${(file.size / 1024).toFixed(0)}KB ✓`);
  };
  $("input[type=file]", wrap).onchange = (e) => upload(e.target.files[0]);
  rm.onclick = () => { show(""); onChange(""); };
  wrap.addEventListener("dragover", (e) => { e.preventDefault(); wrap.classList.add("over"); });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("over"));
  wrap.addEventListener("drop", (e) => { e.preventDefault(); wrap.classList.remove("over"); upload(e.dataTransfer.files[0]); });
  return wrap;
}

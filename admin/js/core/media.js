/* رفع الصور: تصغير في المتصفح إلى WebP قبل الرفع (يوفّر النطاق ويسرّع المتجر). */
import { uploadMedia } from "./http.js";
export async function shrink(file, max = 900, quality = 0.82) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const r = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/webp", quality));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }) : file;
  } finally { URL.revokeObjectURL(url); }
}
export async function uploadImage(file, max = 900) { return uploadMedia(await shrink(file, max), "img"); }

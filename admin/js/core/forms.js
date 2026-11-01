import { h, field, input, toast, fail, icon } from "./ui.js";
import { uploadImage } from "./media.js";
import { subscribe, isDirty, publish, buildDiff, discard } from "./catalog.js";
import { isAdmin } from "./rbac.js";
import { confirmBox, setBusy } from "./ui.js";

/* حقل صورة: رابط + رفع + معاينة. getter/setter للقيمة. */
export function imageField(label, value, onChange, max = 900) {
  const url = input({ value: value || "", dir: "ltr", placeholder: "https://… أو ارفع صورة", oninput: (e) => { onChange(e.target.value.trim()); prev(); } });
  const prevBox = h("div", { style: { marginTop: "6px" } });
  const prev = () => { prevBox.replaceChildren(url.value ? h("img", { src: url.value, alt: "", style: { maxHeight: "70px", maxWidth: "100%", borderRadius: "8px", border: "1px solid var(--line)" }, onerror: (e) => e.target.remove() }) : ""); };
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", style: { display: "none" }, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return; setBusy(btn, true);
    try { url.value = await uploadImage(f, max); onChange(url.value); prev(); toast("تم رفع الصورة"); } catch (x) { fail(x, "فشل الرفع"); } finally { setBusy(btn, false); e.target.value = ""; }
  } });
  const btn = h("button", { class: "btn sm", type: "button", onclick: () => file.click() }, icon("upload", 14), "رفع");
  prev();
  return h("div", { class: "field" }, h("span", null, label), h("div", { class: "toolbar", style: { flexWrap: "nowrap" } }, url, btn, file), prevBox);
}

/* شريط النشر: يظهر فقط عند وجود تعديلات غير منشورة */
export function publishBar() {
  const bar = h("div", { class: "publish-bar", hidden: true });
  const draw = () => {
    bar.hidden = !isDirty(); if (bar.hidden) return;
    const d = buildDiff(!isAdmin());
    const parts = [d.upserts.length && `${d.upserts.length} منتج مضاف/معدّل`, d.deletes.length && `${d.deletes.length} محذوف`, d.order && "ترتيب المنتجات", ...d.patchKeys.map((k) => `إعدادات: ${k}`)].filter(Boolean);
    const pub = h("button", { class: "btn primary", onclick: async (e) => {
      if (!(await confirmBox(`سيُنشر للزوار فوراً:\n• ${parts.join("\n• ")}`, { okLabel: "نشر الآن", title: "نشر التعديلات" }))) return;
      setBusy(e.currentTarget, true);
      try { const r = await publish((i, n) => n > 1 && toast(`تجهيز النشر الآمن ${i}/${n}`)); toast(r.empty ? "لا تغييرات للنشر" : "تم النشر بنجاح"); } catch (x) { fail(x, "فشل النشر"); } finally { setBusy(e.currentTarget, false); }
    } }, "نشر");
    bar.replaceChildren(h("div", null, h("b", null, "تعديلات غير منشورة"), h("small", { class: "sub" }, parts.join(" · ") || "تغييرات")),
      h("div", { class: "page-actions" }, h("button", { class: "btn ghost", onclick: async () => { if (await confirmBox("تجاهل كل التعديلات غير المنشورة؟", { danger: true })) discard(); } }, "تجاهل"), pub));
  };
  const off = subscribe(draw); draw();
  const mo = new MutationObserver(() => { if (!bar.isConnected) { off(); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true });
  return bar;
}
window.addEventListener("beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });

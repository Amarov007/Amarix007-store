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
  const file = h("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/*",
    style: { position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", zIndex: 10 },
    onchange: async (e) => {
      const f = e.target.files?.[0]; if (!f) return; setBusy(btn, true);
      try {
        let uploadedUrl = "";
        try {
          const uploadPromise = uploadImage(f, max);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Storage timeout")), 4000));
          uploadedUrl = await Promise.race([uploadPromise, timeoutPromise]);
        } catch (storageErr) {
          console.warn("[Forms] Storage upload fallback:", storageErr);
        }
        if (uploadedUrl && /^https:\/\//i.test(uploadedUrl)) {
          url.value = uploadedUrl;
        } else {
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const img = new Image();
              img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/webp", 0.85));
              };
              img.onerror = () => resolve(reader.result);
              img.src = reader.result;
            };
            reader.onerror = () => resolve("");
            reader.readAsDataURL(f);
          });
          if (dataUrl) url.value = dataUrl;
        }
        onChange(url.value);
        prev();
        toast("تم رفع الصورة");
      } catch (x) {
        fail(x, "فشل الرفع");
      } finally {
        setBusy(btn, false);
        e.target.value = "";
      }
    }
  });
  const btn = h("label", {
    class: "btn sm",
    style: { position: "relative", cursor: "pointer", overflow: "hidden", display: "inline-flex", alignItems: "center", gap: "6px" }
  }, icon("upload", 14), "رفع", file);
  prev();
  return h("div", { class: "field" }, h("span", null, label), h("div", { class: "toolbar", style: { flexWrap: "nowrap" } }, url, btn), prevBox);
}

/* شريط النشر: يظهر فقط عند وجود تعديلات غير منشورة */
export function publishBar() {
  const bar = h("div", { class: "publish-bar", hidden: true, style: { display: "none" } });
  const draw = () => {
    const dirty = isDirty();
    bar.hidden = !dirty;
    bar.style.display = dirty ? "flex" : "none";
    if (!dirty) return;
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

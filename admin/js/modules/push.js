import { rpc, select } from "../core/http.js";
import { h, mount, pageHeader, field, input, select as sel, dataTable, statCard, toast, fail, confirmBox, spinner, errorState, withBusy } from "../core/ui.js";
import { fmtDate } from "../core/utils.js";

const URLS = [["#/", "الصفحة الرئيسية"], ["#/orders", "طلباتي"], ["#/account", "حسابي"], ["#/cart", "السلة"]];
const TPL = [["🚀 خدمة جديدة", "خدمة جديدة في المتجر 🚀", "أضفنا خدمة جديدة! اكتشفها الآن في AMARIX007."], ["🎁 بونص جديد", "بونص جديد لك 🎁", "بونص جديد متاح الآن لفترة محدودة، لا تفوّت الفرصة!"], ["🏷️ كود خصم", "كود خصم حصري 🏷️", "استخدم الكود XXXX في سلتك واحصل على خصم حصري. العرض لفترة محدودة."]];
const ERR = (m) => (/too_fast/.test(m) ? "انتظر 20 ثانية بين كل إرسالين" : /push_not_configured/.test(m) ? "الإشعارات غير مضبوطة في الخادم" : /forbidden/.test(m) ? "هذا الحساب ليس أدمن" : m);

export default async function (view) {
  const title = input({ maxLength: 60 }), text = h("textarea", { class: "input", rows: 3, maxLength: 160 }), url = sel(URLS, "#/");
  const hist = h("div"), stats = h("div", { class: "grid g4" });
  const send = (test) => async (e) => {
    const t = title.value.trim(), b = text.value.trim();
    if (!t || !b) return toast("اكتب العنوان والنص", "err");
    if (!test && !(await confirmBox(`سيصل الإشعار لكل الأجهزة المشتركة:\n\n${t}\n${b}`, { okLabel: "إرسال للجميع" }))) return;
    await withBusy(e.target, async () => { try { await rpc("admin_send_broadcast", { p_title: t, p_body: b, p_url: url.value, p_test: test }); toast(test ? "أُرسل إشعار تجريبي لجهازك" : "أُرسل الإشعار"); loadHist(); } catch (x) { fail({ message: ERR(x.message) }); } });
  };
  mount(view, pageHeader("الإشعارات", "إشعار فوري لكل المشتركين"), stats,
    h("div", { class: "card" }, h("h3", null, "رسالة جديدة"),
      h("div", { class: "toolbar", style: { marginBottom: "12px" } }, TPL.map(([l, t, b]) => h("button", { class: "btn sm", onclick: () => { title.value = t; text.value = b; } }, l))),
      field("العنوان", title), field("النص", text), field("الوجهة عند الضغط", url),
      h("div", { class: "page-actions" }, h("button", { class: "btn", onclick: send(true) }, "تجربة على جهازي"), h("button", { class: "btn primary", onclick: send(false) }, "إرسال للجميع"))),
    h("h3", null, "آخر الإرسالات"), hist);
  async function loadHist() {
    mount(hist, spinner());
    try {
      const [s, rows] = await Promise.all([rpc("admin_push_stats").catch(() => null), select("push_broadcasts", "select=*&order=created_at.desc&limit=30")]);
      if (s) mount(stats, statCard({ label: "الأجهزة المشتركة", value: s.devices ?? "—", ic: "bell" }));
      mount(hist, dataTable({ rows, pageSize: 10, emptyText: "لا إرسالات", columns: [{ label: "العنوان", render: (r) => [r.title, r.test && h("small", { class: "sub" }, "تجريبي")] }, { label: "النص", render: (r) => r.body }, { label: "وصل / مستهدف", render: (r) => `${r.sent ?? "—"} / ${r.recipients ?? "—"}` }, { label: "التاريخ", render: (r) => h("span", { class: "muted" }, fmtDate(r.created_at)) }] }));
    } catch (e) { mount(hist, errorState(e, loadHist)); }
  }
  await loadHist();
}

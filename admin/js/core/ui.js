/* مكتبة واجهة صغيرة: كل المحتوى يُبنى بـ DOM API (h) فلا حقن HTML ولا XSS من بيانات الزبائن. */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  // Bind event listeners first so handlers like onerror/onload are active before src or other attributes are set
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      const evName = k.slice(2).toLowerCase();
      e.addEventListener(evName, v);
      try { e[k.toLowerCase()] = v; } catch (_) {}
    }
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || (k.startsWith("on") && typeof v === "function")) continue;
    if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "selected" || k === "textContent") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  append(e, kids);
  return e;
}
function append(e, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const mount = (parent, ...kids) => { parent.replaceChildren(); append(parent, kids); return parent; };

/* ---------- أيقونات (مسارات SVG ثابتة موثوقة) ---------- */
const P = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  orders: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16.5 14.5h.01",
  card: "M2 5h20v14H2zM2 10h20M6 15h4",
  ticket: "M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3z",
  box: "M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8",
  layers: "M12 2l10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5",
  image: "M3 5h18v14H3zM3 15l5-4 4 3 3-2 6 4",
  tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  plug: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  file: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  x: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  alert: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
};
export function icon(name, size = 18) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", P[name] || P.box); s.append(p);
  return s;
}

/* ---------- إشعارات ---------- */
export function toast(msg, type = "ok", ms = 3600) {
  const host = $("#toasts");
  const t = h("div", { class: `toast ${type}`, role: "status" }, icon(type === "err" ? "alert" : "check", 16), h("span", null, msg));
  host.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 250); }, ms);
}
export const fail = (e, prefix = "فشلت العملية") => toast(`${prefix} — ${e?.message || e}`, "err", 5200);

/* ---------- نوافذ ---------- */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc); onClose?.(); };
  const esc = (e) => e.key === "Escape" && close();
  const ov = h("div", { class: "overlay", onclick: (e) => e.target === ov && close() },
    h("div", { class: `modal ${wide ? "wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title },
      h("header", null, h("h3", null, title), h("button", { class: "icon-btn", onclick: close, "aria-label": "إغلاق" }, icon("x"))),
      h("div", { class: "modal-body" }, body),
      actions.length && h("footer", null, actions.map((a) => h("button", { class: `btn ${a.kind || ""}`, onclick: async (e) => { if (a.onClick) { const keep = await a.onClick(e, close); if (keep !== false && !a.stay) close(); } else close(); } }, a.label)))));
  document.body.append(ov);
  document.addEventListener("keydown", esc);
  ov.querySelector("input,select,textarea,button.btn")?.focus();
  return { close, el: ov };
}
export const confirmBox = (message, { danger = false, okLabel = "تأكيد", title = "تأكيد الإجراء" } = {}) =>
  new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    modal({ title, body: h("p", { class: "confirm-text" }, message), onClose: () => fin(false),
      actions: [{ label: "إلغاء", kind: "ghost" }, { label: okLabel, kind: danger ? "danger" : "primary", onClick: () => fin(true) }] });
  });
export const promptBox = (label, { title = "إدخال", value = "", multiline = false, okLabel = "حفظ" } = {}) =>
  new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    const inp = multiline ? h("textarea", { class: "input", rows: 4, value }) : h("input", { class: "input", value });
    modal({ title, body: h("label", { class: "field" }, h("span", null, label), inp), onClose: () => fin(null),
      actions: [{ label: "إلغاء", kind: "ghost" }, { label: okLabel, kind: "primary", onClick: () => fin(inp.value.trim()) }] });
  });

/* ---------- مكونات ---------- */
export const badge = (text, tone = "mute") => h("span", { class: `badge ${tone}` }, text);
export const spinner = (text = "جارٍ التحميل…") => h("div", { class: "loading" }, h("span", { class: "spin" }), text);
export const empty = (text, ic = "box") => h("div", { class: "empty" }, icon(ic, 34), h("p", null, text));
export const errorState = (e, retry) => h("div", { class: "empty err" }, icon("alert", 34), h("p", null, e?.message || String(e)), retry && h("button", { class: "btn", onclick: retry }, "إعادة المحاولة"));
export function setBusy(btn, on) { if (!btn) return; btn.disabled = on; btn.classList.toggle("busy", on); }
export async function withBusy(btn, fn) { setBusy(btn, true); try { return await fn(); } finally { setBusy(btn, false); } }

export const field = (label, input, hint) => h("label", { class: "field" }, h("span", null, label), input, hint && h("small", null, hint));
export const input = (props = {}) => h("input", { class: "input", ...props });
export const select = (options, value, props = {}) =>
  h("select", { class: "input", ...props }, options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value) }, l)));
export const switchEl = (checked, onChange, label) =>
  h("label", { class: "switch" }, h("input", { type: "checkbox", checked: !!checked, onchange: (e) => onChange(e.target.checked) }), h("i"), label && h("span", null, label));

export function statCard({ label, value, sub, ic = "chart", tone = "" }) {
  return h("div", { class: `stat ${tone}` }, h("div", { class: "stat-ic" }, icon(ic, 20)), h("div", null, h("small", null, label), h("b", null, value), sub && h("em", null, sub)));
}
export const pageHeader = (title, desc, ...actions) =>
  h("div", { class: "page-head" }, h("div", null, h("h1", null, title), desc && h("p", null, desc)), h("div", { class: "page-actions" }, actions));

/* جدول: columns = [{label, render(row), class}] — ترقيم من جهة العميل */
export function dataTable({ columns, rows, onRow, pageSize = 25, emptyText = "لا توجد بيانات" }) {
  let page = 1;
  const wrap = h("div", { class: "table-wrap" });
  const draw = () => {
    if (!rows.length) return mount(wrap, empty(emptyText));
    const pages = Math.ceil(rows.length / pageSize); page = Math.min(page, pages);
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);
    mount(wrap,
      h("div", { class: "scroll-x" }, h("table", { class: "table" },
        h("thead", null, h("tr", null, columns.map((c) => h("th", { class: c.class }, c.label)))),
        h("tbody", null, slice.map((r) => h("tr", { class: onRow ? "clickable" : "", onclick: onRow && ((e) => !e.target.closest("button,a,select,input") && onRow(r)) },
          columns.map((c) => h("td", { class: c.class, "data-label": c.label }, c.render(r)))))))),
      pages > 1 && h("div", { class: "pager" },
        h("button", { class: "btn ghost sm", disabled: page === 1, onclick: () => { page--; draw(); } }, "السابق"),
        h("span", null, `${page} / ${pages} · ${rows.length} سجل`),
        h("button", { class: "btn ghost sm", disabled: page === pages, onclick: () => { page++; draw(); } }, "التالي")));
  };
  draw();
  wrap.update = (next) => { rows = next; page = 1; draw(); };
  return wrap;
}
export const toolbar = (...kids) => h("div", { class: "toolbar" }, kids);
export const searchBox = (onInput, placeholder = "بحث…") =>
  h("div", { class: "search" }, icon("search", 16), h("input", { class: "input", placeholder, oninput: (e) => onInput(e.target.value.trim().toLowerCase()), type: "search" }));

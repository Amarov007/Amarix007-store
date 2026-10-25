// يولّد /faq/index.html و/policies/index.html و sitemap.xml من نصوص app.js و index.html
// التشغيل: node tools/gen-seo-pages.mjs
import fs from "node:fs";
import vm from "node:vm";

const SITE = "https://amarix007.store";
const app = fs.readFileSync("app.js", "utf8").split("\n");
const start = app.findIndex((l) => l.startsWith("const T = {"));
let end = -1;
for (let i = start + 1; i < app.length; i++) if (app[i] === "};") { end = i; break; }
if (start < 0 || end < 0) throw new Error("لم أجد const T في app.js");
const T = vm.runInNewContext("(" + app.slice(start, end + 1).join("\n").replace(/^const T = /, "").replace(/;$/, "") + ")");
const ar = T.ar;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const index = fs.readFileSync("index.html", "utf8");

function page({ path, title, desc, body, jsonld }) {
  let h = index;
  h = h.replace("<head>", '<head>\n<base href="/">');
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*"/, `$1${SITE}${path}"`);
  h = h.replace(/(<meta property="og:url" content=")[^"]*"/, `$1${SITE}${path}"`);
  h = h.replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(desc)}"`);
  h = h.replace(/(<main class="w" id="m" tabindex="-1">)[\s\S]*?(<\/main>)/, `$1${body}$2`);
  h = h.replace("</head>", `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n</head>`);
  fs.mkdirSync(path.slice(1), { recursive: true });
  fs.writeFileSync(path.slice(1) + "index.html", h);
}

const crumbs = (name, path) => ({
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "AMARIX007", item: SITE + "/" },
    { "@type": "ListItem", position: 2, name, item: SITE + path },
  ],
});

// FAQ
const fk = ["pay", "when", "profit", "link", "track"];
page({
  path: "/faq/",
  title: `${ar.faq} | AMARIX007`,
  desc: ar.faqh,
  body: `<h1>${esc(ar.faq)}</h1><p>${esc(ar.faqh)}</p>` + fk.map((k) => `<h2>${esc(ar["fq_" + k])}</h2><p>${esc(ar["fa_" + k])}</p>`).join(""),
  jsonld: {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "FAQPage", mainEntity: fk.map((k) => ({ "@type": "Question", name: ar["fq_" + k], acceptedAnswer: { "@type": "Answer", text: ar["fa_" + k] } })) },
      crumbs(ar.faq, "/faq/"),
    ],
  },
});

// Policies
const pk = ["dig", "ref", "man", "prv", "trm"];
page({
  path: "/policies/",
  title: `${ar.pol} | AMARIX007`,
  desc: ar.polh,
  body: `<h1>${esc(ar.pol)}</h1><p>${esc(ar.polh)}</p>` + pk.map((k) => `<h2>${esc(ar["po_" + k + "_t"])}</h2><p>${esc(ar["po_" + k])}</p>`).join(""),
  jsonld: { "@context": "https://schema.org", "@graph": [crumbs(ar.pol, "/policies/")] },
});

fs.writeFileSync(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ["/", "/faq/", "/policies/"].map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n") + `\n</urlset>\n`
);
console.log("OK: faq/, policies/, sitemap.xml");

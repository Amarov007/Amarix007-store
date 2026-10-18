/* =====================================================================
   AMARIX007 — Admin panel logic (admin.js)
   ---------------------------------------------------------------------
   Sections
    1. Config & security notes     7. Views (one per tab)
    2. State & helpers             8. Events (input / change / click)
    3. Icons & constants           9. Uploads, backup & import
    4. Form builders               10. Supabase session & REST helper
    5. Toast & draft saving        11. Publish, API settings, users, orders
    6. Misc builders               12. Boot

   SECURITY NOTES
   - Only the Supabase *anon* key is used here. Admin power comes from the
     signed-in user's JWT + Row Level Security, NOT from this file.
   - RLS must be enabled (see supabase-schema.sql):
       store_config -> public SELECT, admin-only INSERT/UPDATE
       orders       -> admin can SELECT all and UPDATE status
       profiles     -> admin can SELECT all (policies exist in your schema)
       api_settings -> admin only (it contains secret keys)
   - Secret keys edited in the "APIs" tab are saved ONLY to api_settings.
     They are stripped from everything published to store_config (which
     the public storefront can read).
   ===================================================================== */
'use strict';

/* ---------- 1. Config ---------- */
const SB_URL = 'https://pvuobngrybygohendwaz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU'; // anon key only

/* ---------- 2. State & helpers ---------- */
const $ = s => document.querySelector(s);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const EMPTY = { ts:0,
  site:{ n1:'MY', n2:'STORE', logo:'', sa:'', se:'', desc:'', col:{ g:'#2F442C', m:'#A7E8BD', ac:'#52B788' }, rt:{ ar:'', en:'' }, risk:{ ar:'', en:'' } },
  partner:{ on:false, name:'', logo:'', url:'', ar:'', en:'', ba:'', be:'', banner_bg_url:'' },
  social:{}, payments:[
    { id:'syriatel', name:'Syriatel Cash', name_ar:'سيرياتيل كاش', on:true, note:'', note_ar:'' },
    { id:'dam', name:'Dam Cash', name_ar:'ضام كاش', on:true, note:'', note_ar:'' },
    { id:'usdt', name:'USDT BEP20', name_ar:'USDT BEP20', on:true, note:'', note_ar:'' },
    { id:'binance', name:'Binance Pay', name_ar:'بايننس Pay', on:true, note:'', note_ar:'' }
  ],
  categories:[], products:[], embeds:[], banners:[], coupons:{}, rates:{ SAR:[1, 'ر.س'] }, api:{} };
const PUB = window.AMX || EMPTY;
let D = clone(PUB), dirty = false, tab = 'home', ed = null, pq = '', pcat = '', SES = null, IS_ADMIN = null;
const fix = () => {
  for (const k in EMPTY) if (D[k] == null) D[k] = clone(EMPTY[k]);
  D.site = { ...EMPTY.site, ...D.site }; D.partner = { ...EMPTY.partner, ...D.partner };
};
fix();
const g  = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const st = (o, p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((a, x) => a[x] ?? (a[x] = {}), o)[l] = v; };

/* What is allowed to leave this browser for the PUBLIC store_config row / drafts / backups.
   `api` holds secret keys (SMM, payment, AI) and must never be published. */
function pubData() { const { api, ...rest } = D; return clone(rest); }

/* ---------- 3. Icons & constants ---------- */
const I = {
  bank:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bot:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8h14v-8M7.5 8C5 8 5 4 8 4c2 0 4 4 4 4s2-4 4-4c3 0 3 4.5.5 4"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
  box:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bolt:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cart:'<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  hs:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'
};
const ICONS = Object.keys(I);
const ic = (n, z = 22) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${I[n] || I.box}</svg>`;
const TYPES = [['shop', 'متجر عادي (سلة وشراء)'], ['boost', 'خدمات زيادة (يُطلب رابط الحساب)'], ['embed', 'تضمين مواقع'], ['funded', 'حسابات ممولة']];
const DELIV = [[0, 'رابط مستودع / منصة'], [1, 'بيانات حساب / اعتماد'], [2, 'ملف تنفيذي / سورس كود'], [3, 'تنفيذ على رابط حساب العميل']];
const TABS = [['home', 'الرئيسية'], ['site', 'الموقع والهوية'], ['partner', 'الشريك'], ['banners', 'البانرات'], ['categories', 'الأقسام'], ['products', 'المنتجات'], ['embeds', 'التضمين'], ['coupons', 'كوبونات'], ['social', 'التواصل'], ['payments', 'وسائل الدفع'], ['users', 'المستخدمين'], ['apis', 'إعدادات APIs'], ['affiliates', 'المسوقين'], ['orders', 'الطلبات']];
const SOCIAL = [['whatsapp', 'wa', 'واتساب', 'https://wa.me/9665XXXXXXXX'], ['telegram', 'tg', 'تلغرام', 'https://t.me/username'], ['instagram', 'ig', 'إنستغرام', 'https://instagram.com/username'], ['x', 'xx', 'X (تويتر)', 'https://x.com/username'], ['youtube', 'yt', 'يوتيوب', 'https://youtube.com/@channel'], ['email', 'mail', 'البريد', 'mailto:support@example.com']];
const ORDER_STATUSES = [['new', 'جديد'], ['processing', 'قيد التنفيذ'], ['paid', 'تم الدفع'], ['done', 'مكتمل'], ['cancelled', 'ملغي']];
const baseCur = () => { const e = Object.entries(D.rates).find(([, v]) => +v[0] == 1); return e ? e[0] : 'SAR'; };
const catName = id => (D.categories.find(c => c.id == id) || {}).ar || '—';

/* ---------- 5. Toast & draft ---------- */
function toast(m, k = '') { const e = $('#ts'); e.textContent = m; e.className = 's ' + k; clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', k ? 3200 : 2200); }
function badge() { const b = $('#bdg'); if (!b) return; b.className = 'bdg ' + (dirty ? 'd' : 'k'); b.textContent = dirty ? 'تعديلات غير منشورة' : 'منشور'; }
function save() { dirty = true; try { localStorage.setItem('amx_draft', JSON.stringify(pubData())); badge(); } catch (e) { toast('تعذّر حفظ المسودة', 'e'); } }
let tm; const later = () => { clearTimeout(tm); tm = setTimeout(save, 300); };
const busy = (btn, on) => { if (!btn) return; if (on) { btn.dataset.h = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + btn.textContent; } else if (btn.dataset.h != null) { btn.innerHTML = btn.dataset.h; btn.disabled = false; delete btn.dataset.h; } };

/* ---------- 4. Form builders ---------- */
function imgf(p, v) {
  const d = String(v || '').startsWith('data:'), logo = /logo/.test(p);
  return `<div class="imgf"><span class="thm">${v ? `<img src="${esc(v)}" alt="">` : ic('box', 20)}</span><input class="inp" dir="ltr" data-p="${p}" data-re="1" value="${d ? '' : esc(v)}" placeholder="${d ? 'صورة مرفوعة ✓' : 'https://… رابط الصورة'}"><label class="b b2 sm">رفع<input type="file" accept="image/*" hidden data-up="${p}" data-mx="${logo ? 512 : 900}" data-png="${logo ? 1 : 0}"></label>${v ? `<button class="b bd2 sm" data-a="clr" data-p="${p}" title="حذف">✕</button>` : ''}</div>`;
}
function imgsf(p, v) {
  v = v || [];
  return `<div class="grid-imgs">${v.map((u, i) => `<span class="thm"><img src="${esc(u)}" alt=""><button data-a="clr-img" data-p="${p}" data-i="${i}">✕</button></span>`).join('')}</div><label class="dropzone" ondragover="event.preventDefault()" ondrop="event.preventDefault();handleDrop(event,'${p}')"><input type="file" accept="image/*" multiple hidden data-up="${p}" data-mx="1200"><span>اسحب وأفلت الصور هنا أو اضغط للرفع (متعدد)</span></label>`;
}
function F(l, p, o = {}) {
  const v = g(D, p), t = o.t || 'text', a = `data-p="${p}"${o.n ? ' data-n="1"' : ''}${o.re ? ' data-re="1"' : ''}`; let h;
  if (t == 'chk') return `<label class="chk"><input type="checkbox" ${a} ${v !== false && v ? 'checked' : ''}> ${l}</label>`;
  if (t == 'area') h = `<textarea class="inp" rows="${o.r || 3}" ${a}>${esc(v)}</textarea>`;
  else if (t == 'sel') h = `<select class="inp" ${a}>${o.o.map(([k, n]) => `<option value="${esc(k)}" ${k == v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  else if (t == 'img') h = imgf(p, v);
  else if (t == 'imgs') h = imgsf(p, v);
  else if (t == 'col') h = `<input type="color" class="inp col" value="${esc(v || '#000000')}" ${a}>`;
  else h = `<input class="inp" type="${t == 'num' ? 'number' : 'text'}" ${t == 'num' ? 'step="any"' : ''} value="${esc(v)}" ${o.d ? 'dir="ltr"' : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${a}>`;
  return `<div class="fld ${o.w ? 'w2' : ''}"><span>${l}</span>${h}</div>`;
}
function mv(k, i) {
  return `<div class="acts"><button class="b b2 sm" data-a="mv" data-k="${k}" data-i="${i}" data-d="-1">↑</button><button class="b b2 sm" data-a="mv" data-k="${k}" data-i="${i}" data-d="1">↓</button><button class="b bd2 sm" data-a="del" data-k="${k}" data-i="${i}">حذف</button></div>`;
}
const loadingHTML = '<div class="ld"><span class="spin"></span> جارٍ التحميل…</div>';

/* ---------- 7. Views (one function per sidebar tab) ---------- */
const VIEW = {
  home() {
    const n = D.products.length;
    return `<div class="stats"><div class="stat"><b>${D.categories.length}</b><span>الأقسام</span></div><div class="stat"><b>${n}</b><span>المنتجات</span></div><div class="stat"><b>${D.embeds.length}</b><span>التضمين</span></div><div class="stat"><b>${D.banners.length}</b><span>البانرات</span></div><div class="stat"><b>${Object.keys(D.coupons).length}</b><span>الكوبونات</span></div></div>
<div class="card"><h2>نشر التعديلات</h2><p class="hint">النشر يحفظ إعدادات المتجر في جدول store_config. مفاتيح الـ APIs لا تُنشر أبداً.</p><div class="acts"><button class="b" data-a="pub">نشر الآن</button><button class="b b2" data-a="exp">نسخة احتياطية</button><label class="b b2">استيراد<input type="file" accept=".js,.json" hidden data-imp="1"></label></div></div>`;
  },
  site() {
    const s = 'site.';
    return `<div class="card"><h2>الهوية</h2><div class="g2">${F('الاسم 1', s + 'n1', { d: 1 })}${F('الاسم 2', s + 'n2', { d: 1 })}${F('الشعار', s + 'logo', { t: 'img', w: 1 })}${F('العنوان (عربي)', s + 'sa')}${F('العنوان (إنجليزي)', s + 'se', { d: 1 })}${F('الوصف', s + 'desc', { t: 'area', w: 1 })}${F('حقوق النشر (عربي)', s + 'rt.ar', { w: 1 })}${F('حقوق النشر (إنجليزي)', s + 'rt.en', { w: 1, d: 1 })}${F('تنبيه المخاطر (عربي)', s + 'risk.ar', { t: 'area', w: 1 })}${F('تنبيه المخاطر (إنجليزي)', s + 'risk.en', { t: 'area', w: 1, d: 1 })}</div></div>
<div class="card"><h2>الألوان</h2><div class="g3">${F('الأساسي', s + 'col.g', { t: 'col' })}${F('التمييز', s + 'col.m', { t: 'col' })}${F('الإطارات', s + 'col.ac', { t: 'col' })}</div></div>`;
  },
  partner() {
    const s = 'partner.';
    return `<div class="card"><h2>الشريك</h2>${F('إظهار', s + 'on', { t: 'chk' })}<div class="g2">${F('الاسم', s + 'name', { d: 1 })}${F('الرابط', s + 'url', { d: 1 })}${F('الشعار', s + 'logo', { t: 'img', w: 1 })}${F('خلفية البانر (Banner BG)', s + 'banner_bg_url', { t: 'img', w: 1 })}${F('الوصف (عربي)', s + 'ar', { t: 'area', w: 1 })}${F('الوصف (إنجليزي)', s + 'en', { t: 'area', w: 1, d: 1 })}${F('نص الزر (عربي)', s + 'ba')}${F('نص الزر (إنجليزي)', s + 'be', { d: 1 })}</div></div>`;
  },
  banners() {
    const hs = [['#/', 'الرئيسية'], ...D.categories.map(c => ['#/c/' + c.id, 'قسم: ' + c.ar])];
    return `<div class="card"><h2>البانرات</h2><button class="b" data-a="add" data-k="banners">+ بانر جديد</button></div>` + D.banners.map((b, i) => {
      const k = 'banners.' + i + '.';
      return `<div class="card"><div class="g2">${F('العنوان (عربي)', k + 'ar')}${F('العنوان (إنجليزي)', k + 'en', { d: 1 })}${F('الوصف (عربي)', k + 'sa')}${F('الوصف (إنجليزي)', k + 'se', { d: 1 })}${F('الرابط', k + 'h', { t: 'sel', o: hs.some(x => x[0] == b.h) ? hs : [...hs, [b.h, b.h]] })}${F('صورة الخلفية', k + 'img', { t: 'img' })}</div>${mv('banners', i)}</div>`;
    }).join('');
  },
  categories() {
    return `<div class="card"><h2>الأقسام</h2><button class="b" data-a="add" data-k="categories">+ قسم جديد</button></div>` + D.categories.map((c, i) => {
      const k = 'categories.' + i + '.';
      return `<div class="card"><div class="g2">${F('الاسم (عربي)', k + 'ar')}${F('الاسم (إنجليزي)', k + 'en', { d: 1 })}${F('الوصف (عربي)', k + 'da')}${F('الوصف (إنجليزي)', k + 'de', { d: 1 })}${F('النوع', k + 'ty', { t: 'sel', o: TYPES, re: 1 })}${F('الأيقونة', k + 'i', { t: 'sel', o: ICONS.map(x => [x, x]), re: 1 })}${F('صورة القسم', k + 'image_url', { t: 'img', w: 1 })}${F('رابط تضمين (iframe) للقسم', k + 'embed_url', { d: 1, w: 1 })}</div>${mv('categories', i)}</div>`;
    }).join('');
  },
  products() {
    if (ed != null && D.products[ed]) {
      const k = 'products.' + ed + '.', p = D.products[ed], opts = D.categories.map(x => [x.id, x.ar]);
      return `<div class="card"><button class="b b2" data-a="back">← رجوع</button><h2>${esc(p.ar)}</h2>
<div class="g2">${F('القسم', k + 'c', { t: 'sel', o: opts, re: 1 })}${F('التسليم', k + 't', { t: 'sel', o: DELIV, n: 1 })}${F('الاسم (عربي)', k + 'ar', { w: 1 })}${F('الاسم (إنجليزي)', k + 'en', { w: 1, d: 1 })}</div>
<div class="g3">${F('السعر', k + 'p', { t: 'num' })}${F('سعر قديم', k + 'o', { t: 'num' })}${F('الخصم %', k + 'd', { t: 'num' })}${F('التقييم', k + 'r', { t: 'num' })}${F('عدد التقييمات', k + 'n', { t: 'num' })}${F('ترتيب الأكثر مبيعاً', k + 'bs', { t: 'num' })}</div>
<div class="g2">${F('وسوم', k + 'tg', { w: 1 })}${F('مواصفات', k + 'sp', { w: 1 })}${F('الوصف (عربي)', k + 'ds.ar', { t: 'area', w: 1 })}${F('الوصف (إنجليزي)', k + 'ds.en', { t: 'area', w: 1, d: 1 })}</div>
<div class="card" style="background:var(--bg)"><h3>صور المنتج</h3>${F('الصورة الرئيسية', k + 'img', { t: 'img', w: 1 })}${F('معرض الصور المتعددة', k + 'images', { t: 'imgs', w: 1 })}</div>
</div>`;
    }
    const q = pq.trim().toLowerCase(), L = D.products.map((p, i) => [p, i]).filter(([p]) => (!pcat || p.c == pcat) && (!q || (p.ar + ' ' + p.en).toLowerCase().includes(q)));
    return `<div class="card"><h2>المنتجات (${D.products.length})</h2><div class="sw"><input class="inp" id="pq" placeholder="بحث…" value="${esc(pq)}"><button class="b" data-a="add" data-k="products">+ منتج</button></div>
${L.map(([p, i]) => `<div class="it"><span class="thm">${p.img ? `<img src="${esc(p.img)}" alt="">` : ic('box')}</span><div class="im"><b>${esc(p.ar)}</b><small>${esc(catName(p.c))} · ${p.p}</small></div><button class="b b2 sm" data-a="edit" data-i="${i}">تعديل</button><button class="b bd2 sm" data-a="del" data-k="products" data-i="${i}">حذف</button></div>`).join('')}</div>`;
  },
  embeds() {
    const opts = D.categories.map(x => [x.id, x.ar]);
    if (ed != null && D.embeds[ed]) {
      const k = 'embeds.' + ed + '.', e = D.embeds[ed];
      return `<div class="card"><button class="b b2" data-a="back">← رجوع</button><h2>${esc(e.ar)}</h2><div class="g2">${F('القسم', k + 'c', { t: 'sel', o: opts })}${F('الارتفاع', k + 'h', { t: 'num' })}${F('العنوان (عربي)', k + 'ar')}${F('العنوان (إنجليزي)', k + 'en', { d: 1 })}${F('الرابط', k + 'u', { w: 1, d: 1 })}${F('الوصف (عربي)', k + 'da', { t: 'area', w: 1 })}${F('الوصف (إنجليزي)', k + 'de', { t: 'area', w: 1, d: 1 })}</div></div>`;
    }
    return `<div class="card"><h2>عناصر التضمين (${D.embeds.length})</h2><button class="b" data-a="add" data-k="embeds">+ رابط</button>
${D.embeds.map((e, i) => `<div class="it"><div class="im"><b>${esc(e.ar)}</b><small dir="ltr">${esc(e.u)}</small></div><button class="b b2 sm" data-a="edit" data-i="${i}">تعديل</button><button class="b bd2 sm" data-a="del" data-k="embeds" data-i="${i}">حذف</button></div>`).join('')}</div>`;
  },
  /* Coupons tab (was listed in TABS but had no view -> it crashed) */
  coupons() {
    const rows = Object.entries(D.coupons);
    return `<div class="card"><h2>الكوبونات (${rows.length})</h2>
<p class="hint">لكل كود: نسبة خصم % + مبلغ ثابت بالعملة الأساسية (${esc(baseCur())}). الخصم الكلي لا يتجاوز مجموع السلة. مثال: 10 و 0 = خصم 10%.</p>
<button class="b" data-a="add-cpn">+ كوبون</button>
${rows.map(([code, v]) => `<div class="it" style="flex-wrap:wrap"><label class="fld" style="margin:0;flex:1;min-width:140px"><span>الكود</span><input class="inp" dir="ltr" data-cc="${esc(code)}" value="${esc(code)}"></label>
<label class="fld" style="margin:0;width:110px"><span>نسبة %</span><input class="inp" type="number" step="any" min="0" max="100" data-cv="${esc(code)}" data-ci="0" value="${+v[0] || 0}"></label>
<label class="fld" style="margin:0;width:130px"><span>مبلغ ثابت</span><input class="inp" type="number" step="any" min="0" data-cv="${esc(code)}" data-ci="1" value="${+v[1] || 0}"></label>
<button class="b bd2 sm" data-a="del-cpn" data-code="${esc(code)}">حذف</button></div>`).join('')}</div>`;
  },
  /* Social links tab (was listed in TABS but had no view -> it crashed) */
  social() {
    return `<div class="card"><h2>روابط التواصل</h2><p class="hint">تظهر في أسفل المتجر. رابط واتساب يُستخدم أيضاً في زر «اطلب عبر واتساب» (يجب أن يحتوي على الرقم الدولي بدون +). اترك الحقل فارغاً لإخفاء الأيقونة.</p>
<div class="g2">${SOCIAL.map(([k, icon, label, ph]) => `<label class="fld"><span>${label}</span><input class="inp" dir="ltr" data-sc="${k}" data-si="${icon}" value="${esc((D.social[k] || [])[1] || '')}" placeholder="${esc(ph)}"></label>`).join('')}</div></div>`;
  },
  payments() {
    if (!Array.isArray(D.payments) || !D.payments.length) {
      D.payments = [
        { id:'syriatel', name:'Syriatel Cash', name_ar:'سيرياتيل كاش', on:true, note:'', note_ar:'' },
        { id:'dam', name:'Dam Cash', name_ar:'ضام كاش', on:true, note:'', note_ar:'' },
        { id:'usdt', name:'USDT BEP20', name_ar:'USDT BEP20', on:true, note:'', note_ar:'' },
        { id:'binance', name:'Binance Pay', name_ar:'بايننس Pay', on:true, note:'', note_ar:'' }
      ];
    }
    const rows = D.payments.map((p, i) => {
      const k = 'payments.' + i + '.';
      return '<div class="card" style="margin-top:10px"><div class="g2">'
        + F('مفعّلة', k + 'on', { t: 'chk' })
        + F('المعرّف (id)', k + 'id', { d: 1 })
        + F('الاسم (إنجليزي)', k + 'name', { d: 1 })
        + F('الاسم (عربي)', k + 'name_ar')
        + F('ملاحظة / رقم (إنجليزي)', k + 'note', { d: 1, w: 1 })
        + F('ملاحظة / رقم (عربي)', k + 'note_ar', { w: 1 })
        + '</div></div>';
    }).join('');
    return '<div class="card"><h2>وسائل الدفع</h2><p class="hint">تظهر في أسفل المتجر وفي صفحة السلة مع شعاراتها. يمكنك إظهار/إخفاء كل وسيلة وتعديل الاسم والملاحظات (رقم المحفظة، العنوان…).</p>' + rows + '</div>';
  },
  users() { setTimeout(loadUsers, 50); return `<div class="card"><h2>المستخدمين المسجلين</h2><div id="users-list">${loadingHTML}</div></div>`; },
  apis() {
    return `<div class="card"><h2>إعدادات الربط البرمجي (APIs)</h2>
<p class="hint">⚠ تُحفظ في جدول api_settings فقط (يجب أن يكون RLS للمدراء فقط) ولا تُنشر مع إعدادات المتجر. الأفضل نقل المفاتيح السرية إلى Supabase Edge Function secrets.</p>
<p class="hint" style="border-color:var(--wn)">📌 خدمات الرشق (SMM): المفاتيح السرية لا تُستدعى من الواجهة الأمامية لأسباب أمنية. لتشغيل الطلبات تلقائياً أنشئ Supabase Edge Function تستدعي SMM API عند إنشاء طلب من نوع boost، أو نفّذ الطلبات يدوياً من لوحة الطلبات بعد الدفع.</p>
<form id="api-form" autocomplete="off">
<div class="g2">${F('SMM API URL', 'api.smm_url', { d: 1 })}${F('SMM API Key', 'api.smm_key', { d: 1 })}${F('Payment Gateway (اسم البوابة)', 'api.payment_gateway', { d: 1 })}${F('Payment Public Key', 'api.payment_public_key', { d: 1 })}${F('Payment Secret Key', 'api.payment_secret_key', { d: 1 })}${F('AI Support API Key (مثال: OpenAI)', 'api.ai_api_key', { d: 1 })}</div>
${F('AI System Prompt (رسالة توجيه المساعد)', 'api.ai_system_prompt', { t: 'area', w: 1 })}
<button class="b" data-a="save-api" type="button">حفظ الإعدادات</button></form></div>`;
  },
  affiliates() { setTimeout(loadAffiliates, 50); return `<div class="card"><h2>المسوقين (Affiliates)</h2><div id="aff-list">${loadingHTML}</div></div>`; },
  orders() {
    setTimeout(loadOrders, 50);
    return `<div class="card"><h2>الطلبات <small class="od-m" id="oc"></small></h2>
<div class="fl"><select class="inp" id="of"><option value="">كل الحالات</option>${ORDER_STATUSES.map(([k, n]) => `<option value="${k}" ${ordFilter == k ? 'selected' : ''}>${n}</option>`).join('')}</select>
<input class="inp" id="oq" placeholder="بحث: رقم الطلب / الاسم / البريد" value="${esc(ordQ)}"><button class="b b2 sm" data-a="reload-orders">تحديث</button></div>
<div id="ob">${loadingHTML}</div></div>`;
  }
};

function render() {
  const warn = IS_ADMIN === false ? '<div class="card" style="border-color:var(--wn)"><small>⚠ حسابك الحالي غير مضاف في جدول admins؛ قد تفشل عمليات النشر وتغيير الحالات بسبب سياسات RLS.</small></div>' : '';
  $('#app').innerHTML = `<header class="top"><div class="w tr"><b class="ttl">⚙ لوحة التحكم <small>${esc(D.site.n1 + D.site.n2)}</small></b><span class="bdg" id="bdg"></span><span class="sp"></span><a class="b b2 sm" href="index.html" target="_blank" rel="noopener">معاينة ↗</a><button class="b sm" data-a="pub">نشر الآن</button><button class="b b2 sm" data-a="logout">خروج</button></div></header><div class="w lay"><nav class="sd">${TABS.map(([k, n]) => `<button class="${tab == k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</nav><main>${warn}${(VIEW[tab] || VIEW.home)()}</main></div>`;
  badge();
}

/* ---------- 8. Events ---------- */
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.p) { let v = t.type == 'checkbox' ? t.checked : t.value; if (t.dataset.n || t.type == 'number') v = v === '' ? 0 : +v; st(D, t.dataset.p, v); later(); }
  else if (t.id == 'pq') { pq = t.value; const p = t.selectionStart; render(); const n = $('#pq'); n.focus(); n.setSelectionRange(p, p); }
  else if (t.id == 'oq') { ordQ = t.value; renderOrderList(); }
});
document.addEventListener('change', async e => {
  const t = e.target, d = t.dataset;
  if (d.up) return upl(t);
  if (d.imp) return imp(t);
  if (d.ost) return setOrderStatus(t);                                   // order status -> database
  if (t.id == 'of') { ordFilter = t.value; return renderOrderList(); }
  if (d.cc != null) return renameCoupon(d.cc, t.value);                  // coupon code
  if (d.cv != null) { D.coupons[d.cv][+d.ci] = Math.max(0, +t.value || 0); return save(); }
  if (d.sc) { D.social[d.sc] = [d.si, t.value.trim()]; return save(); }  // social link
  if (d.p) { let v = t.type == 'checkbox' ? t.checked : t.value; st(D, d.p, v); save(); if (d.re) render(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('button,[data-tab]'); if (!b) return; const d = b.dataset;
  if (d.tab) { tab = d.tab; ed = null; render(); if (tab == 'apis') loadApis(); return; }
  const a = d.a; if (!a) return;
  if (a == 'logout') { try { localStorage.removeItem('amx_sb'); } catch {} SES = null; return loginView(); }
  if (a == 'back') { ed = null; return render(); }
  if (a == 'edit') { ed = +d.i; return render(); }
  if (a == 'clr') { st(D, d.p, ''); save(); return render(); }
  if (a == 'clr-img') { D.products[ed].images.splice(+d.i, 1); save(); return render(); }
  if (a == 'add') { const it = NEW[d.k](); if (d.k == 'products' || d.k == 'embeds') { D[d.k].unshift(it); ed = 0; } else D[d.k].push(it); save(); return render(); }
  if (a == 'mv') { const k = d.k, i = +d.i, j = i + +d.d; if (j < 0 || j >= D[k].length) return; [D[k][i], D[k][j]] = [D[k][j], D[k][i]]; save(); return render(); }
  if (a == 'del') { if (!confirm('تأكيد الحذف؟')) return; D[d.k].splice(+d.i, 1); save(); return render(); }
  if (a == 'add-cpn') { let n = Object.keys(D.coupons).length + 1, c; do { c = 'CODE' + n++; } while (D.coupons[c]); D.coupons[c] = [10, 0]; save(); return render(); }
  if (a == 'del-cpn') { if (!confirm('حذف الكوبون؟')) return; delete D.coupons[d.code]; save(); return render(); }
  if (a == 'save-api') return saveApis(b);
  if (a == 'pub') return publish(b);
  if (a == 'exp') return exportBackup();
  if (a == 'reload-orders') return loadOrders();
});
const NEW = {
  categories: () => ({ id: 'c' + uid(), ty: 'shop', i: 'box', ar: 'قسم جديد', en: 'New category', da: '', de: '', f: [], embed_url: '', image_url: '' }),
  products: () => ({ id: 'p' + uid(), c: (D.categories[0] || {}).id || '', ar: 'منتج جديد', en: 'New product', p: 100, o: 0, d: 0, r: 5, n: 0, bs: 0, t: 0, tg: '', sp: '', ds: { ar: '', en: '' }, img: '', images: [] }),
  embeds: () => ({ id: 'e' + uid(), c: (D.categories[0] || {}).id || '', ar: 'عنوان', en: 'Title', da: '', de: '', u: 'https://', h: 480 }),
  banners: () => ({ ar: 'عنوان', en: 'Title', sa: '', se: '', h: '#/', img: '' })
};
function renameCoupon(oldCode, raw) {
  const code = String(raw).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code) { toast('كود غير صالح (أحرف إنجليزية وأرقام فقط)', 'e'); return render(); }
  if (code != oldCode && D.coupons[code]) { toast('هذا الكود موجود مسبقاً', 'e'); return render(); }
  if (code != oldCode) { const rebuilt = {}; for (const [k, v] of Object.entries(D.coupons)) rebuilt[k == oldCode ? code : k] = v; D.coupons = rebuilt; }
  save(); render();
}

/* ---------- 9. Uploads, backup & import ---------- */
const rd = (f, cb) => { const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(f); };
function setimg(p, u) { st(D, p, u); save(); render(); }
async function up(blob, ext, type) {
  const name = 'img/' + uid() + '.' + ext;
  const r = await api('/storage/v1/object/store-media/' + name, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'true' }, body: blob });
  if (!r.ok) throw new Error((await r.text()).slice(0, 150));
  return SB_URL + '/storage/v1/object/public/store-media/' + name;
}
function upl(t) {
  const files = t.files; if (!files.length) return;
  const p = t.dataset.up, mx = +t.dataset.mx || 900;
  Array.from(files).forEach(f => {
    const fail = e => toast('فشل الرفع: ' + e.message, 'e');
    rd(f, u => {
      const im = new Image();
      im.onload = () => {
        const rr = Math.min(1, mx / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * rr); c.height = Math.round(im.height * rr);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(b => up(b, 'jpg', 'image/jpeg').then(url => {
          if (p.includes('images')) { if (!D.products[ed].images) D.products[ed].images = []; D.products[ed].images.push(url); save(); render(); }
          else setimg(p, url);
        }).catch(fail), 'image/jpeg', .82);
      };
      im.onerror = () => toast('الملف ليس صورة صالحة', 'e');
      im.src = u;
    });
  });
}
window.handleDrop = (e, p) => {
  const f = e.dataTransfer.files[0]; if (!f) return;
  const dt = new DataTransfer(); dt.items.add(f);
  const inp = document.querySelector(`input[data-up="${p}"]`); inp.files = dt.files; upl(inp);
};
function exportBackup() {
  const blob = new Blob([JSON.stringify(pubData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'amarix-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('تم تنزيل النسخة الاحتياطية');
}
function imp(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      // Accepts a .json backup or a store-data.js file ("window.AMX = {...};")
      const txt = String(r.result).replace(/^\s*(?:window\.AMX|var\s+AMX|const\s+AMX)\s*=\s*/, '').replace(/;\s*$/, '');
      const j = JSON.parse(txt);
      if (!j || !Array.isArray(j.products) || !Array.isArray(j.categories)) throw new Error('بنية غير صالحة');
      if (!confirm('سيتم استبدال البيانات الحالية بالملف المستورد. متابعة؟')) return;
      const keepApi = D.api; D = clone(j); delete D.api; D.api = keepApi || {}; fix(); save(); ed = null; render(); toast('تم الاستيراد — اضغط «نشر الآن» لتطبيقه');
    } catch (err) { toast('فشل الاستيراد: ' + err.message, 'e'); }
    input.value = '';
  };
  r.readAsText(f);
}

/* ---------- 10. Supabase session & REST helper ---------- */
const sget = () => { try { return JSON.parse(localStorage.getItem('amx_sb')); } catch { return null; } };
async function auth(body, grant) {
  const r = await fetch(SB_URL + '/auth/v1/token?grant_type=' + grant, { method: 'POST', mode: 'cors', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.msg || 'فشل');
  SES = { access_token: j.access_token, refresh_token: j.refresh_token, exp: Math.floor(Date.now() / 1e3) + (j.expires_in || 3600), email: (j.user || {}).email, uid: (j.user || {}).id || (SES && SES.uid) };
  try { localStorage.setItem('amx_sb', JSON.stringify(SES)); } catch {}
  return SES;
}
async function tok() { if (!SES) throw new Error('login'); if (SES.exp - 60 < Date.now() / 1e3) await auth({ refresh_token: SES.refresh_token }, 'refresh_token'); return SES.access_token; }
async function api(path, o = {}) { const t = await tok(); return fetch(SB_URL + path, { ...o, mode: 'cors', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + t, ...(o.headers || {}) } }); }
function loginView(msg = '') {
  $('#app').innerHTML = `<div class="w" style="max-width:380px;margin-top:12vh"><form class="card" id="lf"><h2 style="text-align:center">⚙ لوحة التحكم</h2><div class="fld"><span>البريد</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="username" required></div><div class="fld"><span>كلمة المرور</span><input class="inp" name="p" type="password" dir="ltr" autocomplete="current-password" required></div><p id="le" style="color:var(--er);font-size:12px">${esc(msg)}</p><button class="b" style="width:100%">دخول</button></form></div>`;
}
document.addEventListener('submit', async e => {
  if (e.target.id != 'lf') return; e.preventDefault();
  const f = new FormData(e.target), b = e.target.querySelector('.b'); busy(b, true);
  try { await auth({ email: f.get('e').trim(), password: f.get('p') }, 'password'); await boot(); }
  catch (x) { busy(b, false); $('#le').textContent = x.message; }
});
/* Soft check only: real protection is RLS. Calls the existing public.is_admin() function
   (based on the `admins` table) and shows a warning banner if the account is not an admin. */
async function checkRole() {
  IS_ADMIN = null; if (!SES) return;
  try {
    const r = await api('/rest/v1/rpc/is_admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (r.ok) { const v = await r.json(); if (typeof v == 'boolean') IS_ADMIN = v; }
  } catch {}
}

/* ---------- 11. Publish, API settings, users, orders ---------- */
async function loadCfg() {
  try {
    const r = await api('/rest/v1/store_config?id=eq.1&select=data'); if (!r.ok) throw new Error();
    const row = (await r.json())[0];
    D = clone(row && row.data && Array.isArray(row.data.products) ? row.data : PUB); dirty = !row;
  } catch (e) { D = clone(PUB); dirty = true; }
  delete D.api;            // never trust/keep secrets coming from the public config row
  fix();
}
async function publish(btn) {
  if (!confirm('نشر التعديلات الآن؟')) return;
  D.ts = Date.now(); busy(btn, true);
  try {
    const r = await api('/rest/v1/store_config', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, data: pubData(), updated_at: new Date().toISOString() }) });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    dirty = false; badge(); toast('تم النشر');
  } catch (e) { toast('فشل النشر: ' + (e.message || '').slice(0, 80), 'e'); }
  finally { busy(btn, false); }
}
async function loadApis() {
  try {
    const r = await api('/rest/v1/api_settings?id=eq.1&select=*'); if (!r.ok) throw new Error();
    const d = (await r.json())[0] || {};
    D.api = { smm_url: d.smm_api_url || '', smm_key: d.smm_api_key || '', payment_gateway: d.payment_gateway || '', payment_public_key: d.payment_public_key || '', payment_secret_key: d.payment_secret_key || '', ai_api_key: d.ai_api_key || '', ai_system_prompt: d.ai_system_prompt || '' };
    if (tab == 'apis') render();      // render() no longer calls loadApis(), so there is no loop any more
  } catch { toast('تعذّر تحميل إعدادات الـ APIs', 'e'); }
}
async function saveApis(btn) {
  const d = D.api || {}; busy(btn, true);
  try {
    const r = await api('/rest/v1/api_settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, smm_api_url: d.smm_url, smm_api_key: d.smm_key, payment_gateway: d.payment_gateway, payment_public_key: d.payment_public_key, payment_secret_key: d.payment_secret_key, ai_api_key: d.ai_api_key, ai_system_prompt: d.ai_system_prompt }) });
    if (!r.ok) throw new Error();
    toast('تم حفظ الإعدادات');
  } catch { toast('فشل الحفظ', 'e'); }
  finally { busy(btn, false); }
}
async function loadUsers() {
  const b = $('#users-list'); if (!b) return;
  try {
    const [pr, or] = await Promise.all([api('/rest/v1/profiles?select=*&order=created_at.desc'), api('/rest/v1/orders?select=user_id,total,status')]);
    if (!pr.ok) throw new Error();
    const users = await pr.json(), orders = or.ok ? await or.json() : [];
    const by = {}; orders.forEach(o => { if (o.user_id) (by[o.user_id] = by[o.user_id] || []).push(o); });
    b.innerHTML = `<div class="tw"><table class="tb"><tr><th>الاسم</th><th>البريد</th><th>الطلبات</th><th>الإجمالي</th><th>الحالة</th></tr>${users.map(x => {
      const os = (by[x.id] || []).filter(o => o.status != 'cancelled');
      return `<tr><td>${esc(x.full_name || '—')}</td><td dir="ltr">${esc(x.email)}</td><td>${os.length}</td><td>${os.reduce((s, o) => s + +o.total, 0).toFixed(2)}</td><td>${os.length ? '<span style="color:var(--lk)">أتم طلبات</span>' : '<span style="color:#FBBF24">لا يوجد طلب</span>'}</td></tr>`;
    }).join('')}</table></div>`;
  } catch { b.textContent = 'فشل التحميل'; }
}
async function loadAffiliates() {
  const b = $('#aff-list'); if (!b) return;
  try {
    const r = await api('/rest/v1/affiliates?select=*,profiles(email)'); if (!r.ok) throw new Error();
    const a = await r.json();
    b.innerHTML = `<div class="tw"><table class="tb"><tr><th>المسوق</th><th>النقرات</th><th>المبيعات</th><th>العمولة</th></tr>${a.map(x => `<tr><td dir="ltr">${esc((x.profiles || {}).email || x.user_id)}</td><td>${x.clicks}</td><td>${x.sales}</td><td>${(+x.total_commission).toFixed(2)}</td></tr>`).join('')}</table></div>`;
  } catch { b.textContent = 'فشل التحميل'; }
}

/* Orders: list, filter, and a status change that really updates the database */
let ORDERS = null, ordFilter = '', ordQ = '';
const statusLabel = k => (ORDER_STATUSES.find(s => s[0] == k) || [k, k || '—'])[1];
async function loadOrders() {
  const b = $('#ob'); if (!b) return; b.innerHTML = loadingHTML;
  try {
    const r = await api('/rest/v1/orders?select=*&order=created_at.desc&limit=200');
    if (!r.ok) throw new Error(); ORDERS = await r.json(); renderOrderList();
  } catch { b.textContent = 'فشل التحميل'; }
}
function orderRow(o) {
  let items = o.items; if (typeof items == 'string') { try { items = JSON.parse(items); } catch { items = []; } } items = Array.isArray(items) ? items : [];
  const known = ORDER_STATUSES.some(s => s[0] == o.status), st0 = known ? o.status : 'new';
  const date = o.created_at ? new Date(o.created_at).toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<div class="od"><div class="od-h"><div><span class="od-id">${esc(o.id)}</span><div class="od-m">${esc(o.customer_name || '—')} · <span dir="ltr">${esc(o.customer_email || '')}</span></div><div class="od-m">${esc(date)} · <b>${(+o.total).toFixed(2)} ${esc(o.currency || baseCur())}</b>${o.coupon ? ' · كوبون: <span dir="ltr">' + esc(o.coupon) + '</span>' : ''}${o.affiliate_ref ? ' · Ref: ' + esc(o.affiliate_ref) : ''}</div></div>
<div class="od-s"><select class="inp s-${st0}" data-ost="${esc(o.id)}" data-prev="${esc(st0)}">${ORDER_STATUSES.map(([k, n]) => `<option value="${k}" ${st0 == k ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
<details><summary>المنتجات (${items.length})</summary><div class="od-items">${items.map(i => `<div><span>${esc(i.ar || i.name || i.id)} × ${esc(i.q)}${i.link ? '<br><small dir="ltr">' + esc(i.link) + '</small>' : ''}</span><b>${esc(i.price)}</b></div>`).join('')}</div></details></div>`;
}
function renderOrderList() {
  const b = $('#ob'); if (!b || !ORDERS) return;
  const q = ordQ.trim().toLowerCase();
  const list = ORDERS.filter(o => (!ordFilter || (o.status || 'new') == ordFilter) && (!q || ((o.id || '') + ' ' + (o.customer_name || '') + ' ' + (o.customer_email || '')).toLowerCase().includes(q)));
  b.innerHTML = list.length ? list.map(orderRow).join('') : '<p class="hint">لا توجد طلبات مطابقة</p>';
  const c = $('#oc'); if (c) c.textContent = `(${list.length} من ${ORDERS.length} · جديد: ${ORDERS.filter(o => (o.status || 'new') == 'new').length})`;
}
async function setOrderStatus(sel) {
  const id = sel.dataset.ost, prev = sel.dataset.prev, status = sel.value; sel.disabled = true;
  try {
    // return=representation lets us detect a silent RLS block (0 rows updated)
    const r = await api('/rest/v1/orders?id=eq.' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ status }) });
    if (!r.ok) throw new Error((await r.text()).slice(0, 120));
    const rows = await r.json(); if (!rows.length) throw new Error('RLS: لا صلاحية للتعديل');
    const o = (ORDERS || []).find(x => x.id == id); if (o) o.status = status;
    sel.dataset.prev = status; sel.className = 'inp s-' + status;
    toast('تم تحديث الحالة: ' + statusLabel(status));
  } catch (e) { sel.value = prev; toast('فشل تحديث الحالة — ' + (e.message || ''), 'e'); }
  finally { sel.disabled = false; }
}

/* ---------- 12. Boot ---------- */
async function boot() {
  SES = sget();
  if (SES) { try { await tok(); } catch { SES = null; } }
  if (!SES) return loginView();
  await Promise.all([loadCfg(), checkRole()]);
  render();
}
boot();

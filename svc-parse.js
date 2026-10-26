/* AMARIX007 — SMM service-name parser (shared by index.html and admin.html)
   ---------------------------------------------------------------------
   Panel providers (رشق / SMM) put everything into one long service name, e.g.
     "Instagram Followers [Refill 30D] [Max 1M] - Fast - Start: 0-1 Hour - Speed 50K/Day 🔥"
     "خدمات أخرى تيليجرام – ⚫ اعضاء قناة/جروب تيليجرام [خدمة جديدة] [سرعة 10K/يوم]"
   A list of such names is unreadable: the platform / type words repeat on every row, the useful parts (refill, speed, start time…)
   sit at the very end where the line is cut off, and decorations (●, 🔥, ⚡, ★) add noise.

   AMXSvc.parse(name) splits the name into
     title : short clean title (no platform/type prefix, no brackets, no emoji)
     tags  : known features   [{ id, ar, en }]   id = refill | norefill | nodrop | fast | speed | start | new | cancel | geo | quality | extra
     full  : the original name, whitespace-normalised
   It only reads text, never changes data, so it works on products imported before this file existed. */
(function (g) {
  "use strict";

  /* platform words that are stripped from the START of a title (the platform icon already says it) */
  const PLAT =
    "instagram|insta|ig|tiktok|tik tok|youtube|yt|telegram|tg|facebook|fb|twitter|x|whatsapp|snapchat|snap chat|spotify|threads|linkedin|discord|twitch|kick|reddit|soundcloud|pinterest|tumblr|quora|coinmarketcap|" +
    "انستغرام|انستجرام|إنستغرام|إنستجرام|تيك توك|تيكتوك|يوتيوب|تيليجرام|تيليغرام|فيسبوك|فيس بوك|تويتر|إكس|اكس|واتساب|سناب شات|سناب|سبوتيفاي|ثريدز|لينكدإن|لينكد إن|ديسكورد|تويتش|كيك|ريديت|ساوند كلاود|بينترست|تمبلر|كورا";
  const SEP = "[\\s\\-–—:|>•·~=*#/\\\\.,،]";
  const HEAD_TYPE = "متابعين|لايكات|مشاهدات|تعليقات|مشاركات وحفظ";
  const re = (s, f) => new RegExp(s, f || "iu");
  /* old importer prefix: "<type> <platform> — <name>"  (and the new one: "<platform> · <name>") */
  const RE_GEN = re("^(?:(?:" + HEAD_TYPE + "|خدمات أخرى)\\s+)?(?:" + PLAT + "|منصات أخرى)\\s*[—–·-]\\s*");
  const RE_HEAD_PLAT = re("^(?:(?:" + PLAT + ")(?=" + SEP + "|$)" + SEP + "*)+");
  const RE_HEAD_OTHER = re("^(?:خدمات أخرى|other services?)(?=" + SEP + "|$)" + SEP + "*");
  const RE_TYPE_ONLY = re("^(?:followers?|likes?|views?|comments?|shares?|members?|subscribers?|متابعين|لايكات|مشاهدات|تعليقات|اعضاء|أعضاء)$");

  const RE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2900}-\u{297F}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{200E}\u{200F}\u{20E3}]/gu;
  const RE_BRACKET = /[\[({【「（]\s*([^\])}】」）]{1,70}?)\s*[\])}】」）]/g;
  const RE_STRAY = /[\[\](){}【】「」（）]/g;
  const RE_SPLIT = /\s[-–—|•·~]+\s|\s*[|•·~]\s*|\s+[-–—]\s*(?=[^\s])/;

  const tr = (s) =>
    String(s)
      .replace(/\b(?:hours?|hrs?)\b/gi, "س")
      .replace(/\b(?:minutes?|mins?)\b/gi, "د")
      .replace(/(\d)\s*h\b/gi, "$1 س")
      .replace(/(\d)\s*m\b/gi, "$1 د")
      .replace(/(\d)\s*d(?:ays?)?\b/gi, "$1 يوم")
      .replace(/\bdays?\b/gi, "يوم")
      .replace(/ساعات|ساعة/g, "س")
      .replace(/دقائق|دقيقة/g, "د")
      .replace(/\s+/g, " ")
      .trim();
  const en = (s) =>
    String(s)
      .replace(/(\d)\s*(?:س)\b/g, "$1h")
      .replace(/\s+/g, " ")
      .trim();

  /* each rule: [id, test, builder(token) -> {ar,en} | null]; first match wins; "drop" = information already shown elsewhere (price, min/max) */
  const num = (t, r) => {
    const m = t.match(r);
    return m ? m[1] : "";
  };
  const RULES = [
    ["drop", /(?:^|\b)(?:max|min)\b\s*[:=]?\s*[\d.,]+\s*[kmb]?|(?:الحد|أقصى|اقصى|أدنى|ادنى)\s*(?:الاقصى|الأقصى|الادنى|الأدنى)?\s*[:=]?\s*[\d.,]+|\$|usd|per\s*1000|\/\s*1000|لكل\s*1000|cheap|offer|sale|best\s*price|رخيص|خصم|أرخص|ارخص/i, () => null],
    [
      "norefill",
      /\b(?:no|non|without)[\s-]*refill\b|بدون\s*(?:ضمان|تعويض)|لا\s*(?:ضمان|تعويض)|غير\s*مضمون/i,
      () => ({ ar: "بدون تعويض", en: "No refill" }),
    ],
    [
      "refill",
      /refill|re-fill|\br\s?-?(?:30|60|90|120|180|365)\b|guarant|lifetime|life\s*time|ضمان|تعويض|مضمون|ليف\s*تايم|مدى\s*الحياة|♻/i,
      (t) => {
        const d = num(t, /(\d{1,3})\s*(?:d\b|day|days|يوم|أيام|ايام)/i) || num(t, /\br\s?-?(\d{2,3})\b/i);
        if (/lifetime|life\s*time|ليف\s*تايم|مدى\s*الحياة|\b365\b/i.test(t)) return { ar: "تعويض مدى الحياة", en: "Lifetime refill" };
        return d ? { ar: "تعويض " + d + " يوم", en: "Refill " + d + "d" } : { ar: "تعويض", en: "Refill" };
      },
    ],
    [
      "nodrop",
      /non[\s-]*drop|no[\s-]*drop|zero[\s-]*drop|لا\s*ينقص|بدون\s*نقص|ثابت|مستقر|\bstable\b/i,
      () => ({ ar: "ثابت (بدون نقص)", en: "Non-drop" }),
    ],
    [
      "speed",
      /speed|سرعة|\d+(?:\.\d+)?\s*[km]?\s*(?:\/|per\s*)\s*(?:day|d|hour|hr|h|يوم|ساعة)\b|\bdaily\b|يومي/i,
      (t) => {
        const v = (t.match(/(\d+(?:\.\d+)?\s*[km]?\s*(?:\/|per\s*)\s*(?:day|d|hour|hr|h|يوم|ساعة))/i) || [])[1] || "";
        const a = tr(v.replace(/per\s*/i, "/"));
        return v ? { ar: "سرعة " + a, en: "Speed " + en(a) } : { ar: tr(t), en: tr(t) };
      },
    ],
    [
      "start",
      /start|بدء|بداية|يبدأ|ابتداء|\b0\s*-\s*\d+\s*(?:h|hr|hrs|hour|hours|min|mins|minutes|ساعة|ساعات|دقيقة|دقائق)\b/i,
      (t) => {
        const v = t.replace(/^\s*(?:start(?:s|ing)?(?:\s*time)?|بدء|بداية|يبدأ|ابتداء)\s*[:=\-]?\s*/i, "").trim();
        const a = tr(v);
        return a ? { ar: "بدء " + a, en: "Start " + en(a) } : { ar: "بدء سريع", en: "Fast start" };
      },
    ],
    ["fast", /\bfast\b|super[\s-]*fast|\binstant\b|express|turbo|سريع|فوري|فورى|لحظي|⚡|🚀/i, () => ({ ar: "سريع", en: "Fast" })],
    ["new", /\bnew\b|جديد|جديدة|🆕/i, () => ({ ar: "جديد", en: "New" })],
    ["cancel", /cancel|إلغاء|الغاء/i, () => ({ ar: "قابل للإلغاء", en: "Cancelable" })],
    [
      "geo",
      /\b(?:usa|us|uk|arab|arabic|egypt|saudi|ksa|uae|turkey|turkish|india|indian|worldwide|global|europe|brazil|iraq|syria)\b|عرب|عربي|سعود|مصر|مصري|إمارات|تركي|هندي|عالمي|أجنبي|اجنبي|عراق|سوري/i,
      (t) => ({ ar: tr(t), en: tr(t) }),
    ],
    [
      "quality",
      /\bhq\b|high[\s-]*quality|premium|\bvip\b|\breal\b|\bactive\b|\bnormal\b|\bmixed\b|\bbots?\b|\blow\b|\bold\b|جودة|حقيقي|حقيقية|نشط|نشطة|مختلط|بوت|عادي/i,
      (t) => ({ ar: tr(t), en: tr(t) }),
    ],
  ];

  const LIM = 28; // longest unknown token still shown as a chip
  const ORDER = ["refill", "nodrop", "fast", "speed", "start", "new", "quality", "geo", "cancel", "norefill", "extra"];

  function classify(tok, tags, seen) {
    const t = tok.replace(/\s+/g, " ").trim();
    if (!t || !/[\p{L}\p{N}]/u.test(t)) return true; // nothing readable: swallow
    for (const [id, test, build] of RULES) {
      if (!test.test(t)) continue;
      if (id == "drop") return true;
      const b = build(t);
      if (b && !seen.has(id + ":" + b.ar)) {
        /* one tag per id, except extras; a more specific refill ("30 يوم") replaces a bare one */
        const k = tags.findIndex((x) => x.id == id);
        if (k >= 0 && id != "geo" && id != "quality") {
          if (b.ar.length > tags[k].ar.length) tags[k] = { id, ...b };
        } else tags.push({ id, ...b });
        seen.add(id + ":" + b.ar);
      }
      return true;
    }
    if (t.length <= LIM && !/^\d+$/.test(t)) {
      if (!seen.has("extra:" + t.toLowerCase())) {
        tags.push({ id: "extra", ar: t, en: t });
        seen.add("extra:" + t.toLowerCase());
      }
      return true;
    }
    return false; // long unknown text stays in the title
  }

  const strip = (s) => {
    let x = s.replace(RE_GEN, "").replace(RE_HEAD_OTHER, "");
    x = x.replace(RE_HEAD_PLAT, "").replace(RE_HEAD_OTHER, "").replace(RE_HEAD_PLAT, "");
    return x.replace(/^[\s\-–—:|>•·~=*#]+/, "").trim();
  };
  const lead = (s) => s.replace(/^[\s\-–—:|>•·~=*#]+/, "").trim();
  const RE_PRICE = /\$\s*[\d.,]+(?:\s*(?:per|\/)\s*1000)?|[\d.,]+\s*(?:\$|usd)\b|\bper\s*1000\b|\b(?:max|min)\s*[:=]?\s*[\d.,]+\s*[kmb]?\b/gi;
  const RE_OPEN = /[\[({【「（]\s*([^\])}】」）]{1,70})$/; // an opening bracket that was never closed (a name cut short by an old import)

  function parse(name) {
    const full = String(name == null ? "" : name).replace(/\s+/g, " ").trim();
    const out = { title: full, tags: [], full };
    if (!full) return out;
    const tags = [],
      seen = new Set();

    /* 1. emoji that carry meaning, before they are removed */
    if (/⚡|🚀/.test(full)) classify("fast", tags, seen);
    if (/♻/.test(full)) classify("refill", tags, seen);
    if (/🆕/.test(full)) classify("new", tags, seen);

    /* 2. bracketed pieces -> tags (a piece that is long and not understood goes back to the title) */
    let rest = full.replace(RE_EMOJI, " ");
    const back = [];
    const take = (_, tok) => {
      if (!classify(tok, tags, seen)) back.push(tok);
      return " ";
    };
    rest = rest.replace(RE_BRACKET, take).replace(RE_OPEN, take);
    rest = rest.replace(RE_STRAY, " ").replace(RE_PRICE, " ").replace(/[…]+\s*$|\.{3,}\s*$/, "").replace(/\s+/g, " ").trim();

    /* 3. drop the old importer prefix and the platform name at the START (the platform icon already shows it); if nothing useful is left keep the full text */
    const split = (x) => x.split(RE_SPLIT).map((y) => y.trim()).filter(Boolean);
    let parts = split(strip(rest));
    if (!parts.length || parts[0].length < 5 || RE_TYPE_ONLY.test(parts[0])) parts = split(lead(rest));

    /* 4. first piece = title; short pieces after " - " / " | " become tags, long unknown ones stay in the title */
    let title = parts.shift() || "";
    const tail = [];
    parts.forEach((p) => {
      if (!classify(p, tags, seen)) tail.push(p);
    });
    title = [title, ...tail, ...back].filter(Boolean).join(" — ");
    title = title.replace(/\s+/g, " ").replace(/[\s\-–—:|>•·~=*#,،]+$/, "").trim();
    if (!title) title = full.replace(RE_EMOJI, "").replace(RE_STRAY, "").replace(/\s+/g, " ").trim() || full;

    tags.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    out.title = title;
    out.tags = tags;
    return out;
  }

  /* Deterministic product classification shared by import, admin and storefront. */
  const norm = (v) => String(v == null ? "" : v).normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const GAME_RE = /\b(pubg|pubg mobile|free fire|freefire|mobile legends|mlbb|genshin|valorant|roblox|fortnite|steam|playstation|xbox|riot points|uc|diamonds|شدات|جواهر|ببجي|فري فاير|فريفاير|شحن العاب|شحن ألعاب)\b/i;
  const APP_RE = /\b(netflix|shahid|spotify|youtube premium|youtube music|chatgpt|claude|midjourney|perplexity|discord nitro|canva|crunchyroll|osn|disney|prime video|اشتراك|اشتراكات|نتفلكس|شاهد|سبوتيفاي)\b/i;
  const SMM_RE = /\b(followers?|likes?|views?|comments?|shares?|members?|subscribers?|reactions?|instagram|telegram|tiktok|youtube|facebook|twitter|linkedin|متابعين|لايكات|مشاهدات|تعليقات|أعضاء|اعضاء|رشق)\b/i;
  function typeOf(x) {
    const name = String((x && (x.name || x.en || x.ar || x.title)) || "");
    const cat = String((x && (x.category || x.smm_cat || "")) || "");
    const explicit = String((x && (x.ptype || x.product_type || x.service_type)) || "").toLowerCase();
    if (["smm","game_topup","app_subscription","gift_card"].includes(explicit)) return explicit;
    if (x && (x.smm_input === "none" || x.input_type === "none" || x.delivery_type === "pin")) return "gift_card";
    if (GAME_RE.test(name + " " + cat) || x && (x.requires_player_id || x.player_id_required)) return "game_topup";
    if (APP_RE.test(name + " " + cat) || x && (x.requires_email || x.requires_phone)) return "app_subscription";
    if (SMM_RE.test(name + " " + cat) && (x && (x.provider_kind === "smm" || x.smm_service || x.smm_provider || x.min != null || x.max != null))) return "smm";
    if (x && x.provider_kind === "custom") return APP_RE.test(name + " " + cat) ? "app_subscription" : GAME_RE.test(name + " " + cat) ? "game_topup" : "gift_card";
    return "smm";
  }
  const BRANDS = [
    ["pubg","PUBG Mobile","ببجي موبايل",/\b(pubg|pubg mobile|uc|ببجي|شدات)\b/i,"games"],
    ["free_fire","Free Fire","فري فاير",/\b(free ?fire|freefire|فري ?فاير|جواهر فري)\b/i,"games"],
    ["mobile_legends","Mobile Legends","موبايل ليجندز",/\b(mobile legends|mlbb|موبايل ليجندز)\b/i,"games"],
    ["genshin","Genshin Impact","جينشن إمباكت",/\b(genshin|جينشن)\b/i,"games"],
    ["roblox","Roblox","روبلوكس",/\b(roblox|روبلوكس)\b/i,"games"],
    ["netflix","Netflix","نتفلكس",/\b(netflix|نتفلكس)\b/i,"apps"],
    ["shahid","Shahid","شاهد",/\b(shahid|شاهد)\b/i,"apps"],
    ["spotify","Spotify","سبوتيفاي",/\b(spotify|سبوتيفاي)\b/i,"apps"],
    ["chatgpt","ChatGPT","ChatGPT",/\b(chatgpt|gpt ?plus)\b/i,"apps"],
    ["claude","Claude","Claude",/\b(claude)\b/i,"apps"],
    ["telegram","Telegram","تيليجرام",/\b(telegram|تيليجرام|تيليغرام)\b/i,"smm"],
    ["instagram","Instagram","إنستغرام",/\b(instagram|انستغرام|انستجرام)\b/i,"smm"]
  ];
  function brandOf(x) {
    const text = String((x && (x.name || x.en || x.ar || "")) || "") + " " + String((x && x.category) || "");
    const explicit = String((x && (x.bk || x.brand_key)) || "");
    if (explicit) {
      const found = BRANDS.find((b) => b[0] === explicit);
      if (found) return { key: found[0], en: found[1], ar: found[2], kind: found[4] === "games" ? "game" : found[4] === "apps" ? "app" : "smm" };
    }
    const found = BRANDS.find((b) => b[3].test(text));
    if (found) return { key: found[0], en: found[1], ar: found[2], kind: found[4] === "games" ? "game" : found[4] === "apps" ? "app" : "smm" };
    const clean = String((x && (x.category || x.name || x.en || x.ar)) || "Other").trim();
    return { key: norm(clean).replace(/\s+/g, "_").slice(0, 64) || "other", en: clean, ar: clean, kind: "other" };
  }
  const hubOf = (x) => ({ smm: "smm", game_topup: "games", app_subscription: "apps", gift_card: "apps" })[typeOf(x)];
  const providerOf = (x) => !x || !x.smm_service ? "manual" : String(x.smm_provider || "main").toLowerCase();
  const deliveryOf = (x) => x && (x.auto === false || x.delivery === "manual" || x.delivery_type === "manual" || !x.smm_service) ? "manual" : "auto";
  const availOf = (x) => x && (x.oos === true || x.available === false || x.active === false || x.hidden === true) ? "hidden" : "available";
  const typeLabel = (t, en) => ({ smm: en ? "SMM" : "رشق متابعين", game_topup: en ? "Game top-up" : "شحن ألعاب", app_subscription: en ? "App subscription" : "تطبيق / اشتراك", gift_card: en ? "Gift card / PIN" : "بطاقة / كود فوري" })[t] || String(t || "");
  function requiredOf(x) {
    const t = typeOf(x);
    if (t === "smm") return [];
    if (t === "gift_card") return [];
    if (t === "game_topup") return Array.isArray(x && x.req) ? x.req : ["player_id"];
    return Array.isArray(x && x.req) ? x.req : (/\b(email|mail|إيميل|بريد)\b/i.test(String((x && x.name) || "")) ? ["email"] : ["email"]);
  }
  function denomination(name) {
    const m = String(name || "").match(/(\d[\d,]*(?:\.\d+)?)\s*(UC|diamonds?|gems?|coins?|credits?|months?|days?|GB|USD|EUR|ليرة|شدات|جوهرة|جواهر|كريديت)/i);
    return m ? { amount: Number(m[1].replace(/,/g, "")), unit: m[2] } : null;
  }
  function refine(list, filters) {
    const f = filters || {};
    return (Array.isArray(list) ? list : []).filter((p) => {
      if (f.type && typeOf(p) !== f.type) return false;
      if (f.provider) {
        const pv = providerOf(p);
        const wanted = String(f.provider).toLowerCase();
        if (wanted === "fazer") { if (!/fazer/.test(pv)) return false; }
        else if (wanted === "main") { if (pv !== "main") return false; }
        else if (pv !== wanted) return false;
      }
      if (f.delivery && deliveryOf(p) !== f.delivery) return false;
      if (f.avail === "available" && availOf(p) !== "available") return false;
      if (f.avail === "out" && availOf(p) !== "hidden") return false;
      return true;
    });
  }
  function sortList(list, mode, opts) {
    const price = opts && typeof opts.price === "function" ? opts.price : (p) => Number(p && p.p) || 0;
    const rank = (p) => Number(p && p.bs) > 0 ? Number(p.bs) : Number.MAX_SAFE_INTEGER;
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
      if (mode === "pa") return price(a) - price(b) || String(a.id || "").localeCompare(String(b.id || ""));
      if (mode === "pd") return price(b) - price(a) || String(a.id || "").localeCompare(String(b.id || ""));
      if (mode === "bs") return rank(a) - rank(b) || String(a.id || "").localeCompare(String(b.id || ""));
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }
  g.AMXSvc = { norm, parse, typeOf, brandOf, hubOf, providerOf, deliveryOf, availOf, typeLabel, requiredOf, denomination, refine, sortList };
})(typeof window !== "undefined" ? window : globalThis);

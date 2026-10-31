#!/usr/bin/env python3
"""فحوص ثابتة للمستودع: ملفات مطلوبة، مراجع ?v=، أسرار مكشوفة، localStorage الحساس، وSQL الأساسي.
التشغيل: python tests/verify-project.py   (يخرج بكود 1 عند أي فشل)"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
errs = []
def err(m): errs.append(m)

for f in ["index.html","admin.html","app.js","admin/js/main.js","admin/js/routes.js","admin/css/admin.css","sw.js","boot.js","style.css","manifest.json","404.html",
          "faq/index.html","policies/index.html","sitemap.xml","robots.txt","CNAME","supabase-wallet.sql"]:
    if not (root/f).exists(): err(f"ملف مفقود: {f}")

for html in ["index.html","admin.html","404.html","faq/index.html","policies/index.html"]:
    p = root/html
    if not p.exists(): continue
    for ref in re.findall(r'(?:src|href)="([^"#?]+)(?:\?[^"]*)?"', p.read_text(encoding="utf-8")):
        if ref.startswith(("http","data:","mailto:","/")) or ref in ("",): continue
        if not (root/ref).exists() and not (p.parent/ref).exists(): err(f"{html}: مرجع مكسور {ref}")

secret = re.compile(r"sb_secret_|sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY")
jwt = re.compile(r"eyJ[A-Za-z0-9_-]{15,}\.([A-Za-z0-9_-]{20,})\.")
import base64, json
for f in root.glob("*.js"):
    s = f.read_text(encoding="utf-8", errors="ignore")
    if secret.search(s): err(f"{f.name}: نمط سرّي محتمل")
    for m in jwt.finditer(s):
        try:
            pad = m.group(1) + "=" * (-len(m.group(1)) % 4)
            if json.loads(base64.urlsafe_b64decode(pad)).get("role") not in ("anon", None): err(f"{f.name}: مفتاح JWT بدور غير anon")
        except Exception: pass

sql = (root/"supabase-wallet.sql").read_text(encoding="utf-8") if (root/"supabase-wallet.sql").exists() else ""
for fn in re.findall(r"create or replace function public\.(\w+)\(", sql):
    if "security definer" in sql.split(f"public.{fn}(")[1].split("$$;")[0].lower() and "set search_path" not in sql.split(f"public.{fn}(")[1].split("$$;")[0].lower():
        err(f"supabase-wallet.sql: {fn} بلا search_path")
if re.search(r"grant\s+(insert|update|delete|all)[^;]*public\.wallet", sql, re.I): err("منح كتابة مباشرة على جداول المحفظة")

# حراسة SQL/Functions: كل دالة public في ملف supabase-*.sql واحد فقط، لا هروب مزدوج للأسطر، ومصادر Edge Functions داخل supabase/functions
from collections import defaultdict
defs = defaultdict(set)
for f in sorted(root.glob("supabase-*.sql")):
    t = f.read_text(encoding="utf-8")
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(", t, re.I):
        defs[m.group(1).lower()].add(f.name)
    if re.search(r"E'[^']*\\\\n", t): err(f"{f.name}: هروب مزدوج E'\\\\n (يظهر \\n حرفياً في تلغرام)")
for fn, files in sorted(defs.items()):
    if len(files) > 1: err(f"دالة {fn} معرَّفة في أكثر من ملف SQL: {', '.join(sorted(files))}")
for fn in ("telegram-auth", "smm-order"):
    if not (root/"supabase"/"functions"/fn/"index.ts").exists(): err(f"supabase/functions/{fn}/index.ts مفقود")
for stray in root.glob("*.ts"): err(f"{stray.name}: ملف TypeScript في الجذر (يُخدَّم علناً)؛ مكانه supabase/functions/<name>/index.ts")

print("\n".join("✗ "+e for e in errs) if errs else "✓ كل الفحوص نجحت")
sys.exit(1 if errs else 0)

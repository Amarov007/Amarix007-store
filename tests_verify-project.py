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

# حراسة SQL: كل دالة public في ملف supabase-*.sql واحد فقط + دوال الدفع الحساسة ممنوحة في final-grants
from collections import defaultdict
defs = defaultdict(set)
for f in sorted(root.glob("supabase-*.sql")):
    t = f.read_text(encoding="utf-8")
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(", t, re.I):
        defs[m.group(1).lower()].add(f.name)
for fn, files in sorted(defs.items()):
    if len(files) > 1: err(f"دالة {fn} معرَّفة في أكثر من ملف SQL: {', '.join(sorted(files))}")
grants = (root/"supabase-final-grants.sql").read_text(encoding="utf-8") if (root/"supabase-final-grants.sql").exists() else ""
if "approve_manual_payment" not in defs: err("approve_manual_payment غير معرَّفة في أي ملف SQL")
if "'approve_manual_payment'" not in grants: err("approve_manual_payment غير ممنوحة في supabase-final-grants.sql")
lock = (root/"supabase-payment-lockdown.sql").read_text(encoding="utf-8") if (root/"supabase-payment-lockdown.sql").exists() else ""
if "orders_payment_guard" not in lock: err("حارس payment_status مفقود (supabase-payment-lockdown.sql)")
def _src(f):
    return "\n".join(x.read_text(encoding="utf-8", errors="ignore") for x in sorted((root/"admin/js").rglob("*.js"))) if f == "admin.js" else (root/f).read_text(encoding="utf-8", errors="ignore")
for f in ("admin.js","app.js"):
    if re.search(r"orders\?id=eq[^`\"']*['\"`][^;]{0,200}payment_status\s*:\s*['\"]paid", _src(f)):
        err(f"{f}: تحديث مباشر لـ payment_status=paid")

# نظام الدفع الموحّد: كل دالة جديدة ممنوحة، ولا كتابة مباشرة على جداوله، والدوال الحساسة definer + search_path
pay = (root/"supabase-payments.sql").read_text(encoding="utf-8") if (root/"supabase-payments.sql").exists() else ""
if not pay: err("supabase-payments.sql مفقود")
for fn in ("payment_methods_public","payment_create","payment_create_wallet_pay","payment_create_topup","payment_instructions","payment_attach_proof",
           "payment_submit","payment_cancel","payment_review_queue","payment_approve","payment_reject","refund_request","refund_approve",
           "refund_reject","payments_reconcile","payment_settings_save","fx_rate_set"):
    if fn not in defs: err(f"{fn}: غير معرَّفة")
    if f"'{fn}'" not in grants: err(f"{fn}: غير ممنوحة في supabase-final-grants.sql")
for fn in ("transition_payment","payments_expire","payment_sync_order"):
    if f"'{fn}'" in grants: err(f"{fn}: دالة داخلية يجب ألا تُمنح")
if re.search(r"grant\s+(insert|update|delete|all)[^;]*public\.(payments|payment_events|refunds|payment_methods|fx_rates)", pay, re.I):
    err("منح كتابة مباشرة على جداول الدفع")
for m in re.finditer(r"create or replace function public\.(\w+)\(.*?\$function\$;", pay, re.S):
    body = m.group(0)
    if "security definer" in body.lower() and "set search_path" not in body.lower(): err(f"supabase-payments.sql: {m.group(1)} بلا search_path")
if "payments_v2" not in pay: err("علم payments_v2 مفقود")
for f in ("app.js","admin.js"):
    t = _src(f)
    if re.search(r"/rest/v1/(payments|payment_events|refunds)[^\n]{0,80}method:\s*[\"'](POST|PATCH|PUT|DELETE)", t): err(f"{f}: كتابة مباشرة على جداول الدفع")

print("\n".join("✗ "+e for e in errs) if errs else "✓ كل الفحوص نجحت")
sys.exit(1 if errs else 0)

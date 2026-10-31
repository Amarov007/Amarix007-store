# بنية لوحة التحكم (admin/)

لوحة مُعاد بناؤها من الصفر: ES Modules بلا أي مكتبات خارجية، كل صفحة تُحمَّل كسولاً عند فتحها.

```
admin.html                 نقطة الدخول (CSP مطابق لـ index.html)
admin/css/admin.css        نظام التصميم: رموز ألوان dark/light + مكونات + تجاوب
admin/js/
  guard.js                 منع clickjacking + مراقب الإقلاع
  main.js                  الإقلاع، تسجيل الدخول (Turnstile)، الهيكل، الموجّه
  routes.js                سجل الصفحات والصلاحيات (perm: null = مدير فقط)
  core/
    config.js              الثوابت (anon key فقط)
    auth.js                Supabase Auth + تجديد الرمز (sessionStorage)
    http.js                rest / rpc / fn / patch (يكشف حجب RLS الصامت) / uploadMedia
    rbac.js                is_admin + my_staff_perms
    ui.js                  h() لبناء DOM آمن، modal، toast، dataTable، أيقونات
    catalog.js             حالة store_config + النشر الآمن (stage → commit → cancel)
    forms.js               imageField (رفع+تصغير WebP) وشريط النشر
    media.js, utils.js
  modules/                 صفحة لكل خدمة (dashboard, orders, payments, ...)
```

## قواعد ثابتة
- لا `innerHTML` إطلاقاً (يفرضه اختبار في `tests/security-contract.test.mjs`) ⇒ لا XSS من بيانات الزبائن.
- أسرار المزوّدين: يُدخل **اسم** Edge Secret فقط، لا قيمة المفتاح.
- مفتاح `api` لا يُنشر أبداً إلى `store_config`؛ الموظف (صلاحية products) ينشر المنتجات فقط.
- لا كتابة مباشرة على جداول الدفع؛ كل شيء عبر RPC (`payment_approve_received` ...).
- الجلسة في `sessionStorage` (تنتهي بإغلاق التبويب).

## إضافة خدمة جديدة
1. أنشئ `admin/js/modules/<name>.js` يصدّر `export default async function (view, ctx)`.
2. أضف سطراً في `routes.js` (`group` و`icon` و`perm`).
انتهى — القائمة والصلاحيات والتحميل الكسول تعمل تلقائياً.

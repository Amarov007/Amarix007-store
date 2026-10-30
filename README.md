# Amarix Store

متجر خدمات رقمية عربي RTL مبني بملفات HTML/CSS/JavaScript ثابتة وSupabase.

## التشغيل
- اضبط قيمة `window.AMARIX_SUPABASE_ANON_KEY` في ملف إعداد محلي غير ملتزم بالمستودع، أو أضفها كإعداد Pages آمن عند توفر آلية حقن وقت النشر.
- طبّق migrations بالترتيب.
- أضف أسرار المزودين إلى Supabase Edge Secrets فقط.
- لا تضع service_role أو مفاتيح المزودين في الواجهة.

## الأمان
كل عمليات الخصم/الاسترداد يجب أن تتم عبر دوال Postgres ذرية، وكل استدعاء مزود عبر Edge Functions. لا تعتبر واجهة الإدارة بديلاً عن RLS.
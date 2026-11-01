-- =====================================================================
-- AMARIX007 — supabase-final-grants.sql   (شغّله دائماً الأخير، بعد كل ملفات SQL الأخرى)
-- الملف الوحيد المسموح له بـ «revoke execute on all functions» (يفرض ذلك tests/verify-project.py، فحص 6).
-- آمن لإعادة التشغيل في أي وقت: يعيد صلاحيات تنفيذ الدوال إلى الحالة المقصودة كاملة، فلا تضيع صلاحية دالة
-- لأن ملفاً آخر أعاد تشغيل revoke الشامل. لا يغيّر أي بيانات ولا تعريفات دوال.
--
-- المرجع: صلاحيات القاعدة الحية (project pvuobngrybygohendwaz) كما قُرئت بتاريخ 2026-10-25.
-- الصلاحيات تُمنح بالاسم لا بالتوقيع (يطابق كل overload)، فلا يفشل الملف إن اختلف توقيع دالة بين المستودع والقاعدة؛
-- وأي اسم غير موجود في القاعدة يُتجاهل بصمت.
--
--   anon + authenticated : دوال يحتاجها الزائر قبل تسجيل الدخول
--   authenticated فقط    : دوال الحساب واللوحة (كلٌّ منها يتحقق من is_admin()/has_perm()/auth.uid() داخلياً)
--   service_role         : كل الدوال
--   لا أحد               : التريغرات والدوال المساعدة (تعمل داخل القاعدة بصلاحيات المالك)
-- لإضافة دالة جديدة تُستدعى من المتصفح: أضف اسمها إلى إحدى المصفوفتين أدناه.
-- =====================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

do $grants$
declare
  anon_and_auth text[] := array[
    'public_config', 'payment_methods_public', 'check_coupon', 'track_ref_click',
    'product_stats', 'track_view', 'recent_reviews', 'product_reviews', 'public_stats', 'sale_active'
  ];
  auth_only text[] := array[
    'is_admin', 'has_perm', 'my_staff_perms', 'staff_save_products',
    'my_proof_count', 'set_payment_proof', 'claim_payment', 'my_ticket_file_count', 'rate_ticket',
    'save_cart', 'push_register', 'my_reviews', 'submit_review',
    'apply_affiliate', 'affiliate_balance', 'my_affiliate_balance', 'my_affiliate_monthly', 'my_affiliate_payouts', 'request_payout',
    'approve_manual_payment', 'payment_create', 'payment_create_wallet_pay', 'payment_create_topup', 'payment_instructions',
    'payment_attach_proof', 'payment_submit', 'payment_cancel', 'payment_review_queue', 'payment_approve', 'payment_reject',
    'payment_methods_admin_save', 'payment_methods_admin_delete', 'payments_v2_flag_set', 'smm_providers_admin_list', 'smm_legacy_keys_clear', 'payment_confirmation_issue', 'payment_approve_received', 'wallet_eligible', 'payments_status', 'payments_status_for_order',
    'refund_request', 'refund_request_customer', 'refund_approve', 'refund_reject', 'payments_reconcile', 'payment_settings_save', 'fx_rate_set',
    'pay_order_with_wallet', 'wallet_reconcile', 'wallet_topup_create', 'wallet_topup_set_proof', 'wallet_topup_claim',
    'wallet_topup_approve', 'wallet_topup_reject', 'wallet_admin_adjust',
    'admin_stats', 'admin_product_stats', 'admin_push_stats', 'admin_send_broadcast',
    'admin_affiliate_monthly', 'admin_affiliate_pay', 'admin_find_user', 'get_invoice', 'admin_invoices',
    -- موجودة في القاعدة الحية فقط (سجل التكاملات api_integrations + دالة api-hub) وكل منها يتحقق من is_admin() داخلياً
    'api_integrations_list', 'api_integration_save', 'api_integration_delete'
  ];
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    if r.proname = any (anon_and_auth) then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname = any (auth_only) then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end
$grants$;

-- تحقق (قراءة فقط): يجب ألا يظهر هنا أي دالة تنفيذية لـ anon غير القائمة الأولى أعلاه.
-- select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth
--   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1;

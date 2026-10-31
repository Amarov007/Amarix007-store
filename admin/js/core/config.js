/* الإعدادات الثابتة. مفتاح anon فقط — الصلاحية الفعلية تأتي من JWT المستخدم + RLS في Supabase. */
export const SB_URL = "https://pvuobngrybygohendwaz.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU"; // anon key only
export const TURNSTILE_KEY = "0x4AAAAAAFkSn0TWqJH_GMRW";
export const SESSION_KEY = "amx_admin_session_v2";
export const ORDER_STATUSES = [["new","جديد"],["processing","قيد التنفيذ"],["done","مكتمل"],["cancelled","ملغي"]];
export const TICKET_STATUSES = [["open","مفتوحة"],["answered","تم الرد"],["closed","مغلقة"]];
/* مفاتيح صلاحيات الموظفين — مطابقة لـ has_perm / my_staff_perms في قاعدة البيانات */
export const STAFF_PERMS = [["orders","الطلبات (عرض وتغيير الحالة)"],["tickets","تذاكر الدعم (عرض والرد)"],["users","المستخدمين (عرض فقط)"],["products","المنتجات (تعديل ونشر)"]];

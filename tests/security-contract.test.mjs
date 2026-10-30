import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("orders: authenticated updates are limited to status", async () => {
  const sql = await read("../supabase/migrations/20261030011700_protect_order_audit_and_fulfillment_fields.sql");
  assert.match(sql, /REVOKE UPDATE ON public\.orders FROM authenticated/i);
  assert.match(sql, /GRANT UPDATE \(status\) ON public\.orders TO authenticated/i);
  for (const field of ["total", "user_id", "payment_tx_ref", "payment_proof", "delivered_at"]) {
    assert.match(sql, new RegExp("new\\." + field + " := old\\." + field, "i"), `orders guard must preserve ${field}`);
  }
  assert.match(sql, /new\.payment_status := 'pending'/i);
  assert.match(sql, /new\.total := round\(greatest\(0, sub - disc\), 2\)/i);
});

test("support tickets: authenticated writes use narrow column grants", async () => {
  const sql = await read("../supabase/migrations/20261030011809_restrict_support_ticket_write_columns.sql");
  assert.match(sql, /REVOKE INSERT ON public\.support_tickets FROM authenticated/i);
  assert.match(sql, /GRANT INSERT \(user_id, customer_name, customer_email, order_id, subject, message, attachment, lang\)/i);
  assert.match(sql, /REVOKE UPDATE ON public\.support_tickets FROM authenticated/i);
  assert.match(sql, /GRANT UPDATE \(admin_reply, status\) ON public\.support_tickets TO authenticated/i);
  for (const field of ["user_id", "customer_email", "created_at", "resolved", "rated_at"]) {
    assert.match(sql, new RegExp("new\\." + field + " := old\\." + field, "i"), `ticket guard must preserve ${field}`);
  }
});

test("staff membership policies separate admin writes from self-read", async () => {
  const sql = await read("../supabase/migrations/20261030011423_split_staff_members_admin_policy.sql");
  assert.match(sql, /CREATE POLICY "staff admin read".*FOR SELECT/s);
  assert.match(sql, /CREATE POLICY "staff admin insert".*FOR INSERT/s);
  assert.match(sql, /CREATE POLICY "staff admin update".*FOR UPDATE/s);
  assert.match(sql, /CREATE POLICY "staff admin delete".*FOR DELETE/s);
  assert.match(sql, /user_id = \(SELECT auth\.uid\(\)\)/i);
});

test("provider execution enforces staff permissions and paid owner orders", async () => {
  const src = await read("../supabase/functions/smm-order/index.ts");
  assert.match(src, /userClient\.rpc\("has_perm", \{ p: need \}\)/);
  assert.match(src, /order\.user_id !== uid/);
  assert.match(src, /order\.payment_status !== "paid"/);
  assert.match(src, /force = role === "admin" && !!body\.force/);
  assert.match(src, /role === "owner" && !selfOk\(g\.site\)/);
  assert.match(src, /function selfOk\(site: Site\): boolean/);
});

test("payments v2 has a server-side off switch until E2E signoff", async () => {
  const sql = await read("../supabase/migrations/20261030011456_block_payments_v2_enable_until_e2e_signoff.sql");
  assert.match(sql, /payments_v2_flag_set/i);
  assert.match(sql, /payments_v2_e2e_not_signed_off/i);
  assert.match(sql, /\{payments_v2,on\}/i);
  assert.match(sql, /RAISE EXCEPTION/i);
});

test("admin UI applies the same named permission keys to staff navigation", async () => {
  const src = await read("../admin.js");
  assert.match(src, /const TAB_PERM = \{\s*orders: "orders",\s*invoices: "orders",\s*tickets: "tickets",\s*users: "users",\s*products: "products"\s*\}/);
  assert.match(src, /const canTab = \(k\) => !isStaffOnly\(\) \|\| \(!!TAB_PERM\[k\] && STAFF\.includes\(TAB_PERM\[k\]\)\)/);
});


test("provider service deletion is scoped, backed up, and blocked for open orders", async () => {
  const src = await read("../admin.js");
  assert.match(src, /data-a="smm-delete-imported"/);
  assert.match(src, /data-a="smm-delete-one"/);
  assert.match(src, /if \(a == "smm-delete-imported"\) return smmDeleteImported\(b\)/);
  assert.match(src, /if \(a == "smm-delete-one"\) return smmDeleteImported\(b, b\.dataset\.id\)/);
  assert.match(src, /p\.smm_service != null[\s\S]{0,140}provOf\(p\) === prov/);
  assert.match(src, /status=in\.\(new,processing\)/);
  assert.match(src, /rpc"\s*,\s*\{[\s\S]{0,160}p: "orders"/);
  assert.match(src, /amx_smm_backup/);
  assert.match(src, /smmUndo\(\)/);
});

test("Payments V2 is forced off on every store_config write", async () => {
  const sql = await read("../supabase/migrations/20261030210908_harden_payments_v2_store_config_invariant.sql");
  assert.match(sql, /BEFORE INSERT OR UPDATE OF data ON public\.store_config/i);
  assert.match(sql, /jsonb_set\(v_payments, '\{on\}', 'false'::jsonb, true\)/i);
  assert.match(sql, /ARRAY\['products','ts','api','payments_v2'\]/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.publish_store_config[\s\S]*?GRANT EXECUTE ON FUNCTION public\.publish_store_config/i);
});


test("AI support fails closed when the shared rate limiter is unavailable", async () => {
  const src = await read("../supabase/functions/ai-support/index.ts");
  assert.match(src, /Promise<boolean \| null>/);
  assert.match(src, /persistentLimit === null/);
  assert.match(src, /rate_limit_unavailable/);
  assert.match(src, /rawBody\.length > 20000/);
  assert.match(src, /payload_too_large/);
});

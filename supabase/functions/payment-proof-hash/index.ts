// Verify the authenticated owner, download the actual private Storage object, hash its bytes server-side,
// then record the verified hash through a service-role-only RPC. Never accept a client-supplied hash.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = () => new Set([
  "https://amarix007.store",
  "https://www.amarix007.store",
  ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean),
]);
const cors = (origin: string) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
};
const response = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(req.headers.get("Origin") ?? ""), "Content-Type": "application/json" },
});
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return response(req, { error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(auth)) return response(req, { error: "unauthorized" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return response(req, { error: "server_not_configured" }, 503);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const uid = authData.user?.id;
    if (authError || !uid) return response(req, { error: "unauthorized" }, 401);

    const body = await req.json();
    const paymentId = String(body?.p_id ?? "");
    const path = String(body?.p_path ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) return response(req, { error: "invalid_payment" }, 400);
    if (path.length > 300 || !new RegExp(`^${uid}/[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)$`, "i").test(path)) return response(req, { error: "invalid_path" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: file, error: downloadError } = await admin.storage.from("payment-proofs").download(path);
    if (downloadError || !file) return response(req, { error: "proof_not_found" }, 400);
    if (file.size > 5 * 1024 * 1024) return response(req, { error: "proof_too_large" }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    const { error: saveError } = await admin.rpc("payment_attach_proof_verified", {
      p_id: paymentId,
      p_path: path,
      p_hash: hash,
      p_owner: uid,
    });
    if (saveError) return response(req, { error: saveError.message.includes("duplicate_proof") ? "duplicate_proof" : "proof_save_failed" }, 400);
    return response(req, { ok: true, payment_id: paymentId, proof_hash_prefix: hash.slice(0, 12) });
  } catch (error) {
    return response(req, { error: String((error as Error)?.message ?? error).slice(0, 160) }, 400);
  }
}

if (import.meta.main) Deno.serve(handler);

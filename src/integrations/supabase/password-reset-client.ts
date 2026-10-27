/** Área: Cliente Supabase exclusivo do link de senha, separado da sessão já aberta. */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createSupabaseFetch } from "./client";

/** Never read/write the main login storage or broadcast a recovery session to other tabs. */
export function createPasswordResetClient(config?: { url: string; key: string }) {
  const url = config?.url ?? import.meta.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const key =
    config?.key ??
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Não foi possível validar este link.");
  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "iga-password-reset-memory",
    },
  });
}

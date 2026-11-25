// Ponto de entrada no Supabase (Deno). Toda a lógica está em handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve((req) => handle(req, {
  env: Deno.env.toObject(),
  fetch,
  contar: async (userId) => {
    const { count } = await admin.from("pep_envios").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("criado_em", new Date(Date.now() - 3600_000).toISOString());
    return count || 0;
  },
  registrar: async (userId, para, tipo) => { await admin.from("pep_envios").insert({ user_id: userId, para, tipo }); },
}));

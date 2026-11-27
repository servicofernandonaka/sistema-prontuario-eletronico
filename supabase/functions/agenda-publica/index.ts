// Ponto de entrada no Supabase (Deno). Toda a lógica está em handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ATIVAS = ["solicitada", "marcada", "confirmada"];

Deno.serve((req) => handle(req, {
  env: { ALLOWED_ORIGIN: Deno.env.get("ALLOWED_ORIGIN") ?? undefined },
  agora: () => Date.now(), aleatorio: (n) => crypto.getRandomValues(new Uint8Array(n)),
  configPorSlug: async (slug) => (await admin.from("pep_agenda_config").select("owner_id,config").eq("slug", slug).maybeSingle()).data,
  configPorOwner: async (owner) => (await admin.from("pep_agenda_config").select("slug,config").eq("owner_id", owner).maybeSingle()).data,
  ocupados: async (owner, de, ate) => (await admin.from("pep_agenda").select("data,hora,duracao_min").eq("profissional_id", owner).gte("data", de).lte("data", ate).in("status", [...ATIVAS, "atendida", "faltou"])).data ?? [],
  contarPendentes: async (owner) => (await admin.from("pep_agenda").select("id", { count: "exact", head: true }).eq("profissional_id", owner).eq("status", "solicitada")).count ?? 0,
  contarAtivosTelefone: async (owner, u8, desde) => (await admin.from("pep_agenda").select("id", { count: "exact", head: true }).eq("profissional_id", owner).gte("data", desde).in("status", ATIVAS).like("telefone", "%" + u8)).count ?? 0,
  inserir: async (row) => { const { error } = await admin.from("pep_agenda").insert(row); return error ? { ok: false, conflito: error.code === "23505" } : { ok: true }; },
  porHash: async (h) => (await admin.from("pep_agenda").select("id,profissional_id,nome,data,hora,duracao_min,status,token_hash,preconsulta_em").eq("token_hash", h).maybeSingle()).data,
  atualizar: async (id, patch) => { await admin.from("pep_agenda").update(patch).eq("id", id); },
}));

// Ponto de entrada no Supabase (Deno). Toda a lógica está em handler.ts.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "documentos-links";

Deno.serve((req) => handle(req, {
  env: Deno.env.toObject(), fetch, agora: () => Date.now(), aleatorio: (n) => crypto.getRandomValues(new Uint8Array(n)),
  // valida o token no servidor de autenticação (não confia só no conteúdo do JWT)
  verificarUsuario: async (token) => {
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! } });
    if (!r.ok) return null; const u = await r.json(); return u?.id ? { id: u.id } : null;
  },
  contarCriadosHora: async (owner) => (await admin.from("pep_links").select("id", { count: "exact", head: true }).eq("owner_id", owner).gte("criado_em", new Date(Date.now() - 3600_000).toISOString())).count || 0,
  // limpeza oportunista: apaga arquivos e linhas dos links do próprio médico vencidos há mais de 1 dia
  limparExpirados: async (owner) => {
    const { data } = await admin.from("pep_links").select("id,storage_path").eq("owner_id", owner).lt("expira_em", new Date(Date.now() - 86400_000).toISOString()).limit(50);
    if (data?.length) { await admin.storage.from(BUCKET).remove(data.map((x) => x.storage_path)); await admin.from("pep_links").delete().in("id", data.map((x) => x.id)); }
  },
  guardarPdf: async (path, bytes) => { const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf" }); if (error) throw error; },
  inserirLink: async (l) => { const { data, error } = await admin.from("pep_links").insert(l).select("id").single(); if (error) throw error; return { id: data.id }; },
  buscarPorHash: async (h) => (await admin.from("pep_links").select("*").eq("token_hash", h).maybeSingle()).data,
  atualizar: async (id, patch) => { await admin.from("pep_links").update(patch).eq("id", id); },
  revogarDoOwner: async (id, owner) => { const { data } = await admin.from("pep_links").update({ revogado: true }).eq("id", id).eq("owner_id", owner).select("id"); return !!data?.length; },
  urlAssinada: async (path, s, nome) => (await admin.storage.from(BUCKET).createSignedUrl(path, s, { download: nome })).data?.signedUrl ?? null,
}));

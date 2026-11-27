// Ponto de entrada no Supabase (Deno). Toda a lógica está em handler.ts. Publicar SEM exigir login (verify_jwt = false).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle } from "./handler.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "portal-documentos";
const ATIVAS_E_FEITAS = ["solicitada", "marcada", "confirmada", "atendida", "faltou"];

Deno.serve((req) => handle(req, {
  env: { ALLOWED_ORIGIN: Deno.env.get("ALLOWED_ORIGIN") ?? undefined },
  agora: () => Date.now(), aleatorio: (n) => crypto.getRandomValues(new Uint8Array(n)),
  convitePorHash: async (h) => (await admin.from("pep_portal_convites").select("id,owner_id,paciente_id,expira_em,usado_em,tentativas,bloqueado").eq("token_hash", h).maybeSingle()).data,
  atualizarConvite: async (id, patch) => { await admin.from("pep_portal_convites").update(patch).eq("id", id); },
  paciente: async (id) => (await admin.from("pep_pacientes").select("id,nome,data_nascimento,cpf,telefone").eq("id", id).maybeSingle()).data,
  criarSessao: async (row) => { const { data, error } = await admin.from("pep_portal_sessoes").insert(row).select("id").single(); if (error) throw error; return data.id; },
  sessaoPorHash: async (h) => (await admin.from("pep_portal_sessoes").select("id,owner_id,paciente_id,expira_em,ultimo_uso,revogada").eq("token_hash", h).maybeSingle()).data,
  atualizarSessao: async (id, patch) => { await admin.from("pep_portal_sessoes").update(patch).eq("id", id); },
  registrar: async (row) => { await admin.from("pep_portal_log").insert(row); },
  ultimoLog: async (sessao, acao) => (await admin.from("pep_portal_log").select("em").eq("sessao_id", sessao).eq("acao", acao).order("em", { ascending: false }).limit(1).maybeSingle()).data?.em ?? null,
  consultas: async (pac) => (await admin.from("pep_agenda").select("id,profissional_id,paciente_id,data,hora,duracao_min,status,tipo,preconsulta_em").eq("paciente_id", pac).order("data", { ascending: false }).limit(60)).data ?? [],
  atualizarConsulta: async (id, patch) => { await admin.from("pep_agenda").update(patch).eq("id", id); },
  documentos: async (pac) => (await admin.from("pep_portal_docs").select("id,titulo,criado_em,baixado_em,storage_path,nome_arquivo").eq("paciente_id", pac).order("criado_em", { ascending: false }).limit(200)).data ?? [],
  marcarBaixado: async (id) => { await admin.from("pep_portal_docs").update({ baixado_em: new Date().toISOString() }).eq("id", id); },
  urlAssinada: async (path, nome) => (await admin.storage.from(BUCKET).createSignedUrl(path, 60, { download: nome })).data?.signedUrl ?? null,
  acessos: async (pac) => (await admin.from("pep_portal_log").select("em,acao,detalhe").eq("paciente_id", pac).order("em", { ascending: false }).limit(30)).data ?? [],
  configPorOwner: async (owner) => (await admin.from("pep_agenda_config").select("slug,config").eq("owner_id", owner).maybeSingle()).data,
  ocupados: async (owner, de, ate) => (await admin.from("pep_agenda").select("data,hora,duracao_min").eq("profissional_id", owner).gte("data", de).lte("data", ate).in("status", ATIVAS_E_FEITAS)).data ?? [],
  inserirConsulta: async (row) => { const { error } = await admin.from("pep_agenda").insert(row); return error ? { ok: false, conflito: error.code === "23505" } : { ok: true }; },
}));

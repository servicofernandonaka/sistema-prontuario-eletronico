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
  // entrada pela página aberta
  pacientesPorNascimento: async (nasc) => ((await admin.from("pep_pacientes").select("*").eq("data_nascimento", nasc).limit(50)).data ?? [])
    .map((p: any) => ({ id: p.id, nome: p.nome, cpf: p.cpf, email: p.email ?? null, owner: p.owner_id ?? p.user_id ?? p.profissional_id ?? null })),
  ownerPadrao: async () => { const { data } = await admin.from("pep_agenda_config").select("owner_id,config"); const at = (data ?? []).filter((x: any) => x.config?.ativo === true);
    return at.length === 1 ? at[0].owner_id : (data?.length === 1 ? data[0].owner_id : null); },
  contarCodigos: async (pac, desde) => (await admin.from("pep_portal_codigos").select("id", { count: "exact", head: true }).eq("paciente_id", pac).gte("criado_em", desde)).count ?? 0,
  salvarCodigo: async (row) => { const { error } = await admin.from("pep_portal_codigos").insert(row); if (error) throw error; },
  ultimoCodigo: async (pac) => (await admin.from("pep_portal_codigos").select("id,expira_em,usado_em,tentativas,codigo_hash").eq("paciente_id", pac).order("criado_em", { ascending: false }).limit(1).maybeSingle()).data,
  atualizarCodigo: async (id, patch) => { await admin.from("pep_portal_codigos").update(patch).eq("id", id); },
  enviarEmail: async (para, assunto, texto) => {
    const chave = Deno.env.get("EMAIL_API_KEY"), de = Deno.env.get("EMAIL_FROM");
    if (!chave || !de) return "nao_configurado";
    const nome = Deno.env.get("EMAIL_FROM_NAME") || "PEP Clínico";
    const resend = (Deno.env.get("EMAIL_PROVIDER") || "brevo").toLowerCase() === "resend";
    const r = resend
      ? await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + chave, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${nome} <${de}>`, to: [para], subject: assunto, text: texto }) })
      : await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": chave, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: { email: de, name: nome }, to: [{ email: para }], subject: assunto, textContent: texto }) });
    if (!r.ok) { console.error("e-mail recusado", r.status); return "falhou"; }
    return "ok";
  },
  slugAtivo: async () => { const { data } = await admin.from("pep_agenda_config").select("slug,config"); const at = (data ?? []).filter((x: any) => x.config?.ativo === true);
    return at.length === 1 ? at[0].slug : null; },
}));

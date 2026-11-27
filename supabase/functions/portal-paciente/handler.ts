// Função "portal-paciente": o portal do paciente (portal.html), sem login do Supabase.
// O paciente entra com um CONVITE de uso único (enviado pelo médico) + data de nascimento + 4 últimos dígitos do CPF.
// Depois disso o aparelho recebe uma SESSÃO (token aleatório; só o hash fica no banco) que vale 90 dias e é renovada a cada uso.
// Ações (POST JSON):
//   entrar   {convite, nascimento, cpf4}            → {sessao}
//   inicio   {sessao}                               → nome, consultas, documentos, acessos, agendamento
//   consulta {sessao, id, op: confirmar|cancelar}   → confirma ou cancela uma consulta DELE
//   preconsulta {sessao, id, respostas, aceite}     → envia a pré-consulta de uma consulta DELE
//   horarios {sessao, de?, ate?}  |  marcar {sessao, data, hora, motivo?}
//   documento {sessao, id}                          → link temporário (60 s) para baixar um documento DELE
//   sair     {sessao}                               → desconecta este aparelho
// Toda ação do paciente fica registrada em pep_portal_log (data, ação, resumo) para o médico ver na ficha.
import { normalizarCfg, horariosDoDia, agoraSP, sha256, normalizarPreconsulta } from "../agenda-publica/handler.ts";

export type Paciente = { id: string; nome: string | null; data_nascimento: string | null; cpf: string | null; telefone: string | null };
export type Convite = { id: string; owner_id: string; paciente_id: string; expira_em: string; usado_em: string | null; tentativas: number; bloqueado: boolean };
export type Sessao = { id: string; owner_id: string; paciente_id: string; expira_em: string; ultimo_uso: string; revogada: boolean };
export type Consulta = { id: string; profissional_id: string | null; paciente_id: string | null; data: string; hora: string | null; duracao_min: number | null;
  status: string; tipo: string | null; preconsulta_em: string | null };
export type Deps = {
  env: { ALLOWED_ORIGIN?: string };
  agora: () => number;
  aleatorio: (n: number) => Uint8Array;
  convitePorHash: (h: string) => Promise<Convite | null>;
  atualizarConvite: (id: string, patch: Record<string, unknown>) => Promise<void>;
  paciente: (id: string) => Promise<Paciente | null>;
  criarSessao: (row: Record<string, unknown>) => Promise<string>;               // devolve o id
  sessaoPorHash: (h: string) => Promise<Sessao | null>;
  atualizarSessao: (id: string, patch: Record<string, unknown>) => Promise<void>;
  registrar: (row: { owner_id: string; paciente_id: string; sessao_id: string | null; acao: string; detalhe?: string | null }) => Promise<void>;
  ultimoLog: (sessao: string, acao: string) => Promise<string | null>;          // data do último registro desta ação nesta sessão
  consultas: (paciente: string) => Promise<Consulta[]>;
  atualizarConsulta: (id: string, patch: Record<string, unknown>) => Promise<void>;
  documentos: (paciente: string) => Promise<{ id: string; titulo: string; criado_em: string; baixado_em: string | null; storage_path: string; nome_arquivo: string }[]>;
  marcarBaixado: (id: string) => Promise<void>;
  urlAssinada: (path: string, nome: string) => Promise<string | null>;
  acessos: (paciente: string) => Promise<{ em: string; acao: string; detalhe: string | null }[]>;
  configPorOwner: (owner: string) => Promise<{ slug: string; config: unknown } | null>;
  ocupados: (owner: string, de: string, ate: string) => Promise<{ data: string; hora: string | null; duracao_min: number | null }[]>;
  inserirConsulta: (row: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; conflito: boolean }>;
};

const ATIVAS = ["solicitada", "marcada", "confirmada"];
const DIA = 86400_000, SESSAO_DIAS = 90, MAX_TENTATIVAS = 5;
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cors = (d: Deps) => ({ "Access-Control-Allow-Origin": d.env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" });
const json = (d: Deps, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(d), "Content-Type": "application/json" } });
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const isoData = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(String(s) + "T12:00:00Z")) ? String(s) : null;
const hhmm = (s: unknown) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s ?? "")); if (!m) return null; const h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h * 60 + mi : null; };
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * DIA).toISOString().slice(0, 10);
const absMin = (iso: string, min: number) => Date.parse(iso + "T00:00:00Z") / 60000 + min;
const primeiroNome = (n: string | null) => String(n || "").trim().split(/\s+/)[0] || "";
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
// resumo do aparelho a partir do User-Agent (sem guardar o texto inteiro)
export function resumoAparelho(ua: string | null): string {
  const u = String(ua || "");
  const so = /iPhone|iPad/.test(u) ? "iPhone/iPad" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac OS X/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "aparelho";
  const nav = /EdgA?\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /Firefox|FxiOS/.test(u) ? "Firefox" : /Chrome|CriOS/.test(u) ? "Chrome" : /Safari/.test(u) ? "Safari" : "navegador";
  return so + " · " + nav;
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(d) });
  if (req.method !== "POST") return json(d, 405, { erro: "metodo_nao_permitido" });
  let b: any; try { b = await req.json(); } catch { return json(d, 400, { erro: "json_invalido" }); }
  const acao = String(b?.acao || ""), agoraMs = d.agora(), agora = agoraSP(agoraMs), agoraISO = new Date(agoraMs).toISOString();

  // ---------- entrar com o convite ----------
  if (acao === "entrar") {
    const conv = String(b?.convite || "");
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(conv)) return json(d, 404, { erro: "convite_invalido" });
    const c = await d.convitePorHash(await sha256(conv));
    if (!c || c.bloqueado || c.usado_em || Date.parse(c.expira_em) < agoraMs) return json(d, 404, { erro: "convite_invalido" });
    const p = await d.paciente(c.paciente_id);
    const nasc = isoData(b?.nascimento), cpf4 = digitos(b?.cpf4);
    const okNasc = !!p?.data_nascimento && !!nasc && String(p.data_nascimento).slice(0, 10) === nasc;
    const cpfP = digitos(p?.cpf);
    const okCpf = cpfP.length >= 4 && cpf4.length === 4 && cpfP.slice(-4) === cpf4;
    if (!p || !okNasc || !okCpf) {
      const t = c.tentativas + 1, bloq = t >= MAX_TENTATIVAS;
      await d.atualizarConvite(c.id, { tentativas: t, bloqueado: bloq });
      if (p) await d.registrar({ owner_id: c.owner_id, paciente_id: c.paciente_id, sessao_id: null, acao: bloq ? "convite bloqueado" : "tentativa de entrada com dados errados" });
      return json(d, bloq ? 423 : 401, { erro: bloq ? "convite_bloqueado" : "dados_nao_conferem", restantes: Math.max(0, MAX_TENTATIVAS - t) });
    }
    const token = b64url(d.aleatorio(32));
    const aparelho = resumoAparelho(req.headers.get("user-agent"));
    const sid = await d.criarSessao({ owner_id: c.owner_id, paciente_id: c.paciente_id, token_hash: await sha256(token), aparelho,
      criado_em: agoraISO, ultimo_uso: agoraISO, expira_em: new Date(agoraMs + SESSAO_DIAS * DIA).toISOString() });
    await d.atualizarConvite(c.id, { usado_em: agoraISO });
    await d.registrar({ owner_id: c.owner_id, paciente_id: c.paciente_id, sessao_id: sid, acao: "conectou um aparelho", detalhe: aparelho });
    return json(d, 200, { ok: true, sessao: token, nome: primeiroNome(p.nome) });
  }

  // ---------- daqui para baixo: precisa de sessão válida ----------
  const tok = String(b?.sessao || "");
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(tok)) return json(d, 401, { erro: "sessao_invalida" });
  const s = await d.sessaoPorHash(await sha256(tok));
  if (!s || s.revogada || Date.parse(s.expira_em) < agoraMs) return json(d, 401, { erro: "sessao_invalida" });
  // renova a validade no máximo 1 vez por hora (evita escrever no banco a cada clique)
  if (agoraMs - Date.parse(s.ultimo_uso) > 3600_000) await d.atualizarSessao(s.id, { ultimo_uso: agoraISO, expira_em: new Date(agoraMs + SESSAO_DIAS * DIA).toISOString() });
  const log = (a: string, det?: string | null) => d.registrar({ owner_id: s.owner_id, paciente_id: s.paciente_id, sessao_id: s.id, acao: a, detalhe: det ?? null });
  const p = await d.paciente(s.paciente_id);
  if (!p) return json(d, 401, { erro: "sessao_invalida" });
  const minhas = async () => (await d.consultas(p.id)).filter((x) => !x.profissional_id || x.profissional_id === s.owner_id);
  const passou = (x: Consulta) => absMin(x.data, hhmm(x.hora) ?? 0) + (x.duracao_min || 30) < absMin(agora.data, agora.min);
  const vistaConsulta = (x: Consulta) => ({ id: x.id, data: x.data, hora: x.hora ? String(x.hora).slice(0, 5) : null, duracao_min: x.duracao_min || 30,
    status: x.status, tipo: x.tipo, preconsulta: !!x.preconsulta_em, passada: passou(x) });

  if (acao === "sair") { await d.atualizarSessao(s.id, { revogada: true }); await log("desconectou este aparelho"); return json(d, 200, { ok: true }); }

  if (acao === "inicio") {
    const ult = await d.ultimoLog(s.id, "abriu o portal");
    if (!ult || agoraMs - Date.parse(ult) > 30 * 60_000) await log("abriu o portal");
    const cs = (await minhas()).sort((a, z) => (a.data + (a.hora || "")).localeCompare(z.data + (z.hora || "")));
    const prox = cs.filter((x) => !passou(x) && ATIVAS.includes(x.status));
    const ant = cs.filter((x) => passou(x) || !ATIVAS.includes(x.status)).reverse().slice(0, 15);
    const docs = (await d.documentos(p.id)).map((x) => ({ id: x.id, titulo: x.titulo, criado_em: x.criado_em, baixado: !!x.baixado_em }));
    const cfgReg = await d.configPorOwner(s.owner_id), cfg = cfgReg ? normalizarCfg(cfgReg.config) : null;
    return json(d, 200, { ok: true, nome: primeiroNome(p.nome), medico: cfg?.nome_publico || "", agendamento: !!cfg?.ativo,
      modo: cfg?.modo || "aprovar", duracao_min: cfg?.duracao_min || 30,
      proximas: prox.map(vistaConsulta), anteriores: ant.map(vistaConsulta), documentos: docs, acessos: (await d.acessos(p.id)).slice(0, 30) });
  }

  if (acao === "consulta" || acao === "preconsulta") {
    const x = (await minhas()).find((c) => c.id === String(b?.id || ""));
    if (!x) return json(d, 404, { erro: "consulta_nao_encontrada" });
    const ativa = ATIVAS.includes(x.status) && !passou(x);
    if (!ativa) return json(d, 409, { erro: "consulta_encerrada" });
    const quando = dataBR(x.data) + (x.hora ? " " + String(x.hora).slice(0, 5) : "");
    if (acao === "preconsulta") {
      if (b?.aceite !== true) return json(d, 400, { erro: "aceite_necessario" });
      const pc = normalizarPreconsulta(b?.respostas); if (!pc) return json(d, 400, { erro: "motivo_obrigatorio" });
      await d.atualizarConsulta(x.id, { preconsulta: pc, preconsulta_em: agoraISO }); x.preconsulta_em = agoraISO;
      await log("respondeu a pré-consulta", "consulta de " + quando);
    } else if (b?.op === "confirmar") {
      if (x.status !== "marcada") return json(d, 409, { erro: "nao_confirmavel" });
      await d.atualizarConsulta(x.id, { status: "confirmada", confirmado_em: agoraISO }); x.status = "confirmada";
      await log("confirmou a consulta", quando);
    } else if (b?.op === "cancelar") {
      await d.atualizarConsulta(x.id, { status: "cancelada" }); x.status = "cancelada";
      await log("cancelou a consulta", quando);
    } else return json(d, 400, { erro: "acao_invalida" });
    return json(d, 200, { ok: true, consulta: vistaConsulta(x) });
  }

  if (acao === "horarios" || acao === "marcar") {
    const reg = await d.configPorOwner(s.owner_id), cfg = reg ? normalizarCfg(reg.config) : null;
    if (!cfg || !cfg.ativo) return json(d, 404, { erro: "agenda_indisponivel" });
    if (acao === "horarios") {
      const de = isoData(b?.de) || agora.data; let ate = isoData(b?.ate) || somaDias(de, cfg.janela_dias);
      if (ate > somaDias(de, 31)) ate = somaDias(de, 31);
      const oc = await d.ocupados(s.owner_id, de, ate); const dias: Record<string, string[]> = {};
      for (let x = de; x <= ate; x = somaDias(x, 1)) { const h = horariosDoDia(cfg, x, oc, agora); if (h.length) dias[x] = h; }
      return json(d, 200, { ok: true, dias });
    }
    const data = isoData(b?.data), hora = hhmm(b?.hora);
    if (!data || hora == null) return json(d, 400, { erro: "horario_invalido" });
    if ((await minhas()).filter((x) => ATIVAS.includes(x.status) && !passou(x)).length >= 2) return json(d, 429, { erro: "limite_consultas" });
    const oc = await d.ocupados(s.owner_id, data, data);
    if (!horariosDoDia(cfg, data, oc, agora).includes(fmt(hora))) return json(d, 409, { erro: "horario_indisponivel" });
    const motivo = String(b?.motivo || "").replace(/\s+/g, " ").trim().slice(0, 200);
    const status = cfg.modo === "confirmar" ? "marcada" : "solicitada";
    const r = await d.inserirConsulta({ profissional_id: s.owner_id, paciente_id: p.id, nome: null, telefone: p.telefone, data, hora: fmt(hora),
      duracao_min: cfg.duracao_min, tipo: "Consulta (portal do paciente)", status, origem: "portal", observacao: motivo || null });
    if (!r.ok) return json(d, r.conflito ? 409 : 500, { erro: r.conflito ? "horario_indisponivel" : "falha_ao_gravar" });
    await log(status === "solicitada" ? "pediu uma consulta" : "marcou uma consulta", dataBR(data) + " " + fmt(hora));
    return json(d, 200, { ok: true, status, data, hora: fmt(hora) });
  }

  if (acao === "documento") {
    const doc = (await d.documentos(p.id)).find((x) => x.id === String(b?.id || ""));
    if (!doc) return json(d, 404, { erro: "documento_nao_encontrado" });
    const url = await d.urlAssinada(doc.storage_path, doc.nome_arquivo);
    if (!url) return json(d, 500, { erro: "falha_ao_abrir" });
    if (!doc.baixado_em) await d.marcarBaixado(doc.id);
    await log("baixou um documento", doc.titulo.slice(0, 80));
    return json(d, 200, { ok: true, url });
  }
  return json(d, 400, { erro: "acao_invalida" });
}

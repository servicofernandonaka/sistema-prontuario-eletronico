// Função "agenda-publica": agendamento online e confirmação pelo paciente (sem login).
// Ações (POST JSON):
//   info      {slug}                                    → nome do médico, duração, modo e janela de datas
//   horarios  {slug, de?, ate?}                         → horários livres por dia
//   solicitar {slug,nome,telefone,data,hora,motivo?,aceite,site?} → cria o pedido; devolve o token do link do paciente
//   consulta  {token}  | confirmar {token} | cancelar {token}   → o paciente vê, confirma ou cancela a própria consulta
//   preconsulta {token, respostas, aceite}                  → o paciente envia a pré-consulta (as respostas nunca são devolvidas pelo link)
// Segurança: o token do paciente é aleatório (só o hash fica no banco); respostas iguais para token inexistente;
// limites por telefone e por profissional contra abuso; campo-isca "site"; nenhum dado de outros pacientes é devolvido.

export type Cfg = { dias: Record<string, [string, string][]>; duracao_min: number; intervalo_min: number; antecedencia_horas: number;
  janela_dias: number; modo: "aprovar" | "confirmar"; bloqueios: { de: string; ate: string }[]; nome_publico: string; mensagem: string; ativo: boolean };
export type Ocupado = { data: string; hora: string | null; duracao_min: number | null };
export type Linha = { id: string; profissional_id: string; nome: string | null; data: string; hora: string | null; duracao_min: number | null;
  status: string; token_hash: string | null; preconsulta_em?: string | null };
export type Deps = {
  env: { ALLOWED_ORIGIN?: string };
  agora: () => number;                                   // ms (UTC)
  aleatorio: (n: number) => Uint8Array;
  configPorSlug: (slug: string) => Promise<{ owner_id: string; config: unknown } | null>;
  configPorOwner: (owner: string) => Promise<{ slug: string; config: unknown } | null>;
  ocupados: (owner: string, de: string, ate: string) => Promise<Ocupado[]>;
  contarPendentes: (owner: string) => Promise<number>;
  contarAtivosTelefone: (owner: string, ultimos8: string, desde: string) => Promise<number>;
  inserir: (row: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; conflito: boolean }>;
  porHash: (hash: string) => Promise<Linha | null>;
  atualizar: (id: string, patch: Record<string, unknown>) => Promise<void>;
};

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const cors = (d: Deps) => ({ "Access-Control-Allow-Origin": d.env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" });
const json = (d: Deps, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(d), "Content-Type": "application/json" } });

const clamp = (v: unknown, lo: number, hi: number, pad: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : pad; };
const hhmm = (s: unknown) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s ?? "")); if (!m) return null; const h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h * 60 + mi : null; };
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const isoData = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(String(s) + "T12:00:00Z")) ? String(s) : null;
const diaDaSemana = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const somaDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
// "agora" no fuso de São Paulo (UTC-3, sem horário de verão desde 2019)
export const agoraSP = (ms: number) => { const d = new Date(ms - 3 * 3600_000); return { data: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
const absMin = (iso: string, min: number) => Date.parse(iso + "T00:00:00Z") / 60000 + min;   // linha do tempo "local" contínua

export function normalizarCfg(raw: unknown): Cfg {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const dias: Cfg["dias"] = {};
  for (let i = 0; i < 7; i++) {
    const fx = Array.isArray(r.dias?.[i]) ? r.dias[i] : [];
    dias[String(i)] = fx.map((p: unknown) => { const a = Array.isArray(p) ? hhmm(p[0]) : null, b = Array.isArray(p) ? hhmm(p[1]) : null; return a != null && b != null && b > a ? [fmt(a), fmt(b)] as [string, string] : null; }).filter(Boolean) as [string, string][];
  }
  const bl = (Array.isArray(r.bloqueios) ? r.bloqueios : []).map((b: any) => { const de = isoData(b?.de), ate = isoData(b?.ate || b?.de); return de && ate && ate >= de ? { de, ate } : null; }).filter(Boolean) as Cfg["bloqueios"];
  return { dias, duracao_min: clamp(r.duracao_min, 10, 180, 30), intervalo_min: clamp(r.intervalo_min, 0, 60, 0), antecedencia_horas: clamp(r.antecedencia_horas, 0, 168, 12),
    janela_dias: clamp(r.janela_dias, 1, 90, 30), modo: r.modo === "confirmar" ? "confirmar" : "aprovar", bloqueios: bl.slice(0, 50),
    nome_publico: String(r.nome_publico || "").slice(0, 80), mensagem: String(r.mensagem || "").slice(0, 300), ativo: r.ativo === true };
}

// horários livres de um dia (inclui a regra de antecedência mínima, bloqueios e choque com consultas existentes)
export function horariosDoDia(cfg: Cfg, dia: string, ocupados: Ocupado[], agora: { data: string; min: number }): string[] {
  if (cfg.bloqueios.some((b) => dia >= b.de && dia <= b.ate)) return [];
  if (dia < agora.data || dia > somaDias(agora.data, cfg.janela_dias)) return [];
  const limite = absMin(agora.data, agora.min) + cfg.antecedencia_horas * 60;
  const ocup = ocupados.filter((o) => o.data === dia && o.hora).map((o) => { const s = hhmm(o.hora)!; return [s, s + (o.duracao_min || 30)] as [number, number]; });
  const out: string[] = [];
  for (const [ini, fim] of cfg.dias[String(diaDaSemana(dia))] || []) {
    const a = hhmm(ini)!, b = hhmm(fim)!;
    for (let t = a; t + cfg.duracao_min <= b; t += cfg.duracao_min + cfg.intervalo_min) {
      if (absMin(dia, t) < limite) continue;
      if (ocup.some(([s, e]) => t < e && t + cfg.duracao_min > s)) continue;
      out.push(fmt(t));
    }
  }
  return out;
}

const primeiroNome = (n: string | null) => String(n || "").trim().split(/\s+/)[0] || "";
export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const telefoneOK = (v: string) => { const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, ""); return /^\d{10,11}$/.test(d) ? d : ""; };

// pré-consulta: só textos curtos e escalas 0–3 (PHQ-2 e GAD-2); qualquer outro campo é descartado
const TXT_PC: Record<string, number> = { motivo: 500, desde: 120, remedios: 600, alergias: 300, doencas: 400, outros: 600 };
export function normalizarPreconsulta(raw: unknown): Record<string, unknown> | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>; const out: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(TXT_PC)) { const v = String(r[k] ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max); if (v) out[k] = v; }
  for (const k of ["phq2", "gad2"]) { const a = r[k]; if (Array.isArray(a) && a.length === 2 && a.every((x) => Number.isInteger(x) && x >= 0 && x <= 3)) out[k] = [a[0], a[1]]; }
  if (!out.motivo) return null;
  return out;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(deps) });
  if (req.method !== "POST") return json(deps, 405, { erro: "metodo_nao_permitido" });
  let b: any; try { b = await req.json(); } catch { return json(deps, 400, { erro: "json_invalido" }); }
  const acao = String(b?.acao || "");
  const agora = agoraSP(deps.agora());

  // ---------- ações com slug (médico) ----------
  if (acao === "info" || acao === "horarios" || acao === "solicitar") {
    const slug = String(b?.slug || "");
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(slug)) return json(deps, 404, { erro: "agenda_indisponivel" });
    const reg = await deps.configPorSlug(slug); const cfg = reg ? normalizarCfg(reg.config) : null;
    if (!reg || !cfg || !cfg.ativo) return json(deps, 404, { erro: "agenda_indisponivel" });
    const owner = reg.owner_id;

    if (acao === "info") return json(deps, 200, { ok: true, medico: cfg.nome_publico, mensagem: cfg.mensagem, duracao_min: cfg.duracao_min, modo: cfg.modo,
      de: agora.data, ate: somaDias(agora.data, cfg.janela_dias) });

    if (acao === "horarios") {
      const de = isoData(b?.de) || agora.data, ate = isoData(b?.ate) || somaDias(de, 13);
      if (ate < de) return json(deps, 400, { erro: "periodo_invalido" });
      const lim = ate > somaDias(de, 31) ? somaDias(de, 31) : ate;
      const oc = await deps.ocupados(owner, de, lim); const dias: Record<string, string[]> = {};
      for (let d = de; d <= lim; d = somaDias(d, 1)) { const h = horariosDoDia(cfg, d, oc, agora); if (h.length) dias[d] = h; }
      return json(deps, 200, { ok: true, dias });
    }

    // solicitar
    if (b?.site) return json(deps, 200, { ok: true, status: "solicitada" });               // campo-isca preenchido: finge sucesso, não grava
    const nome = String(b?.nome || "").replace(/\s+/g, " ").trim();
    const tel = telefoneOK(String(b?.telefone || "")); const data = isoData(b?.data); const hora = hhmm(b?.hora);
    const motivo = String(b?.motivo || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (b?.aceite !== true) return json(deps, 400, { erro: "aceite_necessario" });
    if (nome.length < 3 || nome.length > 80 || !/\p{L}/u.test(nome)) return json(deps, 400, { erro: "nome_invalido" });
    if (!tel) return json(deps, 400, { erro: "telefone_invalido" });
    if (!data || hora == null) return json(deps, 400, { erro: "horario_invalido" });
    const oc = await deps.ocupados(owner, data, data);
    if (!horariosDoDia(cfg, data, oc, agora).includes(fmt(hora))) return json(deps, 409, { erro: "horario_indisponivel" });
    if ((await deps.contarPendentes(owner)) >= 40) return json(deps, 429, { erro: "muitos_pedidos" });
    if ((await deps.contarAtivosTelefone(owner, tel.slice(-8), agora.data)) >= 2) return json(deps, 429, { erro: "limite_por_telefone" });
    const token = b64url(deps.aleatorio(24));
    const status = cfg.modo === "confirmar" ? "marcada" : "solicitada";
    const r = await deps.inserir({ profissional_id: owner, nome, telefone: tel, data, hora: fmt(hora), duracao_min: cfg.duracao_min, tipo: "Consulta (agendamento online)",
      status, origem: "publico", observacao: motivo || null, token_hash: await sha256(token) });
    if (!r.ok) return json(deps, r.conflito ? 409 : 500, { erro: r.conflito ? "horario_indisponivel" : "falha_ao_gravar" });
    return json(deps, 200, { ok: true, status, token, data, hora: fmt(hora), medico: cfg.nome_publico });
  }

  // ---------- ações com token (paciente) ----------
  if (acao === "consulta" || acao === "confirmar" || acao === "cancelar" || acao === "preconsulta") {
    const token = String(b?.token || "");
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return json(deps, 404, { erro: "link_invalido" });
    const l = await deps.porHash(await sha256(token));
    if (!l) return json(deps, 404, { erro: "link_invalido" });
    const passada = absMin(l.data, hhmm(l.hora) ?? 0) + (l.duracao_min || 30) < absMin(agora.data, agora.min);
    const ativa = ["solicitada", "marcada", "confirmada"].includes(l.status);
    if (acao === "confirmar" && ativa && !passada && l.status === "marcada") { await deps.atualizar(l.id, { status: "confirmada", confirmado_em: new Date(deps.agora()).toISOString() }); l.status = "confirmada"; }
    if (acao === "cancelar" && ativa && !passada) { await deps.atualizar(l.id, { status: "cancelada" }); l.status = "cancelada"; }
    if (acao === "preconsulta") {
      if (!ativa || passada) return json(deps, 409, { erro: "consulta_encerrada" });
      if (b?.aceite !== true) return json(deps, 400, { erro: "aceite_necessario" });
      const pc = normalizarPreconsulta(b?.respostas);
      if (!pc) return json(deps, 400, { erro: "motivo_obrigatorio" });
      const em = new Date(deps.agora()).toISOString();
      await deps.atualizar(l.id, { preconsulta: pc, preconsulta_em: em }); l.preconsulta_em = em;
    }
    const c = await deps.configPorOwner(l.profissional_id); const cfg = c ? normalizarCfg(c.config) : null;
    return json(deps, 200, { ok: true, nome: primeiroNome(l.nome), data: l.data, hora: l.hora ? String(l.hora).slice(0, 5) : null, status: l.status,
      medico: cfg?.nome_publico || "", duracao_min: l.duracao_min || 30, passada, slug: c?.slug || null, agendamento_ativo: !!cfg?.ativo,
      preconsulta: !!l.preconsulta_em, preconsulta_em: l.preconsulta_em || null });
  }
  return json(deps, 400, { erro: "acao_invalida" });
}

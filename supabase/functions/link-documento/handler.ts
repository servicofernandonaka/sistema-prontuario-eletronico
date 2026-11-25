// Função "link-documento": cria links seguros para o paciente baixar um documento e valida o acesso a eles.
// Ações (POST JSON):
//   criar   (exige login)  guarda o PDF num bucket privado, gera o token e (opcional) manda o link por SMS
//   revogar (exige login)  invalida um link do próprio médico
//   abrir   (público)      {token} → diz qual confirmação pedir; {token, resposta} → entrega o PDF por URL de 2 minutos
// Segurança: token aleatório (só o hash fica no banco); resposta de confirmação guardada como HMAC com um segredo da função;
// 5 erros bloqueiam o link por 30 min e 10 o revogam; validade e limite de downloads; respostas iguais para token
// desconhecido, vencido ou revogado (não revela se existe); o PDF nunca é público.

export type Env = { LINK_PEPPER?: string; ALLOWED_ORIGIN?: string; LIMITE_CRIAR_HORA?: string; LINK_HOSTS?: string;
  SMS_API_KEY?: string; EMAIL_API_KEY?: string; SMS_SENDER?: string };
export type Linha = { id: string; owner_id: string; token_hash: string; storage_path: string; nome_arquivo: string; titulo: string | null;
  tipo_verificacao: "cpf4" | "nasc"; segredo_hash: string; expira_em: string; max_downloads: number; downloads: number;
  tentativas: number; bloqueado_ate: string | null; revogado: boolean };
export type Deps = {
  env: Env; fetch: typeof fetch; agora: () => number; aleatorio: (n: number) => Uint8Array;
  verificarUsuario: (token: string) => Promise<{ id: string } | null>;
  contarCriadosHora: (owner: string) => Promise<number>;
  limparExpirados: (owner: string) => Promise<void>;
  guardarPdf: (path: string, bytes: Uint8Array) => Promise<void>;
  inserirLink: (l: Omit<Linha, "id">) => Promise<{ id: string }>;
  buscarPorHash: (h: string) => Promise<Linha | null>;
  atualizar: (id: string, patch: Partial<Linha> & { ultimo_acesso?: string }) => Promise<void>;
  revogarDoOwner: (id: string, owner: string) => Promise<boolean>;
  urlAssinada: (path: string, segundos: number, nome: string) => Promise<string | null>;
};

const MAX_PDF = 5 * 1024 * 1024;
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export async function hmac(chave: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const igual = (a: string, b: string) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
export const normalizar = (tipo: string, r: unknown) => { const d = String(r ?? "").replace(/\D/g, ""); return tipo === "cpf4" ? d.slice(-4) : d; };
const respostaValida = (tipo: string, d: string) => tipo === "cpf4" ? /^\d{4}$/.test(d) : /^\d{8}$/.test(d);

const cors = (env: Env) => ({ "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" });
const json = (env: Env, status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors(env), "Content-Type": "application/json" } });

export const telefoneBR = (v: string) => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 10 || d.length === 11) d = "55" + d; return /^55\d{10,11}$/.test(d) ? d : ""; };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const dataBR = (ms: number) => { const d = new Date(ms - 3 * 3600_000); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  if (req.method !== "POST") return json(env, 405, { erro: "metodo_nao_permitido" });
  let b: any; try { b = await req.json(); } catch { return json(env, 400, { erro: "json_invalido" }); }
  if (!env.LINK_PEPPER || env.LINK_PEPPER.length < 16) return json(env, 503, { erro: "nao_configurado", detalhe: "Falta o segredo LINK_PEPPER." });
  const acao = String(b?.acao || "");

  // ---------- público: abrir ----------
  if (acao === "abrir") {
    const token = String(b?.token || "");
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return json(env, 404, { erro: "link_invalido" });
    const th = await sha256(token), l = await deps.buscarPorHash(th), agora = deps.agora();
    if (!l || l.revogado || Date.parse(l.expira_em) < agora) return json(env, 404, { erro: "link_invalido" });
    if (l.bloqueado_ate && Date.parse(l.bloqueado_ate) > agora) return json(env, 429, { erro: "bloqueado", minutos: Math.ceil((Date.parse(l.bloqueado_ate) - agora) / 60000) });
    if (b?.resposta === undefined) return json(env, 200, { ok: true, precisa: l.tipo_verificacao });   // só diz o que pedir
    if (l.downloads >= l.max_downloads) return json(env, 410, { erro: "limite_downloads" });
    const r = normalizar(l.tipo_verificacao, b.resposta);
    const certo = respostaValida(l.tipo_verificacao, r) && igual(await hmac(env.LINK_PEPPER, th + ":" + r), l.segredo_hash);
    if (!certo) {
      const t = l.tentativas + 1, patch: any = { tentativas: t };
      if (t >= 10) patch.revogado = true; else if (t % 5 === 0) patch.bloqueado_ate = new Date(agora + 30 * 60000).toISOString();
      await deps.atualizar(l.id, patch);
      return json(env, 401, { erro: "resposta_incorreta", restantes: t >= 10 ? 0 : 5 - (t % 5) });
    }
    const url = await deps.urlAssinada(l.storage_path, 120, l.nome_arquivo);
    if (!url) return json(env, 502, { erro: "arquivo_indisponivel" });
    const restantes = l.max_downloads - l.downloads - 1;
    await deps.atualizar(l.id, { downloads: l.downloads + 1, tentativas: 0, bloqueado_ate: null, ultimo_acesso: new Date(agora).toISOString() });
    return json(env, 200, { ok: true, url, nome: l.nome_arquivo, titulo: l.titulo, restantes });
  }

  // ---------- com login ----------
  const tk = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = tk ? await deps.verificarUsuario(tk) : null;
  if (!user) return json(env, 401, { erro: "nao_autorizado" });

  if (acao === "revogar") {
    const ok = await deps.revogarDoOwner(String(b?.id || ""), user.id);
    return json(env, ok ? 200 : 404, ok ? { ok: true } : { erro: "nao_encontrado" });
  }
  if (acao !== "criar") return json(env, 400, { erro: "acao_invalida" });

  const tipo = String(b?.verificacao?.tipo || ""), resp = normalizar(tipo, b?.verificacao?.resposta);
  if (!["cpf4", "nasc"].includes(tipo) || !respostaValida(tipo, resp)) return json(env, 400, { erro: "verificacao_invalida" });
  const nome = String(b?.nome_arquivo || "documento.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  const titulo = String(b?.titulo || "").replace(/[\r\n]/g, " ").slice(0, 120);
  const pdf = String(b?.pdf_base64 || "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf) || pdf.length % 4 !== 0) return json(env, 400, { erro: "pdf_invalido" });
  if (Math.floor(pdf.length * 3 / 4) > MAX_PDF) return json(env, 413, { erro: "pdf_grande" });
  if (atob(pdf.slice(0, 8)).slice(0, 4) !== "%PDF") return json(env, 400, { erro: "arquivo_nao_e_pdf" });
  const dias = Math.min(30, Math.max(1, parseInt(String(b?.validade_dias ?? 14), 10) || 14));
  const base = String(b?.base_url || "");
  let urlBase: URL | null = null; try { urlBase = new URL(base); } catch { /* sem base: o app monta o link */ }
  if (urlBase && (urlBase.protocol !== "https:" || (env.LINK_HOSTS && !env.LINK_HOSTS.split(",").map((s) => s.trim()).includes(urlBase.host)))) return json(env, 400, { erro: "base_invalida" });

  const limite = Math.max(1, parseInt(env.LIMITE_CRIAR_HORA || "30", 10) || 30);
  if (await deps.contarCriadosHora(user.id) >= limite) return json(env, 429, { erro: "limite_por_hora" });
  await deps.limparExpirados(user.id);

  const token = b64url(deps.aleatorio(24)), th = await sha256(token);
  const bin = atob(pdf), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const caminho = `${user.id}/${b64url(deps.aleatorio(12))}.pdf`;
  await deps.guardarPdf(caminho, bytes);
  const expira = new Date(deps.agora() + dias * 86400_000).toISOString();
  const { id } = await deps.inserirLink({ owner_id: user.id, token_hash: th, storage_path: caminho, nome_arquivo: nome, titulo, tipo_verificacao: tipo as "cpf4" | "nasc",
    segredo_hash: await hmac(env.LINK_PEPPER, th + ":" + resp), expira_em: expira, max_downloads: 5, downloads: 0, tentativas: 0, bloqueado_ate: null, revogado: false });
  const url = urlBase ? `${urlBase.origin}${urlBase.pathname}#${token}` : null;

  // SMS opcional: o texto é montado AQUI (o cliente não escolhe o conteúdo), para a função não servir de disparador de spam
  let sms: { enviado: boolean; erro?: string } | undefined;
  if (b?.sms_para) {
    const tel = telefoneBR(b.sms_para), chave = env.SMS_API_KEY || env.EMAIL_API_KEY;
    if (!tel || !url) sms = { enviado: false, erro: !tel ? "telefone_invalido" : "base_url_obrigatoria" };
    else if (!chave) sms = { enviado: false, erro: "sms_nao_configurado" };
    else {
      const medico = semAcento(String(b?.remetente_nome || "").replace(/[^\p{L}\p{N} .-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 30));
      const texto = `${medico ? medico + " enviou" : "Foi enviado"} um documento medico. Abra: ${url} (valido ate ${dataBR(Date.parse(expira))})`;
      try {
        const r = await deps.fetch("https://api.brevo.com/v3/transactionalSMS/sms", { method: "POST",
          headers: { "api-key": chave, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: (env.SMS_SENDER || "PEPClinico").slice(0, 11), recipient: tel, content: texto, type: "transactional", tag: "pep-link" }) });
        if (!r.ok) console.error("sms recusado", r.status, (await r.text()).split(chave).join("***").slice(0, 300));
        sms = r.ok ? { enviado: true } : { enviado: false, erro: "sms_recusado" };
      } catch (e) { console.error("sms rede", (e as Error).message); sms = { enviado: false, erro: "sms_indisponivel" }; }
    }
  }
  return json(env, 200, { ok: true, id, token, url, expira_em: expira, ...(sms ? { sms } : {}) });
}

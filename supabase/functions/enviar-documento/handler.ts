// Lógica da função "enviar-documento" (sem dependência do Deno, para poder ser testada em qualquer lugar).
// Recebe o PDF já pronto (gerado no app) e o entrega por e-mail, como anexo, por um serviço de e-mail via HTTP.
// Segurança: exige usuário logado (JWT), valida tudo que chega, limita envios por hora e nunca devolve a chave do serviço.

export type Env = {
  EMAIL_PROVIDER?: string;        // "brevo" (padrão) ou "resend"
  EMAIL_API_KEY?: string;         // chave do serviço — guardada só como segredo da função
  EMAIL_FROM?: string;            // e-mail remetente (precisa estar verificado no serviço)
  EMAIL_FROM_NAME?: string;       // nome que aparece como remetente
  LIMITE_POR_HORA?: string;       // envios por usuário por hora (padrão 30)
  ALLOWED_ORIGIN?: string;        // origem do app (padrão "*")
};
export type Deps = {
  env: Env;
  fetch: typeof fetch;
  contar: (userId: string) => Promise<number>;                        // envios do usuário na última hora
  registrar: (userId: string, paraMascarado: string, tipo: string) => Promise<void>;
};

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const cors = (env: Env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (env: Env, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(env), "Content-Type": "application/json" } });

// O gateway do Supabase já confere a assinatura do JWT (verify_jwt ligado). Aqui só se lê quem é o usuário.
function usuarioDoToken(req: Request): { id: string } | null {
  const h = req.headers.get("authorization") || "";
  const t = h.replace(/^Bearer\s+/i, "");
  const partes = t.split(".");
  if (partes.length !== 3) return null;
  try {
    const p = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p.role !== "authenticated" || !p.sub) return null;
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    return { id: String(p.sub) };
  } catch { return null; }
}

export const mascarar = (email: string) => {
  const [u, d] = email.split("@"); return (u[0] || "") + "***@" + d;
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
  if (req.method !== "POST") return json(env, 405, { error: "metodo_nao_permitido" });

  const user = usuarioDoToken(req);
  if (!user) return json(env, 401, { error: "nao_autorizado" });

  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) return json(env, 503, { error: "nao_configurado", detalhe: "Faltam os segredos EMAIL_API_KEY e EMAIL_FROM na função." });

  let b: any;
  try { b = await req.json(); } catch { return json(env, 400, { error: "json_invalido" }); }

  const para = String(b?.para || "").trim();
  const assunto = String(b?.assunto || "").trim();
  const corpo = String(b?.corpo || "").trim();
  const tipo = String(b?.tipo || "documento").slice(0, 60);
  const responder = String(b?.responder_para || "").trim();
  const nomeArq = String(b?.nome_arquivo || "documento.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  const pdf = String(b?.pdf_base64 || "");

  if (!EMAIL_RE.test(para) || para.length > 254) return json(env, 400, { error: "email_invalido" });
  if (responder && !EMAIL_RE.test(responder)) return json(env, 400, { error: "responder_para_invalido" });
  if (!assunto || assunto.length > 150) return json(env, 400, { error: "assunto_invalido" });
  if (!corpo || corpo.length > 3000) return json(env, 400, { error: "corpo_invalido" });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdf) || pdf.length % 4 !== 0) return json(env, 400, { error: "pdf_invalido" });
  const bytes = Math.floor(pdf.length * 3 / 4);
  if (bytes > MAX_PDF_BYTES) return json(env, 413, { error: "pdf_grande", detalhe: "O PDF passa de 5 MB." });
  if (atob(pdf.slice(0, 8)).slice(0, 4) !== "%PDF") return json(env, 400, { error: "arquivo_nao_e_pdf" });

  const limite = Math.max(1, parseInt(env.LIMITE_POR_HORA || "30", 10) || 30);
  if (await deps.contar(user.id) >= limite) return json(env, 429, { error: "limite_por_hora", detalhe: "Limite de envios por hora atingido." });

  const nomeDe = env.EMAIL_FROM_NAME || "Consultório";
  const prov = (env.EMAIL_PROVIDER || "brevo").toLowerCase();
  let r: Response;
  try {
    if (prov === "resend") {
      r = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.EMAIL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${nomeDe} <${env.EMAIL_FROM}>`, to: [para], subject: assunto, text: corpo,
          ...(responder ? { reply_to: responder } : {}), attachments: [{ filename: nomeArq, content: pdf }] }),
      });
    } else if (prov === "brevo") {
      r = await deps.fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.EMAIL_API_KEY, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { email: env.EMAIL_FROM, name: nomeDe }, to: [{ email: para }], subject: assunto, textContent: corpo,
          ...(responder ? { replyTo: { email: responder } } : {}), attachment: [{ name: nomeArq, content: pdf }] }),
      });
    } else return json(env, 503, { error: "provedor_desconhecido" });
  } catch (e) {
    console.error("falha de rede no provedor:", (e as Error).message);
    return json(env, 502, { error: "provedor_indisponivel" });
  }
  if (!r.ok) {
    // o detalhe do provedor fica só no log da função; nada dele (nem a chave) volta para o navegador
    console.error("provedor respondeu", r.status, (await r.text()).split(env.EMAIL_API_KEY).join("***").slice(0, 300));
    return json(env, 502, { error: "provedor_recusou", status: r.status });
  }
  await deps.registrar(user.id, mascarar(para), tipo);
  return json(env, 200, { ok: true });
}

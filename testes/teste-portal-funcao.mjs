// Testa a lógica da função portal-paciente (handler.ts) no Node, com banco falso.
import { execSync } from "node:child_process"; import { mkdtempSync } from "node:fs"; import { join, dirname } from "node:path";
import { tmpdir } from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { createHash } from "node:crypto";
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(mkdtempSync(join(tmpdir(), "fn-")), "portal.mjs");
execSync(`npx -y esbuild@0.24.0 "${join(raiz, "supabase/functions/portal-paciente/handler.ts")}" --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=warning`, { stdio: "inherit" });
const { handle, resumoAparelho } = await import(pathToFileURL(out).href);
let falhas = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) falhas++; };
let AGORA = Date.parse("2026-11-27T15:00:00Z");      // 12:00 em São Paulo (sexta)
const sha = (s) => createHash("sha256").update(s).digest("hex");
const DR = "dr1", OUTRO = "dr2";
const db = {
  pacientes: { p1: { id: "p1", nome: "Maria Aparecida", data_nascimento: "1960-05-01", cpf: "123.456.789-09", telefone: "11988887777" },
               p2: { id: "p2", nome: "José", data_nascimento: "1950-01-01", cpf: "98765432100", telefone: "11" } },
  convites: [{ id: "c1", owner_id: DR, paciente_id: "p1", token_hash: sha("CONVITE_DA_MARIA_123456"), expira_em: "2026-12-01T00:00:00Z", usado_em: null, tentativas: 0, bloqueado: false },
             { id: "c2", owner_id: DR, paciente_id: "p2", token_hash: sha("CONVITE_DO_JOSE_9876543"), expira_em: "2026-12-01T00:00:00Z", usado_em: null, tentativas: 0, bloqueado: false },
             { id: "c3", owner_id: DR, paciente_id: "p1", token_hash: sha("CONVITE_VENCIDO_0000000"), expira_em: "2026-11-01T00:00:00Z", usado_em: null, tentativas: 0, bloqueado: false }],
  sessoes: [], log: [],
  agenda: [
    { id: "g1", profissional_id: DR, paciente_id: "p1", data: "2026-11-30", hora: "09:00", duracao_min: 30, status: "marcada", tipo: "Consulta", preconsulta_em: null },
    { id: "g2", profissional_id: DR, paciente_id: "p1", data: "2026-10-10", hora: "09:00", duracao_min: 30, status: "atendida", tipo: "Consulta", preconsulta_em: null },
    { id: "g3", profissional_id: DR, paciente_id: "p2", data: "2026-12-01", hora: "10:00", duracao_min: 30, status: "marcada", tipo: "Consulta", preconsulta_em: null },
    { id: "g4", profissional_id: OUTRO, paciente_id: "p1", data: "2026-12-02", hora: "10:00", duracao_min: 30, status: "marcada", tipo: "Outro médico", preconsulta_em: null }],
  docs: [{ id: "d1", paciente_id: "p1", titulo: "Receita", criado_em: "2026-11-20T10:00:00Z", baixado_em: null, storage_path: "dr1/p1/r.pdf", nome_arquivo: "receita.pdf" },
         { id: "d2", paciente_id: "p2", titulo: "Receita do José", criado_em: "2026-11-20T10:00:00Z", baixado_em: null, storage_path: "dr1/p2/r.pdf", nome_arquivo: "r.pdf" }],
};
const cfg = { ativo: true, nome_publico: "Dr. Teste", modo: "aprovar", duracao_min: 30, antecedencia_horas: 2, janela_dias: 14, dias: { 1: [["08:00", "10:00"]], 2: [["08:00", "10:00"]] } };
let seq = 0;
const deps = { env: {}, agora: () => AGORA, aleatorio: (n) => new Uint8Array(n).map(() => Math.floor(Math.random() * 256)),
  convitePorHash: async (h) => db.convites.find((c) => c.token_hash === h) || null,
  atualizarConvite: async (id, p) => Object.assign(db.convites.find((c) => c.id === id), p),
  paciente: async (id) => db.pacientes[id] || null,
  criarSessao: async (r) => { const id = "s" + ++seq; db.sessoes.push({ id, revogada: false, ...r }); return id; },
  sessaoPorHash: async (h) => db.sessoes.find((s) => s.token_hash === h) || null,
  atualizarSessao: async (id, p) => Object.assign(db.sessoes.find((s) => s.id === id), p),
  registrar: async (r) => db.log.push({ em: new Date(AGORA).toISOString(), ...r }),
  ultimoLog: async (sid, a) => [...db.log].reverse().find((l) => l.sessao_id === sid && l.acao === a)?.em ?? null,
  consultas: async (pac) => db.agenda.filter((x) => x.paciente_id === pac),
  atualizarConsulta: async (id, p) => Object.assign(db.agenda.find((x) => x.id === id), p),
  documentos: async (pac) => db.docs.filter((x) => x.paciente_id === pac),
  marcarBaixado: async (id) => { db.docs.find((x) => x.id === id).baixado_em = "agora"; },
  urlAssinada: async (path) => "https://assinado/" + path,
  acessos: async (pac) => db.log.filter((l) => l.paciente_id === pac).reverse().map(({ em, acao, detalhe }) => ({ em, acao, detalhe: detalhe ?? null })),
  configPorOwner: async (o) => (o === DR ? { slug: "slug", config: cfg } : null),
  ocupados: async (o, de, ate) => db.agenda.filter((x) => x.profissional_id === o && x.data >= de && x.data <= ate && x.status !== "cancelada"),
  inserirConsulta: async (r) => { db.agenda.push({ id: "n" + ++seq, preconsulta_em: null, ...r }); return { ok: true }; } };
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
const chamar = async (corpo) => { const r = await handle(new Request("https://x/", { method: "POST", headers: { "user-agent": UA }, body: JSON.stringify(corpo) }), deps); return { s: r.status, j: await r.json() }; };

// entrada
let r = await chamar({ acao: "entrar", convite: "CONVITE_DA_MARIA_123456", nascimento: "1960-05-01", cpf4: "0000" });
ok(r.s === 401 && r.j.restantes === 4, "CPF errado: recusa e informa tentativas restantes");
r = await chamar({ acao: "entrar", convite: "CONVITE_DA_MARIA_123456", nascimento: "1961-05-01", cpf4: "8909" });
ok(r.s === 401, "data errada com CPF certo: recusa (precisa dos dois)");
r = await chamar({ acao: "entrar", convite: "CONVITE_VENCIDO_0000000", nascimento: "1960-05-01", cpf4: "8909" });
ok(r.s === 404, "convite vencido não entra");
r = await chamar({ acao: "entrar", convite: "CONVITE_DA_MARIA_123456", nascimento: "1960-05-01", cpf4: "8909" });
ok(r.s === 200 && r.j.sessao && r.j.nome === "Maria", "dados certos: entra e recebe sessão");
const S = r.j.sessao;
ok(db.sessoes[0].aparelho === "Android · Chrome" && !db.sessoes[0].token_hash.includes(S), "guarda só o hash e o resumo do aparelho");
r = await chamar({ acao: "entrar", convite: "CONVITE_DA_MARIA_123456", nascimento: "1960-05-01", cpf4: "8909" });
ok(r.s === 404, "convite é de uso único");
for (let i = 0; i < 5; i++) r = await chamar({ acao: "entrar", convite: "CONVITE_DO_JOSE_9876543", nascimento: "1950-01-01", cpf4: "1111" });
ok(r.s === 423 && db.convites[1].bloqueado, "5 erros bloqueiam o convite");
r = await chamar({ acao: "entrar", convite: "CONVITE_DO_JOSE_9876543", nascimento: "1950-01-01", cpf4: "2100" });
ok(r.s === 404, "bloqueado não entra nem com dados certos");

// início
r = await chamar({ acao: "inicio", sessao: S });
ok(r.s === 200 && r.j.proximas.length === 1 && r.j.proximas[0].id === "g1" && r.j.anteriores.length === 1, "vê só as próprias consultas deste médico");
ok(r.j.documentos.length === 1 && r.j.documentos[0].id === "d1" && !("storage_path" in r.j.documentos[0]), "vê só os próprios documentos, sem caminho interno");
ok(r.j.acessos.some((a) => a.acao === "conectou um aparelho") && r.j.agendamento === true, "histórico de acessos e agendamento");
const nAbriu = () => db.log.filter((l) => l.acao === "abriu o portal").length;
await chamar({ acao: "inicio", sessao: S }); ok(nAbriu() === 1, "'abriu o portal' não repete dentro de 30 min");
AGORA += 31 * 60_000; await chamar({ acao: "inicio", sessao: S }); ok(nAbriu() === 2, "registra de novo depois de 30 min");

// consultas de outros
r = await chamar({ acao: "consulta", sessao: S, id: "g3", op: "cancelar" }); ok(r.s === 404 && db.agenda[2].status === "marcada", "não mexe em consulta de outro paciente");
r = await chamar({ acao: "consulta", sessao: S, id: "g4", op: "cancelar" }); ok(r.s === 404, "não mexe em consulta de outro médico");
r = await chamar({ acao: "consulta", sessao: S, id: "g2", op: "cancelar" }); ok(r.s === 409, "não mexe em consulta passada");
r = await chamar({ acao: "consulta", sessao: S, id: "g1", op: "confirmar" }); ok(r.s === 200 && db.agenda[0].status === "confirmada", "confirma a própria consulta");
r = await chamar({ acao: "preconsulta", sessao: S, id: "g1", aceite: true, respostas: { motivo: "Dor" } });
ok(r.s === 200 && db.agenda[0].preconsulta.motivo === "Dor" && r.j.consulta.preconsulta === true, "pré-consulta pelo portal");

// documentos
r = await chamar({ acao: "documento", sessao: S, id: "d2" }); ok(r.s === 404, "não baixa documento de outro paciente");
r = await chamar({ acao: "documento", sessao: S, id: "d1" }); ok(r.s === 200 && r.j.url.endsWith("dr1/p1/r.pdf") && db.docs[0].baixado_em, "baixa o próprio documento e marca como baixado");

// marcar
r = await chamar({ acao: "horarios", sessao: S }); const dias = Object.keys(r.j.dias || {});
ok(r.s === 200 && dias.includes("2026-12-01") && !r.j.dias["2026-11-30"]?.includes("09:00"), "horários livres sem o já ocupado");
r = await chamar({ acao: "marcar", sessao: S, data: "2026-11-30", hora: "09:00" }); ok(r.s === 409, "não marca horário ocupado");
r = await chamar({ acao: "marcar", sessao: S, data: "2026-12-01", hora: "08:00", motivo: "Retorno" });
const nova = db.agenda[db.agenda.length - 1];
ok(r.s === 200 && r.j.status === "solicitada" && nova.paciente_id === "p1" && nova.origem === "portal" && nova.telefone === "11988887777", "pede consulta já vinculada ao paciente");
r = await chamar({ acao: "marcar", sessao: S, data: "2026-12-01", hora: "08:30" }); ok(r.s === 429, "limite de 2 consultas futuras");

// log e sessão
const acoes = db.log.filter((l) => l.paciente_id === "p1").map((l) => l.acao);
ok(["confirmou a consulta", "respondeu a pré-consulta", "baixou um documento", "pediu uma consulta"].every((a) => acoes.includes(a)), "tudo registrado no histórico");
ok(!JSON.stringify(db.log).includes("Dor"), "o histórico não guarda conteúdo clínico");
r = await chamar({ acao: "sair", sessao: S }); r = await chamar({ acao: "inicio", sessao: S }); ok(r.s === 401, "depois de sair, a sessão não vale mais");
r = await chamar({ acao: "inicio", sessao: "x".repeat(40) }); ok(r.s === 401, "sessão inventada é recusada");
ok(resumoAparelho("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1") === "iPhone/iPad · Safari", "resumo do aparelho (iPhone)");
// ---------- entrada pela página aberta (código por e-mail) ----------
db.pacientes.p1.email = "maria.souza@exemplo.com"; db.codigos = []; const emails = [];
let emailResultado = "ok";
Object.assign(deps, {
  pacientesPorNascimento: async (n) => Object.values(db.pacientes).filter((p) => p.data_nascimento === n).map((p) => ({ ...p, owner: null })),
  ownerPadrao: async () => DR,
  contarCodigos: async (pid, desde) => db.codigos.filter((c) => c.paciente_id === pid && c.criado_em >= desde).length,
  salvarCodigo: async (r) => db.codigos.push({ id: "k" + ++seq, tentativas: 0, usado_em: null, ...r }),
  ultimoCodigo: async (pid) => [...db.codigos].reverse().find((c) => c.paciente_id === pid) || null,
  atualizarCodigo: async (id, p) => Object.assign(db.codigos.find((c) => c.id === id), p),
  enviarEmail: async (para, assunto, texto) => { if (emailResultado === "ok") emails.push({ para, assunto, texto }); return emailResultado; },
  slugAtivo: async () => "slugAtivo123" });
r = await chamar({ acao: "agenda_link" }); ok(r.j.slug === "slugAtivo123", "página de entrada recebe o link de agendamento");
r = await chamar({ acao: "codigo_pedir", cpf: "123.456.789-09", nascimento: "1960-05-02" }); ok(r.s === 404, "CPF certo com data errada: não acha");
r = await chamar({ acao: "codigo_pedir", cpf: "98765432100", nascimento: "1950-01-01" }); ok(r.s === 422 && r.j.erro === "sem_email", "sem e-mail no cadastro: avisa");
emailResultado = "nao_configurado"; r = await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" });
ok(r.s === 503 && r.j.erro === "email_nao_configurado", "Brevo não configurada: avisa"); emailResultado = "ok"; db.codigos = [];
r = await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" });
const cod = (emails.at(-1)?.texto.match(/\b(\d{6})\b/) || [])[1];
ok(r.s === 200 && r.j.email === "ma******@exemplo.com" && cod && emails.at(-1).para === "maria.souza@exemplo.com", "envia código de 6 dígitos e mostra o e-mail mascarado");
ok(!JSON.stringify(db.codigos).includes(cod), "o código não fica guardado em texto");
r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: cod === "000000" ? "111111" : "000000" });
ok(r.s === 401 && r.j.restantes === 4, "código errado: avisa tentativas restantes");
r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: cod });
ok(r.s === 200 && r.j.sessao && db.sessoes.at(-1).owner_id === DR, "código certo: entra (sessão do médico da clínica)");
const S2 = r.j.sessao; r = await chamar({ acao: "inicio", sessao: S2 }); ok(r.s === 200 && r.j.nome === "Maria", "a sessão aberta pelo código funciona");
r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: cod }); ok(r.s === 401 && r.j.erro === "codigo_expirado", "código só vale uma vez");
await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" }); await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" });
r = await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" }); ok(r.s === 429, "no máximo 3 códigos por hora");
for (let i = 0; i < 5; i++) r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: "999999" });
const codOk = (emails.at(-1).texto.match(/\b(\d{6})\b/) || [])[1];
r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: codOk }); ok(r.s === 401, "depois de 5 erros, nem o código certo entra");
AGORA += 11 * 60_000; db.codigos = []; await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" }); const c3 = (emails.at(-1).texto.match(/\b(\d{6})\b/) || [])[1];
AGORA += 11 * 60_000; r = await chamar({ acao: "codigo_entrar", cpf: "12345678909", nascimento: "1960-05-01", codigo: c3 }); ok(r.s === 401, "código vence em 10 minutos");
db.pacientes.p3 = { id: "p3", nome: "Duplicada", data_nascimento: "1960-05-01", cpf: "12345678909", email: "x@y.com" };
r = await chamar({ acao: "codigo_pedir", cpf: "12345678909", nascimento: "1960-05-01" }); ok(r.s === 409, "cadastro duplicado não entra (evita abrir o paciente errado)");
console.log(falhas ? falhas + " falha(s)" : "tudo certo"); process.exit(falhas ? 1 : 0);

// Testa a lógica da função agenda-publica (handler.ts) no Node, com banco falso.
// Uso: node testes/teste-funcao.mjs   (usa esbuild via npx para converter o TypeScript)
import { execSync } from "node:child_process"; import { writeFileSync, mkdtempSync } from "node:fs"; import { join, dirname } from "node:path";
import { tmpdir } from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { createHash } from "node:crypto";
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(mkdtempSync(join(tmpdir(), "fn-")), "handler.mjs");
execSync(`npx -y esbuild@0.24.0 "${join(raiz, "supabase/functions/agenda-publica/handler.ts")}" --format=esm --outfile="${out}" --log-level=warning`, { stdio: "inherit" });
const { handle, normalizarPreconsulta } = await import(pathToFileURL(out).href);
let falhas = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) falhas++; };
const AGORA = Date.parse("2026-11-27T15:00:00Z");   // 12:00 em São Paulo
const sha = (s) => createHash("sha256").update(s).digest("hex");
const TOK = "tokenDeTesteDoPaciente_123456";
const linhas = {
  a: { id: "a", profissional_id: "dr", nome: "Maria Souza", data: "2026-11-28", hora: "09:00", duracao_min: 30, status: "marcada", token_hash: sha(TOK), preconsulta_em: null },
  b: { id: "b", profissional_id: "dr", nome: "Velha", data: "2026-11-20", hora: "09:00", duracao_min: 30, status: "marcada", token_hash: sha("tokenConsultaQueJaPassou_99"), preconsulta_em: null },
};
const gravados = [];
const deps = { env: {}, agora: () => AGORA, aleatorio: (n) => new Uint8Array(n).fill(7),
  configPorSlug: async () => null, configPorOwner: async () => ({ slug: "slugteste", config: { ativo: true, nome_publico: "Dr. Teste" } }),
  ocupados: async () => [], contarPendentes: async () => 0, contarAtivosTelefone: async () => 0, inserir: async () => ({ ok: true }),
  porHash: async (h) => Object.values(linhas).find((l) => l.token_hash === h) || null,
  atualizar: async (id, patch) => { gravados.push({ id, patch }); Object.assign(linhas[id], patch); } };
const chamar = async (corpo) => { const r = await handle(new Request("https://x/", { method: "POST", body: JSON.stringify(corpo) }), deps); return { s: r.status, j: await r.json() }; };

let r = await chamar({ acao: "consulta", token: TOK });
ok(r.s === 200 && r.j.preconsulta === false, "consulta informa pré-consulta pendente");
r = await chamar({ acao: "preconsulta", token: TOK, respostas: { motivo: "Dor de cabeça" } });
ok(r.s === 400 && r.j.erro === "aceite_necessario", "exige autorização");
r = await chamar({ acao: "preconsulta", token: TOK, aceite: true, respostas: { desde: "2 dias" } });
ok(r.s === 400 && r.j.erro === "motivo_obrigatorio", "exige motivo");
r = await chamar({ acao: "preconsulta", token: TOK, aceite: true, respostas: { motivo: "  Dor   de cabeça ", remedios: "Losartana 50mg", phq2: [1, 2], gad2: [3, 9], hack: "x", outros: "a".repeat(2000) } });
ok(r.s === 200 && r.j.preconsulta === true && r.j.preconsulta_em, "salva a pré-consulta");
const pc = linhas.a.preconsulta;
ok(pc.motivo === "Dor de cabeça" && pc.remedios === "Losartana 50mg" && pc.phq2[1] === 2 && !pc.gad2 && !pc.hack && pc.outros.length === 600, "limpa campos (espaços, extras, escala inválida, tamanho)");
ok(!JSON.stringify(r.j).includes("Losartana"), "a resposta não devolve o conteúdo clínico");
r = await chamar({ acao: "consulta", token: TOK });
ok(r.j.preconsulta === true && !JSON.stringify(r.j).includes("Dor de cabeça"), "reabrir o link mostra só que foi respondida");
r = await chamar({ acao: "preconsulta", token: "tokenConsultaQueJaPassou_99", aceite: true, respostas: { motivo: "x" } });
ok(r.s === 409 && r.j.erro === "consulta_encerrada", "não aceita depois da consulta");
r = await chamar({ acao: "preconsulta", token: "tokenQueNaoExisteNoBanco_000", aceite: true, respostas: { motivo: "x" } });
ok(r.s === 404, "token inexistente");
ok(normalizarPreconsulta(null) === null && normalizarPreconsulta({ motivo: "ok\u0000" }).motivo === "ok", "normalizador seguro");
await chamar({ acao: "cancelar", token: TOK });
r = await chamar({ acao: "preconsulta", token: TOK, aceite: true, respostas: { motivo: "x" } });
ok(r.s === 409, "não aceita em consulta cancelada");
console.log(falhas ? falhas + " falha(s)" : "tudo certo"); process.exit(falhas ? 1 : 0);

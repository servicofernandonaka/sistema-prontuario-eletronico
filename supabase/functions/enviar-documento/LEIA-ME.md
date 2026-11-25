# Função `enviar-documento` — e-mail automático com a receita em PDF

O app gera o PDF no aparelho e chama esta função, que o entrega como **anexo** por um serviço de e-mail.
Sem a função publicada, o app continua funcionando (botões "Compartilhar", "WhatsApp" e "Abrir e-mail").

## 1. Serviço de e-mail (escolha um)
**Brevo** (mais simples para uso individual — não exige domínio próprio, só confirmar o e-mail remetente; plano grátis ~300/dia)
1. Crie conta em brevo.com → *Senders, Domains & Dedicated IPs* → **Add a sender** com o seu e-mail e confirme o link recebido.
2. *SMTP & API* → **API Keys** → gere uma chave (começa com `xkeysib-`).

**Resend** (exige verificar um domínio seu para enviar a terceiros; plano grátis 100/dia).

## 2. Tabela de registro (SQL Editor do Supabase)
Rode o conteúdo de `supabase/pep_envios_schema.sql`. Ela guarda só o e-mail **mascarado** e o tipo do documento, e serve de limite por hora.

## 3. Publicar a função
**Pelo painel (sem instalar nada):** *Edge Functions → Deploy a new function → Via Editor*, nome `enviar-documento`.
Crie dois arquivos e cole o conteúdo de `index.ts` e de `handler.ts` desta pasta. Deixe **Verify JWT ligado**.

**Pelo terminal (CLI):**
```bash
supabase login
supabase link --project-ref SEU_REF
supabase functions deploy enviar-documento
```

## 4. Segredos (*Edge Functions → Secrets*, ou `supabase secrets set`)
| Nome | Valor |
|---|---|
| `EMAIL_API_KEY` | a chave do serviço (nunca no código, nunca no `index.html`) |
| `EMAIL_FROM` | o e-mail remetente já verificado |
| `EMAIL_FROM_NAME` | ex.: `Dr. Fernando — UBS …` |
| `EMAIL_PROVIDER` | `brevo` (padrão) ou `resend` |
| `LIMITE_POR_HORA` | opcional, padrão 30 |
| `ALLOWED_ORIGIN` | opcional: o endereço do app (ex.: `https://seu-app.netlify.app`) |

## 5. Testar
No app: abra um atendimento → **Enviar receita…** → marque a autorização → digite seu próprio e-mail → **Enviar e-mail agora**.

## O que a função garante
Só aceita usuário logado; valida e-mail (um só destinatário), tamanho (até 5 MB) e que o arquivo é mesmo PDF; limita envios por hora;
não devolve ao navegador nada do serviço de e-mail (nem a chave); registra o envio sem o conteúdo.
Privacidade (LGPD): o PDF passa pelo serviço de e-mail escolhido — envie só com a autorização do paciente (o app exige a confirmação).

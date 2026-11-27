-- Portal do paciente: convites, aparelhos conectados (sessões), registro de acessos e documentos do paciente.
-- Rode DEPOIS do agenda_schema.sql, agenda_publica_schema.sql e preconsulta_schema.sql. Idempotente.
-- O paciente NÃO é usuário do Supabase Auth: ele entra pela função "portal-paciente", que só devolve os dados dele.

-- convite enviado pelo médico (link de uso único; só o hash do token fica no banco)
create table if not exists public.pep_portal_convites (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paciente_id  uuid not null references public.pep_pacientes(id) on delete cascade,
  token_hash   text not null unique,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null default now() + interval '7 days',
  usado_em     timestamptz,
  tentativas   int not null default 0,
  bloqueado    boolean not null default false
);
create index if not exists pep_portal_convites_pac on public.pep_portal_convites (paciente_id, criado_em desc);

-- aparelho conectado ao portal (sessão de até 90 dias, renovada a cada uso)
create table if not exists public.pep_portal_sessoes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  paciente_id  uuid not null references public.pep_pacientes(id) on delete cascade,
  token_hash   text not null unique,
  aparelho     text,
  criado_em    timestamptz not null default now(),
  ultimo_uso   timestamptz not null default now(),
  expira_em    timestamptz not null,
  revogada     boolean not null default false
);
create index if not exists pep_portal_sessoes_pac on public.pep_portal_sessoes (paciente_id);

-- registro do que o paciente fez no portal (só data, ação e um resumo; nunca conteúdo clínico)
create table if not exists public.pep_portal_log (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  paciente_id  uuid not null references public.pep_pacientes(id) on delete cascade,
  sessao_id    uuid references public.pep_portal_sessoes(id) on delete set null,
  acao         text not null,
  detalhe      text,
  em           timestamptz not null default now()
);
create index if not exists pep_portal_log_pac on public.pep_portal_log (paciente_id, em desc);

-- documentos guardados para o paciente (cópia do PDF enviado, num bucket privado)
create table if not exists public.pep_portal_docs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  paciente_id   uuid not null references public.pep_pacientes(id) on delete cascade,
  titulo        text not null,
  nome_arquivo  text not null,
  storage_path  text not null unique,
  criado_em     timestamptz not null default now(),
  baixado_em    timestamptz
);
create index if not exists pep_portal_docs_pac on public.pep_portal_docs (paciente_id, criado_em desc);

-- Segurança: o médico vê e gerencia só o que é dele. O paciente nunca acessa estas tabelas diretamente.
alter table public.pep_portal_convites enable row level security;
alter table public.pep_portal_sessoes  enable row level security;
alter table public.pep_portal_log      enable row level security;
alter table public.pep_portal_docs     enable row level security;
drop policy if exists "portal_convites_dono" on public.pep_portal_convites;
create policy "portal_convites_dono" on public.pep_portal_convites for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "portal_sessoes_ler" on public.pep_portal_sessoes;
create policy "portal_sessoes_ler" on public.pep_portal_sessoes for select to authenticated using (owner_id = auth.uid());
drop policy if exists "portal_sessoes_revogar" on public.pep_portal_sessoes;
create policy "portal_sessoes_revogar" on public.pep_portal_sessoes for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "portal_log_ler" on public.pep_portal_log;
create policy "portal_log_ler" on public.pep_portal_log for select to authenticated using (owner_id = auth.uid());
drop policy if exists "portal_docs_dono" on public.pep_portal_docs;
create policy "portal_docs_dono" on public.pep_portal_docs for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- consultas marcadas pelo portal: impede dois pedidos no mesmo horário
create unique index if not exists pep_agenda_portal_unico on public.pep_agenda (profissional_id, data, hora)
  where origem = 'portal' and status in ('solicitada','marcada','confirmada');

-- bucket privado dos documentos do portal: o médico só GRAVA na própria pasta (<id do médico>/...); quem lê é a função
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-documentos', 'portal-documentos', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
drop policy if exists "portal_docs_upload" on storage.objects;
create policy "portal_docs_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-documentos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "portal_docs_apagar" on storage.objects;
create policy "portal_docs_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'portal-documentos' and (storage.foldername(name))[1] = auth.uid()::text);

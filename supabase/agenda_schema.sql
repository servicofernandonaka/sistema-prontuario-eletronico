-- Agenda de consultas (tela "Agenda de consultas", painel inicial e webhook do Cal.com).
-- Compatível com o desenho original (HANDOFF): data/hora separados, hora como texto,
-- origem/origem_id para deduplicar agendamentos vindos do Cal.com.
-- ANTES de rodar, confira se a tabela já existe (consulta no final deste arquivo).
-- Idempotente: pode rodar mais de uma vez.
create table if not exists public.pep_agenda (
  id          uuid primary key default gen_random_uuid(),
  paciente_id uuid references public.pep_pacientes(id) on delete set null,   -- nulo = consulta avulsa
  nome        text,
  telefone    text,
  data        date not null,
  hora        text,
  duracao_min integer not null default 30,
  tipo        text,
  status      text not null default 'marcada',
  observacao  text,
  origem      text not null default 'manual',
  origem_id   text
);
-- colunas que podem faltar numa tabela criada antes
alter table public.pep_agenda add column if not exists profissional_id uuid default auth.uid() references auth.users(id) on delete set null;
alter table public.pep_agenda add column if not exists criado_em  timestamptz not null default now();
alter table public.pep_agenda add column if not exists created_at timestamptz not null default now();
alter table public.pep_agenda add column if not exists origem_id text;
alter table public.pep_agenda add column if not exists observacao text;

create index if not exists pep_agenda_data_hora on public.pep_agenda (data, hora);
create unique index if not exists pep_agenda_origem_unica on public.pep_agenda (origem, origem_id) where origem_id is not null;

-- Segurança: cada profissional vê e altera as próprias consultas. As que chegam do Cal.com
-- entram sem dono (a função grava com a chave de serviço) e aparecem para todos os profissionais da clínica.
alter table public.pep_agenda enable row level security;
drop policy if exists "pep_agenda_acesso" on public.pep_agenda;
create policy "pep_agenda_acesso" on public.pep_agenda
  for all to authenticated
  using (profissional_id = auth.uid() or profissional_id is null)
  with check (profissional_id = auth.uid() or profissional_id is null);

-- ---- CONSULTA PARA RODAR ANTES (só leitura): mostra se a tabela existe e como ela é ----
-- select to_regclass('public.pep_agenda') as tabela,
--        (select data_type from information_schema.columns where table_name='pep_pacientes' and column_name='id') as tipo_id_paciente;
-- select column_name, data_type, is_nullable from information_schema.columns where table_name='pep_agenda' order by ordinal_position;
-- select policyname, cmd, qual from pg_policies where tablename='pep_agenda';

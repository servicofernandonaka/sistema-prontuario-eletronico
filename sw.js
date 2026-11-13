-- =============================================================================
-- PEP Clínico — retorno previsto e encaminhamentos (referência / contrarreferência)
-- Supabase / PostgreSQL · idempotente · não apaga nada
-- =============================================================================
-- • pep_atendimentos.retorno_previsto / retorno_motivo: a data de retorno marcada
--   ao finalizar a consulta. A agenda de retornos e a busca ativa usam isso.
-- • pep_encaminhamentos: um registro por especialidade encaminhada, com o
--   acompanhamento (aguardando → agendado → realizado) e a contrarreferência.
-- A revisão de medicação e a folha de rosto não precisam de tabela.
-- Depende de setup_supabase_completo.sql.
-- =============================================================================

alter table public.pep_atendimentos add column if not exists retorno_previsto date;
alter table public.pep_atendimentos add column if not exists retorno_motivo   text;
create index if not exists idx_pep_atend_retorno on public.pep_atendimentos (retorno_previsto) where retorno_previsto is not null;

create table if not exists public.pep_encaminhamentos (
  id                 uuid primary key default gen_random_uuid(),
  atendimento_id     uuid not null references public.pep_atendimentos(id) on delete cascade,
  paciente_id        uuid not null references public.pep_pacientes(id) on delete cascade,
  especialidade      text not null,
  prioridade         text not null default 'eletiva' check (prioridade in ('eletiva','prioritaria','urgente')),
  cid10              text,
  motivo             text,
  historia           text,
  exames             text,
  tratamento         text,
  pergunta           text,          -- o que se espera do especialista
  status             text not null default 'aguardando'
                       check (status in ('aguardando','agendado','realizado','cancelado')),
  data_agendada      date,
  contrarreferencia  text,
  data_contrarref    date,
  criado_em          timestamptz not null default now()
);
create index if not exists idx_pep_enc_paciente on public.pep_encaminhamentos (paciente_id);
create index if not exists idx_pep_enc_atend    on public.pep_encaminhamentos (atendimento_id);

alter table public.pep_encaminhamentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='pep_encaminhamentos' and policyname='pep_encaminhamentos_dono') then
    create policy pep_encaminhamentos_dono on public.pep_encaminhamentos for all to authenticated
      using (exists (select 1 from public.pep_atendimentos a where a.id=atendimento_id and a.profissional_id=auth.uid()))
      with check (exists (select 1 from public.pep_atendimentos a where a.id=atendimento_id and a.profissional_id=auth.uid()));
  end if;
end $$;

notify pgrst, 'reload schema';

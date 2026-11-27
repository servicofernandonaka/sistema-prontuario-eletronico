-- Portal do paciente: entrada pela página aberta com CPF + data de nascimento + código enviado por e-mail.
-- Rode DEPOIS do portal_schema.sql. Idempotente.
-- Só o HASH do código fica no banco. Quem lê e grava é a função "portal-paciente" (chave de serviço).
create table if not exists public.pep_portal_codigos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  paciente_id  uuid not null references public.pep_pacientes(id) on delete cascade,
  codigo_hash  text not null,
  criado_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  tentativas   int not null default 0,
  usado_em     timestamptz
);
create index if not exists pep_portal_codigos_pac on public.pep_portal_codigos (paciente_id, criado_em desc);
alter table public.pep_portal_codigos enable row level security;
-- sem política: o navegador (médico ou paciente) não lê nem grava esta tabela; só a função.

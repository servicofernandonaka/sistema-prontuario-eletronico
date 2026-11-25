-- Registro dos e-mails enviados pela função "enviar-documento" (também serve de limite por hora).
-- Guarda só o endereço MASCARADO (j***@gmail.com) e o tipo do documento — nunca o conteúdo.
create table if not exists public.pep_envios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  para       text,
  tipo       text,
  criado_em  timestamptz not null default now()
);
create index if not exists pep_envios_user_hora on public.pep_envios (user_id, criado_em desc);

alter table public.pep_envios enable row level security;
-- o usuário só LÊ os próprios envios; quem grava é a função (chave de serviço, que ignora o RLS)
drop policy if exists "pep_envios_leitura" on public.pep_envios;
create policy "pep_envios_leitura" on public.pep_envios for select to authenticated using (user_id = auth.uid());

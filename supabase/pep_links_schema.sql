-- Links seguros para o paciente baixar um documento (receita, relatório…).
-- O arquivo fica num bucket PRIVADO; no banco fica só o HASH do token e o HMAC da resposta de confirmação.
create table if not exists public.pep_links (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  token_hash      text not null unique,
  storage_path    text not null,
  nome_arquivo    text not null,
  titulo          text,
  tipo_verificacao text not null check (tipo_verificacao in ('cpf4','nasc')),
  segredo_hash    text not null,
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null,
  max_downloads   int not null default 5,
  downloads       int not null default 0,
  tentativas      int not null default 0,
  bloqueado_ate   timestamptz,
  revogado        boolean not null default false,
  ultimo_acesso   timestamptz
);
create index if not exists pep_links_owner on public.pep_links (owner_id, criado_em desc);

alter table public.pep_links enable row level security;
-- o médico só LÊ os próprios links (para ver se já baixaram); quem grava/atualiza é a função (chave de serviço)
drop policy if exists "pep_links_leitura" on public.pep_links;
create policy "pep_links_leitura" on public.pep_links for select to authenticated using (owner_id = auth.uid());

-- bucket privado (sem política: só a função, com a chave de serviço, lê e grava)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-links', 'documentos-links', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

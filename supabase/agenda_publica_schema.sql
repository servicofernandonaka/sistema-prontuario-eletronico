-- Agendamento online + confirmação pelo paciente. Rode DEPOIS do agenda_schema.sql.
-- Idempotente: pode rodar mais de uma vez.

-- novas colunas na agenda
alter table public.pep_agenda add column if not exists token_hash   text;          -- hash do token do link do paciente (o token em si nunca é guardado)
alter table public.pep_agenda add column if not exists lembrado_em  timestamptz;   -- quando o lembrete foi enviado
alter table public.pep_agenda add column if not exists confirmado_em timestamptz;  -- quando o paciente confirmou pelo link
create index if not exists pep_agenda_token on public.pep_agenda (token_hash) where token_hash is not null;

-- novo status: "solicitada" (pedido feito pelo paciente, aguardando a sua aprovação)
alter table public.pep_agenda drop constraint if exists pep_agenda_status_check;
alter table public.pep_agenda add constraint pep_agenda_status_check
  check (status in ('solicitada','marcada','confirmada','atendida','faltou','cancelada'));

-- impede dois pedidos online para o mesmo horário
create unique index if not exists pep_agenda_publico_unico on public.pep_agenda (profissional_id, data, hora)
  where origem = 'publico' and status in ('solicitada','marcada','confirmada');

-- configuração do agendamento online de cada profissional
create table if not exists public.pep_agenda_config (
  owner_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  slug          text not null unique,                      -- parte do endereço público (agendar.html?m=SLUG)
  config        jsonb not null default '{}'::jsonb,        -- dias/horários, duração, modo, bloqueios...
  atualizado_em timestamptz not null default now()
);
alter table public.pep_agenda_config enable row level security;
drop policy if exists "pep_agenda_config_dono" on public.pep_agenda_config;
create policy "pep_agenda_config_dono" on public.pep_agenda_config
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

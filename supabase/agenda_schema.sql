-- Agenda de consultas (tela "Agenda de consultas" e painel inicial).
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar mais de uma vez.
-- Cada profissional só enxerga e altera a própria agenda (Row Level Security).
create table if not exists public.pep_agenda (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data            date not null,
  hora            time,
  duracao_min     integer not null default 30,
  paciente_id     text,          -- id do paciente cadastrado (vazio quando "avulso")
  nome            text,          -- nome do paciente avulso
  telefone        text,
  tipo            text,
  observacao      text,
  origem          text not null default 'manual',
  status          text not null default 'marcada'
                  check (status in ('marcada','confirmada','atendida','faltou','cancelada')),
  criado_em       timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists pep_agenda_prof_data on public.pep_agenda (profissional_id, data, hora);

alter table public.pep_agenda enable row level security;
drop policy if exists "pep_agenda_dono" on public.pep_agenda;
create policy "pep_agenda_dono" on public.pep_agenda
  for all to authenticated
  using (profissional_id = auth.uid())
  with check (profissional_id = auth.uid());

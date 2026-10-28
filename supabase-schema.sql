-- Rode no Supabase: SQL Editor → New query → Run.
-- Cada usuário só enxerga e altera os próprios dados (Row Level Security).

create table if not exists public.pacientes (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,
  nome       text,
  dados      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.pacientes enable row level security;

drop policy if exists "pacientes_dono" on public.pacientes;
create policy "pacientes_dono" on public.pacientes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Bucket privado para PDFs/imagens de exames (arquivos em <user_id>/<id_do_arquivo>)
insert into storage.buckets (id, name, public) values ('exames', 'exames', false)
on conflict (id) do nothing;

drop policy if exists "exames_select" on storage.objects;
drop policy if exists "exames_insert" on storage.objects;
drop policy if exists "exames_update" on storage.objects;
drop policy if exists "exames_delete" on storage.objects;

create policy "exames_select" on storage.objects for select to authenticated
  using (bucket_id = 'exames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exames_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'exames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exames_update" on storage.objects for update to authenticated
  using (bucket_id = 'exames' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exames_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exames' and (storage.foldername(name))[1] = auth.uid()::text);

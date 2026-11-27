-- Pré-consulta digital: o paciente responde pelo link pessoal da consulta (consulta.html).
-- Rode DEPOIS do agenda_publica_schema.sql. Idempotente: pode rodar mais de uma vez.
alter table public.pep_agenda add column if not exists preconsulta    jsonb;        -- respostas do paciente
alter table public.pep_agenda add column if not exists preconsulta_em timestamptz;  -- quando respondeu (ou atualizou)

-- conferência (só leitura):
-- select column_name, data_type from information_schema.columns where table_name='pep_agenda' and column_name like 'preconsulta%';

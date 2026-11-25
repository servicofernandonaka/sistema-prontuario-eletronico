-- Opcional: guarda o e-mail do paciente no cadastro (usado em "Enviar ao paciente").
-- Sem esta coluna o app funciona igual: o e-mail é digitado na hora do envio.
alter table public.pep_pacientes add column if not exists email text;

alter table public.ordens_servico
  add column if not exists entrada text;

comment on column public.ordens_servico.entrada is
  'Valor da coluna ENTRADA da planilha de origem da OS, preservado para exibição como abertura da OS.';

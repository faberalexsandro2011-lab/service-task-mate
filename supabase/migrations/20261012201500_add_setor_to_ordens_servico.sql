alter table public.ordens_servico add column if not exists setor text;

comment on column public.ordens_servico.setor is 'Setor de origem/atendimento importado da planilha para análise técnica por setor';

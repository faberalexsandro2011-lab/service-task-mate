alter table public.eventos_provisionamento drop constraint if exists eventos_provisionamento_status_check;

alter table public.eventos_provisionamento
  add constraint eventos_provisionamento_status_check
  check (status = any (array[
    'iniciado'::text,
    'aprovado'::text,
    'rejeitado'::text,
    'concluido'::text,
    'falhou'::text,
    'repetido'::text
  ]));

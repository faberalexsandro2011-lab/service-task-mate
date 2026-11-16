-- O histórico é permanente e os cadastros não são apagados pela interface.
revoke delete on table public.frotas, public.componentes_frota, public.instalacoes_frota
from public, anon, authenticated;

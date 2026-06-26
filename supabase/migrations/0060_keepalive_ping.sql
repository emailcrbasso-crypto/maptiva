-- =====================================================================
-- 0060_keepalive_ping.sql
--
-- Keep-alive para o plano free do Supabase (pausa após 7 dias ociosos).
-- RPC público leve, chamável por anon, que gera atividade real no
-- Postgres a cada chamada. Um agendador externo (GitHub Actions / cron)
-- chama este endpoint a cada poucos dias para zerar o relógio de pausa.
--
-- Não expõe dados: retorna apenas {ok, at}.
-- =====================================================================

create or replace function public.ping()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  -- Leitura trivial só para registrar atividade no banco (não retornada).
  select count(*) into v_count from public.tenants;
  return jsonb_build_object('ok', true, 'at', now());
end$$;

grant execute on function public.ping() to anon, authenticated;

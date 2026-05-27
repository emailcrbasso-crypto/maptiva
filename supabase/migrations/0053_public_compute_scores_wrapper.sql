-- =====================================================================
-- 0053_public_compute_scores_wrapper.sql
--
-- Expõe app.compute_scores como public.compute_scores para que o
-- cliente Supabase JS consiga chamá-la via supabase.rpc().
--
-- A função real continua em app.compute_scores (security definer).
-- Este wrapper apenas delega, mantendo a mesma verificação de
-- admin/owner que já existe internamente.
-- =====================================================================

create or replace function public.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return app.compute_scores(p_cycle_id);
end$$;

grant execute on function public.compute_scores(uuid) to authenticated;

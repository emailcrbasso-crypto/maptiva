-- =====================================================================
-- 0024_public_wrapper_generate_magic_link.sql
--
-- Wrapper público para app.generate_magic_link.
-- Padrão idêntico ao 0021_public_rpc_wrappers.sql.
-- =====================================================================

create or replace function public.generate_magic_link(
  p_assignment_id uuid,
  p_expires_days  int default 30
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.generate_magic_link(p_assignment_id, p_expires_days)
$$;

grant execute on function public.generate_magic_link(uuid, int) to authenticated;

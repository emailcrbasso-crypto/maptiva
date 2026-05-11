-- =====================================================================
-- 0021_public_rpc_wrappers.sql
--
-- Wrappers públicos para RPCs do schema app.
-- PostgREST expõe apenas o schema public por padrão; estas funções
-- fazem a ponte entre o cliente e a lógica real em app.*.
--
-- Convenção: mesmos nomes, mesmos parâmetros, mesmos tipos de retorno.
-- =====================================================================

-- ── get_assignment_context ───────────────────────────────────────────
create or replace function public.get_assignment_context(p_token text)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.get_assignment_context(p_token)
$$;

grant execute on function public.get_assignment_context(text) to anon, authenticated;

-- ── submit_response ──────────────────────────────────────────────────
create or replace function public.submit_response(
  p_token      text,
  p_answers    jsonb,
  p_comments   jsonb default '[]'::jsonb
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.submit_response(p_token, p_answers, p_comments)
$$;

grant execute on function public.submit_response(text, jsonb, jsonb) to anon, authenticated;

-- ── close_cycle ───────────────────────────────────────────────────────
create or replace function public.close_cycle(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.close_cycle(p_cycle_id)
$$;

grant execute on function public.close_cycle(uuid) to authenticated;

-- ── release_reports ───────────────────────────────────────────────────
create or replace function public.release_reports(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.release_reports(p_cycle_id)
$$;

grant execute on function public.release_reports(uuid) to authenticated;

-- ── get_my_report ─────────────────────────────────────────────────────
create or replace function public.get_my_report(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.get_my_report(p_cycle_id)
$$;

grant execute on function public.get_my_report(uuid) to authenticated;

-- ── get_cycle_summary ─────────────────────────────────────────────────
create or replace function public.get_cycle_summary(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.get_cycle_summary(p_cycle_id)
$$;

grant execute on function public.get_cycle_summary(uuid) to authenticated;

-- ── export_cycle_json ─────────────────────────────────────────────────
create or replace function public.export_cycle_json(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.export_cycle_json(p_cycle_id)
$$;

grant execute on function public.export_cycle_json(uuid) to authenticated;

-- ── change_member_role ────────────────────────────────────────────────
create or replace function public.change_member_role(
  p_user_id  uuid,
  p_new_role text
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.change_member_role(p_user_id, p_new_role)
$$;

grant execute on function public.change_member_role(uuid, text) to authenticated;

-- ── revoke_assignment ─────────────────────────────────────────────────
create or replace function public.revoke_assignment(p_assignment_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.revoke_assignment(p_assignment_id)
$$;

grant execute on function public.revoke_assignment(uuid) to authenticated;

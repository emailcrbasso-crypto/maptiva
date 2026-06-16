-- =====================================================================
-- 0059_audit_analytics_ops.sql
--
-- Rastreabilidade de operações analíticas e de talent review.
-- Conformidade com scoring-analytics.md (auditoria de reprocessamento)
-- e integrations/maptiva-grid.md (rastreabilidade).
--
-- Estratégia: helper app.log_audit() + auditoria nos WRAPPERS públicos
-- (caminho chamado pelo frontend), sem tocar nas funções app.* já
-- implantadas. A auditoria nunca quebra a operação principal.
--
-- Eventos registrados:
--   cycles            → scores_recomputed
--   cycle_evaluator_* → weights_set
--   cycle_nine_box    → nine_box_config_set, nine_box_recomputed
--   participant_nine_box → nine_box_calibrated, nine_box_manual_set
-- =====================================================================

-- ── Helper: grava uma linha de auditoria resolvendo o autor ───────────
create or replace function app.log_audit(
  p_tenant_id uuid,
  p_entity    text,
  p_entity_id uuid,
  p_action    text,
  p_payload   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  select u.id into v_actor
  from public.users u
  where u.auth_user_id = auth.uid();

  insert into public.audit_log
    (tenant_id, actor_user_id, entity, entity_id, action, payload_json)
  values
    (p_tenant_id, v_actor, p_entity, p_entity_id, p_action, coalesce(p_payload, '{}'::jsonb));
exception when others then
  -- Auditoria é best-effort: nunca deve interromper a operação principal.
  null;
end$$;

grant execute on function app.log_audit(uuid, text, uuid, text, jsonb) to authenticated;

-- ── Recalcular scores (botão "Recalcular scores") ─────────────────────
create or replace function public.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_tenant uuid;
begin
  v_result := app.compute_scores(p_cycle_id);
  select tenant_id into v_tenant from public.cycles where id = p_cycle_id;
  perform app.log_audit(v_tenant, 'cycles', p_cycle_id, 'scores_recomputed', v_result);
  return v_result;
end$$;

grant execute on function public.compute_scores(uuid) to authenticated;

-- ── Pesos de avaliação (recria a função real de 0054 + auditoria) ─────
create or replace function public.set_cycle_weights(
  p_cycle_id             uuid,
  p_evaluator_weights    jsonb default '[]',
  p_competency_weights   jsonb default '[]'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  delete from public.cycle_evaluator_weights where cycle_id = p_cycle_id;

  if jsonb_array_length(p_evaluator_weights) > 0 then
    insert into public.cycle_evaluator_weights (tenant_id, cycle_id, relationship_code, weight)
    select
      v_tenant_id, p_cycle_id,
      (elem->>'relationship_code'),
      (elem->>'weight')::numeric
    from jsonb_array_elements(p_evaluator_weights) as elem
    where (elem->>'weight')::numeric >= 0;
  end if;

  delete from public.cycle_competency_weights where cycle_id = p_cycle_id;

  if jsonb_array_length(p_competency_weights) > 0 then
    insert into public.cycle_competency_weights (tenant_id, cycle_id, competency_id, weight)
    select
      v_tenant_id, p_cycle_id,
      (elem->>'competency_id')::uuid,
      (elem->>'weight')::numeric
    from jsonb_array_elements(p_competency_weights) as elem
    where (elem->>'weight')::numeric > 0;
  end if;

  perform app.log_audit(
    v_tenant_id, 'cycle_evaluator_weights', p_cycle_id, 'weights_set',
    jsonb_build_object(
      'evaluator_weights',  p_evaluator_weights,
      'competency_weights', p_competency_weights
    )
  );
end$$;

grant execute on function public.set_cycle_weights(uuid, jsonb, jsonb) to authenticated;

-- ── Nine Box: config ──────────────────────────────────────────────────
create or replace function public.set_nine_box_config(p_cycle_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_tenant uuid;
begin
  v_result := app.set_nine_box_config(p_cycle_id, p_config);
  select tenant_id into v_tenant from public.cycles where id = p_cycle_id;
  perform app.log_audit(v_tenant, 'cycle_nine_box', p_cycle_id, 'nine_box_config_set', p_config);
  return v_result;
end$$;

grant execute on function public.set_nine_box_config(uuid, jsonb) to authenticated;

-- ── Nine Box: recalcular posições ─────────────────────────────────────
create or replace function public.compute_nine_box(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_tenant uuid;
begin
  v_result := app.compute_nine_box(p_cycle_id);
  select tenant_id into v_tenant from public.cycles where id = p_cycle_id;
  perform app.log_audit(v_tenant, 'cycle_nine_box', p_cycle_id, 'nine_box_recomputed', v_result);
  return v_result;
end$$;

grant execute on function public.compute_nine_box(uuid) to authenticated;

-- ── Nine Box: calibração (decisão de talent review) ───────────────────
create or replace function public.calibrate_participant(
  p_cycle_id uuid, p_cp_id uuid, p_perf_band int, p_pot_band int, p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  perform app.calibrate_participant(p_cycle_id, p_cp_id, p_perf_band, p_pot_band, p_notes);
  select tenant_id into v_tenant from public.cycles where id = p_cycle_id;
  perform app.log_audit(
    v_tenant, 'participant_nine_box', p_cp_id, 'nine_box_calibrated',
    jsonb_build_object(
      'cycle_id',  p_cycle_id,
      'perf_band', p_perf_band,
      'pot_band',  p_pot_band,
      'notes',     p_notes
    )
  );
end$$;

grant execute on function public.calibrate_participant(uuid, uuid, int, int, text) to authenticated;

-- ── Nine Box: valores manuais ─────────────────────────────────────────
create or replace function public.set_participant_nine_box_manual(
  p_cycle_id uuid, p_cp_id uuid, p_perf_manual numeric, p_pot_manual numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
begin
  perform app.set_participant_nine_box_manual(p_cycle_id, p_cp_id, p_perf_manual, p_pot_manual);
  select tenant_id into v_tenant from public.cycles where id = p_cycle_id;
  perform app.log_audit(
    v_tenant, 'participant_nine_box', p_cp_id, 'nine_box_manual_set',
    jsonb_build_object(
      'cycle_id',    p_cycle_id,
      'perf_manual', p_perf_manual,
      'pot_manual',  p_pot_manual
    )
  );
end$$;

grant execute on function public.set_participant_nine_box_manual(uuid, uuid, numeric, numeric) to authenticated;

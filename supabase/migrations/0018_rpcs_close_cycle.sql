-- =====================================================================
-- 0018_rpcs_close_cycle.sql
-- RPCs de fechamento e cálculo analítico do ciclo.
--
-- app.compute_scores(cycle_id):
--   - Idempotente: limpa snapshots/profiles do ciclo e recomputa.
--   - Aplica n_minimum_default por grupo de relação (peer/subordinate/etc).
--   - self e manager são sempre 'visible' (são identificáveis por design).
--   - Calcula blind_spot_count e hidden_strength_count com threshold = 1.0.
--
-- app.close_cycle(cycle_id):
--   - Verifica owner/admin (ou role privilegiada).
--   - Muda status para 'closed', chama compute_scores, registra audit_log.
--   - Errcodes: P0010 cycle_not_found, P0011 not_authorized,
--     P0012 already_closed.
-- =====================================================================

-- ---------- compute_scores ----------
create or replace function app.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_template_id uuid;
  v_n_min int;
  v_blind_threshold numeric := 1.0;
  v_snapshot_count int := 0;
  v_profile_count  int := 0;
begin
  -- Carrega ciclo.
  select c.tenant_id, c.template_id, t.n_minimum_default
    into v_tenant_id, v_template_id, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Autorização: admin/owner do tenant OU role privilegiada (service_role).
  -- auth.role() lê o JWT claim 'role' — retorna 'authenticated' para
  -- usuários normais e 'service_role' para chamadas privilegiadas.
  -- session_user só é confiável quando auth.role() é nulo (conexão direta
  -- como postgres/superuser sem JWT, ex.: cron jobs internos).
  if not (
       app.is_admin_or_owner()
       or auth.role() = 'service_role'
       or (auth.role() is null and session_user in ('service_role','postgres'))
     ) or (
       app.current_tenant_id() is not null
       and v_tenant_id <> app.current_tenant_id()
     )
  then
    raise exception 'cycle_not_authorized' using errcode = 'P0011';
  end if;

  -- Idempotência: zerar dados derivados deste ciclo.
  delete from public.score_snapshots
   where cycle_id = p_cycle_id;
  delete from public.participant_result_profiles
   where cycle_id = p_cycle_id;

  -- ---------- Snapshots ----------
  -- Agrupa responses por (avaliado, competência, relationship_code).
  -- Apenas assignments completados; apenas score não-nulo.
  insert into public.score_snapshots (
    tenant_id, cycle_id, cycle_participant_id, competency_id,
    dimension_code, relationship_code, relationship_group,
    score_avg, response_count, visibility_status, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code,
    a.relationship_code as relationship_group,
    round(avg(r.score)::numeric, 4),
    count(*)::int,
    case
      when a.relationship_code in ('self','manager') then 'visible'
      when count(*) >= v_n_min then 'visible'
      else 'hidden'
    end,
    now()
  from public.responses r
  join public.assignments a   on a.id = r.assignment_id
  join public.questions q     on q.id = r.question_id
  join public.competencies co on co.id = q.competency_id
  where a.cycle_id = p_cycle_id
    and a.status = 'completed'
    and r.score is not null
  group by a.evaluated_cycle_participant_id, q.competency_id,
           co.dimension_code, a.relationship_code;

  get diagnostics v_snapshot_count = row_count;

  -- ---------- Profiles (shell + médias por relação) ----------
  insert into public.participant_result_profiles (
    tenant_id, cycle_id, cycle_participant_id,
    overall_score, self_score, manager_score, peer_score, subordinate_score,
    blind_spot_count, hidden_strength_count, report_json, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    cp.id,
    -- overall: média de todos os snapshots visíveis (inclui self).
    round(avg(case when ss.visibility_status = 'visible'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'self'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'manager'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'peer'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'subordinate'
                   then ss.score_avg end)::numeric, 4),
    0, 0,
    jsonb_build_object('computed_at', now()::text),
    now()
  from public.cycle_participants cp
  left join public.score_snapshots ss
    on ss.cycle_participant_id = cp.id
   and ss.cycle_id = p_cycle_id
  where cp.cycle_id = p_cycle_id
    and exists (
      -- só gera profile para quem foi avaliado de fato.
      select 1 from public.assignments a
      where a.cycle_id = p_cycle_id
        and a.evaluated_cycle_participant_id = cp.id
        and a.status = 'completed'
    )
  group by cp.id;

  get diagnostics v_profile_count = row_count;

  -- ---------- Blind spot / hidden strength ----------
  -- Por (avaliado, competência): gap entre self e média dos visíveis não-self.
  -- blind_spot_count   = nº de competências com self - others >= threshold
  -- hidden_strength    = nº de competências com others - self >= threshold
  with self_by_comp as (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id = p_cycle_id
      and relationship_code = 'self'
      and visibility_status = 'visible'
  ),
  others_by_comp as (
    select cycle_participant_id, competency_id,
           avg(score_avg)::numeric as others_avg
    from public.score_snapshots
    where cycle_id = p_cycle_id
      and relationship_code <> 'self'
      and visibility_status = 'visible'
    group by cycle_participant_id, competency_id
  ),
  gaps as (
    select s.cycle_participant_id,
           count(*) filter (
             where s.self_score - o.others_avg >= v_blind_threshold
           ) as blind_count,
           count(*) filter (
             where o.others_avg - s.self_score >= v_blind_threshold
           ) as hidden_count
    from self_by_comp s
    join others_by_comp o
      on o.cycle_participant_id = s.cycle_participant_id
     and o.competency_id        = s.competency_id
    group by s.cycle_participant_id
  )
  update public.participant_result_profiles prp
     set blind_spot_count       = coalesce(g.blind_count,  0),
         hidden_strength_count  = coalesce(g.hidden_count, 0)
    from gaps g
   where prp.cycle_id              = p_cycle_id
     and prp.cycle_participant_id  = g.cycle_participant_id;

  return jsonb_build_object(
    'cycle_id',        p_cycle_id,
    'snapshot_count',  v_snapshot_count,
    'profile_count',   v_profile_count,
    'n_minimum_used',  v_n_min,
    'computed_at',     now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

-- ---------- close_cycle ----------
create or replace function app.close_cycle(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status text;
  v_result jsonb;
begin
  -- Existência.
  select c.tenant_id, c.status
    into v_tenant_id, v_status
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Autorização (mesma regra de compute_scores, mas só para entry point).
  if not (
       app.is_admin_or_owner()
       or auth.role() = 'service_role'
       or (auth.role() is null and session_user in ('service_role','postgres'))
     ) or (
       app.current_tenant_id() is not null
       and v_tenant_id <> app.current_tenant_id()
     )
  then
    raise exception 'cycle_not_authorized' using errcode = 'P0011';
  end if;

  -- Estado.
  if v_status = 'closed' then
    raise exception 'cycle_already_closed' using errcode = 'P0012';
  end if;
  if v_status = 'archived' then
    raise exception 'cycle_archived' using errcode = 'P0013';
  end if;

  -- Move para closed.
  update public.cycles
     set status = 'closed'
   where id = p_cycle_id;

  -- Recalcula analytics.
  v_result := app.compute_scores(p_cycle_id);

  -- Audit (uma linha por close).
  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'cycles', p_cycle_id, 'cycle_closed',
    v_result
  );

  return v_result || jsonb_build_object('status', 'closed');
end$$;

grant execute on function app.close_cycle(uuid) to authenticated;

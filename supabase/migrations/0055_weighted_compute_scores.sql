-- =====================================================================
-- 0055_weighted_compute_scores.sql
--
-- app.compute_scores v5 — suporte a pesos por avaliador e competência.
--
-- Lógica:
--   Se cycle_evaluator_weights NÃO existe para o ciclo:
--     overall_score = avg simples de todos os visible snapshots (comportamento atual)
--
--   Se cycle_evaluator_weights EXISTS:
--     Para cada (participant, competency):
--       comp_score = Σ(w_rel × score_rel) / Σ(w_rel com dados)
--       INNER JOIN: só rels com peso > 0 entram
--     Para o overall:
--       overall = Σ(w_comp × comp_score) / Σ(w_comp com dados)
--       LEFT JOIN: competências sem peso recebem 1.0
--
--   self_score, manager_score, peer_score, subordinate_score:
--     sempre avg simples por grupo — são métricas descritivas, sem ponderação.
-- =====================================================================

create or replace function app.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id       uuid;
  v_template_id     uuid;
  v_n_min           int;
  v_blind_threshold numeric := 1.0;
  v_snapshot_count  int := 0;
  v_profile_count   int := 0;
  v_has_ew          boolean;
begin
  select c.tenant_id, c.template_id, t.n_minimum_default
    into v_tenant_id, v_template_id, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

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

  delete from public.score_snapshots             where cycle_id = p_cycle_id;
  delete from public.participant_result_profiles where cycle_id = p_cycle_id;

  -- ── Snapshots ────────────────────────────────────────────────────
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
      when count(*) >= v_n_min                       then 'visible'
      else                                                'hidden'
    end,
    now()
  from public.responses r
  join public.assignments  a  on a.id  = r.assignment_id
  join public.questions    q  on q.id  = r.question_id
  left join public.competencies co on co.id = q.competency_id
  where a.cycle_id  = p_cycle_id
    and a.status    = 'completed'
    and r.score     is not null
  group by
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code;

  get diagnostics v_snapshot_count = row_count;

  -- ── score_distribution — count por valor numérico ────────────────
  with dist as (
    select
      sub.evaluated_cycle_participant_id,
      sub.competency_id,
      sub.relationship_code,
      jsonb_object_agg(sub.bucket::text, sub.cnt) as distribution
    from (
      select
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int as bucket,
        count(*)::int as cnt
      from public.responses   r2
      join public.assignments a2 on a2.id = r2.assignment_id
      join public.questions   q2 on q2.id = r2.question_id
      where a2.cycle_id = p_cycle_id
        and a2.status   = 'completed'
        and r2.score    is not null
      group by
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int
    ) sub
    group by
      sub.evaluated_cycle_participant_id,
      sub.competency_id,
      sub.relationship_code
  )
  update public.score_snapshots ss
  set score_distribution = dist.distribution
  from dist
  where ss.cycle_id            = p_cycle_id
    and ss.cycle_participant_id = dist.evaluated_cycle_participant_id
    and ss.competency_id        is not distinct from dist.competency_id
    and ss.relationship_code    = dist.relationship_code;

  -- ── Profiles — INSERT com avg simples (self/manager/peer/sub) ────
  insert into public.participant_result_profiles (
    tenant_id, cycle_id, cycle_participant_id,
    overall_score, self_score, manager_score, peer_score, subordinate_score,
    blind_spot_count, hidden_strength_count, report_json, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    cp.id,
    -- overall_score: avg simples por ora; será sobrescrito abaixo se houver pesos
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
      select 1 from public.assignments a
      where a.cycle_id = p_cycle_id
        and a.evaluated_cycle_participant_id = cp.id
        and a.status = 'completed'
    )
  group by cp.id;

  get diagnostics v_profile_count = row_count;

  -- ── Ponderação: sobrescreve overall_score se houver pesos ─────────
  -- Verifica se existem pesos de avaliador configurados para este ciclo
  select exists(
    select 1 from public.cycle_evaluator_weights where cycle_id = p_cycle_id
  ) into v_has_ew;

  if v_has_ew then
    with
    -- Pesos de avaliador (apenas rels com weight > 0)
    ew as (
      select relationship_code, weight
      from public.cycle_evaluator_weights
      where cycle_id = p_cycle_id and weight > 0
    ),
    -- Pesos de competência (NULL = usa 1.0)
    cw as (
      select competency_id, weight
      from public.cycle_competency_weights
      where cycle_id = p_cycle_id
    ),
    -- Passo 1: score ponderado por (participant, competency)
    comp_weighted as (
      select
        ss.cycle_participant_id,
        ss.competency_id,
        round(
          sum(ss.score_avg * ew.weight) /
          nullif(sum(ew.weight) filter (where ss.score_avg is not null), 0)
        ::numeric, 4) as w_score
      from public.score_snapshots ss
      -- INNER JOIN: só rels com peso > 0 entram no cálculo
      join ew on ew.relationship_code = ss.relationship_code
      where ss.cycle_id          = p_cycle_id
        and ss.visibility_status = 'visible'
        and ss.competency_id     is not null
        and ss.score_avg         is not null
      group by ss.cycle_participant_id, ss.competency_id
    ),
    -- Passo 2: overall ponderado por participant
    overall_weighted as (
      select
        cw_scores.cycle_participant_id,
        round(
          sum(cw_scores.w_score * coalesce(cw.weight, 1.0)) /
          nullif(
            sum(coalesce(cw.weight, 1.0)) filter (where cw_scores.w_score is not null),
            0
          )
        ::numeric, 4) as overall_score
      from comp_weighted cw_scores
      left join cw on cw.competency_id = cw_scores.competency_id
      group by cw_scores.cycle_participant_id
    )
    update public.participant_result_profiles prp
    set overall_score = ow.overall_score
    from overall_weighted ow
    where prp.cycle_id             = p_cycle_id
      and prp.cycle_participant_id = ow.cycle_participant_id;
  end if;

  -- ── Blind spot / hidden strength ──────────────────────────────────
  with self_by_comp as (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  = 'self'
      and visibility_status  = 'visible'
      and competency_id      is not null
  ),
  others_by_comp as (
    select cycle_participant_id, competency_id,
           avg(score_avg)::numeric as others_avg
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  <> 'self'
      and visibility_status   = 'visible'
      and competency_id       is not null
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
     set blind_spot_count      = coalesce(g.blind_count,  0),
         hidden_strength_count = coalesce(g.hidden_count, 0)
    from gaps g
   where prp.cycle_id             = p_cycle_id
     and prp.cycle_participant_id = g.cycle_participant_id;

  return jsonb_build_object(
    'cycle_id',         p_cycle_id,
    'snapshot_count',   v_snapshot_count,
    'profile_count',    v_profile_count,
    'n_minimum_used',   v_n_min,
    'weighted',         v_has_ew,
    'computed_at',      now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

-- O wrapper público também precisa ser recriado para garantir que aponta
-- para a versão v5 (a assinatura não muda, apenas o corpo foi atualizado acima)
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

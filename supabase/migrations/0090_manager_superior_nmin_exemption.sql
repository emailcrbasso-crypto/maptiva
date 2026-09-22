-- =====================================================================
-- 0090_manager_superior_nmin_exemption.sql
--
-- Bug encontrado ao validar o Flexmetal v2: 'manager' ("Chefe direto")
-- e o novo 'manager_superior' ("Liderança Superior") são, por design,
-- SEMPRE exatamente 1 pessoa identificável — não há anonimato a
-- proteger, e escondê-los pelo N-mínimo genérico (pensado pra grupos
-- como Pares/Subordinados) quebra o requisito explícito do cliente de
-- "Chefe direto: sozinho e identificado, mínimo recomendado 1".
--
-- app.compute_scores() já isentava 'self' e 'manager' corretamente.
-- Mas TRÊS outras funções (usadas pelas seções "Favorabilidade por
-- Nível de Avaliador", o heatmap/radar por competência e a tabela
-- resumida do ciclo) só isentavam 'self' — deixando 'manager' preso
-- ao N-mínimo de 3 e, portanto, sempre escondido (só existe 1 chefe).
-- Esta migração:
--   1. adiciona 'manager_superior' à isenção já existente em
--      compute_scores() e get_question_scores()/get_my_question_scores();
--   2. corrige o bug real, adicionando 'manager' (+ 'manager_superior')
--      à isenção em _relationship_favorability_core(),
--      get_cycle_participant_relationship_scores() e
--      _competency_relationship_favorability_core().
-- Pares/Subordinados/Clientes internos continuam com o N-mínimo real.
-- =====================================================================

-- ---------- 1. compute_scores ----------
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
  v_has_ew          boolean := false;
  v_has_cw          boolean := false;
  v_external_scores boolean;
begin
  select c.tenant_id, c.template_id, t.n_minimum_default, c.external_overall_scores
    into v_tenant_id, v_template_id, v_n_min, v_external_scores
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

  create temp table tmp_consultant_notes on commit drop as
  select cycle_participant_id, consultant_notes
  from public.participant_result_profiles
  where cycle_id = p_cycle_id
    and consultant_notes is not null;

  -- Nota final travada (fornecida externamente) — preserva antes do DELETE.
  create temp table tmp_external_overall on commit drop as
  select cycle_participant_id, overall_score
  from public.participant_result_profiles
  where cycle_id = p_cycle_id
    and v_external_scores
    and overall_score is not null;

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
      when a.relationship_code in ('self','manager','manager_superior') then 'visible'
      when count(distinct a.evaluator_cycle_participant_id) >= v_n_min then 'visible'
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

  update public.participant_result_profiles prp
     set consultant_notes = tmp.consultant_notes
    from tmp_consultant_notes tmp
   where prp.cycle_id             = p_cycle_id
     and prp.cycle_participant_id = tmp.cycle_participant_id;

  -- Nota final travada — restaura por cima de qualquer recálculo abaixo.
  if v_external_scores then
    update public.participant_result_profiles prp
       set overall_score = tmp.overall_score
      from tmp_external_overall tmp
     where prp.cycle_id             = p_cycle_id
       and prp.cycle_participant_id = tmp.cycle_participant_id;
  end if;

  -- ── Ponderação: sobrescreve overall_score se houver QUALQUER peso ──
  -- (pulado inteiramente quando a nota é travada externamente — o
  -- cliente já forneceu o número final com a fórmula certa).
  if not v_external_scores then
    select exists(select 1 from public.cycle_evaluator_weights   where cycle_id = p_cycle_id) into v_has_ew;
    select exists(select 1 from public.cycle_competency_weights  where cycle_id = p_cycle_id) into v_has_cw;

    if v_has_ew or v_has_cw then
      create temp table tmp_overall_weighted on commit drop as
      with
      ew as (
        select relationship_code, weight
        from public.cycle_evaluator_weights
        where cycle_id = p_cycle_id and weight > 0
      ),
      cw as (
        select competency_id, weight
        from public.cycle_competency_weights
        where cycle_id = p_cycle_id
      ),
      comp_weighted as (
        select
          ss.cycle_participant_id,
          ss.competency_id,
          round(
            sum(ss.score_avg * coalesce(ew.weight, case when v_has_ew then 0 else 1.0 end)) /
            nullif(
              sum(coalesce(ew.weight, case when v_has_ew then 0 else 1.0 end))
                filter (where ss.score_avg is not null),
              0
            )
          ::numeric, 4) as w_score
        from public.score_snapshots ss
        left join ew on ew.relationship_code = ss.relationship_code
        where ss.cycle_id          = p_cycle_id
          and ss.visibility_status = 'visible'
          and ss.competency_id     is not null
          and ss.score_avg         is not null
        group by ss.cycle_participant_id, ss.competency_id
      )
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
      group by cw_scores.cycle_participant_id;

      update public.participant_result_profiles prp
      set overall_score = ow.overall_score
      from tmp_overall_weighted ow
      where prp.cycle_id             = p_cycle_id
        and prp.cycle_participant_id = ow.cycle_participant_id;

      update public.participant_result_profiles prp
      set overall_score = null
      where prp.cycle_id = p_cycle_id
        and not exists (
          select 1 from tmp_overall_weighted ow
          where ow.cycle_participant_id = prp.cycle_participant_id
        );
    end if;
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
    'weighted',         (v_has_ew or v_has_cw),
    'external_scores',  v_external_scores,
    'computed_at',      now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

-- ---------- 2. _relationship_favorability_core (bug: só isentava self) ----------
create or replace function app._relationship_favorability_core(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_n_min    int
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with raw_responses as (
    select
      a.evaluator_cycle_participant_id,
      a.relationship_code,
      a.relationship_detail,
      r.score
    from public.assignments a
    join public.responses   r on r.assignment_id = a.id
    where a.cycle_id                       = p_cycle_id
      and a.evaluated_cycle_participant_id = p_cp_id
      and a.status                         = 'completed'
      and r.score is not null
  ),
  rater_counts as (
    select relationship_code, relationship_detail,
           count(distinct evaluator_cycle_participant_id) as n_raters
    from raw_responses
    group by relationship_code, relationship_detail
  ),
  grouped_dist as (
    select
      relationship_code, relationship_detail,
      jsonb_object_agg(score::int::text, cnt) as distribution,
      sum(cnt)                                as response_count
    from (
      select relationship_code, relationship_detail, score::int as score, count(*) as cnt
      from raw_responses
      group by relationship_code, relationship_detail, score
    ) buckets
    group by relationship_code, relationship_detail
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'relationship_code',   rc.relationship_code,
      'relationship_detail', rc.relationship_detail,
      'rater_count',         rc.n_raters,
      'suppressed',          not (rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min),
      'distribution',        case when rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min
                                   then gd.distribution else null end,
      'response_count',      case when rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min
                                   then gd.response_count else null end
    ) order by rc.relationship_code, rc.relationship_detail
  ), '[]'::jsonb)
  from rater_counts rc
  join grouped_dist gd
    on gd.relationship_code = rc.relationship_code
   and gd.relationship_detail is not distinct from rc.relationship_detail
$$;

-- ---------- 3. get_cycle_participant_relationship_scores (mesmo bug) ----------
create or replace function app.get_cycle_participant_relationship_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_n_min     int;
begin
  select c.tenant_id, t.n_minimum_default
    into v_tenant_id, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  return (
    with raw_responses as (
      select
        a.evaluated_cycle_participant_id,
        a.evaluator_cycle_participant_id,
        a.relationship_code,
        a.relationship_detail,
        r.score
      from public.assignments a
      join public.responses   r on r.assignment_id = a.id
      where a.cycle_id  = p_cycle_id
        and a.status    = 'completed'
        and r.score is not null
    ),
    rater_counts as (
      select evaluated_cycle_participant_id, relationship_code, relationship_detail,
             count(distinct evaluator_cycle_participant_id) as n_raters
      from raw_responses
      group by evaluated_cycle_participant_id, relationship_code, relationship_detail
    ),
    grouped as (
      select
        evaluated_cycle_participant_id, relationship_code, relationship_detail,
        round(avg(score)::numeric, 4) as score_avg,
        count(*)::int                 as response_count
      from raw_responses
      group by evaluated_cycle_participant_id, relationship_code, relationship_detail
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'cycle_participant_id', rc.evaluated_cycle_participant_id,
        'relationship_code',    rc.relationship_code,
        'relationship_detail',  rc.relationship_detail,
        'rater_count',          rc.n_raters,
        'suppressed',           not (rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= v_n_min),
        'score_avg',            case when rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= v_n_min
                                      then g.score_avg else null end,
        'response_count',       case when rc.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= v_n_min
                                      then g.response_count else null end
      ) order by rc.evaluated_cycle_participant_id, rc.relationship_code, rc.relationship_detail
    ), '[]'::jsonb)
    from rater_counts rc
    join grouped g
      on g.evaluated_cycle_participant_id = rc.evaluated_cycle_participant_id
     and g.relationship_code              = rc.relationship_code
     and g.relationship_detail is not distinct from rc.relationship_detail
  );
end$$;

grant execute on function app.get_cycle_participant_relationship_scores(uuid) to authenticated;

-- ---------- 4. _competency_relationship_favorability_core (mesmo bug) ----------
create or replace function app._competency_relationship_favorability_core(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_n_min    int
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with raw_responses as (
    select
      a.evaluator_cycle_participant_id,
      a.relationship_code,
      a.relationship_detail,
      q.competency_id,
      r.score
    from public.assignments a
    join public.responses   r on r.assignment_id = a.id
    join public.questions   q on q.id = r.question_id
    where a.cycle_id                       = p_cycle_id
      and a.evaluated_cycle_participant_id = p_cp_id
      and a.status                         = 'completed'
      and r.score is not null
      and q.competency_id is not null
  ),
  rater_counts as (
    select relationship_code, relationship_detail,
           count(distinct evaluator_cycle_participant_id) as n_raters
    from raw_responses
    group by relationship_code, relationship_detail
  ),
  grouped_dist as (
    select
      competency_id, relationship_code, relationship_detail,
      jsonb_object_agg(score::int::text, cnt) as distribution,
      sum(cnt)                                as response_count
    from (
      select competency_id, relationship_code, relationship_detail, score::int as score, count(*) as cnt
      from raw_responses
      group by competency_id, relationship_code, relationship_detail, score
    ) buckets
    group by competency_id, relationship_code, relationship_detail
  ),
  subgroup_rows as (
    select
      gd.competency_id, gd.relationship_code, gd.relationship_detail,
      rc.n_raters,
      not (gd.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min) as suppressed,
      case when gd.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min
           then gd.distribution else null end   as distribution,
      case when gd.relationship_code in ('self','manager','manager_superior') or rc.n_raters >= p_n_min
           then gd.response_count else null end as response_count
    from grouped_dist gd
    join rater_counts rc
      on rc.relationship_code = gd.relationship_code
     and rc.relationship_detail is not distinct from gd.relationship_detail
  ),
  external_rater_total as (
    select count(distinct evaluator_cycle_participant_id) as n_raters
    from raw_responses
    where relationship_code <> 'self'
  ),
  external_dist as (
    select
      competency_id,
      jsonb_object_agg(score::int::text, cnt) as distribution,
      sum(cnt)                                as response_count
    from (
      select competency_id, score::int as score, count(*) as cnt
      from raw_responses
      where relationship_code <> 'self'
      group by competency_id, score
    ) buckets
    group by competency_id
  ),
  -- Por competência: quantos subgrupos não-self existem e quantos estão
  -- suprimidos. Exatamente 1 suprimido = risco de reconstrução por
  -- subtração do total — nesse caso o total também precisa ficar oculto.
  competency_suppression as (
    select
      competency_id,
      count(*) filter (where relationship_code <> 'self')            as n_subgroups,
      count(*) filter (where relationship_code <> 'self' and suppressed) as n_suppressed
    from subgroup_rows
    group by competency_id
  ),
  external_rows as (
    select
      ed.competency_id,
      '__external__'::text as relationship_code,
      null::text            as relationship_detail,
      ert.n_raters,
      (ert.n_raters < p_n_min or coalesce(cs.n_suppressed, 0) = 1) as suppressed,
      case when ert.n_raters >= p_n_min and coalesce(cs.n_suppressed, 0) <> 1
           then ed.distribution else null end as distribution,
      case when ert.n_raters >= p_n_min and coalesce(cs.n_suppressed, 0) <> 1
           then ed.response_count else null end as response_count
    from external_dist ed
    cross join external_rater_total ert
    left join competency_suppression cs on cs.competency_id = ed.competency_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'competency_id',       x.competency_id,
      'relationship_code',   x.relationship_code,
      'relationship_detail', x.relationship_detail,
      'rater_count',         x.n_raters,
      'suppressed',          x.suppressed,
      'distribution',        x.distribution,
      'response_count',      x.response_count
    ) order by x.competency_id, x.relationship_code, x.relationship_detail
  ), '[]'::jsonb)
  from (
    select * from subgroup_rows
    union all
    select * from external_rows
  ) x
$$;

-- ---------- 5. get_question_scores / get_my_question_scores ----------
create or replace function public.get_question_scores(
  p_cycle_id uuid,
  p_cp_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_n_min      int;
  v_release_at timestamptz;
  v_authorized boolean := false;
begin
  select c.tenant_id, c.report_release_at, t.n_minimum_default
    into v_tenant_id, v_release_at, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then return '[]'::jsonb; end if;

  if app.is_admin_or_owner()
     and (app.current_tenant_id() = v_tenant_id or app.current_tenant_id() is null)
  then
    v_authorized := true;
  end if;

  if not v_authorized then
    if v_release_at is not null
       and v_release_at <= now()
       and app.current_tenant_id() = v_tenant_id
       and exists (
         select 1
         from public.cycle_participants cp
         join public.people pe on pe.id = cp.person_id
         join public.users  u  on u.id  = pe.user_id
         where cp.id        = p_cp_id
           and u.auth_user_id = auth.uid()
       )
    then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'question_id',        sub.question_id,
        'prompt',             sub.prompt,
        'order_index',        sub.order_index,
        'competency_id',      sub.competency_id,
        'relationship_code',  sub.relationship_code,
        'relationship_detail',sub.relationship_detail,
        'score_avg',          sub.score_avg,
        'response_count',     sub.response_count
      ) order by sub.order_index, sub.relationship_code, sub.relationship_detail
    )
    from (
      select
        q.id                                  as question_id,
        q.prompt                              as prompt,
        q.order_index                         as order_index,
        q.competency_id                       as competency_id,
        a.relationship_code                   as relationship_code,
        a.relationship_detail                 as relationship_detail,
        round(avg(r.score)::numeric, 4)       as score_avg,
        count(*)::int                         as response_count
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code, a.relationship_detail
      having (a.relationship_code in ('self', 'manager', 'manager_superior') or count(*) >= v_n_min)
    ) sub
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_question_scores(uuid, uuid) to authenticated;

create or replace function public.get_my_question_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_n_min      int;
  v_release_at timestamptz;
  v_cp_id      uuid;
begin
  select c.tenant_id, c.report_release_at, t.n_minimum_default
    into v_tenant_id, v_release_at, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then return '[]'::jsonb; end if;

  if app.current_tenant_id() is distinct from v_tenant_id then
    return '[]'::jsonb;
  end if;

  if not app.is_admin_or_owner() then
    if v_release_at is null or v_release_at > now() then
      return '[]'::jsonb;
    end if;
  end if;

  select cp.id into v_cp_id
  from public.cycle_participants cp
  join public.people pe on pe.id = cp.person_id
  join public.users  u  on u.id  = pe.user_id
  where cp.cycle_id    = p_cycle_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_cp_id is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'question_id',        sub.question_id,
        'prompt',             sub.prompt,
        'order_index',        sub.order_index,
        'competency_id',      sub.competency_id,
        'relationship_code',  sub.relationship_code,
        'relationship_detail',sub.relationship_detail,
        'score_avg',          sub.score_avg,
        'response_count',     sub.response_count
      ) order by sub.order_index, sub.relationship_code, sub.relationship_detail
    )
    from (
      select
        q.id                                  as question_id,
        q.prompt                              as prompt,
        q.order_index                         as order_index,
        q.competency_id                       as competency_id,
        a.relationship_code                   as relationship_code,
        a.relationship_detail                 as relationship_detail,
        round(avg(r.score)::numeric, 4)       as score_avg,
        count(*)::int                         as response_count
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = v_cp_id
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code, a.relationship_detail
      having (a.relationship_code in ('self', 'manager', 'manager_superior') or count(*) >= v_n_min)
    ) sub
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_my_question_scores(uuid) to authenticated;

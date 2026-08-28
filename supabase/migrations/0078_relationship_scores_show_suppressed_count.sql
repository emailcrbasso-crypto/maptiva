-- =====================================================================
-- 0078_relationship_scores_show_suppressed_count.sql
--
-- app._relationship_favorability_core() e
-- get_cycle_participant_relationship_scores() (0077) passam a
-- retornar TODO grupo com pelo menos 1 avaliador — mesmo abaixo do
-- N-mínimo — mas com a nota/distribuição SEMPRE nula quando
-- suprimido (nunca vaza o valor real, só a contagem de avaliadores).
-- Isso deixa o frontend mostrar "menos de N avaliadores" em vez de um
-- traço vazio indistinguível de "sem avaliadores nesse grupo".
--
-- Contagem de avaliadores não é dado sensível por si só (não revela
-- quem disse o quê) — só a NOTA de um grupo pequeno demais é que
-- precisa ficar escondida.
-- =====================================================================

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
      'suppressed',          not (rc.relationship_code = 'self' or rc.n_raters >= p_n_min),
      'distribution',        case when rc.relationship_code = 'self' or rc.n_raters >= p_n_min
                                   then gd.distribution else null end,
      'response_count',      case when rc.relationship_code = 'self' or rc.n_raters >= p_n_min
                                   then gd.response_count else null end
    ) order by rc.relationship_code, rc.relationship_detail
  ), '[]'::jsonb)
  from rater_counts rc
  join grouped_dist gd
    on gd.relationship_code = rc.relationship_code
   and gd.relationship_detail is not distinct from rc.relationship_detail
$$;

-- ── get_cycle_participant_relationship_scores (0077) — mesma lógica ─

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
        'suppressed',           not (rc.relationship_code = 'self' or rc.n_raters >= v_n_min),
        'score_avg',            case when rc.relationship_code = 'self' or rc.n_raters >= v_n_min
                                      then g.score_avg else null end,
        'response_count',       case when rc.relationship_code = 'self' or rc.n_raters >= v_n_min
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

-- =====================================================================
-- 0082_fix_external_total_deanonymization.sql
--
-- Bug de anonimato encontrado numa auditoria externa e confirmado: a
-- linha '__external__' (0080, soma de todos os avaliadores não-self)
-- é retornada junto com as linhas de cada subgrupo (Pares Direto,
-- Pares Indireto, Equipe Direta, Equipe Indireta). Quando exatamente
-- UM subgrupo fica suprimido pelo N-mínimo e os demais + o total ficam
-- visíveis, dá pra reconstruir a nota exata do grupo escondido por
-- subtração:
--   total_externo − soma(subgrupos visíveis) = subgrupo escondido
--
-- Correção: quando exatamente 1 subgrupo (entre os que têm pelo menos
-- 1 avaliador) está suprimido para uma competência, a linha
-- '__external__' dessa competência TAMBÉM é suprimida — não dá pra
-- reconstruir por subtração porque o total deixa de ser publicado.
-- Com 0 ou 2+ subgrupos escondidos não há esse risco (2+ escondidos
-- só permite reconstruir a SOMA deles, que é o "merge" esperado pela
-- política de anonimato).
-- =====================================================================

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
      not (gd.relationship_code = 'self' or rc.n_raters >= p_n_min) as suppressed,
      case when gd.relationship_code = 'self' or rc.n_raters >= p_n_min
           then gd.distribution else null end   as distribution,
      case when gd.relationship_code = 'self' or rc.n_raters >= p_n_min
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

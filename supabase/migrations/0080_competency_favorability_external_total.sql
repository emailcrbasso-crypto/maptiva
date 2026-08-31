-- =====================================================================
-- 0080_competency_favorability_external_total.sql
--
-- Bug real encontrado no heatmap/roda única de favorabilidade: a coluna
-- "Geral" (todos os avaliadores externos) era montada no FRONTEND
-- mesclando as distribuições dos subgrupos (Pares Direto/Indireto,
-- Equipe Direta/Indireta) — mas quando um subgrupo pequeno demais fica
-- suprimido (n < n_minimum), sua distribuição não é retornada, e o
-- merge no cliente simplesmente perde esses avaliadores. Resultado:
-- "Avaliadores Externos" podia não conter TODOS os avaliadores.
--
-- Isso já valia também pro score_snapshots-based "Favorabilidade
-- geral" (mais antigo) — score_snapshots nunca teve uma linha
-- pré-agregada "todos os externos combinados", só uma linha por
-- relationship_code isolado.
--
-- Correção: app._competency_relationship_favorability_core (0079)
-- passa a emitir também uma linha pseudo-grupo
-- relationship_code = '__external__' por competência, com a
-- distribuição de TODOS os avaliadores não-self combinados — supressa
-- apenas se o total combinado de avaliadores distintos (não cada
-- subgrupo isolado) ficar abaixo do N-mínimo. Isso é o dado correto
-- pra qualquer "Geral"/"Avaliadores Externos" agregado.
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
  -- Total de avaliadores externos distintos (une todos os subgrupos não-self) —
  -- é isso que decide se o agregado "Geral" pode ser mostrado, não cada
  -- subgrupo isoladamente.
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
  external_rows as (
    select
      ed.competency_id,
      '__external__'::text as relationship_code,
      null::text            as relationship_detail,
      ert.n_raters,
      ert.n_raters < p_n_min                              as suppressed,
      case when ert.n_raters >= p_n_min then ed.distribution   else null end as distribution,
      case when ert.n_raters >= p_n_min then ed.response_count else null end as response_count
    from external_dist ed
    cross join external_rater_total ert
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

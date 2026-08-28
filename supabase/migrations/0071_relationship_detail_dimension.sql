-- =====================================================================
-- 0071_relationship_detail_dimension.sql
--
-- Adiciona 'nivel_detalhe' como 5ª dimensão do corte demográfico
-- (junto com sexo/geracao/cargo/tempo_casa) — reaproveita exatamente
-- a mesma infraestrutura de 0068/0069, sem tocar em relationship_code,
-- score_snapshots ou compute_scores.
--
-- Contexto: a base real da Flexmetal usa "Nível do Avaliador" com
-- granularidade Direto/Indireto dentro de Pares e de Equipe (ex.:
-- "Pares Direto", "Pares Indireto", "Equipe Direta", "Equipe
-- Indireta") — mais fino que o relationship_code coarse (peer/
-- subordinate) que o resto do produto usa. Em vez de expandir
-- relationship_code (risco alto — toca dezenas de componentes,
-- RPCs e regras de visibilidade que já assumem o conjunto coarse),
-- guardamos o detalhe em people.metadata_json ->> 'nivel_detalhe'
-- (valores 'Direto'/'Indireto', só para pares/equipe — null para
-- self) e tratamos como mais uma dimensão demográfica do avaliador.
--
-- Afeta: app.get_participant_demographic_breakdown (favorabilidade +
-- corte simples) e app.get_cycle_demographic_breakdown (corte do
-- ciclo). Sem migração de dados — nivel_detalhe fica null para
-- avaliadores existentes (a UI já esconde dimensões sem dado).
-- =====================================================================

-- ── 1. get_participant_demographic_breakdown ────────────────────────

create or replace function app.get_participant_demographic_breakdown(
  p_cycle_id uuid,
  p_cp_id    uuid
)
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
        a.evaluator_cycle_participant_id,
        pe.metadata_json ->> 'sexo'           as sexo,
        pe.metadata_json ->> 'geracao'        as geracao,
        pe.metadata_json ->> 'cargo'          as cargo,
        pe.metadata_json ->> 'tempo_casa'     as tempo_casa,
        pe.metadata_json ->> 'nivel_detalhe'  as nivel_detalhe,
        r.score                               as score
      from public.assignments a
      join public.responses   r  on r.assignment_id = a.id
      join public.cycle_participants ecp on ecp.id = a.evaluator_cycle_participant_id
      join public.people pe on pe.id = ecp.person_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score is not null
    ),
    evaluator_scores as (
      select
        evaluator_cycle_participant_id,
        sexo, geracao, cargo, tempo_casa, nivel_detalhe,
        avg(score) as avaliador_score
      from raw_responses
      group by evaluator_cycle_participant_id, sexo, geracao, cargo, tempo_casa, nivel_detalhe
    ),
    dims_avg as (
      select 'sexo'          as dimension, sexo          as value, avaliador_score from evaluator_scores where sexo          is not null
      union all
      select 'geracao'       as dimension, geracao       as value, avaliador_score from evaluator_scores where geracao       is not null
      union all
      select 'cargo'         as dimension, cargo         as value, avaliador_score from evaluator_scores where cargo         is not null
      union all
      select 'tempo_casa'    as dimension, tempo_casa    as value, avaliador_score from evaluator_scores where tempo_casa    is not null
      union all
      select 'nivel_detalhe' as dimension, nivel_detalhe as value, avaliador_score from evaluator_scores where nivel_detalhe is not null
    ),
    dims_scores as (
      select 'sexo'          as dimension, sexo          as value, score from raw_responses where sexo          is not null
      union all
      select 'geracao'       as dimension, geracao       as value, score from raw_responses where geracao       is not null
      union all
      select 'cargo'         as dimension, cargo         as value, score from raw_responses where cargo         is not null
      union all
      select 'tempo_casa'    as dimension, tempo_casa    as value, score from raw_responses where tempo_casa    is not null
      union all
      select 'nivel_detalhe' as dimension, nivel_detalhe as value, score from raw_responses where nivel_detalhe is not null
    ),
    grouped_avg as (
      select
        dimension, value,
        round(avg(avaliador_score)::numeric, 4) as avg_score,
        count(*)                                as respondent_count
      from dims_avg
      group by dimension, value
      having count(*) >= v_n_min
    ),
    grouped_dist as (
      select
        dimension, value,
        jsonb_object_agg(score::int::text, cnt) as distribution,
        sum(cnt)                                as response_count
      from (
        select dimension, value, score::int as score, count(*) as cnt
        from dims_scores
        group by dimension, value, score
      ) buckets
      group by dimension, value
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'dimension',        ga.dimension,
        'value',            ga.value,
        'avg_score',        ga.avg_score,
        'respondent_count', ga.respondent_count,
        'distribution',     gd.distribution,
        'response_count',   gd.response_count
      ) order by ga.dimension, ga.value
    ), '[]'::jsonb)
    from grouped_avg ga
    join grouped_dist gd on gd.dimension = ga.dimension and gd.value = ga.value
  );
end$$;

grant execute on function app.get_participant_demographic_breakdown(uuid, uuid) to authenticated;

-- ── 2. get_cycle_demographic_breakdown ───────────────────────────────

create or replace function app.get_cycle_demographic_breakdown(p_cycle_id uuid)
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
    with evaluator_scores as (
      select
        a.evaluator_cycle_participant_id,
        a.evaluated_cycle_participant_id,
        pe.metadata_json ->> 'sexo'          as sexo,
        pe.metadata_json ->> 'geracao'       as geracao,
        pe.metadata_json ->> 'cargo'         as cargo,
        pe.metadata_json ->> 'tempo_casa'    as tempo_casa,
        pe.metadata_json ->> 'nivel_detalhe' as nivel_detalhe,
        avg(r.score)                         as avaliador_score
      from public.assignments a
      join public.responses   r  on r.assignment_id = a.id
      join public.cycle_participants ecp on ecp.id = a.evaluator_cycle_participant_id
      join public.people pe on pe.id = ecp.person_id
      where a.cycle_id          = p_cycle_id
        and a.relationship_code <> 'self'
        and a.status            = 'completed'
        and r.score is not null
      group by a.evaluator_cycle_participant_id, a.evaluated_cycle_participant_id, pe.metadata_json
    ),
    dims as (
      select 'sexo'          as dimension, sexo          as value, avaliador_score from evaluator_scores where sexo          is not null
      union all
      select 'geracao'       as dimension, geracao       as value, avaliador_score from evaluator_scores where geracao       is not null
      union all
      select 'cargo'         as dimension, cargo         as value, avaliador_score from evaluator_scores where cargo         is not null
      union all
      select 'tempo_casa'    as dimension, tempo_casa    as value, avaliador_score from evaluator_scores where tempo_casa    is not null
      union all
      select 'nivel_detalhe' as dimension, nivel_detalhe as value, avaliador_score from evaluator_scores where nivel_detalhe is not null
    ),
    grouped as (
      select
        dimension, value,
        round(avg(avaliador_score)::numeric, 4) as avg_score,
        count(*)                                as respondent_count
      from dims
      group by dimension, value
      having count(*) >= v_n_min
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'dimension',        dimension,
        'value',            value,
        'avg_score',        avg_score,
        'respondent_count', respondent_count
      ) order by dimension, value
    ), '[]'::jsonb)
    from grouped
  );
end$$;

grant execute on function app.get_cycle_demographic_breakdown(uuid) to authenticated;

-- =====================================================================
-- 0069_demographic_favorability.sql
--
-- Adiciona 'distribution' (contagem de notas 1..scale_max) e
-- 'response_count' a cada grupo demográfico retornado por
-- app.get_participant_demographic_breakdown(). Com isso o frontend
-- consegue calcular % Favorável/Neutro/Desfavorável por grupo (ex.:
-- "Favorabilidade por Tipo de Cargo"), não só a média simples que já
-- existia. avg_score continua igual (média por avaliador, depois
-- média entre avaliadores do grupo) — distribution é aditivo.
--
-- respondent_count continua contando avaliadores DISTINTOS (não
-- respostas) para o filtro de N-mínimo, preservando a regra de
-- anonimato já em vigor.
-- =====================================================================

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
      -- Uma linha por resposta individual, com metadados do avaliador.
      select
        a.evaluator_cycle_participant_id,
        pe.metadata_json ->> 'sexo'       as sexo,
        pe.metadata_json ->> 'geracao'    as geracao,
        pe.metadata_json ->> 'cargo'      as cargo,
        pe.metadata_json ->> 'tempo_casa' as tempo_casa,
        r.score                           as score
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
      -- Score médio por avaliador (para avg_score, como antes).
      select
        evaluator_cycle_participant_id,
        sexo, geracao, cargo, tempo_casa,
        avg(score) as avaliador_score
      from raw_responses
      group by evaluator_cycle_participant_id, sexo, geracao, cargo, tempo_casa
    ),
    dims_avg as (
      select 'sexo'       as dimension, sexo       as value, avaliador_score from evaluator_scores where sexo       is not null
      union all
      select 'geracao'    as dimension, geracao    as value, avaliador_score from evaluator_scores where geracao    is not null
      union all
      select 'cargo'      as dimension, cargo      as value, avaliador_score from evaluator_scores where cargo      is not null
      union all
      select 'tempo_casa' as dimension, tempo_casa as value, avaliador_score from evaluator_scores where tempo_casa is not null
    ),
    dims_scores as (
      select 'sexo'       as dimension, sexo       as value, score from raw_responses where sexo       is not null
      union all
      select 'geracao'    as dimension, geracao    as value, score from raw_responses where geracao    is not null
      union all
      select 'cargo'      as dimension, cargo      as value, score from raw_responses where cargo      is not null
      union all
      select 'tempo_casa' as dimension, tempo_casa as value, score from raw_responses where tempo_casa is not null
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

-- =====================================================================
-- 0110_demographic_profile_all_cuts.sql
--
-- Perfil dos avaliadores do Relatório Executivo: todos os recortes, com
-- alerta nos pequenos.
--
-- get_participant_demographic_breakdown (0096) descarta os recortes com
-- menos de n_minimum pessoas ("having count(*) >= v_n_min"). No BD da
-- Flexmetal (PARAMETROS) a regra do recorte demográfico é outra: abaixo
-- do mínimo de 3 o recorte é exibido com alerta, e não ocultado. Além
-- disso, a ocultação acontece antes de juntar valores equivalentes
-- (ex.: "Operacional A" 2 + "Operacional B" 2 some, mas "Operacional" 4
-- passaria), então só o frontend, depois de normalizar os valores, sabe
-- se o recorte final fica abaixo do mínimo.
--
-- Esta função nova devolve todos os recortes, cada um com
-- below_minimum e o n_minimum do template. Só o Relatório Executivo a
-- usa; get_participant_demographic_breakdown continua igual para as
-- demais telas. Mesmas regras de acesso da 0096 (admin/owner do tenant).
-- =====================================================================

begin;

create or replace function app.get_participant_demographic_profile(
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
        'response_count',   gd.response_count,
        'below_minimum',    ga.respondent_count < v_n_min,
        'n_minimum',        v_n_min
      ) order by ga.dimension, ga.value
    ), '[]'::jsonb)
    from grouped_avg ga
    join grouped_dist gd on gd.dimension = ga.dimension and gd.value = ga.value
  );
end$$;

grant execute on function app.get_participant_demographic_profile(uuid, uuid) to authenticated;

create or replace function public.get_participant_demographic_profile(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_participant_demographic_profile(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_participant_demographic_profile(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

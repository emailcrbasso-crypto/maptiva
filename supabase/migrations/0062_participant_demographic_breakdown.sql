-- =====================================================================
-- 0062_participant_demographic_breakdown.sql
--
-- Corte demográfico do relatório individual — quebra a média geral por
-- características do avaliador (geração, tipo de cargo, tempo de casa),
-- lidas de people.metadata_json quando existirem.
--
-- Escopo enxuto (uso inicial: piloto/demo): olha só as 3 chaves abaixo,
-- que não fazem parte do schema fixo — ficam em metadata_json e cada
-- tenant decide se preenche. Onde não existir, a chave simplesmente não
-- aparece no resultado (a UI esconde a seção automaticamente).
--
-- Respeita anonimato: exclui a autoavaliação (não é "grupo" comparativo)
-- e aplica o n_minimum_default do template — grupos pequenos demais são
-- omitidos para não permitir reidentificação do avaliador.
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
    with evaluator_scores as (
      -- Score médio (todas as competências) por avaliador não-self,
      -- com os metadados demográficos do avaliador.
      select
        a.evaluator_cycle_participant_id,
        pe.metadata_json ->> 'geracao'    as geracao,
        pe.metadata_json ->> 'cargo'      as cargo,
        pe.metadata_json ->> 'tempo_casa' as tempo_casa,
        avg(r.score)                      as avaliador_score
      from public.assignments a
      join public.responses   r  on r.assignment_id = a.id
      join public.cycle_participants ecp on ecp.id = a.evaluator_cycle_participant_id
      join public.people pe on pe.id = ecp.person_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score is not null
      group by a.evaluator_cycle_participant_id, pe.metadata_json
    ),
    dims as (
      select 'geracao'    as dimension, geracao    as value, avaliador_score from evaluator_scores where geracao    is not null
      union all
      select 'cargo'      as dimension, cargo      as value, avaliador_score from evaluator_scores where cargo      is not null
      union all
      select 'tempo_casa' as dimension, tempo_casa as value, avaliador_score from evaluator_scores where tempo_casa is not null
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

grant execute on function app.get_participant_demographic_breakdown(uuid, uuid) to authenticated;

create or replace function public.get_participant_demographic_breakdown(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_participant_demographic_breakdown(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_participant_demographic_breakdown(uuid, uuid) to authenticated;

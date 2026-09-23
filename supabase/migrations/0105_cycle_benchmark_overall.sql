-- =====================================================================
-- 0105_cycle_benchmark_overall.sql
--
-- Relatório executivo: "Em relação ao grupo comparativo" (Visão geral) e
-- a posição no ranking usavam a média das médias POR COMPETÊNCIA de
-- get_cycle_benchmark() (peso igual por competência) como aproximação da
-- "média geral do grupo" — mas a própria metodologia do relatório-modelo
-- define isso como "a média simples das médias gerais de cada pessoa do
-- grupo" (peso igual por resposta dentro de cada pessoa, depois peso
-- igual por pessoa), que é exatamente como a "Média geral" do próprio
-- participante já é calculada no resto do relatório. As duas contas
-- davam números ligeiramente diferentes (4,07 vs 4,06 no caso de teste).
--
-- Esta função computa a média geral por pessoa (mesma regra do
-- get_cycle_benchmark: exclui self, exclui client quando
-- external_overall_scores) e devolve a média simples entre pessoas, mais
-- a posição do participante nesse ranking.
-- =====================================================================

begin;

create or replace function public.get_cycle_benchmark_overall(
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
  v_release_at timestamptz;
  v_is_admin   boolean;
  v_is_participant boolean;
begin
  select c.tenant_id, c.report_release_at
    into v_tenant_id, v_release_at
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then return null; end if;

  v_is_admin := app.is_admin_or_owner()
                and (app.current_tenant_id() = v_tenant_id
                     or app.current_tenant_id() is null);

  v_is_participant := (
    v_release_at is not null
    and v_release_at <= now()
    and app.current_tenant_id() = v_tenant_id
    and exists (
      select 1
      from public.cycle_participants cp
      join public.people pe on pe.id = cp.person_id
      join public.users  u  on u.id  = pe.user_id
      where cp.cycle_id    = p_cycle_id
        and u.auth_user_id = auth.uid()
    )
  );

  if not (v_is_admin or v_is_participant) then
    return null;
  end if;

  return (
    with cycle_flag as (
      select coalesce(external_overall_scores, false) as exclude_client
      from public.cycles
      where id = p_cycle_id
    ),
    raw_responses as (
      select
        a.evaluated_cycle_participant_id,
        r.score
      from public.assignments a
      join public.responses r on r.assignment_id = a.id
      join public.questions q on q.id = r.question_id
      cross join cycle_flag cf
      where a.cycle_id     = p_cycle_id
        and a.status       = 'completed'
        and r.score        is not null
        and q.competency_id is not null
        and a.relationship_code <> 'self'
        and not (cf.exclude_client and a.relationship_code = 'client')
    ),
    per_person as (
      select
        evaluated_cycle_participant_id,
        avg(score) as person_avg
      from raw_responses
      group by evaluated_cycle_participant_id
    )
    select jsonb_build_object(
      'score_avg',         round(avg(pp.person_avg)::numeric, 4),
      'participant_count', count(*),
      'my_rank',           (
        select count(*) + 1
        from per_person pp2
        where pp2.person_avg > (
          select person_avg from per_person where evaluated_cycle_participant_id = p_cp_id
        )
      )
    )
    from per_person pp
  );
end$$;

grant execute on function public.get_cycle_benchmark_overall(uuid, uuid) to authenticated;

commit;

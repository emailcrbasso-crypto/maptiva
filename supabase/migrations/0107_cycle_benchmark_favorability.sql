-- =====================================================================
-- 0107_cycle_benchmark_favorability.sql
--
-- Relatório executivo/participante: "Resultado por competência" no
-- modelo de referência marca um traço na própria barra de favorabilidade
-- com a favorabilidade média do grupo comparativo (os 16 gestores) na
-- mesma competência. get_cycle_benchmark() só devolve a média 1-5
-- (score_avg), não a favorabilidade — adiciona 'fav_avg' (% de respostas
-- 4 ou 5), calculada com o mesmo padrão já usado pro resto do banco:
-- favorabilidade por pessoa, depois média simples entre pessoas.
-- =====================================================================

create or replace function public.get_cycle_benchmark(p_cycle_id uuid)
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

  if not found then return '[]'::jsonb; end if;

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
    return '[]'::jsonb;
  end if;

  return coalesce((
    with cycle_flag as (
      select coalesce(external_overall_scores, false) as exclude_client
      from public.cycles
      where id = p_cycle_id
    ),
    raw_responses as (
      select
        a.evaluated_cycle_participant_id,
        q.competency_id,
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
        competency_id,
        avg(score)                                                as person_avg,
        avg((score >= 4)::int::numeric)                            as person_fav
      from raw_responses
      group by evaluated_cycle_participant_id, competency_id
    )
    select jsonb_agg(
      jsonb_build_object(
        'competency_id',     competency_id,
        'score_avg',         round(avg_score::numeric, 4),
        'fav_avg',            round(avg_fav::numeric * 100, 1),
        'participant_count', part_count
      )
    )
    from (
      select
        competency_id,
        avg(person_avg)                                 as avg_score,
        avg(person_fav)                                  as avg_fav,
        count(distinct evaluated_cycle_participant_id)::int as part_count
      from per_person
      group by competency_id
    ) agg
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_cycle_benchmark(uuid) to authenticated;

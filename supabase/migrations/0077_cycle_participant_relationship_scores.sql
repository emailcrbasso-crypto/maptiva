-- =====================================================================
-- 0077_cycle_participant_relationship_scores.sql
--
-- Versão "ciclo inteiro" de get_participant_relationship_favorability
-- (0074) — em vez da distribuição completa de 1 participante, traz só
-- a média por (participante, relationship_code, relationship_detail)
-- para TODOS os participantes do ciclo de uma vez. Usado na lista
-- "Resultados por participante" do relatório do ciclo, que hoje só
-- usa o corte coarse (self/gestor/pares/subordinados).
-- =====================================================================

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
        'cycle_participant_id', g.evaluated_cycle_participant_id,
        'relationship_code',    g.relationship_code,
        'relationship_detail',  g.relationship_detail,
        'score_avg',            g.score_avg,
        'response_count',       g.response_count
      ) order by g.evaluated_cycle_participant_id, g.relationship_code, g.relationship_detail
    ), '[]'::jsonb)
    from grouped g
    join rater_counts rc
      on rc.evaluated_cycle_participant_id = g.evaluated_cycle_participant_id
     and rc.relationship_code              = g.relationship_code
     and rc.relationship_detail is not distinct from g.relationship_detail
    where g.relationship_code = 'self' or rc.n_raters >= v_n_min
  );
end$$;

grant execute on function app.get_cycle_participant_relationship_scores(uuid) to authenticated;

create or replace function public.get_cycle_participant_relationship_scores(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_cycle_participant_relationship_scores(p_cycle_id); end$$;

grant execute on function public.get_cycle_participant_relationship_scores(uuid) to authenticated;

-- =====================================================================
-- 0100_question_divergence_public_schema.sql
--
-- A 0097 criou get_participant_question_divergence()/
-- get_my_question_divergence() no schema `app` — a função existe (
-- confirmado via pg_proc) e o NOTIFY pgrst foi enviado, mas a API
-- continua devolvendo 404 "function not found in schema cache" pra
-- essas duas especificamente, mesmo com get_participant_demographic_
-- breakdown (também em `app`) funcionando normalmente. Não deu pra
-- isolar a causa exata sem acesso à configuração do PostgREST.
--
-- Como get_question_scores/get_my_question_scores (que já funcionam
-- de forma confiável) ficam no schema `public`, recria as duas
-- funções novas lá também — mesmo corpo, só muda o schema.
-- =====================================================================

begin;

create or replace function public.get_participant_question_divergence(
  p_cycle_id uuid,
  p_cp_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id   uuid;
  v_n_min       int;
  v_unweighted  boolean;
begin
  select c.tenant_id, t.n_minimum_default, c.external_overall_scores
    into v_tenant_id, v_n_min, v_unweighted
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
    with by_group as (
      select
        q.id                 as question_id,
        q.prompt             as prompt,
        q.order_index        as order_index,
        co.name              as dimension_name,
        a.relationship_code  as relationship_code,
        count(*)                                          as n,
        count(*) filter (where r.score >= rs.max - 1)      as n_fav
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      join public.templates   t  on t.id  = q.template_id
      left join public.competencies co on co.id = q.competency_id
      join app.response_scales rs on rs.id = coalesce(q.scale_id, co.scale_id, t.scale_id)
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, co.name, a.relationship_code
      having (a.relationship_code in ('manager', 'manager_superior') or count(*) >= v_n_min)
    ),
    with_pct as (
      select
        question_id, prompt, order_index, dimension_name, relationship_code,
        round((n_fav::numeric / n) * 100, 4) as pct
      from by_group
    ),
    extremes as (
      select
        question_id, prompt, order_index, dimension_name,
        max(pct) as max_pct,
        min(pct) as min_pct
      from with_pct
      group by question_id, prompt, order_index, dimension_name
      having count(*) >= 2
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'question_number',             e.order_index + 1,
        'question_prompt',             e.prompt,
        'dimension_name',              e.dimension_name,
        'amplitude_points',            round(e.max_pct - e.min_pct, 2),
        'highest_groups',              hi.groups,
        'highest_pct',                 e.max_pct,
        'lowest_groups',               lo.groups,
        'lowest_pct',                  e.min_pct,
        'extreme_in_unweighted_group', v_unweighted
          and (hi.groups ? 'client' or lo.groups ? 'client')
      ) order by e.order_index
    ), '[]'::jsonb)
    from extremes e
    join lateral (
      select jsonb_agg(wp.relationship_code order by wp.relationship_code) as groups
      from with_pct wp
      where wp.question_id = e.question_id and wp.pct = e.max_pct
    ) hi on true
    join lateral (
      select jsonb_agg(wp.relationship_code order by wp.relationship_code) as groups
      from with_pct wp
      where wp.question_id = e.question_id and wp.pct = e.min_pct
    ) lo on true
  );
end$$;

grant execute on function public.get_participant_question_divergence(uuid, uuid) to authenticated;

create or replace function public.get_my_question_divergence(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id   uuid;
  v_n_min       int;
  v_unweighted  boolean;
  v_release_at  timestamptz;
  v_cp_id       uuid;
begin
  select c.tenant_id, t.n_minimum_default, c.external_overall_scores, c.report_release_at
    into v_tenant_id, v_n_min, v_unweighted, v_release_at
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then return '[]'::jsonb; end if;

  if app.current_tenant_id() is distinct from v_tenant_id then
    return '[]'::jsonb;
  end if;

  if not app.is_admin_or_owner() then
    if v_release_at is null or v_release_at > now() then
      return '[]'::jsonb;
    end if;
  end if;

  select cp.id into v_cp_id
  from public.cycle_participants cp
  join public.people pe on pe.id = cp.person_id
  join public.users  u  on u.id  = pe.user_id
  where cp.cycle_id    = p_cycle_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_cp_id is null then return '[]'::jsonb; end if;

  return (
    with by_group as (
      select
        q.id                 as question_id,
        q.prompt             as prompt,
        q.order_index        as order_index,
        co.name              as dimension_name,
        a.relationship_code  as relationship_code,
        count(*)                                          as n,
        count(*) filter (where r.score >= rs.max - 1)      as n_fav
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      join public.templates   t  on t.id  = q.template_id
      left join public.competencies co on co.id = q.competency_id
      join app.response_scales rs on rs.id = coalesce(q.scale_id, co.scale_id, t.scale_id)
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = v_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, co.name, a.relationship_code
      having (a.relationship_code in ('manager', 'manager_superior') or count(*) >= v_n_min)
    ),
    with_pct as (
      select
        question_id, prompt, order_index, dimension_name, relationship_code,
        round((n_fav::numeric / n) * 100, 4) as pct
      from by_group
    ),
    extremes as (
      select
        question_id, prompt, order_index, dimension_name,
        max(pct) as max_pct,
        min(pct) as min_pct
      from with_pct
      group by question_id, prompt, order_index, dimension_name
      having count(*) >= 2
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'question_number',             e.order_index + 1,
        'question_prompt',             e.prompt,
        'dimension_name',              e.dimension_name,
        'amplitude_points',            round(e.max_pct - e.min_pct, 2),
        'highest_groups',              hi.groups,
        'highest_pct',                 e.max_pct,
        'lowest_groups',               lo.groups,
        'lowest_pct',                  e.min_pct,
        'extreme_in_unweighted_group', v_unweighted
          and (hi.groups ? 'client' or lo.groups ? 'client')
      ) order by e.order_index
    ), '[]'::jsonb)
    from extremes e
    join lateral (
      select jsonb_agg(wp.relationship_code order by wp.relationship_code) as groups
      from with_pct wp
      where wp.question_id = e.question_id and wp.pct = e.max_pct
    ) hi on true
    join lateral (
      select jsonb_agg(wp.relationship_code order by wp.relationship_code) as groups
      from with_pct wp
      where wp.question_id = e.question_id and wp.pct = e.min_pct
    ) lo on true
  );
end$$;

grant execute on function public.get_my_question_divergence(uuid) to authenticated;

-- Remove as versões em `app` que a API não conseguiu enxergar, pra não
-- deixar função morta/confusa no schema.
drop function if exists app.get_participant_question_divergence(uuid, uuid);
drop function if exists app.get_my_question_divergence(uuid);

notify pgrst, 'reload schema';

commit;

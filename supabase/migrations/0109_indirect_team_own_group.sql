-- =====================================================================
-- 0109_indirect_team_own_group.sql
--
-- Equipe indireta como grupo próprio na Divergência e na Confiabilidade.
--
-- Na importação do Flexmetal v4 (0089), "Equipe indireta" foi gravada
-- como relationship_code 'subordinate' + relationship_detail 'Indireto',
-- ao lado da Equipe ('subordinate' + 'Direto'). Estas funções agrupavam só
-- por relationship_code e fundiam os dois grupos — contra a regra do BD
-- ("Nenhum grupo é fundido"). No painel do Sergio Fujmura (Equipe 4 +
-- Equipe indireta 24) a Divergência saía vazia (um grupo só) e a
-- Confiabilidade contava 1 grupo com 100% da nota, em vez de 2 grupos
-- com 86% na Equipe indireta.
--
-- Agora 'subordinate' + 'Indireto' vira o grupo 'subordinate_indirect'
-- (código sintético, só na saída destas funções). Os demais grupos, e a
-- Equipe direta, continuam com o relationship_code de sempre. A nota
-- geral não muda: as duas equipes já entravam nela do mesmo jeito.
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
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
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
      group by q.id, q.prompt, q.order_index, co.name, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
      -- Divergência só compara grupos com 3+ avaliadores — diferente da
      -- isenção usada em get_question_scores, aqui chefe direto/liderança
      -- superior (1 pessoa) nunca participam, pra não expor nota individual.
      having count(*) >= v_n_min
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
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
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
      group by q.id, q.prompt, q.order_index, co.name, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
      having count(*) >= v_n_min
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

create or replace function public.get_participant_reliability(
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
    with rater_avgs as (
      select
        a.evaluator_cycle_participant_id as rater_id,
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
        avg(r.score)                     as rater_avg,
        count(distinct r.score)          as distinct_scores,
        count(*)                         as n_responses
      from public.responses   r
      join public.assignments a on a.id = r.assignment_id
      join public.questions   q on q.id = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              not in ('self', 'client')
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by a.evaluator_cycle_participant_id, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
    ),
    group_counts as (
      select relationship_code, count(*) as n
      from rater_avgs
      group by relationship_code
    ),
    eligible_groups as (
      select relationship_code, n
      from group_counts
      where relationship_code in ('manager', 'manager_superior') or n >= v_n_min
    ),
    eligible_raters as (
      select ra.*
      from rater_avgs ra
      join eligible_groups eg on eg.relationship_code = ra.relationship_code
    ),
    stats as (
      select
        count(*)                                     as n_avaliadores,
        (select count(*) from eligible_groups)        as n_grupos,
        coalesce(stddev_samp(rater_avg), 0)            as desvio,
        count(*) filter (where distinct_scores = 1)   as n_indiferenciados,
        bool_or(relationship_code = 'manager')        as has_chefe,
        bool_or(relationship_code = 'peer')            as has_pares,
        coalesce(
          (select max(n) from eligible_groups)::numeric / nullif(count(*), 0),
          0
        ) as max_group_share
      from eligible_raters
    ),
    -- Todos os avaliadores (inclui clientes internos, exclui autoavaliação)
    -- com uma única nota do início ao fim, pra citar o caso concreto.
    all_indiferenciados as (
      select
        case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end as relationship_code,
        min(r.score)                                      as value
      from public.responses   r
      join public.assignments a on a.id = r.assignment_id
      join public.questions   q on q.id = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.relationship_code              <> 'self'
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by a.evaluator_cycle_participant_id, case when a.relationship_code = 'subordinate' and a.relationship_detail = 'Indireto' then 'subordinate_indirect' else a.relationship_code end
      having count(distinct r.score) = 1
    )
    select jsonb_build_object(
      'n_avaliadores',       s.n_avaliadores,
      'n_grupos',            s.n_grupos,
      'desvio_padrao',       round(s.desvio::numeric, 4),
      'margem',              round((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric, 4),
      'limiar_leitura',      ceil((1.96 * s.desvio / nullif(sqrt(s.n_avaliadores), 0))::numeric * 10) / 10,
      'n_indiferenciados',   s.n_indiferenciados,
      'has_chefe',           s.has_chefe,
      'has_pares',           s.has_pares,
      'max_group_share_pct', round(s.max_group_share * 100, 1),
      'tier',
        case
          when s.n_grupos < 3 or s.n_avaliadores < 15 then 'fragil'
          when not s.has_chefe or not s.has_pares
            or s.max_group_share >= 0.75
            or s.n_indiferenciados >= 3
            or s.n_avaliadores < 20
          then 'atencao'
          else 'bom'
        end,
      'indiferenciados_detail', (
        select coalesce(jsonb_agg(jsonb_build_object('relationship_code', relationship_code, 'value', value)), '[]'::jsonb)
        from all_indiferenciados
      )
    )
    from stats s
  );
end$$;

grant execute on function public.get_participant_reliability(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

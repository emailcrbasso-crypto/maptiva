-- =====================================================================
-- 0097_live_question_divergence.sql
--
-- Auditoria externa (Flexmetal v2, Marcelo Pezzutti): a aba Divergência
-- comparou o relatório do Rafael com o relatório CR BASSO e achou 5
-- perguntas com empate no grupo mais alto ou mais baixo, onde o
-- relatório do Rafael mostra só 1 dos grupos empatados (o CR BASSO
-- mostra os dois) — e a pergunta 9 com amplitude 16,66 em vez de
-- 83,33 − 66,67 = 16,67.
--
-- Causa: participant_question_divergence é uma tabela importada
-- verbatim da planilha DIVERGENCIA (migration 0089) — highest_group/
-- lowest_group são colunas de texto único, não conseguem representar
-- empate, e o número vem arredondado já na origem.
--
-- Fix: nova função app.get_participant_question_divergence(), que
-- calcula a divergência ao vivo a partir das respostas (mesma fonte
-- que já usamos pra tudo mais no relatório), agrupando por
-- relationship_code (excluindo autoavaliação, respeitando o mesmo
-- n-mínimo com a isenção de chefe direto/liderança superior já usada
-- em get_question_scores). "Mais alto"/"mais baixo" viram arrays —
-- quando dois ou mais grupos empatam no extremo, todos aparecem.
--
-- A tabela participant_question_divergence e a função antiga não são
-- removidas (histórico/outros usos futuros), só deixam de ser a fonte
-- do relatório — trocar a chamada no frontend é o próximo passo.
-- =====================================================================

begin;

create or replace function app.get_participant_question_divergence(
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

grant execute on function app.get_participant_question_divergence(uuid, uuid) to authenticated;

-- Mesma consulta, mas resolvendo o próprio cycle_participant do usuário
-- logado — usada em "Meu relatório" (mesmo par que get_question_scores /
-- get_my_question_scores).
create or replace function app.get_my_question_divergence(p_cycle_id uuid)
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

grant execute on function app.get_my_question_divergence(uuid) to authenticated;

commit;

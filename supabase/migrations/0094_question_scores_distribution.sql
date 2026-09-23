-- =====================================================================
-- 0094_question_scores_distribution.sql
--
-- Auditoria externa (Flexmetal v2, Marcelo Pezzutti): "Perguntas em
-- destaque" ordena pelas médias das perguntas, mas a regra do BD manda
-- ordenar por favorabilidade (% de notas 4-5) primeiro, depois média,
-- depois menor desfavorabilidade, depois menor número da pergunta.
-- Sem a distribuição de notas por pergunta não dá pra calcular
-- favorabilidade no frontend — get_question_scores()/
-- get_my_question_scores() só devolviam a média.
--
-- Adiciona `score_distribution` (histograma nota -> contagem) a cada
-- linha, no mesmo formato já usado em snapshots.score_distribution.
-- =====================================================================

begin;

create or replace function public.get_question_scores(
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
  v_n_min      int;
  v_release_at timestamptz;
  v_authorized boolean := false;
begin
  select c.tenant_id, c.report_release_at, t.n_minimum_default
    into v_tenant_id, v_release_at, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then return '[]'::jsonb; end if;

  if app.is_admin_or_owner()
     and (app.current_tenant_id() = v_tenant_id or app.current_tenant_id() is null)
  then
    v_authorized := true;
  end if;

  if not v_authorized then
    if v_release_at is not null
       and v_release_at <= now()
       and app.current_tenant_id() = v_tenant_id
       and exists (
         select 1
         from public.cycle_participants cp
         join public.people pe on pe.id = cp.person_id
         join public.users  u  on u.id  = pe.user_id
         where cp.id        = p_cp_id
           and u.auth_user_id = auth.uid()
       )
    then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'question_id',         agg.question_id,
        'prompt',               agg.prompt,
        'order_index',          agg.order_index,
        'competency_id',        agg.competency_id,
        'relationship_code',    agg.relationship_code,
        'relationship_detail',  agg.relationship_detail,
        'score_avg',            round(agg.score_avg_raw, 4),
        'response_count',       agg.response_count,
        'score_distribution',   agg.score_distribution
      ) order by agg.order_index, agg.relationship_code, agg.relationship_detail
    )
    from (
      select
        scored.question_id, scored.prompt, scored.order_index, scored.competency_id,
        scored.relationship_code, scored.relationship_detail,
        sum(scored.score * scored.cnt)::numeric / sum(scored.cnt) as score_avg_raw,
        sum(scored.cnt)::int                                      as response_count,
        jsonb_object_agg(scored.score::text, scored.cnt)          as score_distribution
      from (
        select
          q.id                    as question_id,
          q.prompt                as prompt,
          q.order_index           as order_index,
          q.competency_id         as competency_id,
          a.relationship_code     as relationship_code,
          a.relationship_detail   as relationship_detail,
          r.score                 as score,
          count(*)                as cnt
        from public.responses   r
        join public.assignments a  on a.id  = r.assignment_id
        join public.questions   q  on q.id  = r.question_id
        where a.cycle_id                       = p_cycle_id
          and a.evaluated_cycle_participant_id = p_cp_id
          and a.status                         = 'completed'
          and r.score                          is not null
          and q.response_type                  = 'scale'
        group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code, a.relationship_detail, r.score
      ) scored
      group by scored.question_id, scored.prompt, scored.order_index, scored.competency_id,
               scored.relationship_code, scored.relationship_detail
    ) agg
    where (agg.relationship_code in ('self', 'manager', 'manager_superior') or agg.response_count >= v_n_min)
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_question_scores(uuid, uuid) to authenticated;

create or replace function public.get_my_question_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_n_min      int;
  v_release_at timestamptz;
  v_cp_id      uuid;
begin
  select c.tenant_id, c.report_release_at, t.n_minimum_default
    into v_tenant_id, v_release_at, v_n_min
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

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'question_id',         agg.question_id,
        'prompt',               agg.prompt,
        'order_index',          agg.order_index,
        'competency_id',        agg.competency_id,
        'relationship_code',    agg.relationship_code,
        'relationship_detail',  agg.relationship_detail,
        'score_avg',            round(agg.score_avg_raw, 4),
        'response_count',       agg.response_count,
        'score_distribution',   agg.score_distribution
      ) order by agg.order_index, agg.relationship_code, agg.relationship_detail
    )
    from (
      select
        scored.question_id, scored.prompt, scored.order_index, scored.competency_id,
        scored.relationship_code, scored.relationship_detail,
        sum(scored.score * scored.cnt)::numeric / sum(scored.cnt) as score_avg_raw,
        sum(scored.cnt)::int                                      as response_count,
        jsonb_object_agg(scored.score::text, scored.cnt)          as score_distribution
      from (
        select
          q.id                    as question_id,
          q.prompt                as prompt,
          q.order_index           as order_index,
          q.competency_id         as competency_id,
          a.relationship_code     as relationship_code,
          a.relationship_detail   as relationship_detail,
          r.score                 as score,
          count(*)                as cnt
        from public.responses   r
        join public.assignments a  on a.id  = r.assignment_id
        join public.questions   q  on q.id  = r.question_id
        where a.cycle_id                       = p_cycle_id
          and a.evaluated_cycle_participant_id = v_cp_id
          and a.status                         = 'completed'
          and r.score                          is not null
          and q.response_type                  = 'scale'
        group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code, a.relationship_detail, r.score
      ) scored
      group by scored.question_id, scored.prompt, scored.order_index, scored.competency_id,
               scored.relationship_code, scored.relationship_detail
    ) agg
    where (agg.relationship_code in ('self', 'manager', 'manager_superior') or agg.response_count >= v_n_min)
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_my_question_scores(uuid) to authenticated;

commit;

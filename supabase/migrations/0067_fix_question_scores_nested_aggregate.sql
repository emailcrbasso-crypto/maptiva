-- =====================================================================
-- 0067_fix_question_scores_nested_aggregate.sql
--
-- Corrige bug real de SQL em 0052_question_scores_rpc.sql: as funções
-- get_question_scores() e get_my_question_scores() tentavam envolver
-- jsonb_agg(...) em torno de avg()/count() na MESMA query com GROUP BY
-- — agregação aninhada sem subquery intermediária, que o Postgres
-- sempre rejeita com erro 42803 ("aggregate function calls cannot be
-- nested"). Isso fazia as duas RPCs sempre retornarem HTTP 400,
-- deixando a seção "Perguntas com maiores e menores notas" (Top 5 por
-- pergunta) e o drill-down por pergunta em branco para todo mundo.
--
-- Fix: separa em duas etapas —
--   1. subquery agrupa por (questão, relação) e calcula avg/count;
--   2. query externa aplica o filtro de N-mínimo e faz jsonb_agg
--      sobre as linhas já agregadas.
-- =====================================================================

-- ── get_question_scores ───────────────────────────────────────────────

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

  -- Admin/owner do tenant correto → sempre autorizado
  if app.is_admin_or_owner()
     and (app.current_tenant_id() = v_tenant_id or app.current_tenant_id() is null)
  then
    v_authorized := true;
  end if;

  -- Participante → somente após liberação, somente para o próprio cp_id
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
        'question_id',       sub.question_id,
        'prompt',            sub.prompt,
        'order_index',       sub.order_index,
        'competency_id',     sub.competency_id,
        'relationship_code', sub.relationship_code,
        'score_avg',         sub.score_avg,
        'response_count',    sub.response_count
      ) order by sub.order_index, sub.relationship_code
    )
    from (
      select
        q.id                                  as question_id,
        q.prompt                              as prompt,
        q.order_index                         as order_index,
        q.competency_id                       as competency_id,
        a.relationship_code                   as relationship_code,
        round(avg(r.score)::numeric, 4)       as score_avg,
        count(*)::int                         as response_count
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = p_cp_id
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code
      having (a.relationship_code in ('self', 'manager') or count(*) >= v_n_min)
    ) sub
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_question_scores(uuid, uuid) to authenticated;

-- ── get_my_question_scores ────────────────────────────────────────────

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

  -- Gate de liberação para não-admin
  if not app.is_admin_or_owner() then
    if v_release_at is null or v_release_at > now() then
      return '[]'::jsonb;
    end if;
  end if;

  -- Localiza cp_id do usuário logado
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
        'question_id',       sub.question_id,
        'prompt',            sub.prompt,
        'order_index',       sub.order_index,
        'competency_id',     sub.competency_id,
        'relationship_code', sub.relationship_code,
        'score_avg',         sub.score_avg,
        'response_count',    sub.response_count
      ) order by sub.order_index, sub.relationship_code
    )
    from (
      select
        q.id                                  as question_id,
        q.prompt                              as prompt,
        q.order_index                         as order_index,
        q.competency_id                       as competency_id,
        a.relationship_code                   as relationship_code,
        round(avg(r.score)::numeric, 4)       as score_avg,
        count(*)::int                         as response_count
      from public.responses   r
      join public.assignments a  on a.id  = r.assignment_id
      join public.questions   q  on q.id  = r.question_id
      where a.cycle_id                       = p_cycle_id
        and a.evaluated_cycle_participant_id = v_cp_id
        and a.status                         = 'completed'
        and r.score                          is not null
        and q.response_type                  = 'scale'
      group by q.id, q.prompt, q.order_index, q.competency_id, a.relationship_code
      having (a.relationship_code in ('self', 'manager') or count(*) >= v_n_min)
    ) sub
  ), '[]'::jsonb);
end$$;

grant execute on function public.get_my_question_scores(uuid) to authenticated;

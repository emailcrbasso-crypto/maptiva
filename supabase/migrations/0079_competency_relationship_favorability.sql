-- =====================================================================
-- 0079_competency_relationship_favorability.sql
--
-- Versão "por competência" de app._relationship_favorability_core (0078)
-- — em vez de uma distribuição só por (relationship_code,
-- relationship_detail) agregada em todas as competências, traz uma
-- distribuição por (competency_id, relationship_code,
-- relationship_detail). Isso permite montar o heatmap "Dimensão ×
-- Nível de Avaliador" com a granularidade completa (Pares Direto/
-- Indireto, Equipe Direta/Indireta) que hoje só existe agregada.
--
-- Mesma regra de supressão do 0078: todo grupo com pelo menos 1
-- avaliador é retornado, mas a distribuição só vem preenchida quando
-- o grupo atinge o N-mínimo (ou é a autoavaliação) — nunca vaza nota
-- de grupo pequeno demais, só a contagem de avaliadores.
-- =====================================================================

create or replace function app._competency_relationship_favorability_core(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_n_min    int
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with raw_responses as (
    select
      a.evaluator_cycle_participant_id,
      a.relationship_code,
      a.relationship_detail,
      q.competency_id,
      r.score
    from public.assignments a
    join public.responses   r on r.assignment_id = a.id
    join public.questions   q on q.id = r.question_id
    where a.cycle_id                       = p_cycle_id
      and a.evaluated_cycle_participant_id = p_cp_id
      and a.status                         = 'completed'
      and r.score is not null
      and q.competency_id is not null
  ),
  -- Contagem de avaliadores por (relationship, detail) — NÃO por competência:
  -- o N-mínimo é sobre "quantas pessoas distintas avaliaram nesse nível",
  -- não sobre quantas responderam cada competência especificamente (mesmo
  -- conjunto de avaliadores responde todas as competências do questionário).
  rater_counts as (
    select relationship_code, relationship_detail,
           count(distinct evaluator_cycle_participant_id) as n_raters
    from raw_responses
    group by relationship_code, relationship_detail
  ),
  grouped_dist as (
    select
      competency_id, relationship_code, relationship_detail,
      jsonb_object_agg(score::int::text, cnt) as distribution,
      sum(cnt)                                as response_count
    from (
      select competency_id, relationship_code, relationship_detail, score::int as score, count(*) as cnt
      from raw_responses
      group by competency_id, relationship_code, relationship_detail, score
    ) buckets
    group by competency_id, relationship_code, relationship_detail
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'competency_id',       gd.competency_id,
      'relationship_code',   gd.relationship_code,
      'relationship_detail', gd.relationship_detail,
      'rater_count',         rc.n_raters,
      'suppressed',          not (gd.relationship_code = 'self' or rc.n_raters >= p_n_min),
      'distribution',        case when gd.relationship_code = 'self' or rc.n_raters >= p_n_min
                                   then gd.distribution else null end,
      'response_count',      case when gd.relationship_code = 'self' or rc.n_raters >= p_n_min
                                   then gd.response_count else null end
    ) order by gd.competency_id, gd.relationship_code, gd.relationship_detail
  ), '[]'::jsonb)
  from grouped_dist gd
  join rater_counts rc
    on rc.relationship_code = gd.relationship_code
   and rc.relationship_detail is not distinct from gd.relationship_detail
$$;

-- ── get_participant_competency_relationship_favorability (admin/owner) ─

create or replace function app.get_participant_competency_relationship_favorability(
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

  return app._competency_relationship_favorability_core(p_cycle_id, p_cp_id, v_n_min);
end$$;

grant execute on function app.get_participant_competency_relationship_favorability(uuid, uuid) to authenticated;

create or replace function public.get_participant_competency_relationship_favorability(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_participant_competency_relationship_favorability(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_participant_competency_relationship_favorability(uuid, uuid) to authenticated;

-- ── get_my_competency_relationship_favorability (participante logado) ──

create or replace function app.get_my_competency_relationship_favorability(p_cycle_id uuid)
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

  return app._competency_relationship_favorability_core(p_cycle_id, v_cp_id, v_n_min);
end$$;

grant execute on function app.get_my_competency_relationship_favorability(uuid) to authenticated;

create or replace function public.get_my_competency_relationship_favorability(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_my_competency_relationship_favorability(p_cycle_id); end$$;

grant execute on function public.get_my_competency_relationship_favorability(uuid) to authenticated;

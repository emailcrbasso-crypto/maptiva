-- =====================================================================
-- 0050_score_distribution.sql
--
-- Adiciona distribuição de scores por valor ao score_snapshots,
-- e atualiza as RPCs de relatório para expor esse dado.
--
-- Mudanças:
--   1. ALTER TABLE score_snapshots  ADD COLUMN score_distribution jsonb
--      Formato: {"1": 3, "3": 7, "4": 8, "5": 2} — count por valor
--
--   2. app.compute_scores v4 — após o insert principal, popula
--      score_distribution com um UPDATE + CTE
--
--   3. app.get_my_report — inclui score_distribution no jsonb de cada snapshot
--
--   4. public.get_participant_report — idem
-- =====================================================================

-- ── 1. Schema ────────────────────────────────────────────────────────

alter table public.score_snapshots
  add column if not exists score_distribution jsonb;

-- ── 2. compute_scores (v4) ───────────────────────────────────────────

create or replace function app.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id       uuid;
  v_template_id     uuid;
  v_n_min           int;
  v_blind_threshold numeric := 1.0;
  v_snapshot_count  int := 0;
  v_profile_count   int := 0;
begin
  select c.tenant_id, c.template_id, t.n_minimum_default
    into v_tenant_id, v_template_id, v_n_min
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not (
       app.is_admin_or_owner()
       or auth.role() = 'service_role'
       or (auth.role() is null and session_user in ('service_role','postgres'))
     ) or (
       app.current_tenant_id() is not null
       and v_tenant_id <> app.current_tenant_id()
     )
  then
    raise exception 'cycle_not_authorized' using errcode = 'P0011';
  end if;

  delete from public.score_snapshots             where cycle_id = p_cycle_id;
  delete from public.participant_result_profiles where cycle_id = p_cycle_id;

  -- ── Snapshots ────────────────────────────────────────────────────
  insert into public.score_snapshots (
    tenant_id, cycle_id, cycle_participant_id, competency_id,
    dimension_code, relationship_code, relationship_group,
    score_avg, response_count, visibility_status, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code,
    a.relationship_code as relationship_group,
    round(avg(r.score)::numeric, 4),
    count(*)::int,
    case
      when a.relationship_code in ('self','manager') then 'visible'
      when count(*) >= v_n_min                       then 'visible'
      else                                                'hidden'
    end,
    now()
  from public.responses r
  join public.assignments  a  on a.id  = r.assignment_id
  join public.questions    q  on q.id  = r.question_id
  left join public.competencies co on co.id = q.competency_id
  where a.cycle_id  = p_cycle_id
    and a.status    = 'completed'
    and r.score     is not null
  group by
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code;

  get diagnostics v_snapshot_count = row_count;

  -- ── score_distribution — count por valor numérico ────────────────
  with dist as (
    select
      a.evaluated_cycle_participant_id,
      q.competency_id,
      a.relationship_code,
      jsonb_object_agg(bucket::text, cnt) as distribution
    from (
      select
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int as bucket,
        count(*)::int as cnt
      from public.responses   r2
      join public.assignments a2 on a2.id = r2.assignment_id
      join public.questions   q2 on q2.id = r2.question_id
      where a2.cycle_id = p_cycle_id
        and a2.status   = 'completed'
        and r2.score    is not null
      group by
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int
    ) sub
    group by
      evaluated_cycle_participant_id,
      competency_id,
      relationship_code
  )
  update public.score_snapshots ss
  set score_distribution = dist.distribution
  from dist
  where ss.cycle_id            = p_cycle_id
    and ss.cycle_participant_id = dist.evaluated_cycle_participant_id
    and ss.competency_id        is not distinct from dist.competency_id
    and ss.relationship_code    = dist.relationship_code;

  -- ── Profiles ─────────────────────────────────────────────────────
  insert into public.participant_result_profiles (
    tenant_id, cycle_id, cycle_participant_id,
    overall_score, self_score, manager_score, peer_score, subordinate_score,
    blind_spot_count, hidden_strength_count, report_json, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    cp.id,
    round(avg(case when ss.visibility_status = 'visible'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'self'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'manager'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'peer'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'subordinate'
                   then ss.score_avg end)::numeric, 4),
    0, 0,
    jsonb_build_object('computed_at', now()::text),
    now()
  from public.cycle_participants cp
  left join public.score_snapshots ss
    on ss.cycle_participant_id = cp.id
   and ss.cycle_id = p_cycle_id
  where cp.cycle_id = p_cycle_id
    and exists (
      select 1 from public.assignments a
      where a.cycle_id = p_cycle_id
        and a.evaluated_cycle_participant_id = cp.id
        and a.status = 'completed'
    )
  group by cp.id;

  get diagnostics v_profile_count = row_count;

  -- ── Blind spot / hidden strength ──────────────────────────────────
  with self_by_comp as (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  = 'self'
      and visibility_status  = 'visible'
      and competency_id      is not null
  ),
  others_by_comp as (
    select cycle_participant_id, competency_id,
           avg(score_avg)::numeric as others_avg
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  <> 'self'
      and visibility_status   = 'visible'
      and competency_id       is not null
    group by cycle_participant_id, competency_id
  ),
  gaps as (
    select s.cycle_participant_id,
           count(*) filter (
             where s.self_score - o.others_avg >= v_blind_threshold
           ) as blind_count,
           count(*) filter (
             where o.others_avg - s.self_score >= v_blind_threshold
           ) as hidden_count
    from self_by_comp s
    join others_by_comp o
      on o.cycle_participant_id = s.cycle_participant_id
     and o.competency_id        = s.competency_id
    group by s.cycle_participant_id
  )
  update public.participant_result_profiles prp
     set blind_spot_count      = coalesce(g.blind_count,  0),
         hidden_strength_count = coalesce(g.hidden_count, 0)
    from gaps g
   where prp.cycle_id             = p_cycle_id
     and prp.cycle_participant_id = g.cycle_participant_id;

  return jsonb_build_object(
    'cycle_id',       p_cycle_id,
    'snapshot_count', v_snapshot_count,
    'profile_count',  v_profile_count,
    'n_minimum_used', v_n_min,
    'computed_at',    now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

-- ── 3. app.get_my_report — inclui score_distribution nos snapshots ───

create or replace function app.get_my_report(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_status     text;
  v_release_at timestamptz;
  v_cp_id      uuid;
  v_profile    jsonb;
  v_snapshots  jsonb;
begin
  select c.tenant_id, c.status, c.report_release_at
    into v_tenant_id, v_status, v_release_at
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  if not app.is_admin_or_owner() then
    if v_release_at is null or v_release_at > now() then
      raise exception 'report_not_released' using errcode = 'P0015';
    end if;
  end if;

  select cp.id into v_cp_id
  from public.cycle_participants cp
  join public.people p on p.id = cp.person_id
  join public.users  u on u.id = p.user_id
  where cp.cycle_id    = p_cycle_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_cp_id is null then
    raise exception 'participant_not_found' using errcode = 'P0016';
  end if;

  select jsonb_build_object(
    'overall_score',         prp.overall_score,
    'self_score',            prp.self_score,
    'manager_score',         prp.manager_score,
    'peer_score',            prp.peer_score,
    'subordinate_score',     prp.subordinate_score,
    'blind_spot_count',      prp.blind_spot_count,
    'hidden_strength_count', prp.hidden_strength_count,
    'generated_at',          prp.generated_at::text
  )
  into v_profile
  from public.participant_result_profiles prp
  where prp.cycle_participant_id = v_cp_id
    and prp.cycle_id             = p_cycle_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'relationship_code',  ss.relationship_code,
      'competency_id',      ss.competency_id,
      'dimension_code',     ss.dimension_code,
      'score_avg',          ss.score_avg,
      'response_count',     ss.response_count,
      'score_distribution', ss.score_distribution
    ) order by ss.relationship_code, ss.dimension_code
  ), '[]'::jsonb)
  into v_snapshots
  from public.score_snapshots ss
  where ss.cycle_participant_id = v_cp_id
    and ss.cycle_id             = p_cycle_id
    and ss.visibility_status    = 'visible';

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'id',     p_cycle_id,
      'name',   (select name from public.cycles where id = p_cycle_id),
      'status', v_status
    ),
    'profile',   v_profile,
    'snapshots', v_snapshots
  );
end$$;

grant execute on function app.get_my_report(uuid) to authenticated;

-- ── 4. public.get_participant_report — inclui score_distribution ─────

create or replace function public.get_participant_report(
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
  v_status    text;
  v_profile   jsonb;
  v_snapshots jsonb;
  v_person    jsonb;
begin
  select c.tenant_id, c.status
    into v_tenant_id, v_status
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  if not exists (
    select 1 from public.cycle_participants cp
    where cp.id = p_cp_id and cp.cycle_id = p_cycle_id
  ) then
    raise exception 'participant_not_found' using errcode = 'P0016';
  end if;

  select jsonb_build_object('name', pe.name)
    into v_person
    from public.cycle_participants cp
    join public.people pe on pe.id = cp.person_id
   where cp.id = p_cp_id;

  select jsonb_build_object(
    'overall_score',         prp.overall_score,
    'self_score',            prp.self_score,
    'manager_score',         prp.manager_score,
    'peer_score',            prp.peer_score,
    'subordinate_score',     prp.subordinate_score,
    'blind_spot_count',      prp.blind_spot_count,
    'hidden_strength_count', prp.hidden_strength_count,
    'generated_at',          prp.generated_at::text
  )
    into v_profile
    from public.participant_result_profiles prp
   where prp.cycle_participant_id = p_cp_id
     and prp.cycle_id             = p_cycle_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'relationship_code',  ss.relationship_code,
      'competency_id',      ss.competency_id,
      'dimension_code',     ss.dimension_code,
      'score_avg',          ss.score_avg,
      'response_count',     ss.response_count,
      'score_distribution', ss.score_distribution
    ) order by ss.relationship_code, ss.dimension_code
  ), '[]'::jsonb)
    into v_snapshots
    from public.score_snapshots ss
   where ss.cycle_participant_id = p_cp_id
     and ss.cycle_id             = p_cycle_id
     and ss.visibility_status    = 'visible';

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'id',     p_cycle_id,
      'name',   (select name from public.cycles where id = p_cycle_id),
      'status', v_status
    ),
    'person',    v_person,
    'profile',   v_profile,
    'snapshots', v_snapshots
  );
end
$$;

grant execute on function public.get_participant_report(uuid, uuid) to authenticated;

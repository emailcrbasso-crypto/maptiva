-- =====================================================================
-- 0070_consultant_notes.sql
--
-- "Leitura do consultor" — campo de texto livre, editável pelo
-- admin/owner do tenant, anexado ao relatório individual. Combina a
-- automação (scores, favorabilidade, gaps) com o julgamento
-- profissional de quem conduz a devolutiva.
--
-- Mudanças:
--   1. participant_result_profiles ganha consultant_notes (text)
--   2. app.update_consultant_notes(cycle_id, cp_id, notes) — único
--      caminho de escrita (a tabela é INSERT/UPDATE só via
--      service_role por RLS — igual todo o resto do módulo)
--   3. get_my_report / get_participant_report passam a incluir
--      consultant_notes no jsonb de profile
-- =====================================================================

-- ── 1. Schema ────────────────────────────────────────────────────────

alter table public.participant_result_profiles
  add column if not exists consultant_notes text;

-- ── 2. RPC de escrita ────────────────────────────────────────────────

create or replace function app.update_consultant_notes(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_notes    text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select c.tenant_id into v_tenant_id
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

  update public.participant_result_profiles
     set consultant_notes = nullif(trim(p_notes), '')
   where cycle_id             = p_cycle_id
     and cycle_participant_id = p_cp_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0017';
  end if;
end$$;

grant execute on function app.update_consultant_notes(uuid, uuid, text) to authenticated;

create or replace function public.update_consultant_notes(p_cycle_id uuid, p_cp_id uuid, p_notes text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin perform app.update_consultant_notes(p_cycle_id, p_cp_id, p_notes); end$$;

grant execute on function public.update_consultant_notes(uuid, uuid, text) to authenticated;

-- ── 3. Inclui consultant_notes nos RPCs de leitura ──────────────────

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
    'consultant_notes',      prp.consultant_notes,
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

  select jsonb_build_object('id', pe.id, 'name', pe.name)
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
    'consultant_notes',      prp.consultant_notes,
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

-- =====================================================================
-- 0108_my_report_person_info.sql
--
-- MyReportPage vai passar a gerar também a versão "participant" do
-- Relatório Executivo (marca do tenant, sem o Guia para a devolutiva).
-- Para isso precisa do cp_id (para chamar get_participant_reliability,
-- get_cycle_benchmark_overall, get_participant_demographic_breakdown e
-- as duas funções de favorabilidade detalhada — todas já aceitam
-- participante autenticado, não só admin) e de cargo/área (mesmo dado
-- que o relatório executivo do admin já mostra). get_my_report não
-- expunha nenhum dos dois — adiciona ambos ao payload.
-- =====================================================================

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
  v_person_id  uuid;
  v_person     jsonb;
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

  select cp.id, p.id into v_cp_id, v_person_id
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
    'id',         pe.id,
    'name',       pe.name,
    'job_title',  pe.job_title,
    'department', pe.department
  )
  into v_person
  from public.people pe
  where pe.id = v_person_id;

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
    'cp_id',     v_cp_id,
    'person',    v_person,
    'profile',   v_profile,
    'snapshots', v_snapshots
  );
end$$;

grant execute on function app.get_my_report(uuid) to authenticated;

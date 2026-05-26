-- 0049_get_participant_report.sql
--
-- RPC para administradores visualizarem o relatório individual de qualquer
-- participante de um ciclo — mesmo layout do get_my_report, mas sem gate de
-- liberação e acessível somente a admin/owner do tenant.

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
  -- Localiza o ciclo
  select c.tenant_id, c.status
    into v_tenant_id, v_status
    from public.cycles c
   where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Somente admin/owner do tenant correto
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Verifica que o participante pertence a este ciclo
  if not exists (
    select 1 from public.cycle_participants cp
     where cp.id = p_cp_id and cp.cycle_id = p_cycle_id
  ) then
    raise exception 'participant_not_found' using errcode = 'P0016';
  end if;

  -- Nome da pessoa
  select jsonb_build_object('name', pe.name)
    into v_person
    from public.cycle_participants cp
    join public.people pe on pe.id = cp.person_id
   where cp.id = p_cp_id;

  -- Profile consolidado (pode ser null se ciclo ainda não foi pontuado)
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

  -- Snapshots visíveis (admin vê todos os visíveis, mesmo regra do participante)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'relationship_code', ss.relationship_code,
      'competency_id',     ss.competency_id,
      'dimension_code',    ss.dimension_code,
      'score_avg',         ss.score_avg,
      'response_count',    ss.response_count
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

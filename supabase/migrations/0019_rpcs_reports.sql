-- =====================================================================
-- 0019_rpcs_reports.sql
-- RPCs de relatórios e exportação analítica.
--
-- app.release_reports(cycle_id):
--   - Owner/admin libera relatórios para participantes.
--   - Seta report_release_at = now() no ciclo.
--   - Idempotente: re-chamar retorna sem erro.
--   - Errcodes: P0010 cycle_not_found, P0011 not_authorized,
--     P0014 cycle_not_closed.
--
-- app.get_my_report(cycle_id):
--   - Participante lê seu próprio resultado consolidado.
--   - Requer relatório liberado (ou caller é admin/owner).
--   - Retorna profile + snapshots visíveis + metadados do ciclo.
--   - Errcodes: P0010 cycle_not_found, P0011 not_authorized,
--     P0015 report_not_released, P0016 participant_not_found.
--
-- app.get_cycle_summary(cycle_id):
--   - Admin/owner lê todos os profiles do ciclo.
--   - Inclui nome do participante, scores e blind spots.
--   - Errcodes: P0010 cycle_not_found, P0011 not_authorized.
--
-- app.export_cycle_json(cycle_id):
--   - Owner/admin gera payload JSON completo (profiles + snapshots).
--   - Grava em integration_exports (target_system='maptiva_grid').
--   - Retorna payload + export_id.
--   - Errcodes: P0010 cycle_not_found, P0011 not_authorized.
-- =====================================================================

-- ---------- release_reports ----------
create or replace function app.release_reports(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_status     text;
  v_release_at timestamptz;
begin
  select c.tenant_id, c.status, c.report_release_at
    into v_tenant_id, v_status, v_release_at
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Autorização: admin ou owner do tenant correto.
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Relatórios só podem ser liberados para ciclos fechados.
  if v_status <> 'closed' then
    raise exception 'cycle_not_closed' using errcode = 'P0014';
  end if;

  -- Idempotente: já liberado → retorna sem erro.
  if v_release_at is not null then
    return jsonb_build_object(
      'cycle_id',       p_cycle_id,
      'released_at',    v_release_at::text,
      'already_released', true
    );
  end if;

  update public.cycles
     set report_release_at = now()
   where id = p_cycle_id;

  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'cycles', p_cycle_id, 'reports_released',
    jsonb_build_object('released_at', now()::text)
  );

  return jsonb_build_object(
    'cycle_id',       p_cycle_id,
    'released_at',    now()::text,
    'already_released', false
  );
end$$;

grant execute on function app.release_reports(uuid) to authenticated;

-- ---------- get_my_report ----------
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

  -- Tenant membership obrigatório.
  if app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Gate de liberação: participantes e managers precisam do release;
  -- admin/owner podem ver mesmo antes da liberação formal.
  if not app.is_admin_or_owner() then
    if v_release_at is null or v_release_at > now() then
      raise exception 'report_not_released' using errcode = 'P0015';
    end if;
  end if;

  -- Localiza o cycle_participant do usuário logado neste ciclo.
  select cp.id into v_cp_id
  from public.cycle_participants cp
  join public.people p on p.id = cp.person_id
  join public.users  u on u.id = p.user_id
  where cp.cycle_id  = p_cycle_id
    and u.auth_user_id = auth.uid()
  limit 1;

  if v_cp_id is null then
    raise exception 'participant_not_found' using errcode = 'P0016';
  end if;

  -- Profile consolidado (pode ser nulo se ciclo ainda não foi pontuado).
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
    and prp.cycle_id = p_cycle_id;

  -- Snapshots visíveis (filtramos explicitamente; hidden nunca exposto).
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
  where ss.cycle_participant_id = v_cp_id
    and ss.cycle_id             = p_cycle_id
    and ss.visibility_status    = 'visible';

  return jsonb_build_object(
    'cycle', jsonb_build_object(
      'id',     p_cycle_id,
      'name',   (select name   from public.cycles where id = p_cycle_id),
      'status', v_status
    ),
    'profile',   v_profile,
    'snapshots', v_snapshots
  );
end$$;

grant execute on function app.get_my_report(uuid) to authenticated;

-- ---------- get_cycle_summary ----------
create or replace function app.get_cycle_summary(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_result    jsonb;
begin
  select c.tenant_id into v_tenant_id
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Admin/owner only.
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  select jsonb_build_object(
    'cycle_id',         p_cycle_id,
    'cycle_name',       c.name,
    'status',           c.status,
    'report_release_at', c.report_release_at::text,
    'total_assignments',    (
      select count(*) from public.assignments a where a.cycle_id = p_cycle_id
    ),
    'completed_assignments', (
      select count(*) from public.assignments a
       where a.cycle_id = p_cycle_id and a.status = 'completed'
    ),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cycle_participant_id',  cp.id,
          'person_name',           pe.name,
          'has_profile',           (prp.cycle_participant_id is not null),
          'overall_score',         prp.overall_score,
          'self_score',            prp.self_score,
          'manager_score',         prp.manager_score,
          'peer_score',            prp.peer_score,
          'subordinate_score',     prp.subordinate_score,
          'blind_spot_count',      prp.blind_spot_count,
          'hidden_strength_count', prp.hidden_strength_count
        ) order by pe.name
      )
      from public.cycle_participants cp
      join public.people pe on pe.id = cp.person_id
      left join public.participant_result_profiles prp
        on prp.cycle_participant_id = cp.id
       and prp.cycle_id = p_cycle_id
      where cp.cycle_id = p_cycle_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.cycles c
  where c.id = p_cycle_id;

  return v_result;
end$$;

grant execute on function app.get_cycle_summary(uuid) to authenticated;

-- ---------- export_cycle_json ----------
create or replace function app.export_cycle_json(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_payload   jsonb;
  v_export_id uuid;
begin
  select c.tenant_id into v_tenant_id
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- Admin/owner only.
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Monta payload versionado.
  select jsonb_build_object(
    'schema_version', 'v1',
    'exported_at',    now()::text,
    'cycle', jsonb_build_object(
      'id',                c.id,
      'name',              c.name,
      'status',            c.status,
      'start_at',          c.start_at::text,
      'deadline_at',       c.deadline_at::text,
      'report_release_at', c.report_release_at::text
    ),
    'profiles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cycle_participant_id',  prp.cycle_participant_id,
          'person_name',           pe.name,
          'overall_score',         prp.overall_score,
          'self_score',            prp.self_score,
          'manager_score',         prp.manager_score,
          'peer_score',            prp.peer_score,
          'subordinate_score',     prp.subordinate_score,
          'blind_spot_count',      prp.blind_spot_count,
          'hidden_strength_count', prp.hidden_strength_count,
          'generated_at',          prp.generated_at::text
        ) order by pe.name
      )
      from public.participant_result_profiles prp
      join public.cycle_participants cp on cp.id = prp.cycle_participant_id
      join public.people pe             on pe.id = cp.person_id
      where prp.cycle_id = p_cycle_id
    ), '[]'::jsonb),
    'snapshots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cycle_participant_id', ss.cycle_participant_id,
          'competency_id',        ss.competency_id,
          'dimension_code',       ss.dimension_code,
          'relationship_code',    ss.relationship_code,
          'score_avg',            ss.score_avg,
          'response_count',       ss.response_count,
          'visibility_status',    ss.visibility_status
        ) order by ss.cycle_participant_id, ss.relationship_code
      )
      from public.score_snapshots ss
      where ss.cycle_id = p_cycle_id
    ), '[]'::jsonb)
  )
  into v_payload
  from public.cycles c
  where c.id = p_cycle_id;

  -- Grava em integration_exports.
  insert into public.integration_exports
    (tenant_id, cycle_id, export_type, target_system,
     schema_version, status, payload_json, generated_at)
  values
    (v_tenant_id, p_cycle_id, 'cycle_analytics', 'maptiva_grid',
     'v1', 'processed', v_payload, now())
  returning id into v_export_id;

  -- Audit.
  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'cycles', p_cycle_id, 'cycle_exported',
    jsonb_build_object(
      'export_id',     v_export_id,
      'target_system', 'maptiva_grid'
    )
  );

  return v_payload || jsonb_build_object('export_id', v_export_id);
end$$;

grant execute on function app.export_cycle_json(uuid) to authenticated;

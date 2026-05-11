-- =====================================================================
-- 18_cycle_summary_export.sql
-- get_cycle_summary e export_cycle_json: permissões e conteúdo.
--
-- Usa ffff0001 (com 3 cycle_participants, 1 profile, 1 snapshot visible).
-- Usa ffff0003 (fechado no test 14, com scores reais computados).
-- =====================================================================

\echo '== Test 18: get_cycle_summary + export_cycle_json =='

-- ---------------------------------------------------------------------
-- get_cycle_summary: manager bloqueado → P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
begin
  begin
    perform app.get_cycle_summary('ffff0001-0000-0000-0000-000000000001');
    raise exception 'FAIL: manager conseguiu get_cycle_summary';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('get_cycle_summary: manager blocked (P0011)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- export_cycle_json: participant bloqueado → P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.export_cycle_json('ffff0001-0000-0000-0000-000000000001');
    raise exception 'FAIL: participant conseguiu export_cycle_json';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('export_cycle_json: participant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: get_cycle_summary de ffff0001
-- 3 cycle_participants: 1a1a0001(participant), 1a1a0002(subord), 1a1a0003(other)
-- 1 profile (1a1a0001 com overall=4.1)
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
declare
  v_result      jsonb;
  v_parts       jsonb;
  v_part_count  int;
  v_total_assn  int;
  v_comp_assn   int;
begin
  v_result := app.get_cycle_summary('ffff0001-0000-0000-0000-000000000001');
  perform app_test.assert_raises('get_cycle_summary: owner success on ffff0001');

  if (v_result->>'cycle_id') <> 'ffff0001-0000-0000-0000-000000000001' then
    raise exception 'FAIL: cycle_id errado: %', v_result->>'cycle_id';
  end if;
  perform app_test.assert_raises('get_cycle_summary: cycle_id correto');

  v_parts := v_result->'participants';
  v_part_count := jsonb_array_length(v_parts);
  perform app_test.assert_count(
    'get_cycle_summary: 3 participants em ffff0001', 3, v_part_count);

  -- 3 assignments originais + 3 do bloco 11-13 = 6 total em ffff0001
  v_total_assn := (v_result->>'total_assignments')::int;
  perform app_test.assert_count(
    'get_cycle_summary: total_assignments = 6', 6, v_total_assn);

  -- 3 do setup (a55a0001/0002/0003) + 2 completados pelos tests 12-13
  -- (a55a0012 via TOKEN_SINGLE e a55a0010 via TOKEN_VALID) = 5 total.
  v_comp_assn := (v_result->>'completed_assignments')::int;
  perform app_test.assert_count(
    'get_cycle_summary: completed_assignments = 5', 5, v_comp_assn);
end$$;

-- ---------------------------------------------------------------------
-- Owner: get_cycle_summary de ffff0003 (com profiles computados)
-- ---------------------------------------------------------------------
do $$
declare
  v_result    jsonb;
  v_has_prof  boolean;
  v_overall   numeric;
begin
  v_result := app.get_cycle_summary('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_raises('get_cycle_summary: owner success on ffff0003');

  -- ffff0003 teve compute_scores rodado no test 14 → deve ter >=1 profile
  v_has_prof := exists (
    select 1 from jsonb_array_elements(v_result->'participants') p
     where (p->>'has_profile')::boolean
  );
  if not v_has_prof then
    raise exception 'FAIL: nenhum participant com profile em ffff0003';
  end if;
  perform app_test.assert_raises('get_cycle_summary: at least 1 participant has profile in ffff0003');
end$$;

-- ---------------------------------------------------------------------
-- Owner: ciclo inexistente → P0010
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.get_cycle_summary('00000000-dead-beef-0000-000000000000');
    raise exception 'FAIL: get_cycle_summary aceitou cycle inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('get_cycle_summary: cycle_not_found (P0010)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- export_cycle_json: ffff0003 (com dados reais de compute_scores)
-- ---------------------------------------------------------------------
do $$
declare
  v_result      jsonb;
  v_export_id   text;
  v_profiles    jsonb;
  v_snapshots   jsonb;
  v_export_count int;
begin
  v_result := app.export_cycle_json('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_raises('export_cycle_json: owner success on ffff0003');

  -- Verifica campos obrigatórios
  if v_result->>'schema_version' <> 'v1' then
    raise exception 'FAIL: schema_version errada: %', v_result->>'schema_version';
  end if;
  perform app_test.assert_raises('export_cycle_json: schema_version=v1');

  v_export_id := v_result->>'export_id';
  if v_export_id is null then
    raise exception 'FAIL: export_id ausente no resultado';
  end if;
  perform app_test.assert_raises('export_cycle_json: export_id presente');

  -- Verifica que foi gravado em integration_exports
  select count(*) into v_export_count
    from public.integration_exports
   where cycle_id = 'ffff0003-0000-0000-0000-000000000003'
     and target_system = 'maptiva_grid'
     and status = 'processed';
  perform app_test.assert_count(
    'export_cycle_json: 1 row em integration_exports', 1, v_export_count);

  -- Verifica que profiles e snapshots estão presentes
  v_profiles  := v_result->'profiles';
  v_snapshots := v_result->'snapshots';

  if jsonb_array_length(v_profiles) < 1 then
    raise exception 'FAIL: nenhum profile no export (esperado >=1)';
  end if;
  perform app_test.assert_raises('export_cycle_json: >=1 profile no payload');

  -- O export inclui snapshots hidden (é export admin completo)
  if jsonb_array_length(v_snapshots) < 1 then
    raise exception 'FAIL: nenhum snapshot no export (esperado >=1)';
  end if;
  perform app_test.assert_raises('export_cycle_json: >=1 snapshot no payload (inclui hidden)');

  -- Audit: test 16 gerou 2 audits em ffff0003; export adiciona mais 1 → 3
  perform app_test.assert_count(
    'audit_log: 3 rows em ffff0003 após export',
    3,
    app_test.count_audit('ffff0003-0000-0000-0000-000000000003')
  );
end$$;

-- ---------------------------------------------------------------------
-- Cross-tenant: owner_a não exporta ciclo de tenant_b
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.export_cycle_json('ffff00b3-0000-0000-0000-0000000000b3');
    raise exception 'FAIL: owner_a exportou ciclo de tenant_b';
  exception when sqlstate 'P0010' then
    -- ffff00b3 não existe mais (deletado no test 15) → P0010 também é correto
    perform app_test.assert_raises('export_cycle_json: cross-tenant cycle not found (P0010)');
  when sqlstate 'P0011' then
    perform app_test.assert_raises('export_cycle_json: cross-tenant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

\echo 'Test 18 OK'

-- =====================================================================
-- 16_release_reports.sql
-- release_reports: bloqueia manager/participant (P0011), requer
-- ciclo fechado (P0014), libera com sucesso e é idempotente.
-- Usa ffff0003 que foi fechado pelo test 14.
-- =====================================================================

\echo '== Test 16: release_reports =='

-- ---------------------------------------------------------------------
-- Manager: P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
begin
  begin
    perform app.release_reports('ffff0003-0000-0000-0000-000000000003');
    raise exception 'FAIL: manager conseguiu release_reports';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('release_reports: manager blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Participant: P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.release_reports('ffff0003-0000-0000-0000-000000000003');
    raise exception 'FAIL: participant conseguiu release_reports';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('release_reports: participant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: ciclo ativo (ffff0002) → P0014
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform app.release_reports('ffff0002-0000-0000-0000-000000000002');
    raise exception 'FAIL: owner liberou relatório de ciclo ativo';
  exception when sqlstate 'P0014' then
    perform app_test.assert_raises('release_reports: active cycle blocked (P0014)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: ciclo inexistente → P0010
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.release_reports('00000000-dead-beef-0000-000000000000');
    raise exception 'FAIL: release_reports aceitou cycle inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('release_reports: cycle_not_found (P0010)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: libera ffff0003 (fechado pelo test 14) com sucesso
-- ---------------------------------------------------------------------
do $$
declare
  v_result      jsonb;
  v_release_at  text;
  v_audit_count int;
begin
  v_result := app.release_reports('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_raises('release_reports: owner released successfully');

  if (v_result->>'already_released')::boolean then
    raise exception 'FAIL: already_released deveria ser false na primeira chamada';
  end if;
  perform app_test.assert_raises('release_reports: already_released=false on first call');

  v_release_at := (
    select report_release_at::text from public.cycles
     where id = 'ffff0003-0000-0000-0000-000000000003'
  );
  if v_release_at is null then
    raise exception 'FAIL: report_release_at não foi setado';
  end if;
  perform app_test.assert_raises('release_reports: report_release_at set on cycle');

  v_audit_count := app_test.count_audit('ffff0003-0000-0000-0000-000000000003');
  -- test 14 gerou 1 audit (cycle_closed); agora devemos ter 2
  perform app_test.assert_count('audit_log: 2 rows after release', 2, v_audit_count);
end$$;

-- ---------------------------------------------------------------------
-- Owner: re-liberar → idempotente (already_released=true, sem erro)
-- ---------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := app.release_reports('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_raises('release_reports: re-release is idempotent');

  if not (v_result->>'already_released')::boolean then
    raise exception 'FAIL: already_released deveria ser true na segunda chamada';
  end if;
  perform app_test.assert_raises('release_reports: already_released=true on second call');
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Cross-tenant: owner_a não libera ciclo de tenant_b
-- ---------------------------------------------------------------------
insert into public.cycles
  (id, tenant_id, template_id, name, status, start_at, deadline_at)
values
  ('ffff00c0-0000-0000-0000-0000000000c0',
   '22222222-2222-2222-2222-222222222222',
   'b1111111-0000-0000-0000-000000000001',
   'Tenant B Cycle for Test 16',
   'closed',
   now() - interval '10 days',
   now() - interval '1 day')
on conflict (id) do nothing;

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform app.release_reports('ffff00c0-0000-0000-0000-0000000000c0');
    raise exception 'FAIL: owner_a liberou relatório de tenant_b';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('release_reports: cross-tenant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

delete from public.cycles where id = 'ffff00c0-0000-0000-0000-0000000000c0';

\echo 'Test 16 OK'

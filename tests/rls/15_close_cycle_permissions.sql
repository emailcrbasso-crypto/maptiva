-- =====================================================================
-- 15_close_cycle_permissions.sql
-- close_cycle: bloqueia manager/participant (P0011) e re-fechamento (P0012).
-- Usa ciclo fresh para não depender do estado da suíte anterior.
-- =====================================================================

\echo '== Test 15: close_cycle permissions =='

-- ---------------------------------------------------------------------
-- Criar ciclo fresh para este teste
-- ---------------------------------------------------------------------
insert into public.cycles
  (id, tenant_id, template_id, name, status, start_at, deadline_at)
values
  (
    'ffff0050-0000-0000-0000-000000000050',
    '11111111-1111-1111-1111-111111111111',
    'eeee0001-0000-0000-0000-000000000001',
    'Fresh Test 15 Cycle',
    'active',
    now() - interval '1 day',
    now() + interval '5 days'
  )
on conflict (id) do update
set status = excluded.status,
    start_at = excluded.start_at,
    deadline_at = excluded.deadline_at,
    template_id = excluded.template_id,
    tenant_id = excluded.tenant_id,
    name = excluded.name;

-- ---------------------------------------------------------------------
-- Manager: P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
begin
  begin
    perform app.close_cycle('ffff0050-0000-0000-0000-000000000050');
    raise exception 'FAIL: manager conseguiu close_cycle';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('close_cycle: manager blocked (P0011)');
  end;

  begin
    perform app.compute_scores('ffff0050-0000-0000-0000-000000000050');
    raise exception 'FAIL: manager conseguiu compute_scores';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('compute_scores: manager blocked (P0011)');
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
    perform app.close_cycle('ffff0050-0000-0000-0000-000000000050');
    raise exception 'FAIL: participant conseguiu close_cycle';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('close_cycle: participant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: fecha com sucesso
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
declare
  v_result jsonb;
  v_status text;
  v_audit_count int;
begin
  v_result := app.close_cycle('ffff0050-0000-0000-0000-000000000050');
  perform app_test.assert_raises('close_cycle: owner closed cycle successfully');

  v_status := (select status from public.cycles where id = 'ffff0050-0000-0000-0000-000000000050');
  perform app_test.assert_count('cycle.status set to closed', 1, case when v_status = 'closed' then 1 else 0 end);

  v_audit_count := app_test.count_audit('ffff0050-0000-0000-0000-000000000050');
  perform app_test.assert_count('audit_log: 1 row after successful close', 1, v_audit_count);
end$$;

-- ---------------------------------------------------------------------
-- Owner: re-fechar = P0012
-- ---------------------------------------------------------------------
do $$
declare
  v_audit_count int;
begin
  begin
    perform app.close_cycle('ffff0050-0000-0000-0000-000000000050');
    raise exception 'FAIL: owner conseguiu re-fechar ciclo já fechado';
  exception when sqlstate 'P0012' then
    perform app_test.assert_raises('close_cycle: already_closed (P0012)');
  end;

  v_audit_count := app_test.count_audit('ffff0050-0000-0000-0000-000000000050');
  perform app_test.assert_count('audit_log: still 1 row after rejected re-close', 1, v_audit_count);
end$$;

-- ---------------------------------------------------------------------
-- P0010: cycle inexistente
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.close_cycle('00000000-1111-2222-3333-444444444444');
    raise exception 'FAIL: close_cycle aceitou cycle_id inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('close_cycle: cycle_not_found (P0010)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Cross-tenant: owner_a não fecha ciclo do tenant_b
-- ---------------------------------------------------------------------
insert into public.cycles
  (id, tenant_id, template_id, name, status, start_at, deadline_at)
values
  (
    'ffff00b3-0000-0000-0000-0000000000b3',
    '22222222-2222-2222-2222-222222222222',
    'b1111111-0000-0000-0000-000000000001',
    'Tenant B Cycle',
    'active',
    now() - interval '1 day',
    now() + interval '5 days'
  )
on conflict (id) do nothing;

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform app.close_cycle('ffff00b3-0000-0000-0000-0000000000b3');
    raise exception 'FAIL: owner_a fechou ciclo de tenant_b';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('close_cycle: cross-tenant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

delete from public.cycles
where id = 'ffff00b3-0000-0000-0000-0000000000b3';

delete from public.cycles
where id = 'ffff0050-0000-0000-0000-000000000050';

\echo 'Test 15 OK'
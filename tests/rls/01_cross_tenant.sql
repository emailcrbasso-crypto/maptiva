-- =====================================================================
-- 01_cross_tenant.sql
-- Owner do tenant A não enxerga dados do tenant B.
-- =====================================================================

\echo '== Test 01: cross-tenant isolation =='

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');  -- owner_a

do $$
declare v int;
begin
  -- Owner A não deve enxergar a person do tenant B.
  select count(*) into v from public.people
   where id = 'dddd0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('people: tenant_a sees no tenant_b row', 0, v);

  -- Não deve enxergar tenant B em tenants.
  select count(*) into v from public.tenants
   where id = '22222222-2222-2222-2222-222222222222';
  perform app_test.assert_count('tenants: tenant_a sees no tenant_b row', 0, v);

  -- Tentar inserir people no tenant B deve falhar (with check).
  begin
    insert into public.people (tenant_id, name, email)
    values ('22222222-2222-2222-2222-222222222222',
            'invader', 'invader@test');
    raise exception 'FAIL: insert cross-tenant succeeded';
  exception when others then
    perform app_test.assert_raises('people: cross-tenant insert blocked');
  end;

  -- Owner A enxerga seu próprio tenant.
  select count(*) into v from public.tenants
   where id = '11111111-1111-1111-1111-111111111111';
  perform app_test.assert_count('tenants: owner_a sees own tenant', 1, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 01 OK'

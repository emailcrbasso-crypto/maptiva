-- =====================================================================
-- 09_responses_admin_raw.sql
-- Responses cruas: SELECT direto sempre bloqueado (privilégio revogado).
-- =====================================================================

\echo '== Test 09: responses raw access =='

-- Owner
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform 1 from public.responses limit 1;
    raise exception 'FAIL: owner has SELECT on public.responses';
  exception when insufficient_privilege then
    perform app_test.assert_raises('responses: direct SELECT blocked for owner');
  end;
end$$;

select app_test.logout();
reset role;

-- Manager
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
begin
  begin
    perform 1 from public.responses limit 1;
    raise exception 'FAIL: manager has SELECT on public.responses';
  exception when insufficient_privilege then
    perform app_test.assert_raises('responses: direct SELECT blocked for manager');
  end;
end$$;

select app_test.logout();
reset role;

-- Mesmo com allow_admin_raw_read=true, o GRANT continua revogado para
-- authenticated. A leitura excepcional só pode ocorrer via service_role
-- (RPC dedicada com audit_log). Validar:
do $$
declare v int;
begin
  -- como postgres/superuser, ler diretamente para confirmar que dado existe.
  -- 2 do setup original (assn1, assn2) + 6 do ffff0003 (assn b0001-b0006).
  -- Tests 11-14 ainda não rodaram (ordem alfabética).
  select count(*) into v from public.responses;
  perform app_test.assert_count('responses: rows exist (read by postgres)', 8, v);
end$$;

\echo 'Test 09 OK'

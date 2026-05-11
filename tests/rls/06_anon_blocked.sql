-- =====================================================================
-- 06_anon_blocked.sql
-- anon (sem JWT) não tem nenhum acesso a tabelas/views.
-- =====================================================================

\echo '== Test 06: anon blocked =='

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

do $$
declare v int;
begin
  -- Cada uma destas tentativas deve falhar com insufficient_privilege.
  begin
    perform 1 from public.assignments limit 1;
    raise exception 'FAIL: anon read public.assignments';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on assignments');
  end;

  begin
    perform 1 from public.responses limit 1;
    raise exception 'FAIL: anon read public.responses';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on responses');
  end;

  begin
    perform 1 from public.comments limit 1;
    raise exception 'FAIL: anon read public.comments';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on comments');
  end;

  begin
    perform 1 from public.people limit 1;
    raise exception 'FAIL: anon read public.people';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on people');
  end;

  -- Views também devem ser inacessíveis: 0 linhas, mas a query não deve crashar
  -- por falta de privilégio. Na prática, revogamos all em schema public para anon,
  -- então mesmo views devem dar insufficient_privilege.
  begin
    perform 1 from public.assignments_safe limit 1;
    raise exception 'FAIL: anon read assignments_safe';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on assignments_safe');
  end;

  begin
    perform 1 from public.comments_published limit 1;
    raise exception 'FAIL: anon read comments_published';
  exception when insufficient_privilege then
    perform app_test.assert_raises('anon blocked on comments_published');
  end;
end$$;

reset role;
\echo 'Test 06 OK'

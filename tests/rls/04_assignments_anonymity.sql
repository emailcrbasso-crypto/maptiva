-- =====================================================================
-- 04_assignments_anonymity.sql
-- Manager/participant não acessam colunas sensíveis de assignments.
-- =====================================================================

\echo '== Test 04: assignments anonymity =='

-- ---------- Manager ----------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');  -- manager_a

do $$
declare v int;
begin
  -- SELECT direto na base deve falhar (privilégio revogado).
  begin
    perform 1 from public.assignments limit 1;
    raise exception 'FAIL: manager has SELECT on public.assignments';
  exception
    when insufficient_privilege then
      perform app_test.assert_raises('assignments: manager has no direct SELECT');
    when others then
      perform app_test.assert_raises('assignments: manager direct SELECT blocked');
  end;

  -- Mesmo via view safe, manager não pode projetar evaluator nem token_hash:
  -- a view simplesmente não tem essas colunas. Confirmamos lendo schema.
  select count(*) into v from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'assignments_safe'
     and column_name in ('evaluator_cycle_participant_id','magic_token_hash');
  perform app_test.assert_count('assignments_safe: no sensitive columns', 0, v);

  -- Manager vê assignments dos seus subordinados:
  --   assn1, assn2 (originais avaliando participant/subord)
  --   + 6 do ffff0003 (todos avaliando cp_target = participant_a)
  -- = 8 rows.
  select count(*) into v from public.assignments_safe;
  perform app_test.assert_count('assignments_safe: manager sees scoped rows only', 8, v);

  select count(*) into v from public.assignments_safe
   where id = 'a55a0003-0000-0000-0000-000000000003';
  perform app_test.assert_count('assignments_safe: manager does not see other-evaluated', 0, v);

  -- Manager não acessa view admin (is_admin_or_owner falha -> 0 linhas).
  select count(*) into v from public.assignments_admin;
  perform app_test.assert_count('assignments_admin: manager sees nothing', 0, v);
end$$;

select app_test.logout();
reset role;

-- ---------- Owner ----------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');  -- owner_a

do $$
declare v int;
begin
  -- Via assignments_admin: vê tudo + colunas sensíveis.
  -- 3 originais + 3 RPC (a55a0010-12) + 6 do ffff0003 (a55b0001-6) = 12.
  select count(*) into v from public.assignments_admin;
  perform app_test.assert_count('assignments_admin: owner sees all', 12, v);

  -- A view tem as colunas sensíveis (apenas owner/admin acessa).
  select count(*) into v from information_schema.columns
   where table_schema = 'public' and table_name = 'assignments_admin'
     and column_name = 'magic_token_hash';
  perform app_test.assert_count('assignments_admin: includes magic_token_hash', 1, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 04 OK'

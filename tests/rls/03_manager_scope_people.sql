-- =====================================================================
-- 03_manager_scope_people.sql
-- Manager vê apenas pessoas sob seu escopo + a si mesmo.
-- =====================================================================

\echo '== Test 03: manager scope on people =='

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');  -- manager_a

do $$
declare v int;
begin
  -- Manager vê: a si mesmo (cccc0001), participant (cccc0002), subord (cccc0003).
  -- NÃO vê: other (cccc0004), nem tenant_b.
  select count(*) into v from public.people;
  perform app_test.assert_count('people: manager sees self+subordinates only', 3, v);

  -- Especificamente NÃO vê person_other.
  select count(*) into v from public.people
   where id = 'cccc0004-0000-0000-0000-000000000004';
  perform app_test.assert_count('people: manager does not see unmanaged person', 0, v);

  -- Especificamente vê subord.
  select count(*) into v from public.people
   where id = 'cccc0003-0000-0000-0000-000000000003';
  perform app_test.assert_count('people: manager sees subord', 1, v);

  -- Manager NÃO pode inserir people (only admin/owner)
  begin
    insert into public.people (tenant_id, name, email)
    values ('11111111-1111-1111-1111-111111111111',
            'manager-created', 'mgr-created@test');
    raise exception 'FAIL: manager insert succeeded';
  exception when others then
    perform app_test.assert_raises('people: manager cannot insert');
  end;
end$$;

select app_test.logout();
reset role;
\echo 'Test 03 OK'

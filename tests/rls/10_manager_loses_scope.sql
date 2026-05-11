-- =====================================================================
-- 10_manager_loses_scope.sql
-- Manager perde acesso imediatamente após manager_person_id ser realocado.
-- =====================================================================

\echo '== Test 10: manager loses scope on reassignment =='

-- Estado inicial: manager_a vê person_subord (cccc0003).
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
declare v int;
begin
  select count(*) into v from public.people
   where id = 'cccc0003-0000-0000-0000-000000000003';
  perform app_test.assert_count('people: manager initially sees subord', 1, v);

  select count(*) into v from public.assignments_safe
   where evaluated_cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('assignments_safe: manager sees subord assignment', 1, v);
end$$;

select app_test.logout();
reset role;

-- Owner remove vínculo: subord deixa de ter manager.
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

update public.people
   set manager_person_id = null
 where id = 'cccc0003-0000-0000-0000-000000000003';

select app_test.logout();
reset role;

-- Manager perde acesso imediatamente.
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
declare v int;
begin
  select count(*) into v from public.people
   where id = 'cccc0003-0000-0000-0000-000000000003';
  perform app_test.assert_count('people: manager loses access after reassignment', 0, v);

  select count(*) into v from public.assignments_safe
   where evaluated_cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('assignments_safe: manager loses scoped row', 0, v);

  -- snapshot/profile do subord também ficam invisíveis (não que estivessem visíveis,
  -- mas garantimos que não há vazamento residual).
  select count(*) into v from public.score_snapshots
   where cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('snapshot: manager loses access', 0, v);
end$$;

select app_test.logout();
reset role;

-- Restaurar vínculo para não contaminar reruns (00_setup já trataria, mas seguro).
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');
update public.people
   set manager_person_id = 'cccc0001-0000-0000-0000-000000000001'
 where id = 'cccc0003-0000-0000-0000-000000000003';
select app_test.logout();
reset role;

\echo 'Test 10 OK'

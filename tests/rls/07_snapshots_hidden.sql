-- =====================================================================
-- 07_snapshots_hidden.sql
-- score_snapshots com visibility_status='hidden' invisíveis a todos.
-- =====================================================================

\echo '== Test 07: snapshots hidden =='

-- Owner: vê visible, NÃO vê hidden.
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');  -- owner_a

do $$
declare v int;
begin
  -- Snapshot hidden do subord NÃO aparece nem para owner.
  select count(*) into v from public.score_snapshots
   where cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002'
     and visibility_status = 'hidden';
  perform app_test.assert_count('snapshot: hidden invisible to owner', 0, v);

  -- Snapshot visible do participant aparece.
  select count(*) into v from public.score_snapshots
   where cycle_participant_id = '1a1a0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('snapshot: visible row reachable to owner', 1, v);
end$$;

select app_test.logout();
reset role;

-- Manager idem.
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');  -- manager_a

do $$
declare v int;
begin
  -- Manager vê snapshot do participant (escopo).
  select count(*) into v from public.score_snapshots
   where cycle_participant_id = '1a1a0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('snapshot: manager sees scoped visible', 1, v);

  -- Não vê hidden mesmo do subord.
  select count(*) into v from public.score_snapshots
   where cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('snapshot: manager does not see hidden subord', 0, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 07 OK'

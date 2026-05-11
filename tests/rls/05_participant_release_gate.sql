-- =====================================================================
-- 05_participant_release_gate.sql
-- Participant não vê profile antes de cycles.report_release_at.
-- =====================================================================

\echo '== Test 05: participant release gate =='

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');  -- participant_a

do $$
declare v int;
begin
  -- Cycle released (passado): participant vê seu profile.
  select count(*) into v from public.participant_result_profiles
   where cycle_id = 'ffff0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('profile: participant sees released cycle', 1, v);

  -- Cycle locked (release no futuro): participant NÃO vê.
  select count(*) into v from public.participant_result_profiles
   where cycle_id = 'ffff0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('profile: participant blocked before release', 0, v);

  -- score_snapshots: idem
  select count(*) into v from public.score_snapshots
   where cycle_id = 'ffff0001-0000-0000-0000-000000000001'
     and cycle_participant_id = '1a1a0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('snapshot: participant sees own released', 1, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 05 OK'

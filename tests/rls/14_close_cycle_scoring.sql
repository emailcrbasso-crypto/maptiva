-- =====================================================================
-- 14_close_cycle_scoring.sql
-- close_cycle: muda status, dispara compute_scores, registra audit_log.
-- Valida visibility_status por relação (n_minimum) e cálculo de scores
-- + blind_spot_count.
--
-- Importante: RLS de score_snapshots oculta visibility_status='hidden'
-- mesmo para owner. Por isso usamos app_test.* helpers (security definer)
-- para inspecionar o estado real do banco.
-- =====================================================================

\echo '== Test 14: close_cycle + scoring =='

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');  -- owner_a

do $$
declare
  v_count int;
  v_result jsonb;
  v_status text;
  v_snap record;
begin
  -- Estado inicial.
  select status into v_status from public.cycles
   where id = 'ffff0003-0000-0000-0000-000000000003';
  if v_status <> 'active' then
    raise exception 'FAIL: precondition cycle.status should be active, got %', v_status;
  end if;
  perform app_test.assert_raises('precondition: cycle is active');

  v_count := app_test.count_snapshots_total('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('precondition: zero snapshots before close', 0, v_count);

  v_count := app_test.count_profiles_total('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('precondition: zero profiles before close', 0, v_count);

  v_count := app_test.count_audit('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('precondition: zero audit rows before close', 0, v_count);

  -- 1) close_cycle como owner.
  v_result := app.close_cycle('ffff0003-0000-0000-0000-000000000003');
  if (v_result->>'status') <> 'closed' then
    raise exception 'FAIL: close_cycle returned status=%', v_result->>'status';
  end if;
  perform app_test.assert_raises('close_cycle: returned status=closed');

  -- 2) Cycle agora 'closed'.
  select status into v_status from public.cycles
   where id = 'ffff0003-0000-0000-0000-000000000003';
  if v_status <> 'closed' then
    raise exception 'FAIL: cycle.status not updated';
  end if;
  perform app_test.assert_raises('cycle.status set to closed');

  -- 3) Snapshots: 4 grupos (self, manager, peer, subordinate).
  v_count := app_test.count_snapshots_total('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('snapshots: 4 created (incluindo hidden)', 4, v_count);

  -- 4) Visibilidade por relação:
  --    self/manager sempre visible (mesmo com count=1)
  --    peer com count=3 = visible
  --    subordinate com count=1 < n_min=3 = hidden
  select * into v_snap from app_test.snapshot_state(
    'ffff0003-0000-0000-0000-000000000003', 'self');
  if v_snap.visibility_status <> 'visible' or v_snap.score_avg <> 5
     or v_snap.response_count <> 1 then
    raise exception 'FAIL: self snapshot wrong: vis=% avg=% count=%',
      v_snap.visibility_status, v_snap.score_avg, v_snap.response_count;
  end if;
  perform app_test.assert_raises('snapshot self: visible, score=5, count=1');

  select * into v_snap from app_test.snapshot_state(
    'ffff0003-0000-0000-0000-000000000003', 'manager');
  if v_snap.visibility_status <> 'visible' or v_snap.score_avg <> 4
     or v_snap.response_count <> 1 then
    raise exception 'FAIL: manager snapshot wrong: vis=% avg=% count=%',
      v_snap.visibility_status, v_snap.score_avg, v_snap.response_count;
  end if;
  perform app_test.assert_raises('snapshot manager: visible, score=4, count=1');

  select * into v_snap from app_test.snapshot_state(
    'ffff0003-0000-0000-0000-000000000003', 'peer');
  if v_snap.visibility_status <> 'visible' or v_snap.response_count <> 3
     or abs(v_snap.score_avg - 3.6667) > 0.01 then
    raise exception 'FAIL: peer snapshot wrong: vis=% avg=% count=%',
      v_snap.visibility_status, v_snap.score_avg, v_snap.response_count;
  end if;
  perform app_test.assert_raises(
    'snapshot peer: visible, score≈3.67, count=3 atinge n_min');

  select * into v_snap from app_test.snapshot_state(
    'ffff0003-0000-0000-0000-000000000003', 'subordinate');
  if v_snap.visibility_status <> 'hidden' or v_snap.response_count <> 1 then
    raise exception 'FAIL: subordinate snapshot wrong: vis=% count=%',
      v_snap.visibility_status, v_snap.response_count;
  end if;
  perform app_test.assert_raises(
    'snapshot subordinate: hidden, count=1 < n_min');

  -- Confirma que o owner via RLS NÃO vê o snapshot hidden:
  --   3 visíveis (self, manager, peer), o subordinate não aparece.
  select count(*) into v_count from public.score_snapshots
   where cycle_id = 'ffff0003-0000-0000-0000-000000000003';
  perform app_test.assert_count(
    'RLS check: owner sees 3 visible snapshots (hidden filtered)', 3, v_count);

  -- 5) Profile: 1 row para cp_target.
  v_count := app_test.count_profiles_total(
    'ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('profiles: 1 created', 1, v_count);

  -- 6) Profile fields:
  --    self_score=5, manager_score=4, peer_score≈3.67,
  --    subordinate_score=NULL (hidden snapshot é excluído).
  --    overall_score = avg(visíveis) = (5+4+3.6667)/3 ≈ 4.2222
  --    blind_spot: self(5) - others_avg = 5 - avg(4, 3.6667) = 5 - 3.83 = 1.17 ≥ 1.0 → 1
  declare
    v_prof record;
  begin
    select * into v_prof from app_test.profile_state(
      'ffff0003-0000-0000-0000-000000000003');

    if v_prof.self_score <> 5 then
      raise exception 'FAIL: self_score expected 5, got %', v_prof.self_score;
    end if;
    if v_prof.manager_score <> 4 then
      raise exception 'FAIL: manager_score expected 4, got %', v_prof.manager_score;
    end if;
    if abs(v_prof.peer_score - 3.6667) > 0.01 then
      raise exception 'FAIL: peer_score expected ~3.67, got %', v_prof.peer_score;
    end if;
    if v_prof.subordinate_score is not null then
      raise exception 'FAIL: subordinate_score expected NULL (hidden), got %',
        v_prof.subordinate_score;
    end if;
    if abs(v_prof.overall_score - 4.2222) > 0.01 then
      raise exception 'FAIL: overall_score expected ~4.22, got %', v_prof.overall_score;
    end if;
    if v_prof.blind_spot_count <> 1 then
      raise exception 'FAIL: blind_spot_count expected 1, got %', v_prof.blind_spot_count;
    end if;
    if v_prof.hidden_strength_count <> 0 then
      raise exception 'FAIL: hidden_strength_count expected 0, got %', v_prof.hidden_strength_count;
    end if;
    perform app_test.assert_raises('profile fields: self/mgr/peer/sub/overall/blind correctos');
  end;

  -- 7) Audit log: 1 entrada cycle_closed.
  v_count := app_test.count_audit('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count('audit_log: 1 row for cycle_closed', 1, v_count);

  select count(*) into v_count from public.audit_log
   where entity_id = 'ffff0003-0000-0000-0000-000000000003'
     and action    = 'cycle_closed';
  perform app_test.assert_count('audit_log: action=cycle_closed', 1, v_count);

  -- 8) Idempotência de compute_scores: rodar de novo não duplica.
  perform app.compute_scores('ffff0003-0000-0000-0000-000000000003');

  v_count := app_test.count_snapshots_total('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count(
    'compute_scores idempotent: still 4 snapshots after recompute', 4, v_count);

  v_count := app_test.count_profiles_total('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_count(
    'compute_scores idempotent: still 1 profile after recompute', 1, v_count);
end$$;

select app_test.logout();
reset role;
\echo 'Test 14 OK'

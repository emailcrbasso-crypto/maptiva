-- =====================================================================
-- 17_get_my_report.sql
-- get_my_report: gate de liberação, conteúdo correto, bloqueios.
--
-- Fixtures relevantes do setup:
--   ffff0001 → released (report_release_at = now()-1day), closed
--   ffff0002 → locked   (report_release_at = now()+7days), active
--   participant_a (a4) → cp 1a1a0001 em ffff0001 com profile(4.1)
--                        + snapshot peer visible(4.2)
--   participant_a (a4) → cp 1a1a0011 em ffff0002 (sem score; release futuro)
-- =====================================================================

\echo '== Test 17: get_my_report =='

-- ---------------------------------------------------------------------
-- Participant: ciclo sem release ainda → P0015
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.get_my_report('ffff0002-0000-0000-0000-000000000002');
    raise exception 'FAIL: participant leu relatório de ciclo não liberado';
  exception when sqlstate 'P0015' then
    perform app_test.assert_raises('get_my_report: report_not_released (P0015)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Participant: ciclo released → sucesso com dados corretos
-- ---------------------------------------------------------------------
do $$
declare
  v_result    jsonb;
  v_profile   jsonb;
  v_snapshots jsonb;
  v_score     numeric;
begin
  v_result    := app.get_my_report('ffff0001-0000-0000-0000-000000000001');
  perform app_test.assert_raises('get_my_report: participant reads released cycle');

  -- Verifica estrutura
  if v_result->>'cycle' is null then
    raise exception 'FAIL: campo cycle ausente no resultado';
  end if;
  if (v_result->'cycle'->>'id') <> 'ffff0001-0000-0000-0000-000000000001' then
    raise exception 'FAIL: cycle.id errado: %', v_result->'cycle'->>'id';
  end if;
  perform app_test.assert_raises('get_my_report: cycle.id correto');

  -- Verifica profile
  v_profile := v_result->'profile';
  if v_profile is null then
    raise exception 'FAIL: profile ausente no resultado';
  end if;
  v_score := (v_profile->>'overall_score')::numeric;
  if abs(v_score - 4.1) > 0.01 then
    raise exception 'FAIL: overall_score esperado 4.1, recebido %', v_score;
  end if;
  perform app_test.assert_raises('get_my_report: profile.overall_score=4.1 correto');

  -- Verifica snapshots
  v_snapshots := v_result->'snapshots';
  if jsonb_array_length(v_snapshots) < 1 then
    raise exception 'FAIL: esperado >=1 snapshot visível, recebido %',
      jsonb_array_length(v_snapshots);
  end if;
  perform app_test.assert_raises('get_my_report: >=1 snapshot visível retornado');

  -- Confirma que snapshot hidden (subord/peer de 1a1a0002) não veio
  -- (participant_a só tem 1a1a0001, então não veria o hidden de 1a1a0002 de qualquer forma)
  -- O snapshot peer de 1a1a0001 tem score_avg=4.2
  v_score := (v_snapshots->0->>'score_avg')::numeric;
  if abs(v_score - 4.2) > 0.01 then
    raise exception 'FAIL: snapshot score_avg esperado 4.2, recebido %', v_score;
  end if;
  perform app_test.assert_raises('get_my_report: snapshot peer score_avg=4.2 correto');
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: pode ler mesmo com release no futuro (ffff0002)
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
declare
  v_result jsonb;
begin
  -- owner_a não tem person vinculado em cycle_participants → P0016
  -- (owner não precisa ser avaliado para fechar/liberar o ciclo,
  --  mas para ler "meu relatório" precisa de cp)
  begin
    perform app.get_my_report('ffff0002-0000-0000-0000-000000000002');
    raise exception 'FAIL: owner sem cp conseguiu get_my_report';
  exception when sqlstate 'P0016' then
    perform app_test.assert_raises('get_my_report: owner sem cp → P0016');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Participant: ciclo inexistente → P0010
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.get_my_report('00000000-dead-beef-0000-000000000000');
    raise exception 'FAIL: get_my_report aceitou cycle inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('get_my_report: cycle_not_found (P0010)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Participant: ffff0003 (liberado no test 16) — participant_a é o
-- target (1c1c0001), então deve conseguir ler o próprio report.
-- O profile tem os scores computados pelo test 14.
-- ---------------------------------------------------------------------
do $$
declare
  v_result  jsonb;
  v_profile jsonb;
begin
  v_result := app.get_my_report('ffff0003-0000-0000-0000-000000000003');
  perform app_test.assert_raises('get_my_report: participant reads ffff0003 after release');

  v_profile := v_result->'profile';
  if v_profile is null then
    raise exception 'FAIL: profile ausente em ffff0003';
  end if;
  -- Test 14 calculou: overall ≈ 4.2222 (média de self=5, mgr=4, peer≈3.67)
  if abs((v_profile->>'overall_score')::numeric - 4.2222) > 0.01 then
    raise exception 'FAIL: overall_score esperado ~4.22, recebido %',
      v_profile->>'overall_score';
  end if;
  perform app_test.assert_raises('get_my_report: ffff0003 overall_score≈4.22 correto');
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- P0016: ciclo released mas participant_a não é cp
-- Cria ciclo fresh (ffff0051) sem participants.
-- ---------------------------------------------------------------------
insert into public.cycles
  (id, tenant_id, template_id, name, status, start_at, deadline_at,
   report_release_at)
values
  ('ffff0051-0000-0000-0000-000000000051',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Empty Cycle Test 17', 'closed',
   now() - interval '5 days', now() - interval '1 day',
   now() - interval '1 hour')
on conflict (id) do update
  set status = excluded.status,
      report_release_at = excluded.report_release_at;

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.get_my_report('ffff0051-0000-0000-0000-000000000051');
    raise exception 'FAIL: participant leu relatório de ciclo onde não é cp';
  exception when sqlstate 'P0016' then
    perform app_test.assert_raises('get_my_report: participant_not_found (P0016)');
  end;
end$$;

select app_test.logout();
reset role;

delete from public.cycles where id = 'ffff0051-0000-0000-0000-000000000051';

\echo 'Test 17 OK'

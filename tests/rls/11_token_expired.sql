-- =====================================================================
-- 11_token_expired.sql
-- submit_response com token expirado deve falhar com errcode P0004
-- e não gravar nada em responses, comments ou audit_log.
-- =====================================================================

\echo '== Test 11: token expired =='

-- Roda como anon (fluxo público de magic link).
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

do $$
declare
  v_responses_before  int;
  v_comments_before   int;
  v_audit_before      int;
  v_responses_after   int;
  v_comments_after    int;
  v_audit_after       int;
begin
  -- Snapshot de contagens antes da chamada (via helpers security definer).
  v_responses_before := app_test.count_responses('a55a0011-0000-0000-0000-000000000011');
  v_comments_before  := app_test.count_comments('a55a0011-0000-0000-0000-000000000011');
  v_audit_before     := app_test.count_audit('a55a0011-0000-0000-0000-000000000011');

  -- 1) get_assignment_context com token expirado deve falhar P0004.
  begin
    perform app.get_assignment_context('TEST_TOKEN_EXPIRED_A_001');
    raise exception 'FAIL: get_assignment_context aceitou token expirado';
  exception when sqlstate 'P0004' then
    perform app_test.assert_raises('get_assignment_context: token_expired (P0004)');
  end;

  -- 2) submit_response com token expirado deve falhar P0004.
  begin
    perform app.submit_response(
      'TEST_TOKEN_EXPIRED_A_001',
      jsonb_build_array(
        jsonb_build_object(
          'question_id', 'eeee0004-0000-0000-0000-000000000004',
          'score', 4
        )
      ),
      '[]'::jsonb
    );
    raise exception 'FAIL: submit_response aceitou token expirado';
  exception when sqlstate 'P0004' then
    perform app_test.assert_raises('submit_response: token_expired (P0004)');
  end;

  -- 3) Nenhuma escrita deve ter ocorrido.
  v_responses_after := app_test.count_responses('a55a0011-0000-0000-0000-000000000011');
  v_comments_after  := app_test.count_comments('a55a0011-0000-0000-0000-000000000011');
  v_audit_after     := app_test.count_audit('a55a0011-0000-0000-0000-000000000011');

  perform app_test.assert_count(
    'responses: nothing written for expired token',
    v_responses_before, v_responses_after);
  perform app_test.assert_count(
    'comments: nothing written for expired token',
    v_comments_before, v_comments_after);
  perform app_test.assert_count(
    'audit_log: nothing written for expired token',
    v_audit_before, v_audit_after);
end$$;

reset role;
\echo 'Test 11 OK'

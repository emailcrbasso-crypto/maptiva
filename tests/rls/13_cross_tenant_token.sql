-- =====================================================================
-- 13_cross_tenant_token.sql
-- Cross-tenant via token forjado: caller tem um token VÁLIDO de tenant A,
-- mas tenta gravar respostas referenciando question_id de tenant B.
-- A RPC deve rejeitar com P0005 (invalid_question_for_assignment),
-- não gravar nada e não consumir o token (ainda dá pra usar legitimamente).
-- =====================================================================

\echo '== Test 13: cross-tenant via forged question_id =='

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

do $$
declare
  v_responses_before  int;
  v_audit_before      int;
  v_state_before      record;
  v_responses_after   int;
  v_audit_after       int;
  v_state_after       record;
  v_result            jsonb;
begin
  -- Estado inicial via helpers.
  v_responses_before := app_test.count_responses('a55a0010-0000-0000-0000-000000000010');
  v_audit_before     := app_test.count_audit('a55a0010-0000-0000-0000-000000000010');
  select * into v_state_before
    from app_test.assignment_state('a55a0010-0000-0000-0000-000000000010');

  -- 1) Forja: token válido de tenant A + question_id de tenant B.
  begin
    perform app.submit_response(
      'TEST_TOKEN_VALID_A_001',
      jsonb_build_array(
        jsonb_build_object(
          'question_id', 'b1111111-0000-0000-0000-000000000004',  -- tenant B!
          'score', 5
        )
      ),
      '[]'::jsonb
    );
    raise exception 'FAIL: submit aceitou question_id cross-tenant';
  exception when sqlstate 'P0005' then
    perform app_test.assert_raises('submit_response: invalid_question_for_assignment (P0005)');
  end;

  -- 2) Forja com mistura: 1 question válida + 1 forjada.
  -- A RPC deve rejeitar a transação inteira (sem gravação parcial).
  begin
    perform app.submit_response(
      'TEST_TOKEN_VALID_A_001',
      jsonb_build_array(
        jsonb_build_object(
          'question_id', 'eeee0004-0000-0000-0000-000000000004',  -- tenant A, válida
          'score', 4
        ),
        jsonb_build_object(
          'question_id', 'b1111111-0000-0000-0000-000000000004',  -- tenant B, forjada
          'score', 4
        )
      ),
      '[]'::jsonb
    );
    raise exception 'FAIL: submit aceitou batch contendo question_id forjado';
  exception when sqlstate 'P0005' then
    perform app_test.assert_raises('submit_response: rejects entire batch on forged item');
  end;

  -- 3) Estado final = estado inicial (rollback total).
  v_responses_after := app_test.count_responses('a55a0010-0000-0000-0000-000000000010');
  v_audit_after     := app_test.count_audit('a55a0010-0000-0000-0000-000000000010');
  select * into v_state_after
    from app_test.assignment_state('a55a0010-0000-0000-0000-000000000010');

  perform app_test.assert_count(
    'responses: no rows written across forged attempts',
    v_responses_before, v_responses_after);
  perform app_test.assert_count(
    'audit_log: no audit entry for rejected attempts',
    v_audit_before, v_audit_after);

  if v_state_after.status <> v_state_before.status then
    raise exception 'FAIL: assignment.status changed (was % now %)',
      v_state_before.status, v_state_after.status;
  end if;
  if v_state_after.used_at is distinct from v_state_before.used_at then
    raise exception 'FAIL: assignment.used_at changed despite rejection';
  end if;
  perform app_test.assert_raises('assignment: status & used_at unchanged');

  -- 4) Token continua válido para uso legítimo.
  v_result := app.submit_response(
    'TEST_TOKEN_VALID_A_001',
    jsonb_build_array(
      jsonb_build_object(
        'question_id', 'eeee0004-0000-0000-0000-000000000004',
        'score', 3
      )
    ),
    '[]'::jsonb
  );
  if not (v_result->>'ok')::boolean then
    raise exception 'FAIL: legitimate submit failed after forged attempts';
  end if;
  perform app_test.assert_raises(
    'submit_response: legitimate use still works after rejected forgeries');

  v_responses_after := app_test.count_responses('a55a0010-0000-0000-0000-000000000010');
  perform app_test.assert_count(
    'responses: 1 row after legitimate submit', 1, v_responses_after);
end$$;

reset role;
\echo 'Test 13 OK'

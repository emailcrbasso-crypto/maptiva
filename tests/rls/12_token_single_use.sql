-- =====================================================================
-- 12_token_single_use.sql
-- 1ª chamada de submit_response sucede; 2ª chamada com o mesmo token
-- deve falhar com P0002 (token_already_used).
-- get_assignment_context após uso também deve falhar com P0002.
-- =====================================================================

\echo '== Test 12: token single-use =='

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

do $$
declare
  v_result jsonb;
  v_count int;
  v_state record;
  v_score numeric;
begin
  -- 1) get_assignment_context devolve contexto válido.
  v_result := app.get_assignment_context('TEST_TOKEN_SINGLE_A_001');
  if (v_result->>'assignment_id')::uuid <> 'a55a0012-0000-0000-0000-000000000012' then
    raise exception 'FAIL: get_assignment_context returned wrong assignment';
  end if;
  if jsonb_array_length(v_result->'questions') < 1 then
    raise exception 'FAIL: get_assignment_context returned no questions';
  end if;
  perform app_test.assert_raises('get_assignment_context: returned valid context');

  -- 2) Primeira submissão deve suceder.
  v_result := app.submit_response(
    'TEST_TOKEN_SINGLE_A_001',
    jsonb_build_array(
      jsonb_build_object(
        'question_id', 'eeee0004-0000-0000-0000-000000000004',
        'score', 5
      )
    ),
    jsonb_build_array(
      jsonb_build_object('body', 'comentário no fluxo single-use')
    )
  );
  if not (v_result->>'ok')::boolean then
    raise exception 'FAIL: first submit returned ok=false';
  end if;
  perform app_test.assert_raises('submit_response: first call succeeded');

  -- 3) Persistência conferida (via helpers security definer).
  v_count := app_test.count_responses('a55a0012-0000-0000-0000-000000000012');
  perform app_test.assert_count('responses: 1 row after first submit', 1, v_count);

  v_count := app_test.count_comments('a55a0012-0000-0000-0000-000000000012');
  perform app_test.assert_count('comments: 1 row after first submit', 1, v_count);

  select * into v_state
    from app_test.assignment_state('a55a0012-0000-0000-0000-000000000012');
  if v_state.status <> 'completed' then
    raise exception 'FAIL: assignment status should be completed, got %', v_state.status;
  end if;
  if v_state.used_at is null then
    raise exception 'FAIL: assignment.used_at should be set';
  end if;
  perform app_test.assert_raises('assignment: marked completed + used_at set');

  -- 4) Segunda chamada deve falhar P0002.
  begin
    perform app.submit_response(
      'TEST_TOKEN_SINGLE_A_001',
      jsonb_build_array(
        jsonb_build_object(
          'question_id', 'eeee0004-0000-0000-0000-000000000004',
          'score', 1
        )
      ),
      '[]'::jsonb
    );
    raise exception 'FAIL: second submit succeeded';
  exception when sqlstate 'P0002' then
    perform app_test.assert_raises('submit_response: token_already_used (P0002)');
  end;

  -- 5) get_assignment_context após uso também rejeita.
  begin
    perform app.get_assignment_context('TEST_TOKEN_SINGLE_A_001');
    raise exception 'FAIL: get_assignment_context aceitou token usado';
  exception when sqlstate 'P0002' then
    perform app_test.assert_raises('get_assignment_context: token_already_used (P0002)');
  end;

  -- 6) Nenhuma row extra foi criada (segunda tentativa não escreveu nada).
  v_count := app_test.count_responses('a55a0012-0000-0000-0000-000000000012');
  perform app_test.assert_count('responses: still 1 after blocked retry', 1, v_count);

  -- 7) Score não foi sobrescrito (continua 5, não foi para 1).
  v_score := app_test.response_score(
    'a55a0012-0000-0000-0000-000000000012',
    'eeee0004-0000-0000-0000-000000000004'
  );
  if v_score <> 5 then
    raise exception 'FAIL: score should be 5, got %', v_score;
  end if;
  perform app_test.assert_raises('responses: original score preserved (5)');
end$$;

reset role;
\echo 'Test 12 OK'

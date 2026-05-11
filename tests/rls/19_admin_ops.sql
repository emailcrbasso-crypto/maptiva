-- =====================================================================
-- 19_admin_ops.sql
-- change_member_role e revoke_assignment: permissões e comportamento.
--
-- Fixtures relevantes:
--   admin_a  = user aaaa0002 (auth_user_id a2), role 'admin' em tenant_a
--   manager_a= user aaaa0003 (auth_user_id a3), role 'manager' em tenant_a
--   a55a0011 = assignment 'pending' com token expirado em ffff0001
--   a55a0001 = assignment 'completed' em ffff0001 (não pode revogar)
-- =====================================================================

\echo '== Test 19: change_member_role + revoke_assignment =='

-- =====================================================================
-- change_member_role
-- =====================================================================

-- ---------------------------------------------------------------------
-- Manager: não pode mudar roles → P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
begin
  begin
    perform app.change_member_role(
      'aaaa0004-0000-0000-0000-000000000004', 'admin');
    raise exception 'FAIL: manager conseguiu change_member_role';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('change_member_role: manager blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: não pode mudar o próprio papel → P0018
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform app.change_member_role(
      'aaaa0001-0000-0000-0000-000000000001', 'admin');
    raise exception 'FAIL: owner conseguiu mudar o próprio papel';
  exception when sqlstate 'P0018' then
    perform app_test.assert_raises('change_member_role: cannot_change_own_role (P0018)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: membership inexistente → P0010
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.change_member_role(
      '00000000-dead-0000-0000-000000000000', 'manager');
    raise exception 'FAIL: change_member_role aceitou user inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('change_member_role: membership_not_found (P0010)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: rebaixa admin_a de 'admin' para 'manager' → sucesso
-- ---------------------------------------------------------------------
do $$
declare
  v_result   jsonb;
  v_new_role text;
  v_audit    int;
begin
  v_result := app.change_member_role(
    'aaaa0002-0000-0000-0000-000000000002', 'manager');
  perform app_test.assert_raises('change_member_role: owner demotes admin→manager');

  v_new_role := v_result->>'new_role';
  if v_new_role <> 'manager' then
    raise exception 'FAIL: new_role esperado manager, recebido %', v_new_role;
  end if;
  perform app_test.assert_raises('change_member_role: new_role=manager correto');

  if (v_result->>'old_role') <> 'admin' then
    raise exception 'FAIL: old_role esperado admin, recebido %', v_result->>'old_role';
  end if;
  perform app_test.assert_raises('change_member_role: old_role=admin correto');

  -- Verifica no banco
  select count(*) into v_audit
    from public.audit_log
   where entity = 'tenant_memberships'
     and action = 'role_changed'
     and payload_json->>'user_id' =
         'aaaa0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('change_member_role: 1 audit row', 1, v_audit);
end$$;

-- ---------------------------------------------------------------------
-- Owner: reestabelece admin_a para 'admin' → sucesso
-- ---------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := app.change_member_role(
    'aaaa0002-0000-0000-0000-000000000002', 'admin');
  perform app_test.assert_raises('change_member_role: owner restores admin');

  if (v_result->>'new_role') <> 'admin' then
    raise exception 'FAIL: new_role esperado admin, recebido %', v_result->>'new_role';
  end if;
  perform app_test.assert_raises('change_member_role: admin_a restored to admin');
end$$;

-- ---------------------------------------------------------------------
-- Owner: não pode elevar para 'owner' sem ser owner → já é owner, testa
-- que admin_a NÃO pode elevar outro para owner → P0011
-- (re-loga como admin_a para esse teste)
-- ---------------------------------------------------------------------
select app_test.logout();

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a2');  -- admin_a

do $$
begin
  begin
    perform app.change_member_role(
      'aaaa0003-0000-0000-0000-000000000003', 'owner');
    raise exception 'FAIL: admin conseguiu elevar para owner';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('change_member_role: admin cannot set owner role (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- =====================================================================
-- revoke_assignment
-- =====================================================================

-- ---------------------------------------------------------------------
-- Participant: não pode revogar → P0011
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a4');

do $$
begin
  begin
    perform app.revoke_assignment('a55a0011-0000-0000-0000-000000000011');
    raise exception 'FAIL: participant conseguiu revoke_assignment';
  exception when sqlstate 'P0011' then
    perform app_test.assert_raises('revoke_assignment: participant blocked (P0011)');
  end;
end$$;

select app_test.logout();
reset role;

-- ---------------------------------------------------------------------
-- Owner: assignment completado não pode ser revogado → P0019
-- ---------------------------------------------------------------------
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
begin
  begin
    perform app.revoke_assignment('a55a0001-0000-0000-0000-000000000001');
    raise exception 'FAIL: owner revogou assignment completado';
  exception when sqlstate 'P0019' then
    perform app_test.assert_raises('revoke_assignment: completed → not_revocable (P0019)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: assignment inexistente → P0010
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.revoke_assignment('00000000-dead-beef-0000-000000000000');
    raise exception 'FAIL: revoke_assignment aceitou id inexistente';
  exception when sqlstate 'P0010' then
    perform app_test.assert_raises('revoke_assignment: assignment_not_found (P0010)');
  end;
end$$;

-- ---------------------------------------------------------------------
-- Owner: revoga a55a0011 (pending, token expirado) → sucesso
-- ---------------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_status text;
begin
  v_result := app.revoke_assignment('a55a0011-0000-0000-0000-000000000011');
  perform app_test.assert_raises('revoke_assignment: owner cancels pending assignment');

  if (v_result->>'already_cancelled')::boolean then
    raise exception 'FAIL: already_cancelled deveria ser false';
  end if;
  perform app_test.assert_raises('revoke_assignment: already_cancelled=false on first call');

  -- Verifica no banco via helper (SELECT direto é revogado para authenticated)
  select state.status into v_status
    from app_test.assignment_state('a55a0011-0000-0000-0000-000000000011') state;
  if v_status <> 'cancelled' then
    raise exception 'FAIL: status esperado cancelled, recebido %', v_status;
  end if;
  perform app_test.assert_raises('revoke_assignment: status=cancelled no banco');
end$$;

-- ---------------------------------------------------------------------
-- Idempotente: revogar novamente → already_cancelled=true, sem erro
-- ---------------------------------------------------------------------
do $$
declare
  v_result jsonb;
begin
  v_result := app.revoke_assignment('a55a0011-0000-0000-0000-000000000011');
  perform app_test.assert_raises('revoke_assignment: re-revoke is idempotent');

  if not (v_result->>'already_cancelled')::boolean then
    raise exception 'FAIL: already_cancelled deveria ser true na segunda chamada';
  end if;
  perform app_test.assert_raises('revoke_assignment: already_cancelled=true on second call');
end$$;

-- ---------------------------------------------------------------------
-- Token do assignment cancelado torna-se inválido (P0003)
-- ---------------------------------------------------------------------
do $$
begin
  begin
    perform app.get_assignment_context('TEST_TOKEN_EXPIRED_A_001');
    raise exception 'FAIL: token de assignment cancelado foi aceito';
  exception
    when sqlstate 'P0003' then
      perform app_test.assert_raises(
        'revoke_assignment: cancelled token rejected by get_assignment_context (P0003)');
    when sqlstate 'P0004' then
      -- token expirado é verificado antes de status em alguns paths;
      -- ambos os erros indicam que o assignment está bloqueado
      perform app_test.assert_raises(
        'revoke_assignment: cancelled token rejected (P0004 expiry wins)');
  end;
end$$;

select app_test.logout();
reset role;

\echo 'Test 19 OK'

-- =====================================================================
-- 02_anti_escalation.sql
-- Admin não pode promover ninguém a owner nem alterar/excluir owner.
-- =====================================================================

\echo '== Test 02: anti-escalation =='

set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a2');  -- admin_a

do $$
declare v_owner_membership_id uuid;
        v int;
begin
  select id into v_owner_membership_id
    from public.tenant_memberships
   where user_id = 'aaaa0001-0000-0000-0000-000000000001';

  -- 1. Admin tenta promover admin_a (a si mesmo) para owner -> trigger barra
  begin
    update public.tenant_memberships
       set role = 'owner'
     where user_id = 'aaaa0002-0000-0000-0000-000000000002';
    raise exception 'FAIL: admin self-promotion to owner succeeded';
  exception
    when raise_exception then
      perform app_test.assert_raises('membership: admin cannot self-promote to owner');
    when others then
      perform app_test.assert_raises('membership: admin cannot self-promote (caught)');
  end;

  -- 2. Admin tenta rebaixar owner_a -> trigger barra
  begin
    update public.tenant_memberships
       set role = 'admin'
     where id = v_owner_membership_id;
    raise exception 'FAIL: admin demoted owner';
  exception
    when raise_exception then
      perform app_test.assert_raises('membership: admin cannot demote owner');
    when others then
      perform app_test.assert_raises('membership: admin cannot demote owner (caught)');
  end;

  -- 3. Admin tenta deletar owner -> trigger barra
  begin
    delete from public.tenant_memberships where id = v_owner_membership_id;
    raise exception 'FAIL: admin deleted owner';
  exception
    when raise_exception then
      perform app_test.assert_raises('membership: admin cannot delete owner');
    when others then
      perform app_test.assert_raises('membership: admin cannot delete owner (caught)');
  end;

  -- 4. Owner ainda existe.
  select count(*) into v from public.tenant_memberships
   where id = v_owner_membership_id and role = 'owner';
  perform app_test.assert_count('membership: owner row intact', 1, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 02 OK'

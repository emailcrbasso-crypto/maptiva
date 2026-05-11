-- =====================================================================
-- 08_comments_n_minimum.sql
-- comments_published só expõe comments cujo grupo atinge n_minimum.
-- =====================================================================

\echo '== Test 08: comments n-minimum =='

-- Owner via comments_published
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a1');

do $$
declare v int;
begin
  -- comment 1 (vinculado a assn1, snapshot visible com response_count=3) -> aparece
  select count(*) into v from public.comments_published
   where evaluated_cycle_participant_id = '1a1a0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('comments_published: published when n>=min', 1, v);

  -- comment 2 (vinculado a assn2, snapshot hidden com response_count=1) -> bloqueado
  select count(*) into v from public.comments_published
   where evaluated_cycle_participant_id = '1a1a0002-0000-0000-0000-000000000002';
  perform app_test.assert_count('comments_published: hidden when n<min', 0, v);

  -- A view nunca expõe assignment_id (anonimato).
  select count(*) into v from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'comments_published'
     and column_name  = 'assignment_id';
  perform app_test.assert_count('comments_published: assignment_id not exposed', 0, v);

  -- SELECT direto em comments deve falhar (privilégio revogado).
  begin
    perform 1 from public.comments limit 1;
    raise exception 'FAIL: owner has SELECT on public.comments';
  exception when insufficient_privilege then
    perform app_test.assert_raises('comments: direct SELECT blocked even for owner');
  end;
end$$;

select app_test.logout();
reset role;

-- Manager: vê só comments do seu escopo
set role authenticated;
select app_test.login('00000000-0000-0000-0000-0000000000a3');

do $$
declare v int;
begin
  select count(*) into v from public.comments_published
   where evaluated_cycle_participant_id = '1a1a0001-0000-0000-0000-000000000001';
  perform app_test.assert_count('comments_published: manager sees scoped', 1, v);
end$$;

select app_test.logout();
reset role;
\echo 'Test 08 OK'

-- =====================================================================
-- 00_setup.sql
-- Fixtures idempotentes para a suite de RLS.
-- Roda como postgres/superuser. Limpa antes de inserir.
-- =====================================================================

\echo '== RLS setup =='

-- ---------- helpers de impersonação (vivem em app_test, dropados em 99) ----------
create schema if not exists app_test;

create or replace function app_test.login(p_auth_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_auth_id::text, false);
  -- Inclui 'role' para que auth.role() retorne 'authenticated' dentro de
  -- funções SECURITY DEFINER, evitando o bypass de sessão postgres.
  perform set_config('request.jwt.claims',
                     json_build_object(
                       'sub',  p_auth_id::text,
                       'role', 'authenticated'
                     )::text,
                     false);
end$$;

create or replace function app_test.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end$$;

create or replace function app_test.assert_count(
  p_label text, p_expected int, p_actual int
) returns void language plpgsql as $$
begin
  if p_actual <> p_expected then
    raise exception 'FAIL [%]: expected % rows, got %',
      p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS [%]: % rows', p_label, p_actual;
end$$;

create or replace function app_test.assert_raises(p_label text)
returns void language plpgsql as $$
begin
  raise notice 'PASS [%]: expected exception was raised', p_label;
end$$;

-- ---------- helpers de leitura para tabelas com SELECT revogado ----------
-- Permitem que testes rodando como anon/authenticated leiam contagens
-- e estado de assignments/responses/comments/audit sem precisar de
-- privilégio direto (security definer roda como postgres).

create or replace function app_test.count_responses(p_assignment uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.responses where assignment_id = p_assignment
$$;

create or replace function app_test.count_comments(p_assignment uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.comments where assignment_id = p_assignment
$$;

create or replace function app_test.count_audit(p_entity_id uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.audit_log where entity_id = p_entity_id
$$;

create or replace function app_test.assignment_state(p_id uuid)
returns table(status text, used_at timestamptz)
language sql security definer set search_path = public as $$
  select a.status, a.used_at from public.assignments a where a.id = p_id
$$;

create or replace function app_test.response_score(p_assignment uuid, p_question uuid)
returns numeric language sql security definer set search_path = public as $$
  select score from public.responses
   where assignment_id = p_assignment and question_id = p_question
$$;

-- Score_snapshots têm filtro RLS visibility_status<>'hidden' até para owner.
-- Estes helpers permitem inspecionar o estado real (incluindo hidden).
create or replace function app_test.count_snapshots_total(p_cycle uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.score_snapshots where cycle_id = p_cycle
$$;

create or replace function app_test.count_profiles_total(p_cycle uuid)
returns int language sql security definer set search_path = public as $$
  select count(*)::int from public.participant_result_profiles where cycle_id = p_cycle
$$;

create or replace function app_test.snapshot_state(p_cycle uuid, p_rel text)
returns table(score_avg numeric, response_count int, visibility_status text)
language sql security definer set search_path = public as $$
  select s.score_avg, s.response_count, s.visibility_status
    from public.score_snapshots s
   where s.cycle_id = p_cycle and s.relationship_code = p_rel
$$;

create or replace function app_test.profile_state(p_cycle uuid)
returns table(
  overall_score numeric, self_score numeric, manager_score numeric,
  peer_score numeric, subordinate_score numeric,
  blind_spot_count int, hidden_strength_count int)
language sql security definer set search_path = public as $$
  select prp.overall_score, prp.self_score, prp.manager_score,
         prp.peer_score, prp.subordinate_score,
         prp.blind_spot_count, prp.hidden_strength_count
    from public.participant_result_profiles prp
   where prp.cycle_id = p_cycle
$$;

-- Permitir que authenticated/anon usem os helpers de teste.
grant usage on schema app_test to authenticated, anon;
grant execute on all functions in schema app_test to authenticated, anon;

-- ---------- limpeza de fixtures anteriores ----------
do $$
declare
  r record;
begin
  -- desabilitar trigger de anti-escalação durante limpeza de membership
  alter table public.tenant_memberships disable trigger memberships_anti_escalation;
end$$;

delete from public.audit_log                    where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.integration_exports          where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.participant_result_profiles  where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.score_snapshots              where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.comments                     where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.responses                    where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.assignments                  where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.cycle_participants           where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.cycles                       where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.questionnaire_questions      where questionnaire_id in
  (select q.id from public.questionnaires q
    join public.tenants t on t.id = q.tenant_id where t.slug like 'rls-%');
delete from public.questions                    where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.questionnaires               where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.competencies                 where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.template_relationship_rules  where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.templates                    where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.people                       where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.tenant_memberships           where tenant_id in
  (select id from public.tenants where slug like 'rls-%');
delete from public.tenants                      where slug like 'rls-%';
delete from public.users                        where email like 'rls_%@test';

alter table public.tenant_memberships enable trigger memberships_anti_escalation;

-- ---------- tenants ----------
insert into public.tenants (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'RLS Tenant A', 'rls-tenant-a'),
  ('22222222-2222-2222-2222-222222222222', 'RLS Tenant B', 'rls-tenant-b');

-- ---------- users (auth_user_id determinístico) ----------
insert into public.users (id, auth_user_id, email, name) values
  ('aaaa0001-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'rls_owner_a@test',       'Owner A'),
  ('aaaa0002-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000a2', 'rls_admin_a@test',       'Admin A'),
  ('aaaa0003-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-0000000000a3', 'rls_manager_a@test',     'Manager A'),
  ('aaaa0004-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-0000000000a4', 'rls_participant_a@test', 'Participant A'),
  ('bbbb0001-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', 'rls_owner_b@test',       'Owner B');

-- ---------- memberships ----------
insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('11111111-1111-1111-1111-111111111111',
   'aaaa0001-0000-0000-0000-000000000001', 'owner',       'active'),
  ('11111111-1111-1111-1111-111111111111',
   'aaaa0002-0000-0000-0000-000000000002', 'admin',       'active'),
  ('11111111-1111-1111-1111-111111111111',
   'aaaa0003-0000-0000-0000-000000000003', 'manager',     'active'),
  ('11111111-1111-1111-1111-111111111111',
   'aaaa0004-0000-0000-0000-000000000004', 'participant', 'active'),
  ('22222222-2222-2222-2222-222222222222',
   'bbbb0001-0000-0000-0000-000000000001', 'owner',       'active');

-- ---------- people em tenant_a ----------
-- person_manager (linkado ao manager_a)
-- person_participant (linkado ao participant_a, gerido pelo manager)
-- person_subord (gerido pelo manager, sem login)
-- person_other (avaliador "anônimo", sem login, sem manager)
insert into public.people
  (id, tenant_id, user_id, name, email, manager_person_id) values
  ('cccc0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'aaaa0003-0000-0000-0000-000000000003',
   'Person Manager', 'rls_manager_a@test', null),
  ('cccc0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'aaaa0004-0000-0000-0000-000000000004',
   'Person Participant', 'rls_participant_a@test',
   'cccc0001-0000-0000-0000-000000000001'),
  ('cccc0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', null,
   'Person Subord', 'rls_subord@test',
   'cccc0001-0000-0000-0000-000000000001'),
  ('cccc0004-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111', null,
   'Person Other', 'rls_other@test', null);

-- person no tenant_b, para testes cross-tenant
insert into public.people (id, tenant_id, name, email) values
  ('dddd0001-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'Person B', 'rls_b_person@test');

-- ---------- template + cycle ----------
insert into public.templates
  (id, tenant_id, name, method_code, scale_min, scale_max,
   n_minimum_default, status)
values
  ('eeee0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Template A 360', '360', 1, 5, 3, 'active');

-- competency + question + questionnaire
insert into public.competencies
  (id, tenant_id, template_id, name, order_index)
values
  ('eeee0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Liderança', 1);

insert into public.questionnaires
  (id, tenant_id, template_id, name)
values
  ('eeee0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Q Geral');

insert into public.questions
  (id, tenant_id, template_id, competency_id, prompt, response_type, order_index)
values
  ('eeee0004-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'eeee0002-0000-0000-0000-000000000002',
   'Demonstra liderança?', 'scale', 1);

insert into public.questionnaire_questions
  (questionnaire_id, question_id, order_index)
values
  ('eeee0003-0000-0000-0000-000000000003',
   'eeee0004-0000-0000-0000-000000000004', 1);

-- 2 ciclos: um com release no passado, outro com release no futuro
insert into public.cycles
  (id, tenant_id, template_id, name, status,
   start_at, deadline_at, report_release_at, allow_admin_raw_read)
values
  ('ffff0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Cycle Released', 'closed',
   now() - interval '30 days', now() - interval '5 days',
   now() - interval '1 day', false),
  ('ffff0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Cycle Locked', 'active',
   now() - interval '5 days', now() + interval '5 days',
   now() + interval '7 days', false);

-- ---------- cycle_participants (no ciclo released) ----------
insert into public.cycle_participants
  (id, tenant_id, cycle_id, person_id, manager_person_id)
values
  ('1a1a0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   'cccc0002-0000-0000-0000-000000000002',
   'cccc0001-0000-0000-0000-000000000001'),
  ('1a1a0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   'cccc0003-0000-0000-0000-000000000003',
   'cccc0001-0000-0000-0000-000000000001'),
  ('1a1a0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   'cccc0004-0000-0000-0000-000000000004', null);

-- mesmos participants no ciclo locked, para teste de release gate
insert into public.cycle_participants
  (id, tenant_id, cycle_id, person_id, manager_person_id)
values
  ('1a1a0011-0000-0000-0000-000000000011',
   '11111111-1111-1111-1111-111111111111',
   'ffff0002-0000-0000-0000-000000000002',
   'cccc0002-0000-0000-0000-000000000002',
   'cccc0001-0000-0000-0000-000000000001');

-- ---------- assignments ----------
-- assn1: avaliado=participant_a, avaliador=other
-- assn2: avaliado=subord,        avaliador=participant_a
-- assn3: avaliado=other,         avaliador=subord (fora do escopo do manager)
insert into public.assignments
  (id, tenant_id, cycle_id,
   evaluated_cycle_participant_id, evaluator_cycle_participant_id,
   relationship_code, questionnaire_id, magic_token_hash, status, completed_at)
values
  ('a55a0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0001-0000-0000-0000-000000000001',
   '1a1a0003-0000-0000-0000-000000000003',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'hash_secret_001', 'completed', now()),
  ('a55a0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0002-0000-0000-0000-000000000002',
   '1a1a0001-0000-0000-0000-000000000001',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'hash_secret_002', 'completed', now()),
  ('a55a0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0003-0000-0000-0000-000000000003',
   '1a1a0002-0000-0000-0000-000000000002',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'hash_secret_003', 'completed', now());

-- ---------- responses ----------
insert into public.responses
  (tenant_id, assignment_id, question_id, score)
values
  ('11111111-1111-1111-1111-111111111111',
   'a55a0001-0000-0000-0000-000000000001',
   'eeee0004-0000-0000-0000-000000000004', 4),
  ('11111111-1111-1111-1111-111111111111',
   'a55a0002-0000-0000-0000-000000000002',
   'eeee0004-0000-0000-0000-000000000004', 5);

-- ---------- score_snapshots ----------
-- Snapshot visível para participant_a (peer group, com 3 respostas — atinge n_min)
-- Snapshot hidden para subord (com 1 resposta — abaixo de n_min)
insert into public.score_snapshots
  (tenant_id, cycle_id, cycle_participant_id, competency_id,
   relationship_code, relationship_group, score_avg, response_count,
   visibility_status)
values
  ('11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0001-0000-0000-0000-000000000001',
   'eeee0002-0000-0000-0000-000000000002',
   'peer', 'peer', 4.2, 3, 'visible'),
  ('11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0002-0000-0000-0000-000000000002',
   'eeee0002-0000-0000-0000-000000000002',
   'peer', 'peer', 5.0, 1, 'hidden');

-- ---------- profile (apenas para participant_a no ciclo released) ----------
insert into public.participant_result_profiles
  (tenant_id, cycle_id, cycle_participant_id, overall_score)
values
  ('11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0001-0000-0000-0000-000000000001', 4.1),
  ('11111111-1111-1111-1111-111111111111',
   'ffff0002-0000-0000-0000-000000000002',
   '1a1a0011-0000-0000-0000-000000000011', 3.8);

-- ---------- comments ----------
-- comment 1: vinculado a assignment cuja relação peer já passou de n_min  -> publicável
-- comment 2: vinculado a assignment de subord (snapshot hidden)            -> não publicável
insert into public.comments (tenant_id, assignment_id, body) values
  ('11111111-1111-1111-1111-111111111111',
   'a55a0001-0000-0000-0000-000000000001',
   'Demonstra liderança consistentemente.'),
  ('11111111-1111-1111-1111-111111111111',
   'a55a0002-0000-0000-0000-000000000002',
   'Comentário sobre subord — não deveria aparecer.');

-- =====================================================================
-- Fixtures para testes 11-13 (RPC submit_response / get_assignment_context)
-- =====================================================================

-- ---------- Mini template + question em tenant B (para teste 13) ----------
-- O question_id de tenant B será usado como "forja cross-tenant" no payload.
insert into public.templates
  (id, tenant_id, name, method_code, scale_min, scale_max,
   n_minimum_default, status)
values
  ('b1111111-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'Template B 360', '360', 1, 5, 3, 'active');

insert into public.competencies
  (id, tenant_id, template_id, name, order_index)
values
  ('b1111111-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'b1111111-0000-0000-0000-000000000001',
   'Comp B', 1);

insert into public.questionnaires
  (id, tenant_id, template_id, name)
values
  ('b1111111-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222',
   'b1111111-0000-0000-0000-000000000001',
   'Q B');

insert into public.questions
  (id, tenant_id, template_id, competency_id,
   prompt, response_type, order_index)
values
  ('b1111111-0000-0000-0000-000000000004',
   '22222222-2222-2222-2222-222222222222',
   'b1111111-0000-0000-0000-000000000001',
   'b1111111-0000-0000-0000-000000000002',
   'Pergunta forjada de tenant B', 'scale', 1);

-- ---------- 3 novos assignments em tenant A com tokens conhecidos ----------
-- Os tokens em texto-claro são constantes que os testes referenciam.
insert into public.assignments
  (id, tenant_id, cycle_id,
   evaluated_cycle_participant_id, evaluator_cycle_participant_id,
   relationship_code, questionnaire_id,
   magic_token_hash, token_expires_at, status)
values
  -- Todos os 3 com evaluated=cp_other (fora do escopo do manager_a) para
  -- não inflar contagens dos testes 04/10. Variamos evaluator e
  -- relationship_code para satisfazer a UNIQUE
  -- (cycle, evaluated, evaluator, relationship_code).

  -- Token válido (teste 13)
  ('a55a0010-0000-0000-0000-000000000010',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0003-0000-0000-0000-000000000003',
   '1a1a0001-0000-0000-0000-000000000001',
   'subordinate', 'eeee0003-0000-0000-0000-000000000003',
   encode(digest('TEST_TOKEN_VALID_A_001', 'sha256'), 'hex'),
   now() + interval '7 days',
   'pending'),
  -- Token expirado (teste 11)
  ('a55a0011-0000-0000-0000-000000000011',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0003-0000-0000-0000-000000000003',
   '1a1a0002-0000-0000-0000-000000000002',
   'subordinate', 'eeee0003-0000-0000-0000-000000000003',
   encode(digest('TEST_TOKEN_EXPIRED_A_001', 'sha256'), 'hex'),
   now() - interval '1 day',
   'pending'),
  -- Token single-use (teste 12)
  ('a55a0012-0000-0000-0000-000000000012',
   '11111111-1111-1111-1111-111111111111',
   'ffff0001-0000-0000-0000-000000000001',
   '1a1a0003-0000-0000-0000-000000000003',
   '1a1a0001-0000-0000-0000-000000000001',
   'mentor', 'eeee0003-0000-0000-0000-000000000003',
   encode(digest('TEST_TOKEN_SINGLE_A_001', 'sha256'), 'hex'),
   now() + interval '7 days',
   'pending');

-- =====================================================================
-- Fixtures para testes 14-15 (close_cycle / compute_scores)
-- Cycle ffff0003 com avaliações completas em todas as relações:
--   self=1, manager=1, peer=3, subordinate=1
-- Com n_minimum_default=3 esperamos:
--   self      → visible (sempre), score=5
--   manager   → visible (sempre), score=4
--   peer      → visible (count=3 atinge n_min), score_avg=3.6667
--   subord    → hidden  (count=1 < n_min)     , score=5 mas oculto
-- =====================================================================

-- Pessoas adicionais para popular grupos de avaliadores.
insert into public.people (id, tenant_id, name, email) values
  ('cccc0005-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'Peer Evaluator 3', 'rls_peer3@test'),
  ('cccc0006-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'Subord Evaluator', 'rls_subord_eval@test');

-- Cycle ffff0003 'Cycle To Close' (active, sem release).
insert into public.cycles
  (id, tenant_id, template_id, name, status,
   start_at, deadline_at, report_release_at, allow_admin_raw_read)
values
  ('ffff0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'eeee0001-0000-0000-0000-000000000001',
   'Cycle To Close', 'active',
   now() - interval '10 days', now() - interval '1 day', null, false);

-- Cycle participants em ffff0003.
-- target = pessoa avaliada; demais são avaliadores.
insert into public.cycle_participants
  (id, tenant_id, cycle_id, person_id, manager_person_id)
values
  ('1c1c0001-0000-0000-0000-000000000001',  -- target
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0002-0000-0000-0000-000000000002',
   'cccc0001-0000-0000-0000-000000000001'),
  ('1c1c0002-0000-0000-0000-000000000002',  -- manager evaluator
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0001-0000-0000-0000-000000000001', null),
  ('1c1c0003-0000-0000-0000-000000000003',  -- peer 1
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0003-0000-0000-0000-000000000003', null),
  ('1c1c0004-0000-0000-0000-000000000004',  -- peer 2
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0004-0000-0000-0000-000000000004', null),
  ('1c1c0005-0000-0000-0000-000000000005',  -- peer 3
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0005-0000-0000-0000-000000000005', null),
  ('1c1c0006-0000-0000-0000-000000000006',  -- subordinate
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   'cccc0006-0000-0000-0000-000000000006', null);

-- Assignments (todos completed, todos avaliando o target 1c1c0001).
insert into public.assignments
  (id, tenant_id, cycle_id,
   evaluated_cycle_participant_id, evaluator_cycle_participant_id,
   relationship_code, questionnaire_id, status, completed_at)
values
  ('a55b0001-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0001-0000-0000-0000-000000000001',
   'self', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now()),
  ('a55b0002-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0002-0000-0000-0000-000000000002',
   'manager', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now()),
  ('a55b0003-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0003-0000-0000-0000-000000000003',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now()),
  ('a55b0004-0000-0000-0000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0004-0000-0000-0000-000000000004',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now()),
  ('a55b0005-0000-0000-0000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0005-0000-0000-0000-000000000005',
   'peer', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now()),
  ('a55b0006-0000-0000-0000-000000000006',
   '11111111-1111-1111-1111-111111111111',
   'ffff0003-0000-0000-0000-000000000003',
   '1c1c0001-0000-0000-0000-000000000001',
   '1c1c0006-0000-0000-0000-000000000006',
   'subordinate', 'eeee0003-0000-0000-0000-000000000003',
   'completed', now());

-- Responses (1 por assignment, na pergunta eeee0004 do template).
insert into public.responses (tenant_id, assignment_id, question_id, score) values
  ('11111111-1111-1111-1111-111111111111',
   'a55b0001-0000-0000-0000-000000000001',
   'eeee0004-0000-0000-0000-000000000004', 5),    -- self
  ('11111111-1111-1111-1111-111111111111',
   'a55b0002-0000-0000-0000-000000000002',
   'eeee0004-0000-0000-0000-000000000004', 4),    -- manager
  ('11111111-1111-1111-1111-111111111111',
   'a55b0003-0000-0000-0000-000000000003',
   'eeee0004-0000-0000-0000-000000000004', 3),    -- peer 1
  ('11111111-1111-1111-1111-111111111111',
   'a55b0004-0000-0000-0000-000000000004',
   'eeee0004-0000-0000-0000-000000000004', 4),    -- peer 2
  ('11111111-1111-1111-1111-111111111111',
   'a55b0005-0000-0000-0000-000000000005',
   'eeee0004-0000-0000-0000-000000000004', 4),    -- peer 3
  ('11111111-1111-1111-1111-111111111111',
   'a55b0006-0000-0000-0000-000000000006',
   'eeee0004-0000-0000-0000-000000000004', 5);    -- subordinate

\echo 'setup OK'

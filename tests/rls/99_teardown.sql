-- =====================================================================
-- 99_teardown.sql
-- Limpa fixtures e helpers de teste.
-- =====================================================================

\echo '== RLS teardown =='

reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

alter table public.tenant_memberships disable trigger memberships_anti_escalation;

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

drop schema if exists app_test cascade;

\echo 'teardown OK'

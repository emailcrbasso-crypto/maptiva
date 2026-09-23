-- Só verificação — roda e me manda o resultado. Não altera nada.
select
  p.proname as function_name,
  n.nspname as schema_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('get_participant_question_divergence', 'get_my_question_divergence');

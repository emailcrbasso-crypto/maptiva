-- =====================================================================
-- 0095_flexmetal_scale_labels.sql
--
-- Auditoria externa (Flexmetal v2, Marcelo Pezzutti): a metodologia do
-- relatório mostra os rótulos da escala genérica 'frequency_5'
-- (Nunca/Raramente/Às vezes/Frequentemente/Sempre, com opção "Não
-- observei"), mas o questionário real do Flexmetal usa outra
-- nomenclatura (aba ESCALA do BD: Nunca/Raramente/Ocasionalmente/
-- Frequente/Muito Frequente) e não tem opção de resposta vazia
-- (PARAMETROS, linha 9).
--
-- Cria a escala 'frequency_5_strict' (mesmos 5 pontos, rótulos e
-- abreviações corretos, sem N/A) e migra o template do Flexmetal para
-- ela.
-- =====================================================================

begin;

insert into app.response_scales
  (id, name, description, min, max, allow_na, na_label, labels_json, sort_order)
values
  (
    'frequency_5_strict',
    'Frequência (1–5, sem N/A)',
    'Com que frequência o comportamento é observado — toda pergunta precisa de resposta',
    1, 5, false, null,
    '[
      {"value":1,"label":"Nunca","short":"N"},
      {"value":2,"label":"Raramente","short":"R"},
      {"value":3,"label":"Ocasionalmente","short":"O"},
      {"value":4,"label":"Frequente","short":"F"},
      {"value":5,"label":"Muito Frequente","short":"MF"}
    ]'::jsonb,
    5
  )
on conflict (id) do nothing;

update public.templates
set scale_id = 'frequency_5_strict'
where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df'
  and scale_id = 'frequency_5';

update public.competencies
set scale_id = 'frequency_5_strict'
where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df'
  and scale_id = 'frequency_5';

update public.questions
set scale_id = 'frequency_5_strict'
where tenant_id = '387f107b-d8ed-4af3-803c-ab8aabbc72df'
  and scale_id = 'frequency_5';

commit;

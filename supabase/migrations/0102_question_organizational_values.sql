-- =====================================================================
-- 0102_question_organizational_values.sql
--
-- Relatório executivo (novo formato, modelo CR BASSO): a página
-- "Valores organizacionais" agrupa as 33 perguntas pelos 5 valores da
-- Flex-Metal (Senso de Dono, Melhor Ideia, Harmonia, Crescimento,
-- Resultado) — um agrupamento diferente e paralelo às 12 competências.
--
-- Adiciona questions.value_name (mesmo padrão de competencies.
-- dimension_code — um rótulo simples, não uma tabela separada) e
-- popula pro template usado pelo ciclo Flexmetal 2026 v2 (por
-- Competência), com o mapeamento pergunta -> valor exatamente como
-- veio do relatório-modelo do cliente.
-- =====================================================================

begin;

alter table public.questions
  add column if not exists value_name text;

comment on column public.questions.value_name is
  'Valor organizacional ao qual a pergunta pertence (ex.: "Senso de Dono") — '
  'agrupamento paralelo e independente da competência, usado na página '
  '"Valores organizacionais" do relatório executivo. NULL = tenant não usa '
  'valores organizacionais no questionário.';

with target_template as (
  select c.template_id
  from public.cycles c
  where c.id = 'fa8b2560-1350-4340-a7b2-c3f413ddcbef'
),
mapping (order_index, value_name) as (
  values
    (0,  'Senso de Dono'), (1,  'Senso de Dono'), (19, 'Senso de Dono'),
    (22, 'Senso de Dono'), (24, 'Senso de Dono'), (25, 'Senso de Dono'),
    (27, 'Senso de Dono'), (28, 'Senso de Dono'), (29, 'Senso de Dono'),
    (31, 'Senso de Dono'),
    (2,  'Melhor Ideia'),
    (3,  'Harmonia'), (6,  'Harmonia'), (7,  'Harmonia'), (8,  'Harmonia'),
    (9,  'Harmonia'), (10, 'Harmonia'), (11, 'Harmonia'), (23, 'Harmonia'),
    (26, 'Harmonia'),
    (4,  'Crescimento'), (5,  'Crescimento'), (17, 'Crescimento'),
    (18, 'Crescimento'), (20, 'Crescimento'), (32, 'Crescimento'),
    (12, 'Resultado'), (13, 'Resultado'), (14, 'Resultado'),
    (15, 'Resultado'), (16, 'Resultado'), (21, 'Resultado'), (30, 'Resultado')
)
update public.questions q
set value_name = m.value_name
from target_template t, mapping m
where q.template_id = t.template_id
  and q.order_index = m.order_index
  and q.response_type = 'scale';

commit;

-- =====================================================================
-- 0039_response_scale_columns.sql
--
-- Adiciona rastreabilidade de escala às respostas individuais.
--
-- responses.scale_id  — qual escala foi usada nesta resposta (denorm para análise)
-- responses.is_na     — true quando o avaliador selecionou "Não observei"
--                       Diferencia explicitamente N/A deliberado de score=NULL
--                       por falha de submissão.
--
-- Regra:
--   is_na = true  → score deve ser NULL; escala deve allow_na = true
--   is_na = false → score validado contra [scale.min, scale.max]
-- =====================================================================

-- ── responses ─────────────────────────────────────────────────────────

alter table public.responses
  add column scale_id text
    references app.response_scales(id);

alter table public.responses
  add column is_na boolean not null default false;

-- Constraint: is_na=true implica score IS NULL
alter table public.responses
  add constraint chk_na_score_null
    check (is_na = false or score is null);

-- Backfill dados existentes: todos usavam likert_5 (template padrão)
update public.responses
   set scale_id = 'likert_5'
 where scale_id is null;

comment on column public.responses.scale_id is
  'Escala efetiva usada no momento da resposta. Denormalizado de '
  'COALESCE(questions.scale_id, competencies.scale_id, templates.scale_id).';

comment on column public.responses.is_na is
  'True quando o avaliador escolheu explicitamente "Não tive oportunidade de '
  'observar". Score deve ser NULL. Diferente de score=NULL sem is_na (que indica '
  'dado ausente por falha ou questão não respondida).';

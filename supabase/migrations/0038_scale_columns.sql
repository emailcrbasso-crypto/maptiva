-- =====================================================================
-- 0038_scale_columns.sql
--
-- Adiciona scale_id a templates, questions e competencies.
--
-- Hierarquia de resolução (prioridade decrescente):
--   questions.scale_id
--     > competencies.scale_id  (via question.competency_id)
--       > templates.scale_id
--
-- Backward compat:
--   templates.scale_min / templates.scale_max são mantidos.
--   Serão atualizados automaticamente quando scale_id mudar,
--   via trigger validate_template_scale_consistency.
-- =====================================================================

-- ── templates ─────────────────────────────────────────────────────────

alter table public.templates
  add column scale_id text
    not null
    default 'likert_5'
    references app.response_scales(id);

-- Backfill: todos os templates existentes usam range 1-5 = likert_5
update public.templates set scale_id = 'likert_5';

-- Trigger: quando scale_id muda, mantém scale_min/scale_max em sync
create or replace function app.sync_template_scale()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if new.scale_id is not null and new.scale_id <> coalesce(old.scale_id, '') then
    select rs.min, rs.max
      into new.scale_min, new.scale_max
    from app.response_scales rs
    where rs.id = new.scale_id;
  end if;
  return new;
end$$;

create trigger trg_sync_template_scale
  before insert or update of scale_id
  on public.templates
  for each row
  execute function app.sync_template_scale();

-- ── questions ──────────────────────────────────────────────────────────

alter table public.questions
  add column scale_id text
    references app.response_scales(id);
-- NULL = herda do template (via competência se houver, depois template)

comment on column public.questions.scale_id is
  'Sobrescreve a escala padrão do template para esta pergunta específica. '
  'NULL = usa competencies.scale_id ou templates.scale_id (nessa ordem).';

-- ── competencies ───────────────────────────────────────────────────────

alter table public.competencies
  add column scale_id text
    references app.response_scales(id);
-- NULL = herda do template

comment on column public.competencies.scale_id is
  'Sobrescreve a escala padrão do template para todas as perguntas desta '
  'competência (a menos que a pergunta tenha seu próprio scale_id). '
  'NULL = usa templates.scale_id.';

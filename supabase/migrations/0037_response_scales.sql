-- =====================================================================
-- 0037_response_scales.sql
--
-- Catálogo de escalas de resposta para o Maptiva.
-- Reside no schema `app` (não exposto via RLS ao cliente).
--
-- Modelagem extensível: tenant_id NULL = escala de sistema;
-- futuras escalas de tenant usarão tenant_id NOT NULL.
-- is_system = true protege os registros de serem editados/excluídos
-- por tenants quando a UI de gestão for implementada.
--
-- Escalas iniciais:
--   likert_5       — Concordância geral (padrão do sistema)
--   frequency_5    — Frequência de comportamentos observáveis (permite N/A)
--   bars_5         — Desempenho vs. expectativa
--   proficiency_5  — Nível de domínio / proficiência (permite N/A)
--   impact_4       — Nível de impacto (range 1–4, isolado)
-- =====================================================================

create table app.response_scales (
  id          text    primary key,          -- slug: 'likert_5', 'frequency_5', etc.
  name        text    not null,             -- 'Likert (1–5)'
  description text,                         -- 'Concordância / opinião geral'
  min         int     not null,
  max         int     not null,
  allow_na    boolean not null default false,
  na_label    text    default 'Não tive oportunidade de observar',
  labels_json jsonb   not null,             -- [{value, label, short}]
  sort_order  int     not null default 0,
  is_system   boolean not null default true,
  tenant_id   uuid    null,                 -- NULL = sistema; futuro: FK para tenants
  check (max > min),
  check (jsonb_array_length(labels_json) = max - min + 1)
);

comment on table app.response_scales is
  'Catálogo de escalas de resposta. Registros com tenant_id NULL são do sistema '
  'e imutáveis via UI. Registros com tenant_id pertencem ao tenant (fase 2).';

comment on column app.response_scales.labels_json is
  'Array ordenado de {value: int, label: text, short: text}. '
  'Deve ter exatamente (max - min + 1) elementos.';

-- ── Seed: 5 escalas do sistema ────────────────────────────────────────

insert into app.response_scales
  (id, name, description, min, max, allow_na, na_label, labels_json, sort_order)
values
  (
    'likert_5',
    'Likert (1–5)',
    'Concordância geral — ideal para afirmações sobre comportamentos e atitudes',
    1, 5, false, null,
    '[
      {"value":1,"label":"Discordo totalmente","short":"DT"},
      {"value":2,"label":"Discordo","short":"D"},
      {"value":3,"label":"Neutro","short":"N"},
      {"value":4,"label":"Concordo","short":"C"},
      {"value":5,"label":"Concordo totalmente","short":"CT"}
    ]'::jsonb,
    0
  ),
  (
    'frequency_5',
    'Frequência (1–5)',
    'Com que frequência o comportamento é observado — inclui opção "Não observei"',
    1, 5, true,
    'Não tive oportunidade de observar este comportamento',
    '[
      {"value":1,"label":"Nunca","short":"N"},
      {"value":2,"label":"Raramente","short":"R"},
      {"value":3,"label":"Às vezes","short":"AV"},
      {"value":4,"label":"Frequentemente","short":"F"},
      {"value":5,"label":"Sempre","short":"S"}
    ]'::jsonb,
    1
  ),
  (
    'bars_5',
    'Desempenho (1–5)',
    'Performance relativa à expectativa do papel — ideal para avaliações de desempenho',
    1, 5, false, null,
    '[
      {"value":1,"label":"Muito abaixo do esperado","short":"MB"},
      {"value":2,"label":"Abaixo do esperado","short":"B"},
      {"value":3,"label":"Dentro do esperado","short":"DE"},
      {"value":4,"label":"Acima do esperado","short":"A"},
      {"value":5,"label":"Muito acima do esperado","short":"MA"}
    ]'::jsonb,
    2
  ),
  (
    'proficiency_5',
    'Proficiência (1–5)',
    'Nível de domínio de competência — inclui opção "Não observei"',
    1, 5, true,
    'Não tive oportunidade de observar esta competência',
    '[
      {"value":1,"label":"Iniciante","short":"I"},
      {"value":2,"label":"Em desenvolvimento","short":"ED"},
      {"value":3,"label":"Proficiente","short":"P"},
      {"value":4,"label":"Avançado","short":"AV"},
      {"value":5,"label":"Expert","short":"E"}
    ]'::jsonb,
    3
  ),
  (
    'impact_4',
    'Impacto (1–4)',
    'Nível de impacto de iniciativas ou decisões (range 1–4, usar em questionários isolados)',
    1, 4, false, null,
    '[
      {"value":1,"label":"Nenhum impacto","short":"N"},
      {"value":2,"label":"Baixo impacto","short":"B"},
      {"value":3,"label":"Alto impacto","short":"A"},
      {"value":4,"label":"Impacto crítico","short":"IC"}
    ]'::jsonb,
    4
  );

-- ── Permissões ────────────────────────────────────────────────────────
-- Leitura pública: o frontend carrega o catálogo sem autenticação
-- (ex: RespondPage usa anon para renderizar os labels da escala).
grant select on app.response_scales to authenticated, anon;

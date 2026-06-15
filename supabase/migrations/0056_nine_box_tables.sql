-- =====================================================================
-- 0056_nine_box_tables.sql
--
-- Módulo Nine Box (interno ao Maptiva, opcional por ciclo).
--
-- Dois eixos independentes: Desempenho (X) × Potencial (Y).
-- Cada eixo tem fonte configurável por ciclo:
--   'overall'  → usa participant_result_profiles.overall_score (score do 360)
--   'derived'  → média das competências selecionadas (subset dos snapshots)
--   'manual'   → valor digitado por participante (metas/resultados externos)
--
-- Default de produto: Potencial = overall (360); Desempenho = manual.
--
-- Posicionamento: 3 faixas por eixo (baixo/médio/alto) via thresholds.
--   faixa = 1 (baixo) se valor <  low_max
--           3 (alto)  se valor >= high_min
--           2 (médio) caso contrário
-- Calibração manual pode sobrescrever a faixa automática.
--
-- Duas tabelas:
--   cycle_nine_box_config  — 1 por ciclo (ativação + config dos eixos)
--   participant_nine_box   — 1 por participante/ciclo (valores + posição)
-- =====================================================================

-- ── 1. Config por ciclo ───────────────────────────────────────────────

create table public.cycle_nine_box_config (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  cycle_id      uuid        not null references public.cycles(id) on delete cascade,
  enabled       boolean     not null default false,

  -- Eixo Desempenho (X)
  perf_label    text        not null default 'Desempenho',
  perf_source   text        not null default 'manual'
                            check (perf_source in ('overall','derived','manual')),
  perf_competency_ids uuid[] not null default '{}',
  perf_low_max  numeric(6,4) not null default 2.3333,
  perf_high_min numeric(6,4) not null default 3.6667,

  -- Eixo Potencial (Y)
  pot_label     text        not null default 'Potencial',
  pot_source    text        not null default 'overall'
                            check (pot_source in ('overall','derived','manual')),
  pot_competency_ids uuid[] not null default '{}',
  pot_low_max   numeric(6,4) not null default 2.3333,
  pot_high_min  numeric(6,4) not null default 3.6667,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cycle_id)
);

create index on public.cycle_nine_box_config (tenant_id, cycle_id);

-- ── 2. Posição por participante ───────────────────────────────────────

create table public.participant_nine_box (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  cycle_id      uuid        not null references public.cycles(id) on delete cascade,
  cycle_participant_id uuid not null references public.cycle_participants(id) on delete cascade,

  -- Valores resolvidos dos eixos (após aplicar a fonte configurada)
  perf_value    numeric(6,4),
  pot_value     numeric(6,4),

  -- Entrada manual (usada quando a fonte do eixo = 'manual')
  perf_manual   numeric(6,4),
  pot_manual    numeric(6,4),

  -- Faixas automáticas calculadas pelos thresholds (1=baixo,2=médio,3=alto)
  auto_perf_band int check (auto_perf_band between 1 and 3),
  auto_pot_band  int check (auto_pot_band  between 1 and 3),

  -- Override de calibração manual (nullable = sem ajuste, usa automático)
  cal_perf_band int check (cal_perf_band between 1 and 3),
  cal_pot_band  int check (cal_pot_band  between 1 and 3),

  notes         text,
  computed_at   timestamptz,
  updated_at    timestamptz not null default now(),
  unique (cycle_id, cycle_participant_id)
);

create index on public.participant_nine_box (tenant_id, cycle_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────

alter table public.cycle_nine_box_config enable row level security;
alter table public.participant_nine_box  enable row level security;

-- Admin/owner: leitura e escrita no próprio tenant
create policy "admin_nbcfg_all" on public.cycle_nine_box_config
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

create policy "admin_nbpos_all" on public.participant_nine_box
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

-- Nota: Nine Box é uma ferramenta de talent review — visão interna de gestão.
-- Participantes NÃO têm acesso de leitura ao seu próprio posicionamento.
-- O acesso de leitura é exclusivo de admin/owner via as RPCs (security definer).

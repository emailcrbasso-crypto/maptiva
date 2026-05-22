-- 0044_dpa_tables.sql
--
-- Diagnóstico Prévio Anônimo (DPA)
--
-- Permite que tenants enviem questionários anônimos a participantes antes de
-- um ciclo formal. O acesso ao formulário é via token UUID único por participante.
-- Toda a leitura pública é feita via RPCs security-definer (migration 0045).

-- ── 1. Projetos DPA ────────────────────────────────────────────────────────────

create table public.dpa_projetos (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  nome        text        not null,
  descricao   text,
  status      text        not null default 'rascunho'
              check (status in ('rascunho', 'ativo', 'encerrado')),
  -- config JSONB structure:
  -- {
  --   "label_unidade": "Departamento",        ← customizable field name
  --   "perguntas": [
  --     { "id": "q1", "texto": "...", "tipo": "escala_5",        "obrigatoria": true },
  --     { "id": "q2", "texto": "...", "tipo": "texto_livre",     "obrigatoria": false },
  --     { "id": "q3", "texto": "...", "tipo": "multipla_escolha","opcoes": ["A","B"], "obrigatoria": true }
  --   ]
  -- }
  config      jsonb       not null default '{"label_unidade":"Departamento","perguntas":[]}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. Participantes ───────────────────────────────────────────────────────────

create table public.dpa_participantes (
  id             uuid        primary key default gen_random_uuid(),
  projeto_id     uuid        not null references public.dpa_projetos(id) on delete cascade,
  tenant_id      uuid        not null references public.tenants(id) on delete cascade,
  nome           text,
  email          text        not null,
  unidade        text,                     -- department / area value
  token          uuid        not null unique default gen_random_uuid(),
  status         text        not null default 'pendente'
                 check (status in ('pendente', 'respondido')),
  respondido_em  timestamptz,
  -- n8n webhook integration point: set to now() after webhook fires
  email_enviado_em timestamptz,
  created_at     timestamptz not null default now()
);

-- ── 3. Respostas ───────────────────────────────────────────────────────────────

create table public.dpa_respostas (
  id              uuid        primary key default gen_random_uuid(),
  participante_id uuid        not null references public.dpa_participantes(id) on delete cascade,
  projeto_id      uuid        not null references public.dpa_projetos(id) on delete cascade,
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  -- respostas JSONB: { "q1": 4, "q2": "texto livre...", "q3": "Opção A" }
  respostas       jsonb       not null default '{}',
  created_at      timestamptz not null default now()
);

-- ── 4. Indexes ─────────────────────────────────────────────────────────────────

create index dpa_projetos_tenant_idx        on public.dpa_projetos(tenant_id);
create index dpa_projetos_status_idx        on public.dpa_projetos(status);
create index dpa_participantes_projeto_idx  on public.dpa_participantes(projeto_id);
create index dpa_participantes_tenant_idx   on public.dpa_participantes(tenant_id);
create index dpa_participantes_token_idx    on public.dpa_participantes(token);
create index dpa_respostas_projeto_idx      on public.dpa_respostas(projeto_id);

-- ── 5. Row Level Security ──────────────────────────────────────────────────────

alter table public.dpa_projetos      enable row level security;
alter table public.dpa_participantes enable row level security;
alter table public.dpa_respostas     enable row level security;

-- Authenticated users see only their tenant's data
create policy "dpa_projetos_tenant"
  on public.dpa_projetos
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy "dpa_participantes_tenant"
  on public.dpa_participantes
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

create policy "dpa_respostas_tenant"
  on public.dpa_respostas
  for all
  to authenticated
  using (tenant_id = app.current_tenant_id())
  with check (tenant_id = app.current_tenant_id());

-- anon role: blocked at table level; access only via security definer RPCs (0045)

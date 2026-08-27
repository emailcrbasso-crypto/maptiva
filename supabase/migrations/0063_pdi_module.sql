-- =====================================================================
-- 0063_pdi_module.sql
--
-- Módulo PDI (Plano de Desenvolvimento Individual) — Fase 1 enxuta.
--
-- Decisão de escopo (validada com o cliente em negociação, não é
-- requisito contratado ainda): entrega mínima demonstrável, com
-- modelagem extensível para as fases seguintes (ações 70-20-10,
-- check-ins, anexos, notificações, PDF dedicado, dashboard) sem
-- precisar migrar dados depois.
--
-- Desacoplado do Nine Box por design: `source_type` + `source_id`
-- genéricos (assessment | nine_box | manual) — o PDI funciona mesmo
-- sem o Nine Box habilitado, e fica pronto para consumir o Maptiva
-- Grid no futuro sem depender das telas dele.
--
-- O PDI pertence à PESSOA (não ao cycle_participant), preservando
-- histórico entre ciclos — `cycle_id` é só metadado de origem.
--
-- Participantes de avaliação continuam sem precisar de login — o PDI
-- nesta fase é operado só por admin/owner (cria) e gestor (acompanha
-- os PDIs de seus liderados diretos, via app.manages_person já usado
-- em todo o resto do produto).
-- =====================================================================

-- ── 1. Tabelas ────────────────────────────────────────────────────────

create table public.pdi_plans (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  person_id          uuid        not null references public.people(id) on delete cascade,
  manager_person_id  uuid        references public.people(id) on delete set null,
  cycle_id           uuid        references public.cycles(id) on delete set null,
  created_by         uuid        references public.users(id),

  -- Origem: de onde veio a sugestão inicial (revisão humana sempre obrigatória)
  source_type        text        not null default 'manual'
                      check (source_type in ('assessment', 'nine_box', 'manual')),
  source_id          uuid,       -- referência informativa (ex.: cycle_participant_id) — sem FK rígida

  title              text        not null default 'Plano de Desenvolvimento Individual',
  period_start       date,
  period_end         date,
  status             text        not null default 'rascunho'
                      check (status in ('rascunho', 'em_andamento', 'concluido', 'cancelado')),
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on public.pdi_plans (tenant_id, person_id);
create index on public.pdi_plans (tenant_id, manager_person_id);
create index on public.pdi_plans (cycle_id);

create table public.pdi_objectives (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  pdi_id             uuid        not null references public.pdi_plans(id) on delete cascade,
  competency_id      uuid        references public.competencies(id) on delete set null,

  description        text        not null,
  expected_result     text,
  priority           text        not null default 'media'
                      check (priority in ('baixa', 'media', 'alta')),
  due_date            date,
  success_indicator    text,
  status             text        not null default 'nao_iniciado'
                      check (status in ('nao_iniciado', 'em_andamento', 'concluido', 'cancelado')),
  progress_pct        int         not null default 0 check (progress_pct between 0 and 100),
  order_index         int         not null default 0,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index on public.pdi_objectives (tenant_id, pdi_id);

-- ── 2. tenant_id automático (mesmo padrão do módulo DPA) ───────────────

create or replace function app.set_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tenant_id is null then
    new.tenant_id := app.current_tenant_id();
  end if;
  return new;
end$$;

create trigger pdi_plans_auto_tenant
  before insert on public.pdi_plans
  for each row execute function app.set_tenant_id();

create trigger pdi_objectives_auto_tenant
  before insert on public.pdi_objectives
  for each row execute function app.set_tenant_id();

-- updated_at automático
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end$$;

create trigger pdi_plans_touch
  before update on public.pdi_plans
  for each row execute function app.touch_updated_at();

create trigger pdi_objectives_touch
  before update on public.pdi_objectives
  for each row execute function app.touch_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────────

alter table public.pdi_plans      enable row level security;
alter table public.pdi_objectives enable row level security;

-- Admin/owner: acesso total no próprio tenant
create policy "pdi_plans_admin_all" on public.pdi_plans
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id)
  with check (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

create policy "pdi_objectives_admin_all" on public.pdi_objectives
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id)
  with check (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

-- Gestor: lê e atualiza os PDIs de seus liderados diretos (não cria/exclui)
create policy "pdi_plans_manager_rw" on public.pdi_plans
  for select using (
    app.current_tenant_id() = tenant_id and app.manages_person(person_id)
  );

create policy "pdi_plans_manager_update" on public.pdi_plans
  for update using (
    app.current_tenant_id() = tenant_id and app.manages_person(person_id)
  ) with check (
    app.current_tenant_id() = tenant_id and app.manages_person(person_id)
  );

create policy "pdi_objectives_manager_rw" on public.pdi_objectives
  for select using (
    app.current_tenant_id() = tenant_id
    and exists (
      select 1 from public.pdi_plans p
      where p.id = pdi_objectives.pdi_id and app.manages_person(p.person_id)
    )
  );

create policy "pdi_objectives_manager_update" on public.pdi_objectives
  for update using (
    app.current_tenant_id() = tenant_id
    and exists (
      select 1 from public.pdi_plans p
      where p.id = pdi_objectives.pdi_id and app.manages_person(p.person_id)
    )
  ) with check (
    app.current_tenant_id() = tenant_id
    and exists (
      select 1 from public.pdi_plans p
      where p.id = pdi_objectives.pdi_id and app.manages_person(p.person_id)
    )
  );

grant select, insert, update, delete on public.pdi_plans      to authenticated;
grant select, insert, update, delete on public.pdi_objectives to authenticated;

-- ── 4. RPC: sugestões iniciais para revisão (nunca criam PDI sozinhas) ──
-- Junta: 3 competências com menor score externo, blind spots relevantes,
-- e o posicionamento do Nine Box (se existir) — a UI decide como oferecer
-- isso como ponto de partida; quem inclui o objetivo é sempre uma pessoa.

create or replace function app.get_pdi_suggestions(p_cycle_id uuid, p_cp_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_low       jsonb;
  v_blind     jsonb;
  v_nine_box  jsonb;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- 3 competências com pior média externa (exclui self)
  select coalesce(jsonb_agg(row_data order by score_avg asc), '[]'::jsonb)
  into v_low
  from (
    select
      jsonb_build_object(
        'competency_id', ss.competency_id,
        'name',          co.name,
        'score_avg',     round(avg(ss.score_avg)::numeric, 2)
      ) as row_data,
      avg(ss.score_avg) as score_avg
    from public.score_snapshots ss
    join public.competencies co on co.id = ss.competency_id
    where ss.cycle_id            = p_cycle_id
      and ss.cycle_participant_id = p_cp_id
      and ss.relationship_code   <> 'self'
      and ss.visibility_status   = 'visible'
      and ss.competency_id       is not null
      and ss.score_avg           is not null
    group by ss.competency_id, co.name
    order by avg(ss.score_avg) asc
    limit 3
  ) sub;

  -- Blind spots (self bem acima da percepção externa)
  select coalesce(jsonb_agg(jsonb_build_object(
    'competency_id', s.competency_id,
    'name',          co.name,
    'self_score',    s.self_score,
    'others_avg',    round(o.others_avg::numeric, 2),
    'gap',           round((s.self_score - o.others_avg)::numeric, 2)
  ) order by (s.self_score - o.others_avg) desc), '[]'::jsonb)
  into v_blind
  from (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id = p_cycle_id and cycle_participant_id = p_cp_id
      and relationship_code = 'self' and visibility_status = 'visible'
      and competency_id is not null
  ) s
  join (
    select cycle_participant_id, competency_id, avg(score_avg) as others_avg
    from public.score_snapshots
    where cycle_id = p_cycle_id and cycle_participant_id = p_cp_id
      and relationship_code <> 'self' and visibility_status = 'visible'
      and competency_id is not null
    group by cycle_participant_id, competency_id
  ) o on o.cycle_participant_id = s.cycle_participant_id and o.competency_id = s.competency_id
  join public.competencies co on co.id = s.competency_id
  where (s.self_score - o.others_avg) >= 1.0;

  -- Nine Box (se existir posição calculada para este participante/ciclo)
  select jsonb_build_object(
    'perf_value', nb.perf_value,
    'pot_value',  nb.pot_value,
    'perf_band',  coalesce(nb.cal_perf_band, nb.auto_perf_band),
    'pot_band',   coalesce(nb.cal_pot_band,  nb.auto_pot_band)
  )
  into v_nine_box
  from public.participant_nine_box nb
  where nb.cycle_id = p_cycle_id and nb.cycle_participant_id = p_cp_id;

  return jsonb_build_object(
    'low_competencies', v_low,
    'blind_spots',      v_blind,
    'nine_box',         coalesce(v_nine_box, 'null'::jsonb)
  );
end$$;

grant execute on function app.get_pdi_suggestions(uuid, uuid) to authenticated;

create or replace function public.get_pdi_suggestions(p_cycle_id uuid, p_cp_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_pdi_suggestions(p_cycle_id, p_cp_id); end$$;

grant execute on function public.get_pdi_suggestions(uuid, uuid) to authenticated;

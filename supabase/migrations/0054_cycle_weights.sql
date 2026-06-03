-- =====================================================================
-- 0054_cycle_weights.sql
--
-- Pesos de avaliação configuráveis por ciclo.
--
-- Duas tabelas:
--   cycle_evaluator_weights  — peso por tipo de avaliador (relationship_code)
--   cycle_competency_weights — peso por competência
--
-- Se não houver pesos configurados → compute_scores mantém avg simples.
-- Se houver pesos de avaliador   → relationship_codes fora da tabela têm
--                                   peso 0 (self excluído por padrão).
-- Se houver pesos de competência → competências sem peso recebem 1.0.
--
-- RPCs:
--   public.set_cycle_weights    — admin/owner, substitui toda a config
--   public.get_cycle_weights    — admin/owner ou participante pós-liberação
-- =====================================================================

-- ── 1. Tabelas ────────────────────────────────────────────────────────

create table public.cycle_evaluator_weights (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id),
  cycle_id         uuid        not null references public.cycles(id) on delete cascade,
  relationship_code text       not null,
  weight           numeric(6,4) not null check (weight >= 0),
  created_at       timestamptz default now(),
  unique (cycle_id, relationship_code)
);

create table public.cycle_competency_weights (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     uuid        not null references public.tenants(id),
  cycle_id      uuid        not null references public.cycles(id) on delete cascade,
  competency_id uuid        not null references public.competencies(id),
  weight        numeric(6,4) not null check (weight > 0),
  created_at    timestamptz default now(),
  unique (cycle_id, competency_id)
);

-- ── 2. RLS ────────────────────────────────────────────────────────────

alter table public.cycle_evaluator_weights  enable row level security;
alter table public.cycle_competency_weights enable row level security;

-- Admin/owner: leitura e escrita
create policy "admin_ew_all" on public.cycle_evaluator_weights
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

create policy "admin_cw_all" on public.cycle_competency_weights
  for all using (app.is_admin_or_owner() and app.current_tenant_id() = tenant_id);

-- Participante: leitura após liberação (para banner de metodologia no relatório)
create policy "participant_ew_read" on public.cycle_evaluator_weights
  for select using (
    app.current_tenant_id() = tenant_id
    and exists (
      select 1 from public.cycles c
      where c.id        = cycle_id
        and c.report_release_at is not null
        and c.report_release_at <= now()
    )
    and exists (
      select 1 from public.cycle_participants cp
      join public.people pe on pe.id = cp.person_id
      join public.users  u  on u.id  = pe.user_id
      where cp.cycle_id    = cycle_id
        and u.auth_user_id = auth.uid()
    )
  );

create policy "participant_cw_read" on public.cycle_competency_weights
  for select using (
    app.current_tenant_id() = tenant_id
    and exists (
      select 1 from public.cycles c
      where c.id        = cycle_id
        and c.report_release_at is not null
        and c.report_release_at <= now()
    )
    and exists (
      select 1 from public.cycle_participants cp
      join public.people pe on pe.id = cp.person_id
      join public.users  u  on u.id  = pe.user_id
      where cp.cycle_id    = cycle_id
        and u.auth_user_id = auth.uid()
    )
  );

-- ── 3. RPC: set_cycle_weights ─────────────────────────────────────────
-- Substitui toda a configuração de pesos de um ciclo de forma atômica.
-- p_evaluator_weights: [{"relationship_code":"manager","weight":2.0}, ...]
-- p_competency_weights: [{"competency_id":"<uuid>","weight":1.5}, ...]
-- Passar array vazio remove todos os pesos daquele tipo.

create or replace function public.set_cycle_weights(
  p_cycle_id             uuid,
  p_evaluator_weights    jsonb default '[]',
  p_competency_weights   jsonb default '[]'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from public.cycles
  where id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Pesos de avaliador: substitui tudo
  delete from public.cycle_evaluator_weights where cycle_id = p_cycle_id;

  if jsonb_array_length(p_evaluator_weights) > 0 then
    insert into public.cycle_evaluator_weights (tenant_id, cycle_id, relationship_code, weight)
    select
      v_tenant_id,
      p_cycle_id,
      (elem->>'relationship_code'),
      (elem->>'weight')::numeric
    from jsonb_array_elements(p_evaluator_weights) as elem
    where (elem->>'weight')::numeric >= 0;
  end if;

  -- Pesos de competência: substitui tudo
  delete from public.cycle_competency_weights where cycle_id = p_cycle_id;

  if jsonb_array_length(p_competency_weights) > 0 then
    insert into public.cycle_competency_weights (tenant_id, cycle_id, competency_id, weight)
    select
      v_tenant_id,
      p_cycle_id,
      (elem->>'competency_id')::uuid,
      (elem->>'weight')::numeric
    from jsonb_array_elements(p_competency_weights) as elem
    where (elem->>'weight')::numeric > 0;
  end if;
end$$;

grant execute on function public.set_cycle_weights(uuid, jsonb, jsonb) to authenticated;

-- ── 4. RPC: get_cycle_weights ─────────────────────────────────────────

create or replace function public.get_cycle_weights(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid;
  v_release_at timestamptz;
  v_authorized boolean := false;
begin
  select tenant_id, report_release_at
    into v_tenant_id, v_release_at
  from public.cycles
  where id = p_cycle_id;

  if not found then return '{}'::jsonb; end if;

  if app.current_tenant_id() is distinct from v_tenant_id then
    return '{}'::jsonb;
  end if;

  -- Admin/owner sempre autorizado
  if app.is_admin_or_owner() then
    v_authorized := true;
  end if;

  -- Participante: somente após liberação
  if not v_authorized then
    if v_release_at is not null and v_release_at <= now() then
      if exists (
        select 1 from public.cycle_participants cp
        join public.people pe on pe.id = cp.person_id
        join public.users  u  on u.id  = pe.user_id
        where cp.cycle_id    = p_cycle_id
          and u.auth_user_id = auth.uid()
      ) then
        v_authorized := true;
      end if;
    end if;
  end if;

  if not v_authorized then return '{}'::jsonb; end if;

  return jsonb_build_object(
    'evaluator_weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationship_code', relationship_code,
        'weight',            weight
      ) order by relationship_code)
      from public.cycle_evaluator_weights
      where cycle_id = p_cycle_id
    ), '[]'::jsonb),
    'competency_weights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'competency_id', competency_id,
        'weight',        weight
      ) order by competency_id)
      from public.cycle_competency_weights
      where cycle_id = p_cycle_id
    ), '[]'::jsonb)
  );
end$$;

grant execute on function public.get_cycle_weights(uuid) to authenticated;

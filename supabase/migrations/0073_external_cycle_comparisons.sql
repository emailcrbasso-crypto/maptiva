-- =====================================================================
-- 0073_external_cycle_comparisons.sql
--
-- Comparativo com ciclos anteriores feitos FORA do Maptiva (ex.:
-- avaliação 360 de 2024 da Flexmetal, conduzida por outra consultoria
-- — só o resultado agregado está disponível, não há base bruta).
--
-- Isso NÃO é analytics computado pelo Maptiva (não vem de
-- score_snapshots) — é um dado consolidado externo, já pronto,
-- anexado ao histórico da pessoa. Tratado como referência estática,
-- não recalculável, com a fonte/metodologia documentada em
-- source_note para transparência.
-- =====================================================================

create table public.external_cycle_comparisons (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  person_id        uuid not null references public.people(id) on delete cascade,
  comparison_type  text not null check (comparison_type in ('dimensao', 'valor')),
  label            text not null,
  is_total         boolean not null default false,
  year_from        text not null,
  value_from       numeric,
  year_to          text not null,
  value_to         numeric,
  variacao         numeric,
  variacao_pct     numeric,
  situacao         text,
  analise          text,
  order_index      int not null default 0,
  source_note      text,
  n_from           int,
  n_to             int,
  created_at       timestamptz not null default now()
);

create index on public.external_cycle_comparisons (tenant_id, person_id, comparison_type);

alter table public.external_cycle_comparisons enable row level security;

create policy ecc_select on public.external_cycle_comparisons
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and (
      app.is_admin_or_owner()
      or app.manages_person(person_id)
      or person_id = app.person_id_for_user()
    )
  );

-- INSERT/UPDATE/DELETE: só service_role (dado importado manualmente,
-- igual todo o resto do módulo de import histórico).

-- ── RPC de leitura ────────────────────────────────────────────────────

create or replace function app.get_person_external_comparison(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.people where id = p_person_id;

  if not found then
    return '[]'::jsonb;
  end if;

  if app.current_tenant_id() is distinct from v_tenant_id then
    return '[]'::jsonb;
  end if;

  if not (
    app.is_admin_or_owner()
    or app.manages_person(p_person_id)
    or p_person_id = app.person_id_for_user()
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'comparison_type', ecc.comparison_type,
        'label',           ecc.label,
        'is_total',        ecc.is_total,
        'year_from',       ecc.year_from,
        'value_from',      ecc.value_from,
        'year_to',         ecc.year_to,
        'value_to',        ecc.value_to,
        'variacao',        ecc.variacao,
        'variacao_pct',    ecc.variacao_pct,
        'situacao',        ecc.situacao,
        'analise',         ecc.analise,
        'source_note',     ecc.source_note,
        'n_from',          ecc.n_from,
        'n_to',            ecc.n_to
      ) order by ecc.comparison_type, ecc.order_index
    )
    from public.external_cycle_comparisons ecc
    where ecc.person_id = p_person_id
  ), '[]'::jsonb);
end$$;

grant execute on function app.get_person_external_comparison(uuid) to authenticated;

create or replace function public.get_person_external_comparison(p_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_person_external_comparison(p_person_id); end$$;

grant execute on function public.get_person_external_comparison(uuid) to authenticated;

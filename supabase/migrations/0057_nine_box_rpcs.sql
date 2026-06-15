-- =====================================================================
-- 0057_nine_box_rpcs.sql
--
-- RPCs do módulo Nine Box. Padrão: lógica em app.*, wrapper public.*
-- (supabase.rpc só enxerga o schema public).
--
--   get_nine_box_config            — admin: lê config (cria default se faltar)
--   set_nine_box_config            — admin: upsert da config dos eixos
--   compute_nine_box               — admin: resolve eixos + calcula faixas
--   set_participant_nine_box_manual — admin: grava valores manuais de um eixo
--   calibrate_participant          — admin: override de faixa (calibração)
--   get_nine_box_grid              — admin: participantes + posição p/ o grid
-- =====================================================================

-- ── Helper: resolve faixa (1/2/3) a partir de valor + thresholds ──────
create or replace function app.nb_band(
  p_value numeric, p_low_max numeric, p_high_min numeric
) returns int
language sql immutable as $$
  select case
    when p_value is null      then null
    when p_value <  p_low_max then 1
    when p_value >= p_high_min then 3
    else 2
  end
$$;

-- ── get_nine_box_config ───────────────────────────────────────────────
create or replace function app.get_nine_box_config(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_cfg       jsonb;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  select to_jsonb(c) into v_cfg
  from public.cycle_nine_box_config c
  where c.cycle_id = p_cycle_id;

  -- Sem config ainda: devolve default não-persistido
  if v_cfg is null then
    return jsonb_build_object(
      'cycle_id',      p_cycle_id,
      'enabled',       false,
      'perf_label',    'Desempenho',
      'perf_source',   'manual',
      'perf_competency_ids', '[]'::jsonb,
      'perf_low_max',  2.3333,
      'perf_high_min', 3.6667,
      'pot_label',     'Potencial',
      'pot_source',    'overall',
      'pot_competency_ids', '[]'::jsonb,
      'pot_low_max',   2.3333,
      'pot_high_min',  3.6667
    );
  end if;

  return v_cfg;
end$$;

-- ── set_nine_box_config ───────────────────────────────────────────────
-- p_config: objeto com os campos da tabela (parcial permitido).
create or replace function app.set_nine_box_config(p_cycle_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  insert into public.cycle_nine_box_config (
    tenant_id, cycle_id, enabled,
    perf_label, perf_source, perf_competency_ids, perf_low_max, perf_high_min,
    pot_label,  pot_source,  pot_competency_ids,  pot_low_max,  pot_high_min,
    updated_at
  )
  values (
    v_tenant_id, p_cycle_id,
    coalesce((p_config->>'enabled')::boolean, false),
    coalesce(p_config->>'perf_label', 'Desempenho'),
    coalesce(p_config->>'perf_source', 'manual'),
    coalesce((
      select array_agg((e)::uuid)
      from jsonb_array_elements_text(coalesce(p_config->'perf_competency_ids','[]')) e
    ), '{}'),
    coalesce((p_config->>'perf_low_max')::numeric, 2.3333),
    coalesce((p_config->>'perf_high_min')::numeric, 3.6667),
    coalesce(p_config->>'pot_label', 'Potencial'),
    coalesce(p_config->>'pot_source', 'overall'),
    coalesce((
      select array_agg((e)::uuid)
      from jsonb_array_elements_text(coalesce(p_config->'pot_competency_ids','[]')) e
    ), '{}'),
    coalesce((p_config->>'pot_low_max')::numeric, 2.3333),
    coalesce((p_config->>'pot_high_min')::numeric, 3.6667),
    now()
  )
  on conflict (cycle_id) do update set
    enabled             = coalesce((p_config->>'enabled')::boolean, public.cycle_nine_box_config.enabled),
    perf_label          = coalesce(p_config->>'perf_label', public.cycle_nine_box_config.perf_label),
    perf_source         = coalesce(p_config->>'perf_source', public.cycle_nine_box_config.perf_source),
    perf_competency_ids = coalesce((
      select array_agg((e)::uuid)
      from jsonb_array_elements_text(p_config->'perf_competency_ids') e
    ), public.cycle_nine_box_config.perf_competency_ids),
    perf_low_max        = coalesce((p_config->>'perf_low_max')::numeric, public.cycle_nine_box_config.perf_low_max),
    perf_high_min       = coalesce((p_config->>'perf_high_min')::numeric, public.cycle_nine_box_config.perf_high_min),
    pot_label           = coalesce(p_config->>'pot_label', public.cycle_nine_box_config.pot_label),
    pot_source          = coalesce(p_config->>'pot_source', public.cycle_nine_box_config.pot_source),
    pot_competency_ids  = coalesce((
      select array_agg((e)::uuid)
      from jsonb_array_elements_text(p_config->'pot_competency_ids') e
    ), public.cycle_nine_box_config.pot_competency_ids),
    pot_low_max         = coalesce((p_config->>'pot_low_max')::numeric, public.cycle_nine_box_config.pot_low_max),
    pot_high_min        = coalesce((p_config->>'pot_high_min')::numeric, public.cycle_nine_box_config.pot_high_min),
    updated_at          = now();

  return app.get_nine_box_config(p_cycle_id);
end$$;

-- ── set_participant_nine_box_manual ───────────────────────────────────
-- Grava valores manuais de eixo (usados quando a fonte = 'manual').
-- Passar NULL mantém o valor existente.
create or replace function app.set_participant_nine_box_manual(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_perf_manual numeric default null,
  p_pot_manual  numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  insert into public.participant_nine_box (
    tenant_id, cycle_id, cycle_participant_id, perf_manual, pot_manual, updated_at
  )
  values (v_tenant_id, p_cycle_id, p_cp_id, p_perf_manual, p_pot_manual, now())
  on conflict (cycle_id, cycle_participant_id) do update set
    perf_manual = coalesce(p_perf_manual, public.participant_nine_box.perf_manual),
    pot_manual  = coalesce(p_pot_manual,  public.participant_nine_box.pot_manual),
    updated_at  = now();
end$$;

-- ── compute_nine_box ──────────────────────────────────────────────────
-- Resolve perf_value/pot_value por participante conforme a fonte de cada
-- eixo e calcula as faixas automáticas. Preserva perf_manual/pot_manual e
-- os overrides de calibração (cal_*_band) já existentes.
create or replace function app.compute_nine_box(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_cfg       public.cycle_nine_box_config;
  v_count     int := 0;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  select * into v_cfg from public.cycle_nine_box_config where cycle_id = p_cycle_id;
  if not found then raise exception 'nine_box_not_configured' using errcode = 'P0012'; end if;

  -- Garante uma linha por participante com profile calculado
  insert into public.participant_nine_box (tenant_id, cycle_id, cycle_participant_id)
  select v_tenant_id, p_cycle_id, prp.cycle_participant_id
  from public.participant_result_profiles prp
  where prp.cycle_id = p_cycle_id
  on conflict (cycle_id, cycle_participant_id) do nothing;

  -- Resolve valores de eixo por fonte
  with derived_perf as (
    select ss.cycle_participant_id, avg(ss.score_avg)::numeric as v
    from public.score_snapshots ss
    where ss.cycle_id = p_cycle_id
      and ss.visibility_status = 'visible'
      and ss.competency_id = any (v_cfg.perf_competency_ids)
    group by ss.cycle_participant_id
  ),
  derived_pot as (
    select ss.cycle_participant_id, avg(ss.score_avg)::numeric as v
    from public.score_snapshots ss
    where ss.cycle_id = p_cycle_id
      and ss.visibility_status = 'visible'
      and ss.competency_id = any (v_cfg.pot_competency_ids)
    group by ss.cycle_participant_id
  ),
  resolved as (
    select
      nb.cycle_participant_id,
      round(case v_cfg.perf_source
        when 'overall' then prp.overall_score
        when 'derived' then dp.v
        else nb.perf_manual
      end, 4) as perf_value,
      round(case v_cfg.pot_source
        when 'overall' then prp.overall_score
        when 'derived' then dt.v
        else nb.pot_manual
      end, 4) as pot_value
    from public.participant_nine_box nb
    join public.participant_result_profiles prp
      on prp.cycle_id = p_cycle_id
     and prp.cycle_participant_id = nb.cycle_participant_id
    left join derived_perf dp on dp.cycle_participant_id = nb.cycle_participant_id
    left join derived_pot  dt on dt.cycle_participant_id = nb.cycle_participant_id
    where nb.cycle_id = p_cycle_id
  )
  update public.participant_nine_box nb
  set perf_value     = r.perf_value,
      pot_value      = r.pot_value,
      auto_perf_band = app.nb_band(r.perf_value, v_cfg.perf_low_max, v_cfg.perf_high_min),
      auto_pot_band  = app.nb_band(r.pot_value,  v_cfg.pot_low_max,  v_cfg.pot_high_min),
      computed_at    = now(),
      updated_at     = now()
  from resolved r
  where nb.cycle_id = p_cycle_id
    and nb.cycle_participant_id = r.cycle_participant_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'cycle_id',     p_cycle_id,
    'participants', v_count,
    'computed_at',  now()::text
  );
end$$;

-- ── calibrate_participant ─────────────────────────────────────────────
-- Override manual de faixa. Passar band = 0 limpa o override (volta ao auto).
create or replace function app.calibrate_participant(
  p_cycle_id uuid,
  p_cp_id    uuid,
  p_perf_band int default null,
  p_pot_band  int default null,
  p_notes     text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  update public.participant_nine_box
  set cal_perf_band = case when p_perf_band = 0 then null
                           when p_perf_band is not null then p_perf_band
                           else cal_perf_band end,
      cal_pot_band  = case when p_pot_band = 0 then null
                           when p_pot_band is not null then p_pot_band
                           else cal_pot_band end,
      notes         = coalesce(p_notes, notes),
      updated_at    = now()
  where cycle_id = p_cycle_id and cycle_participant_id = p_cp_id;

  if not found then
    raise exception 'participant_not_in_nine_box' using errcode = 'P0013';
  end if;
end$$;

-- ── get_nine_box_grid ─────────────────────────────────────────────────
-- Participantes com posição final (calibração sobrepõe automático).
create or replace function app.get_nine_box_grid(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'cycle_participant_id', nb.cycle_participant_id,
      'person_name',  pe.name,
      'job_title',    pe.job_title,
      'department',   pe.department,
      'perf_value',   nb.perf_value,
      'pot_value',    nb.pot_value,
      'perf_manual',  nb.perf_manual,
      'pot_manual',   nb.pot_manual,
      'auto_perf_band', nb.auto_perf_band,
      'auto_pot_band',  nb.auto_pot_band,
      'cal_perf_band',  nb.cal_perf_band,
      'cal_pot_band',   nb.cal_pot_band,
      'perf_band',    coalesce(nb.cal_perf_band, nb.auto_perf_band),
      'pot_band',     coalesce(nb.cal_pot_band,  nb.auto_pot_band),
      'calibrated',   (nb.cal_perf_band is not null or nb.cal_pot_band is not null),
      'notes',        nb.notes
    ) order by pe.name)
    from public.participant_nine_box nb
    join public.cycle_participants cp on cp.id = nb.cycle_participant_id
    join public.people pe on pe.id = cp.person_id
    where nb.cycle_id = p_cycle_id
  ), '[]'::jsonb);
end$$;

-- ── Wrappers públicos ─────────────────────────────────────────────────
create or replace function public.get_nine_box_config(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_nine_box_config(p_cycle_id); end$$;

create or replace function public.set_nine_box_config(p_cycle_id uuid, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.set_nine_box_config(p_cycle_id, p_config); end$$;

create or replace function public.compute_nine_box(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.compute_nine_box(p_cycle_id); end$$;

create or replace function public.set_participant_nine_box_manual(
  p_cycle_id uuid, p_cp_id uuid, p_perf_manual numeric, p_pot_manual numeric
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin perform app.set_participant_nine_box_manual(p_cycle_id, p_cp_id, p_perf_manual, p_pot_manual); end$$;

create or replace function public.calibrate_participant(
  p_cycle_id uuid, p_cp_id uuid, p_perf_band int, p_pot_band int, p_notes text
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin perform app.calibrate_participant(p_cycle_id, p_cp_id, p_perf_band, p_pot_band, p_notes); end$$;

create or replace function public.get_nine_box_grid(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.get_nine_box_grid(p_cycle_id); end$$;

-- ── Grants ────────────────────────────────────────────────────────────
grant execute on function app.get_nine_box_config(uuid)        to authenticated;
grant execute on function app.set_nine_box_config(uuid, jsonb) to authenticated;
grant execute on function app.compute_nine_box(uuid)           to authenticated;
grant execute on function app.set_participant_nine_box_manual(uuid, uuid, numeric, numeric) to authenticated;
grant execute on function app.calibrate_participant(uuid, uuid, int, int, text) to authenticated;
grant execute on function app.get_nine_box_grid(uuid)          to authenticated;

grant execute on function public.get_nine_box_config(uuid)        to authenticated;
grant execute on function public.set_nine_box_config(uuid, jsonb) to authenticated;
grant execute on function public.compute_nine_box(uuid)           to authenticated;
grant execute on function public.set_participant_nine_box_manual(uuid, uuid, numeric, numeric) to authenticated;
grant execute on function public.calibrate_participant(uuid, uuid, int, int, text) to authenticated;
grant execute on function public.get_nine_box_grid(uuid)          to authenticated;

-- =====================================================================
-- 0083_fix_pdi_suggestions_query.sql
--
-- app.get_pdi_suggestions estava com ORDER BY/LIMIT aplicados DEPOIS de
-- um jsonb_agg sem GROUP BY — o que faz o Postgres rejeitar a consulta
-- (ORDER BY sobre coluna não agregada quando a query já colapsou em 1
-- linha via agregado). Confirmado por execução direta contra dados
-- reais: sempre falha com
--   "column ca.avg_score must appear in the GROUP BY clause..."
-- Ou seja, a seção "low_competencies" das sugestões de PDI está 100%
-- quebrada em produção hoje — o frontend engole o erro e mostra a lista
-- vazia, sem indicar falha.
--
-- Correção: seleciona e ordena/limita as 3 competências ANTES de
-- agregar em jsonb (CTE `top_gaps`), depois faz o jsonb_agg só sobre
-- essas 3 linhas já prontas.
-- =====================================================================

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
  v_gap_margin numeric := 0.3;
begin
  select tenant_id into v_tenant_id from public.cycles where id = p_cycle_id;
  if not found then raise exception 'cycle_not_found' using errcode = 'P0010'; end if;

  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Competências genuinamente abaixo da média do ciclo — seleciona e
  -- limita as 3 maiores gaps ANTES de agregar em jsonb (top_gaps),
  -- para não misturar ORDER BY/LIMIT com um jsonb_agg sem GROUP BY.
  with cycle_avg as (
    select
      ss.competency_id,
      avg(ss.score_avg) as avg_score,
      count(distinct ss.cycle_participant_id) as part_count
    from public.score_snapshots ss
    where ss.cycle_id          = p_cycle_id
      and ss.visibility_status = 'visible'
      and ss.relationship_code <> 'self'
      and ss.score_avg         is not null
    group by ss.competency_id
  ),
  participant_score as (
    select ss.competency_id, avg(ss.score_avg) as score_avg
    from public.score_snapshots ss
    where ss.cycle_id            = p_cycle_id
      and ss.cycle_participant_id = p_cp_id
      and ss.relationship_code   <> 'self'
      and ss.visibility_status   = 'visible'
      and ss.score_avg           is not null
    group by ss.competency_id
  ),
  top_gaps as (
    select
      ps.competency_id,
      ps.score_avg,
      ca.avg_score,
      (ca.avg_score - ps.score_avg) as gap
    from participant_score ps
    join cycle_avg ca on ca.competency_id = ps.competency_id
    -- Precisa de pelo menos mais 1 outro participante para a média ser uma
    -- referência válida, e a diferença precisa ser real (não ruído).
    where ca.part_count >= 2
      and (ca.avg_score - ps.score_avg) >= v_gap_margin
    order by gap desc
    limit 3
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'competency_id', tg.competency_id,
      'name',          co.name,
      'score_avg',     round(tg.score_avg::numeric, 2),
      'cycle_avg',     round(tg.avg_score::numeric, 2),
      'gap',           round(tg.gap::numeric, 2)
    ) order by tg.gap desc
  ), '[]'::jsonb)
  into v_low
  from top_gaps tg
  join public.competencies co on co.id = tg.competency_id;

  -- Blind spots (self bem acima da percepção externa) — inalterado, já
  -- usa o mesmo limiar (1.0) do compute_scores para blind_spot_count.
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

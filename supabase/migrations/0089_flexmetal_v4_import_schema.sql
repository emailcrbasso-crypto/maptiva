-- =====================================================================
-- 0089_flexmetal_v4_import_schema.sql
--
-- Suporte ao novo modelo de categorias do BD_Avaliacao360_FlexMetal_2026
-- v4 (7 categorias, peso igual por pessoa, número único pré-computado
-- pelo cliente). Ver e-mail/planilha do gestor para a especificação
-- completa (abas LEIA-ME, PARAMETROS, AUDITORIA).
--
-- 1) Nova categoria "Liderança Superior" — quem está acima do chefe
--    direto na linha de comando. As outras 6 categorias já mapeiam
--    pra relationship_code/relationship_detail existentes:
--      Autoavaliação      -> self
--      Chefe direto       -> manager               (sempre 1 pessoa,
--                                                     identificada — ver
--                                                     participant_report_notes)
--      Liderança superior -> manager_superior       (novo)
--      Pares              -> peer                   (sem detail)
--      Clientes internos  -> client                 (peso 0)
--      Equipe             -> subordinate + 'Direto'
--      Equipe indireta    -> subordinate + 'Indireto'
--
-- 2) cycles.external_overall_scores — quando true, compute_scores()
--    preserva o overall_score já gravado em vez de recalculá-lo (o
--    cliente forneceu a média ponderada e a favorabilidade ponderada
--    já prontas, calculadas com peso igual por pessoa — uma fórmula
--    que o compute_scores atual não implementa. Recalcular sobrescreveria
--    com o número errado).
--
-- 3) participant_report_notes — anotações pré-computadas por gestor que
--    não são recalculáveis pelo Maptiva (frase de leitura, posição
--    contra a média do grupo, nota obrigatória de confiabilidade etc.).
--    Tabela separada de participant_result_profiles de propósito: não é
--    tocada pelo DELETE+INSERT do compute_scores, então não precisa de
--    lógica de preservação.
--
-- 4) participant_question_divergence — a aba DIVERGENCIA (onde as
--    perspectivas mais discordam, pergunta a pergunta).
-- =====================================================================

-- ── 1. Novo relationship_type ────────────────────────────────────────
insert into public.relationship_types (code, name, is_system)
values ('manager_superior', 'Liderança Superior', true)
on conflict (code) do nothing;

-- ── 2. Trava de recálculo por ciclo ──────────────────────────────────
alter table public.cycles
  add column if not exists external_overall_scores boolean not null default false;

comment on column public.cycles.external_overall_scores is
  'Quando true, compute_scores() preserva overall_score/consultant_notes '
  'em vez de recalcular — usado quando o cliente fornece a nota final '
  'já pronta com uma fórmula de ponderação que o Maptiva ainda não '
  'implementa (ex.: peso igual por pessoa, FlexMetal 2026 v4).';

-- ── 3. Anotações pré-computadas por gestor ───────────────────────────
create table if not exists public.participant_report_notes (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  cycle_id                    uuid not null references public.cycles(id) on delete cascade,
  cycle_participant_id        uuid not null references public.cycle_participants(id) on delete cascade,

  -- Número único pré-computado (fonte da verdade — não recalcular)
  overall_score               numeric,
  overall_favorability_pct    numeric,

  -- Leitura estatística (aba AVALIADOS)
  reading_phrase              text,
  group_position              text,      -- 'acima' | 'dentro' | 'abaixo' da média do grupo
  group_position_diff         numeric,
  reading_threshold           numeric,
  ranking_secondary           int,
  self_favorability_pct       numeric,
  self_awareness_gap          numeric,

  -- Confiabilidade (aba CONFIABILIDADE)
  reliability_tier            text,      -- ex.: 'Frágil'
  reliability_alerts          text,
  reliability_mandatory_note  text,
  biggest_weight_group        text,
  biggest_weight_group_pct    numeric,
  undifferentiated_responses  int,

  -- Chefe direto identificado (exceção aprovada só pra esse tenant/template)
  direct_manager_name         text,

  created_at                  timestamptz not null default now(),
  unique (cycle_id, cycle_participant_id)
);

alter table public.participant_report_notes enable row level security;

drop policy if exists prn_select on public.participant_report_notes;
create policy prn_select on public.participant_report_notes
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and (
      app.is_admin_or_owner()
      or app.manages_person(
          (select cp.person_id from public.cycle_participants cp
           where cp.id = participant_report_notes.cycle_participant_id)
        )
      or (
        (select cp.person_id from public.cycle_participants cp
         where cp.id = participant_report_notes.cycle_participant_id)
        = app.person_id_for_user()
        and app.report_released(cycle_id)
      )
    )
  );
-- INSERT/UPDATE/DELETE: só service_role (script de importação).

-- ── 4. Divergência entre perspectivas, por pergunta ──────────────────
create table if not exists public.participant_question_divergence (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  cycle_id               uuid not null references public.cycles(id) on delete cascade,
  cycle_participant_id   uuid not null references public.cycle_participants(id) on delete cascade,
  question_number        int not null,
  question_prompt        text not null,
  dimension_name         text,
  amplitude_points       numeric not null,
  highest_group          text not null,
  highest_pct            numeric not null,
  lowest_group           text not null,
  lowest_pct             numeric not null,
  groups_compared        text,
  extreme_in_unweighted_group boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists idx_pqd_participant
  on public.participant_question_divergence (cycle_id, cycle_participant_id);

alter table public.participant_question_divergence enable row level security;

drop policy if exists pqd_select on public.participant_question_divergence;
create policy pqd_select on public.participant_question_divergence
  for select to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and (
      app.is_admin_or_owner()
      or app.manages_person(
          (select cp.person_id from public.cycle_participants cp
           where cp.id = participant_question_divergence.cycle_participant_id)
        )
      or (
        (select cp.person_id from public.cycle_participants cp
         where cp.id = participant_question_divergence.cycle_participant_id)
        = app.person_id_for_user()
        and app.report_released(cycle_id)
      )
    )
  );

-- ── 5. compute_scores — preserva overall_score quando travado ───────
create or replace function app.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id       uuid;
  v_template_id     uuid;
  v_n_min           int;
  v_blind_threshold numeric := 1.0;
  v_snapshot_count  int := 0;
  v_profile_count   int := 0;
  v_has_ew          boolean := false;
  v_has_cw          boolean := false;
  v_external_scores boolean;
begin
  select c.tenant_id, c.template_id, t.n_minimum_default, c.external_overall_scores
    into v_tenant_id, v_template_id, v_n_min, v_external_scores
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  if not (
       app.is_admin_or_owner()
       or auth.role() = 'service_role'
       or (auth.role() is null and session_user in ('service_role','postgres'))
     ) or (
       app.current_tenant_id() is not null
       and v_tenant_id <> app.current_tenant_id()
     )
  then
    raise exception 'cycle_not_authorized' using errcode = 'P0011';
  end if;

  create temp table tmp_consultant_notes on commit drop as
  select cycle_participant_id, consultant_notes
  from public.participant_result_profiles
  where cycle_id = p_cycle_id
    and consultant_notes is not null;

  -- Nota final travada (fornecida externamente) — preserva antes do DELETE.
  create temp table tmp_external_overall on commit drop as
  select cycle_participant_id, overall_score
  from public.participant_result_profiles
  where cycle_id = p_cycle_id
    and v_external_scores
    and overall_score is not null;

  delete from public.score_snapshots             where cycle_id = p_cycle_id;
  delete from public.participant_result_profiles where cycle_id = p_cycle_id;

  -- ── Snapshots ────────────────────────────────────────────────────
  insert into public.score_snapshots (
    tenant_id, cycle_id, cycle_participant_id, competency_id,
    dimension_code, relationship_code, relationship_group,
    score_avg, response_count, visibility_status, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code,
    a.relationship_code as relationship_group,
    round(avg(r.score)::numeric, 4),
    count(*)::int,
    case
      when a.relationship_code in ('self','manager') then 'visible'
      when count(distinct a.evaluator_cycle_participant_id) >= v_n_min then 'visible'
      else                                                'hidden'
    end,
    now()
  from public.responses r
  join public.assignments  a  on a.id  = r.assignment_id
  join public.questions    q  on q.id  = r.question_id
  left join public.competencies co on co.id = q.competency_id
  where a.cycle_id  = p_cycle_id
    and a.status    = 'completed'
    and r.score     is not null
  group by
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code;

  get diagnostics v_snapshot_count = row_count;

  -- ── score_distribution — count por valor numérico ────────────────
  with dist as (
    select
      sub.evaluated_cycle_participant_id,
      sub.competency_id,
      sub.relationship_code,
      jsonb_object_agg(sub.bucket::text, sub.cnt) as distribution
    from (
      select
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int as bucket,
        count(*)::int as cnt
      from public.responses   r2
      join public.assignments a2 on a2.id = r2.assignment_id
      join public.questions   q2 on q2.id = r2.question_id
      where a2.cycle_id = p_cycle_id
        and a2.status   = 'completed'
        and r2.score    is not null
      group by
        a2.evaluated_cycle_participant_id,
        q2.competency_id,
        a2.relationship_code,
        r2.score::int
    ) sub
    group by
      sub.evaluated_cycle_participant_id,
      sub.competency_id,
      sub.relationship_code
  )
  update public.score_snapshots ss
  set score_distribution = dist.distribution
  from dist
  where ss.cycle_id            = p_cycle_id
    and ss.cycle_participant_id = dist.evaluated_cycle_participant_id
    and ss.competency_id        is not distinct from dist.competency_id
    and ss.relationship_code    = dist.relationship_code;

  -- ── Profiles — INSERT com avg simples (self/manager/peer/sub) ────
  insert into public.participant_result_profiles (
    tenant_id, cycle_id, cycle_participant_id,
    overall_score, self_score, manager_score, peer_score, subordinate_score,
    blind_spot_count, hidden_strength_count, report_json, generated_at
  )
  select
    v_tenant_id,
    p_cycle_id,
    cp.id,
    round(avg(case when ss.visibility_status = 'visible'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'self'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'manager'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'peer'
                   then ss.score_avg end)::numeric, 4),
    round(avg(case when ss.visibility_status = 'visible'
                    and ss.relationship_code = 'subordinate'
                   then ss.score_avg end)::numeric, 4),
    0, 0,
    jsonb_build_object('computed_at', now()::text),
    now()
  from public.cycle_participants cp
  left join public.score_snapshots ss
    on ss.cycle_participant_id = cp.id
   and ss.cycle_id = p_cycle_id
  where cp.cycle_id = p_cycle_id
    and exists (
      select 1 from public.assignments a
      where a.cycle_id = p_cycle_id
        and a.evaluated_cycle_participant_id = cp.id
        and a.status = 'completed'
    )
  group by cp.id;

  get diagnostics v_profile_count = row_count;

  update public.participant_result_profiles prp
     set consultant_notes = tmp.consultant_notes
    from tmp_consultant_notes tmp
   where prp.cycle_id             = p_cycle_id
     and prp.cycle_participant_id = tmp.cycle_participant_id;

  -- Nota final travada — restaura por cima de qualquer recálculo abaixo.
  if v_external_scores then
    update public.participant_result_profiles prp
       set overall_score = tmp.overall_score
      from tmp_external_overall tmp
     where prp.cycle_id             = p_cycle_id
       and prp.cycle_participant_id = tmp.cycle_participant_id;
  end if;

  -- ── Ponderação: sobrescreve overall_score se houver QUALQUER peso ──
  -- (pulado inteiramente quando a nota é travada externamente — o
  -- cliente já forneceu o número final com a fórmula certa).
  if not v_external_scores then
    select exists(select 1 from public.cycle_evaluator_weights   where cycle_id = p_cycle_id) into v_has_ew;
    select exists(select 1 from public.cycle_competency_weights  where cycle_id = p_cycle_id) into v_has_cw;

    if v_has_ew or v_has_cw then
      create temp table tmp_overall_weighted on commit drop as
      with
      ew as (
        select relationship_code, weight
        from public.cycle_evaluator_weights
        where cycle_id = p_cycle_id and weight > 0
      ),
      cw as (
        select competency_id, weight
        from public.cycle_competency_weights
        where cycle_id = p_cycle_id
      ),
      comp_weighted as (
        select
          ss.cycle_participant_id,
          ss.competency_id,
          round(
            sum(ss.score_avg * coalesce(ew.weight, case when v_has_ew then 0 else 1.0 end)) /
            nullif(
              sum(coalesce(ew.weight, case when v_has_ew then 0 else 1.0 end))
                filter (where ss.score_avg is not null),
              0
            )
          ::numeric, 4) as w_score
        from public.score_snapshots ss
        left join ew on ew.relationship_code = ss.relationship_code
        where ss.cycle_id          = p_cycle_id
          and ss.visibility_status = 'visible'
          and ss.competency_id     is not null
          and ss.score_avg         is not null
        group by ss.cycle_participant_id, ss.competency_id
      )
      select
        cw_scores.cycle_participant_id,
        round(
          sum(cw_scores.w_score * coalesce(cw.weight, 1.0)) /
          nullif(
            sum(coalesce(cw.weight, 1.0)) filter (where cw_scores.w_score is not null),
            0
          )
        ::numeric, 4) as overall_score
      from comp_weighted cw_scores
      left join cw on cw.competency_id = cw_scores.competency_id
      group by cw_scores.cycle_participant_id;

      update public.participant_result_profiles prp
      set overall_score = ow.overall_score
      from tmp_overall_weighted ow
      where prp.cycle_id             = p_cycle_id
        and prp.cycle_participant_id = ow.cycle_participant_id;

      update public.participant_result_profiles prp
      set overall_score = null
      where prp.cycle_id = p_cycle_id
        and not exists (
          select 1 from tmp_overall_weighted ow
          where ow.cycle_participant_id = prp.cycle_participant_id
        );
    end if;
  end if;

  -- ── Blind spot / hidden strength ──────────────────────────────────
  with self_by_comp as (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  = 'self'
      and visibility_status  = 'visible'
      and competency_id      is not null
  ),
  others_by_comp as (
    select cycle_participant_id, competency_id,
           avg(score_avg)::numeric as others_avg
    from public.score_snapshots
    where cycle_id           = p_cycle_id
      and relationship_code  <> 'self'
      and visibility_status   = 'visible'
      and competency_id       is not null
    group by cycle_participant_id, competency_id
  ),
  gaps as (
    select s.cycle_participant_id,
           count(*) filter (
             where s.self_score - o.others_avg >= v_blind_threshold
           ) as blind_count,
           count(*) filter (
             where o.others_avg - s.self_score >= v_blind_threshold
           ) as hidden_count
    from self_by_comp s
    join others_by_comp o
      on o.cycle_participant_id = s.cycle_participant_id
     and o.competency_id        = s.competency_id
    group by s.cycle_participant_id
  )
  update public.participant_result_profiles prp
     set blind_spot_count      = coalesce(g.blind_count,  0),
         hidden_strength_count = coalesce(g.hidden_count, 0)
    from gaps g
   where prp.cycle_id             = p_cycle_id
     and prp.cycle_participant_id = g.cycle_participant_id;

  return jsonb_build_object(
    'cycle_id',         p_cycle_id,
    'snapshot_count',   v_snapshot_count,
    'profile_count',    v_profile_count,
    'n_minimum_used',   v_n_min,
    'weighted',         (v_has_ew or v_has_cw),
    'external_scores',  v_external_scores,
    'computed_at',      now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

create or replace function public.compute_scores(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return app.compute_scores(p_cycle_id);
end$$;

grant execute on function public.compute_scores(uuid) to authenticated;

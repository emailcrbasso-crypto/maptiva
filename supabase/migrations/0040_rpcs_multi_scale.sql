-- =====================================================================
-- 0040_rpcs_multi_scale.sql
--
-- Atualiza três RPCs para suporte a múltiplas escalas por ciclo:
--
--   app.get_assignment_context  — v5: retorna metadados de escala por pergunta
--   app.submit_response         — v2: validação per-question + is_na + mixed-range check
--   app.compute_scores          — v3: filtro explícito is_na + scale_id em respostas
--
-- Resolução de escala efetiva (todos os RPCs usam a mesma lógica):
--   COALESCE(q.scale_id, co.scale_id, t.scale_id)
--   onde co = competency vinculada à questão, t = template do ciclo
-- =====================================================================

-- ── Helper: effective_scale_id ─────────────────────────────────────────
-- Usado internamente; não exportado.

create or replace function app.effective_scale_id(
  p_question_scale_id    text,
  p_competency_scale_id  text,
  p_template_scale_id    text
)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select coalesce(p_question_scale_id, p_competency_scale_id, p_template_scale_id)
$$;


-- ── get_assignment_context v5 ─────────────────────────────────────────
-- Retorna por pergunta: scale_id, scale_min, scale_max, scale_allow_na,
-- scale_na_label, scale_labels.
-- Top-level scale_min/scale_max mantidos (template) para backward compat.

create or replace function app.get_assignment_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_hash               text := app.hash_token(p_token);
  v_assn               record;
  v_evaluated_name     text;
  v_questionnaire_name text;
  v_cycle_name         text;
  v_scale_min          int;
  v_scale_max          int;
  v_questions          jsonb;
  v_tenant             record;
begin
  -- Valida token
  select a.id, a.tenant_id, a.cycle_id, a.questionnaire_id,
         a.relationship_code, a.evaluated_cycle_participant_id,
         a.status, a.token_expires_at, a.used_at
    into v_assn
  from public.assignments a
  where a.magic_token_hash = v_hash;

  if not found then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  if v_assn.used_at is not null then
    raise exception 'token_already_used' using errcode = 'P0002';
  end if;

  if v_assn.status not in ('pending','invited') then
    raise exception 'token_status_invalid: %', v_assn.status using errcode = 'P0003';
  end if;

  if v_assn.token_expires_at is not null and v_assn.token_expires_at < now() then
    raise exception 'token_expired' using errcode = 'P0004';
  end if;

  -- Nome do avaliado
  select p.name
    into v_evaluated_name
  from public.cycle_participants cp
  join public.people p on p.id = cp.person_id
  where cp.id = v_assn.evaluated_cycle_participant_id;

  -- Nome do questionário e ciclo; escala do template (top-level, backward compat)
  select q.name into v_questionnaire_name
  from public.questionnaires q where q.id = v_assn.questionnaire_id;

  select c.name into v_cycle_name
  from public.cycles c where c.id = v_assn.cycle_id;

  select t.scale_min, t.scale_max
    into v_scale_min, v_scale_max
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = v_assn.cycle_id;

  -- Branding do tenant
  select
    coalesce(t.display_name, t.name)      as tenant_name,
    t.logo_url                            as logo_url,
    coalesce(t.primary_color, '#111827')  as primary_color,
    coalesce(t.hide_maptiva_brand, false) as hide_maptiva
  into v_tenant
  from public.tenants t
  where t.id = v_assn.tenant_id;

  -- Perguntas com metadados de escala por pergunta
  -- Resolução: COALESCE(q.scale_id, co.scale_id, tmpl.scale_id)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',              q.id,
        'prompt',          q.prompt,
        'response_type',   q.response_type,
        'order_index',     qq.order_index,
        'competency_id',   q.competency_id,
        'competency_name', co.name,
        -- Escala efetiva desta pergunta
        'scale_id',        rs.id,
        'scale_min',       rs.min,
        'scale_max',       rs.max,
        'scale_allow_na',  rs.allow_na,
        'scale_na_label',  rs.na_label,
        'scale_labels',    rs.labels_json
      )
      order by qq.order_index
    ),
    '[]'::jsonb
  )
    into v_questions
  from public.questionnaire_questions qq
  join public.questions          q   on q.id   = qq.question_id
  join public.cycles             cy  on cy.id  = v_assn.cycle_id
  join public.templates          tmpl on tmpl.id = cy.template_id
  left join public.competencies  co  on co.id  = q.competency_id
  -- Resolve escala efetiva e junta metadados
  join app.response_scales       rs  on rs.id  = app.effective_scale_id(
                                          q.scale_id,
                                          co.scale_id,
                                          tmpl.scale_id
                                        )
  where qq.questionnaire_id = v_assn.questionnaire_id;

  return jsonb_build_object(
    'assignment_id',        v_assn.id,
    'cycle_id',             v_assn.cycle_id,
    'cycle_name',           v_cycle_name,
    'questionnaire_id',     v_assn.questionnaire_id,
    'questionnaire_name',   v_questionnaire_name,
    'relationship_code',    v_assn.relationship_code,
    'evaluated_name',       v_evaluated_name,
    -- Top-level scale (template default, backward compat)
    'scale_min',            coalesce(v_scale_min, 1),
    'scale_max',            coalesce(v_scale_max, 5),
    'questions',            v_questions,
    -- Branding
    'tenant_name',          coalesce(v_tenant.tenant_name, 'Maptiva'),
    'tenant_logo_url',      v_tenant.logo_url,
    'tenant_primary_color', coalesce(v_tenant.primary_color, '#111827'),
    'tenant_hide_maptiva',  coalesce(v_tenant.hide_maptiva, false)
  );
end$$;

grant execute on function app.get_assignment_context(text) to authenticated, anon;


-- ── submit_response v2 ────────────────────────────────────────────────
-- Mudanças em relação à v1:
--   1. Verifica range único por questionário antes do loop (P0008)
--   2. Valida score contra escala efetiva da pergunta (não mais template global)
--   3. Aceita is_na no payload; grava scale_id + is_na em responses
--   4. Errcodes novos: P0008 (mixed_scale_ranges), P0009 (na_not_allowed)
--
-- p_answers:  [{question_id, score, text_answer, is_na?}, ...]
-- p_comments: [{question_id?, body}, ...]

create or replace function app.submit_response(
  p_token    text,
  p_answers  jsonb,
  p_comments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_hash          text := app.hash_token(p_token);
  v_assn          record;
  v_template      record;
  v_answer        jsonb;
  v_comment       jsonb;
  v_q             record;
  v_rs            record;   -- effective response_scale for current question
  v_effective_sid text;
  v_allow_na      boolean;
  v_is_na         boolean;
  v_score_val     numeric;
  v_inserted      int := 0;
  v_comments_count int := 0;

  -- Para verificação de range único
  v_distinct_ranges int;
begin
  -- Lock assignment row
  select a.id, a.tenant_id, a.cycle_id, a.questionnaire_id,
         a.status, a.token_expires_at, a.used_at,
         c.template_id
    into v_assn
  from public.assignments a
  join public.cycles c on c.id = a.cycle_id
  where a.magic_token_hash = v_hash
  for update of a;

  if not found then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;

  if v_assn.used_at is not null then
    raise exception 'token_already_used' using errcode = 'P0002';
  end if;

  if v_assn.status not in ('pending','invited') then
    raise exception 'token_status_invalid: %', v_assn.status using errcode = 'P0003';
  end if;

  if v_assn.token_expires_at is not null and v_assn.token_expires_at < now() then
    raise exception 'token_expired' using errcode = 'P0004';
  end if;

  -- Carrega template para allow_na global e scale_id padrão
  select t.allow_na, t.scale_id
    into v_template
  from public.templates t
  where t.id = v_assn.template_id;

  -- ── Verificação de range único no questionário ─────────────────────
  -- Todas as perguntas de tipo 'scale' devem compartilhar o mesmo min/max.
  -- Misturar ranges (ex: 1-5 + 1-4) viola a invariante de comparabilidade.
  select count(distinct row(rs.min, rs.max))
    into v_distinct_ranges
  from public.questionnaire_questions qq
  join public.questions     q    on q.id   = qq.question_id
  join public.cycles        cy   on cy.id  = v_assn.cycle_id
  join public.templates     tmpl on tmpl.id = cy.template_id
  left join public.competencies co on co.id = q.competency_id
  join app.response_scales  rs   on rs.id  = app.effective_scale_id(
                                      q.scale_id,
                                      co.scale_id,
                                      tmpl.scale_id
                                    )
  where qq.questionnaire_id = v_assn.questionnaire_id
    and q.response_type     = 'scale';

  if v_distinct_ranges > 1 then
    raise exception 'mixed_scale_ranges: questionnaire has questions with different scale ranges'
      using errcode = 'P0008';
  end if;

  -- ── Loop de respostas ──────────────────────────────────────────────
  for v_answer in
    select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    -- Verifica que a pergunta pertence ao questionário E ao tenant
    select q.id, q.response_type, q.scale_id as q_scale_id,
           q.competency_id
      into v_q
    from public.questions q
    join public.questionnaire_questions qq on qq.question_id = q.id
    where qq.questionnaire_id = v_assn.questionnaire_id
      and q.id        = (v_answer->>'question_id')::uuid
      and q.tenant_id = v_assn.tenant_id;

    if not found then
      raise exception 'invalid_question_for_assignment: %',
        v_answer->>'question_id'
        using errcode = 'P0005';
    end if;

    -- Para perguntas scale, carrega escala efetiva
    if v_q.response_type = 'scale' then
      select rs.*
        into v_rs
      from public.cycles        cy
      join public.templates     tmpl on tmpl.id = cy.template_id
      left join public.competencies co on co.id = v_q.competency_id
      join app.response_scales  rs   on rs.id   = app.effective_scale_id(
                                          v_q.q_scale_id,
                                          co.scale_id,
                                          tmpl.scale_id
                                        )
      where cy.id = v_assn.cycle_id;

      v_effective_sid := v_rs.id;

      -- N/A override global: template.allow_na = false desabilita tudo
      v_allow_na := v_rs.allow_na and coalesce(v_template.allow_na, true);

      -- Lê is_na do payload (padrão: false)
      v_is_na := coalesce((v_answer->>'is_na')::boolean, false);

      if v_is_na then
        -- N/A explícito: verifica permissão
        if not v_allow_na then
          raise exception 'na_not_allowed for question: %', v_q.id
            using errcode = 'P0009';
        end if;
        -- score = NULL quando is_na — já garantido pelo constraint chk_na_score_null
        v_score_val := null;
      else
        -- Valida score numérico contra range da escala efetiva
        if (v_answer ? 'score') and v_answer->>'score' is not null
           and v_answer->>'score' <> '' then
          v_score_val := (v_answer->>'score')::numeric;
          if v_score_val < v_rs.min or v_score_val > v_rs.max then
            raise exception 'score_out_of_range: % not in [%, %]',
              v_score_val, v_rs.min, v_rs.max
              using errcode = 'P0006';
          end if;
        elsif not v_allow_na then
          raise exception 'score_required_for_question: %', v_q.id
            using errcode = 'P0007';
        else
          v_score_val := null;
        end if;
      end if;
    else
      -- Perguntas text/boolean: sem validação de escala
      v_effective_sid := null;
      v_is_na         := false;
      v_score_val     := null;
    end if;

    -- UPSERT idempotente
    insert into public.responses
      (tenant_id, assignment_id, question_id, score, text_answer, scale_id, is_na)
    values (
      v_assn.tenant_id,
      v_assn.id,
      v_q.id,
      v_score_val,
      nullif(v_answer->>'text_answer', ''),
      v_effective_sid,
      v_is_na
    )
    on conflict (assignment_id, question_id) do update
      set score       = excluded.score,
          text_answer = excluded.text_answer,
          scale_id    = excluded.scale_id,
          is_na       = excluded.is_na;

    v_inserted := v_inserted + 1;
  end loop;

  -- ── Comentários ────────────────────────────────────────────────────
  for v_comment in
    select * from jsonb_array_elements(coalesce(p_comments, '[]'::jsonb))
  loop
    if coalesce(v_comment->>'body', '') = '' then
      continue;
    end if;

    insert into public.comments
      (tenant_id, assignment_id, question_id, body)
    values (
      v_assn.tenant_id,
      v_assn.id,
      nullif(v_comment->>'question_id', '')::uuid,
      v_comment->>'body'
    );
    v_comments_count := v_comments_count + 1;
  end loop;

  -- ── Finaliza assignment ────────────────────────────────────────────
  update public.assignments
     set status       = 'completed',
         completed_at = now(),
         used_at      = now()
   where id = v_assn.id;

  -- Audit
  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_assn.tenant_id,
    'assignments',
    v_assn.id,
    'response_submitted',
    jsonb_build_object(
      'answers_count',  v_inserted,
      'comments_count', v_comments_count
    )
  );

  return jsonb_build_object(
    'ok',             true,
    'assignment_id',  v_assn.id,
    'answers_count',  v_inserted,
    'comments_count', v_comments_count
  );
end$$;

grant execute on function app.submit_response(text, jsonb, jsonb)
  to authenticated, anon;


-- ── compute_scores v3 ─────────────────────────────────────────────────
-- Mudanças em relação à v2 (0025):
--   1. Filtro explícito r.is_na = false (não apenas score IS NOT NULL)
--      — clareza de intent: N/A deliberados não entram na média
--   2. Sem mudança na lógica de agregação (ranges garantidamente iguais)

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
begin
  select c.tenant_id, c.template_id, t.n_minimum_default
    into v_tenant_id, v_template_id, v_n_min
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

  -- Idempotência
  delete from public.score_snapshots           where cycle_id = p_cycle_id;
  delete from public.participant_result_profiles where cycle_id = p_cycle_id;

  -- ── Snapshots ──────────────────────────────────────────────────────
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
      when count(*) >= v_n_min                       then 'visible'
      else                                                'hidden'
    end,
    now()
  from public.responses   r
  join public.assignments  a  on a.id  = r.assignment_id
  join public.questions    q  on q.id  = r.question_id
  left join public.competencies co on co.id = q.competency_id
  where a.cycle_id  = p_cycle_id
    and a.status    = 'completed'
    and r.score     is not null
    and r.is_na     = false                          -- ← explícito: exclui N/A
  group by
    a.evaluated_cycle_participant_id,
    q.competency_id,
    co.dimension_code,
    a.relationship_code;

  get diagnostics v_snapshot_count = row_count;

  -- ── Profiles ────────────────────────────────────────────────────────
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

  -- ── Blind spot / hidden strength ────────────────────────────────────
  with self_by_comp as (
    select cycle_participant_id, competency_id, score_avg as self_score
    from public.score_snapshots
    where cycle_id          = p_cycle_id
      and relationship_code = 'self'
      and visibility_status = 'visible'
      and competency_id     is not null
  ),
  others_by_comp as (
    select cycle_participant_id, competency_id,
           avg(score_avg)::numeric as others_avg
    from public.score_snapshots
    where cycle_id          = p_cycle_id
      and relationship_code <> 'self'
      and visibility_status  = 'visible'
      and competency_id      is not null
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
    'cycle_id',       p_cycle_id,
    'snapshot_count', v_snapshot_count,
    'profile_count',  v_profile_count,
    'n_minimum_used', v_n_min,
    'computed_at',    now()::text
  );
end$$;

grant execute on function app.compute_scores(uuid) to authenticated;

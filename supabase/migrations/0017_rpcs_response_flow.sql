-- =====================================================================
-- 0017_rpcs_response_flow.sql
-- RPCs do fluxo de resposta por magic link.
-- Todas SECURITY DEFINER; rodam como owner (postgres) e bypassam RLS.
-- Acessíveis a anon (fluxo público) e authenticated.
-- =====================================================================

-- ---------- Helper: hash determinístico do token ----------
-- Qualificamos extensions.digest porque pgcrypto vive em `extensions`
-- no Supabase, e nossas funções com search_path explícito não o incluem.
create or replace function app.hash_token(p_token text)
returns text
language sql
immutable
set search_path = extensions, pg_temp
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

grant execute on function app.hash_token(text) to authenticated, anon;

-- ---------- get_assignment_context ----------
-- Recebe token cru, valida, e retorna contexto mínimo para preencher
-- o questionário. NÃO expõe identidade do evaluator.
create or replace function app.get_assignment_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := app.hash_token(p_token);
  v_assn record;
  v_evaluated_name text;
  v_questionnaire_name text;
  v_cycle_name text;
  v_questions jsonb;
begin
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

  -- Nome do avaliado (sem expor evaluator).
  select p.name
    into v_evaluated_name
  from public.cycle_participants cp
  join public.people p on p.id = cp.person_id
  where cp.id = v_assn.evaluated_cycle_participant_id;

  -- Nome do questionário e do ciclo.
  select q.name into v_questionnaire_name
  from public.questionnaires q where q.id = v_assn.questionnaire_id;

  select c.name into v_cycle_name
  from public.cycles c where c.id = v_assn.cycle_id;

  -- Perguntas em ordem.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',            q.id,
        'prompt',        q.prompt,
        'response_type', q.response_type,
        'order_index',   qq.order_index,
        'competency_id', q.competency_id
      )
      order by qq.order_index
    ),
    '[]'::jsonb
  )
    into v_questions
  from public.questionnaire_questions qq
  join public.questions q on q.id = qq.question_id
  where qq.questionnaire_id = v_assn.questionnaire_id;

  return jsonb_build_object(
    'assignment_id',     v_assn.id,
    'cycle_id',          v_assn.cycle_id,
    'cycle_name',        v_cycle_name,
    'questionnaire_id',  v_assn.questionnaire_id,
    'questionnaire_name',v_questionnaire_name,
    'relationship_code', v_assn.relationship_code,
    'evaluated_name',    v_evaluated_name,
    'questions',         v_questions
  );
end$$;

grant execute on function app.get_assignment_context(text) to authenticated, anon;

-- ---------- submit_response ----------
-- Recebe token + answers + comments. Valida, grava, marca o assignment
-- como completed, registra audit_log. Tudo derivando tenant_id do
-- próprio assignment (caller nunca informa tenant_id).
--
-- p_answers:  [{question_id, score, text_answer}, ...]
-- p_comments: [{question_id?, body}, ...]
create or replace function app.submit_response(
  p_token text,
  p_answers jsonb,
  p_comments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := app.hash_token(p_token);
  v_assn record;
  v_scale_min int;
  v_scale_max int;
  v_allow_na boolean;
  v_answer jsonb;
  v_comment jsonb;
  v_q record;
  v_inserted int := 0;
  v_comments_count int := 0;
begin
  -- Lock the assignment row to serialize concurrent submits.
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

  -- Escala do template (limites de validação).
  select t.scale_min, t.scale_max, coalesce(t.allow_na, true)
    into v_scale_min, v_scale_max, v_allow_na
  from public.templates t
  where t.id = v_assn.template_id;

  -- Iterar respostas.
  for v_answer in
    select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    -- A pergunta DEVE pertencer ao questionário do assignment E ao tenant_id
    -- do assignment. Esta é a defesa contra forja cross-tenant.
    select q.id, q.response_type
      into v_q
    from public.questions q
    join public.questionnaire_questions qq on qq.question_id = q.id
    where qq.questionnaire_id = v_assn.questionnaire_id
      and q.id = (v_answer->>'question_id')::uuid
      and q.tenant_id = v_assn.tenant_id;

    if not found then
      raise exception 'invalid_question_for_assignment: %',
        v_answer->>'question_id'
        using errcode = 'P0005';
    end if;

    -- Validação de score quando response_type='scale'.
    if v_q.response_type = 'scale' then
      if (v_answer ? 'score') and v_answer->>'score' is not null
         and v_answer->>'score' <> '' then
        if (v_answer->>'score')::numeric < v_scale_min
           or (v_answer->>'score')::numeric > v_scale_max then
          raise exception 'score_out_of_range: %', v_answer->>'score'
            using errcode = 'P0006';
        end if;
      elsif not v_allow_na then
        raise exception 'score_required_for_question: %', v_q.id
          using errcode = 'P0007';
      end if;
    end if;

    -- UPSERT idempotente dentro da transação.
    insert into public.responses
      (tenant_id, assignment_id, question_id, score, text_answer)
    values (
      v_assn.tenant_id,
      v_assn.id,
      v_q.id,
      nullif(v_answer->>'score','')::numeric,
      nullif(v_answer->>'text_answer','')
    )
    on conflict (assignment_id, question_id) do update
      set score       = excluded.score,
          text_answer = excluded.text_answer;

    v_inserted := v_inserted + 1;
  end loop;

  -- Comments (opcional).
  for v_comment in
    select * from jsonb_array_elements(coalesce(p_comments, '[]'::jsonb))
  loop
    if coalesce(v_comment->>'body','') = '' then
      continue;
    end if;

    insert into public.comments
      (tenant_id, assignment_id, question_id, body)
    values (
      v_assn.tenant_id,
      v_assn.id,
      nullif(v_comment->>'question_id','')::uuid,
      v_comment->>'body'
    );
    v_comments_count := v_comments_count + 1;
  end loop;

  -- Marcar como completo + single-use.
  update public.assignments
     set status       = 'completed',
         completed_at = now(),
         used_at      = now()
   where id = v_assn.id;

  -- Audit.
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

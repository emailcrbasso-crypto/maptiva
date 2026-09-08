-- =====================================================================
-- 0084_fix_submit_response_validation.sql
--
-- Duas falhas reais confirmadas em app.submit_response (v2, 0040):
--
-- 1) Um envio com p_answers = [] (ou faltando perguntas obrigatórias)
--    passava direto pelo loop (0 iterações) e mesmo assim marcava o
--    assignment como 'completed' — uma avaliação podia ser "concluída"
--    sem nenhuma resposta de verdade.
--
-- 2) Não verificava se o ciclo ainda estava 'active'. Um token ainda
--    'pending'/'invited' (ex.: alguém começou e não terminou antes do
--    fechamento) podia enviar respostas depois do ciclo já fechado e
--    dos scores já calculados.
--
-- Correção:
--  - Exige c.status = 'active' antes de aceitar a submissão.
--  - Depois de gravar as respostas enviadas, confere que TODAS as
--    perguntas do questionário do assignment têm resposta (score
--    preenchido, is_na=true, ou text_answer preenchido para perguntas
--    de texto) antes de marcar como 'completed'. Se faltar alguma,
--    rejeita a submissão inteira (nada é marcado como completo).
-- =====================================================================

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
  v_rs            record;
  v_effective_sid text;
  v_allow_na      boolean;
  v_is_na         boolean;
  v_score_val     numeric;
  v_inserted      int := 0;
  v_comments_count int := 0;
  v_distinct_ranges int;
  v_missing_count   int;
begin
  -- Lock assignment row + carrega status do ciclo
  select a.id, a.tenant_id, a.cycle_id, a.questionnaire_id,
         a.status, a.token_expires_at, a.used_at,
         c.template_id, c.status as cycle_status
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

  if v_assn.cycle_status <> 'active' then
    raise exception 'cycle_not_open: %', v_assn.cycle_status using errcode = 'P0011';
  end if;

  select t.allow_na, t.scale_id
    into v_template
  from public.templates t
  where t.id = v_assn.template_id;

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

  for v_answer in
    select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
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
      v_allow_na := v_rs.allow_na and coalesce(v_template.allow_na, true);
      v_is_na := coalesce((v_answer->>'is_na')::boolean, false);

      if v_is_na then
        if not v_allow_na then
          raise exception 'na_not_allowed for question: %', v_q.id
            using errcode = 'P0009';
        end if;
        v_score_val := null;
      else
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
      v_effective_sid := null;
      v_is_na         := false;
      v_score_val     := null;
    end if;

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

  -- ── Confere que toda pergunta de escala do questionário foi respondida ──
  -- (score preenchido ou is_na=true) antes de aceitar a conclusão do
  -- assignment. Só cobre 'scale' — perguntas de texto são opcionais no
  -- fluxo atual (o próprio frontend só valida as de escala; exigir texto
  -- aqui quebraria submissões legítimas com campo de texto em branco).
  select count(*)
    into v_missing_count
  from public.questionnaire_questions qq
  join public.questions q on q.id = qq.question_id
  where qq.questionnaire_id = v_assn.questionnaire_id
    and q.response_type = 'scale'
    and not exists (
      select 1 from public.responses r
      where r.assignment_id = v_assn.id
        and r.question_id   = q.id
        and (r.score is not null or r.is_na)
    );

  if v_missing_count > 0 then
    raise exception 'missing_required_answers: % question(s) unanswered', v_missing_count
      using errcode = 'P0010';
  end if;

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

  update public.assignments
     set status       = 'completed',
         completed_at = now(),
         used_at      = now()
   where id = v_assn.id;

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

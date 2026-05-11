-- =====================================================================
-- 0029_activate_cycle_validation.sql
--
-- Aprimora app.activate_cycle com validação de estrutura mínima.
--
-- Antes de ativar um ciclo, verifica:
--   1. Pelo menos 1 participante cadastrado
--   2. Pelo menos 1 assignment criado
--   3. Todos os assignments têm questionnaire_id preenchido
--   4. Todos os questionnaires referenciados têm pelo menos 1 questão
--
-- Errcodes adicionais:
--   P0017 — no_participants        (ciclo sem participantes)
--   P0018 — no_assignments         (nenhum avaliador atribuído)
--   P0019 — missing_questionnaire  (assignment sem questionário ou sem perguntas)
-- =====================================================================

create or replace function app.activate_cycle(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id          uuid;
  v_status             text;
  v_participant_count  int;
  v_assignment_count   int;
  v_missing_q_count    int;
  v_empty_q_count      int;
begin
  -- ── Fetch cycle ──────────────────────────────────────────────────────
  select c.tenant_id, c.status
    into v_tenant_id, v_status
  from public.cycles c
  where c.id = p_cycle_id;

  if not found then
    raise exception 'cycle_not_found' using errcode = 'P0010';
  end if;

  -- ── Authorization ─────────────────────────────────────────────────────
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

  -- ── Status guard ──────────────────────────────────────────────────────
  if v_status = 'active' then
    raise exception 'cycle_already_active' using errcode = 'P0014';
  end if;

  if v_status in ('closed','archived') then
    raise exception 'cycle_cannot_activate: %', v_status using errcode = 'P0015';
  end if;

  -- ── Structure validation ──────────────────────────────────────────────

  -- 1. At least one participant
  select count(*) into v_participant_count
  from public.cycle_participants cp
  where cp.cycle_id = p_cycle_id;

  if v_participant_count = 0 then
    raise exception 'no_participants — add at least one participant before activating'
      using errcode = 'P0017';
  end if;

  -- 2. At least one assignment
  select count(*) into v_assignment_count
  from public.assignments a
  where a.cycle_id = p_cycle_id;

  if v_assignment_count = 0 then
    raise exception 'no_assignments — create evaluator assignments before activating'
      using errcode = 'P0018';
  end if;

  -- 3. No assignments missing a questionnaire_id
  select count(*) into v_missing_q_count
  from public.assignments a
  where a.cycle_id = p_cycle_id
    and a.questionnaire_id is null;

  if v_missing_q_count > 0 then
    raise exception 'missing_questionnaire — % assignment(s) have no questionnaire assigned',
      v_missing_q_count
      using errcode = 'P0019';
  end if;

  -- 4. No questionnaires with zero questions
  select count(distinct a.questionnaire_id) into v_empty_q_count
  from public.assignments a
  where a.cycle_id = p_cycle_id
    and not exists (
      select 1
      from public.questionnaire_questions qq
      where qq.questionnaire_id = a.questionnaire_id
    );

  if v_empty_q_count > 0 then
    raise exception 'missing_questionnaire — % questionnaire(s) have no questions',
      v_empty_q_count
      using errcode = 'P0019';
  end if;

  -- ── Activate ──────────────────────────────────────────────────────────
  update public.cycles
     set status = 'active'
   where id = p_cycle_id;

  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'cycles', p_cycle_id, 'cycle_activated',
    jsonb_build_object(
      'activated_at',     now()::text,
      'participant_count', v_participant_count,
      'assignment_count',  v_assignment_count
    )
  );

  return jsonb_build_object(
    'status',            'active',
    'cycle_id',          p_cycle_id,
    'participant_count', v_participant_count,
    'assignment_count',  v_assignment_count
  );
end$$;

grant execute on function app.activate_cycle(uuid) to authenticated;

-- Re-create public wrapper (idempotent)
create or replace function public.activate_cycle(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.activate_cycle(p_cycle_id);
$$;

grant execute on function public.activate_cycle(uuid) to authenticated;

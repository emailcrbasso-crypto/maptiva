-- =====================================================================
-- 0031_assignment_context_branding.sql
-- Extends get_assignment_context to include tenant branding fields,
-- so the /respond/:token page can render the client's brand without
-- a second RPC roundtrip. The function is anon-accessible and
-- security definer — safe because it only exposes presentation data.
-- =====================================================================

create or replace function app.get_assignment_context(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text := app.hash_token(p_token);
  v_assn record;
  v_evaluated_name     text;
  v_questionnaire_name text;
  v_cycle_name         text;
  v_scale_min          int;
  v_scale_max          int;
  v_questions          jsonb;
  v_tenant             record;
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

  -- Nome do avaliado
  select p.name
    into v_evaluated_name
  from public.cycle_participants cp
  join public.people p on p.id = cp.person_id
  where cp.id = v_assn.evaluated_cycle_participant_id;

  -- Nome do questionário e ciclo; escala do template
  select q.name into v_questionnaire_name
  from public.questionnaires q where q.id = v_assn.questionnaire_id;

  select c.name into v_cycle_name
  from public.cycles c where c.id = v_assn.cycle_id;

  select t.scale_min, t.scale_max
    into v_scale_min, v_scale_max
  from public.cycles c
  join public.templates t on t.id = c.template_id
  where c.id = v_assn.cycle_id;

  -- Branding do tenant (dados visuais apenas, sem dados sensíveis)
  select
    coalesce(t.display_name, t.name)              as tenant_name,
    t.logo_url                                    as logo_url,
    coalesce(t.primary_color, '#111827')          as primary_color,
    coalesce(t.hide_maptiva_brand, false)         as hide_maptiva
  into v_tenant
  from public.tenants t
  where t.id = v_assn.tenant_id;

  -- Perguntas em ordem
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
    'assignment_id',       v_assn.id,
    'cycle_id',            v_assn.cycle_id,
    'cycle_name',          v_cycle_name,
    'questionnaire_id',    v_assn.questionnaire_id,
    'questionnaire_name',  v_questionnaire_name,
    'relationship_code',   v_assn.relationship_code,
    'evaluated_name',      v_evaluated_name,
    'scale_min',           coalesce(v_scale_min, 1),
    'scale_max',           coalesce(v_scale_max, 5),
    'questions',           v_questions,
    -- Branding (fallback-safe: returns defaults if columns don't exist yet)
    'tenant_name',         coalesce(v_tenant.tenant_name, 'Maptiva'),
    'tenant_logo_url',     v_tenant.logo_url,
    'tenant_primary_color',coalesce(v_tenant.primary_color, '#111827'),
    'tenant_hide_maptiva', coalesce(v_tenant.hide_maptiva, false)
  );
end$$;

grant execute on function app.get_assignment_context(text) to authenticated, anon;

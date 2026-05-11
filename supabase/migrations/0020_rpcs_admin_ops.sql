-- =====================================================================
-- 0020_rpcs_admin_ops.sql
-- RPCs de operações administrativas.
--
-- app.change_member_role(user_id, new_role):
--   - Owner muda o papel de qualquer membro; admin pode mudar papéis
--     não-owner. Ambos proibidos de mudar o próprio papel.
--   - Errcodes: P0010 membership_not_found, P0011 not_authorized,
--     P0018 cannot_change_own_role.
--
-- app.revoke_assignment(assignment_id):
--   - Admin/owner cancela um assignment ainda não completado.
--   - Status passa para 'cancelled'; token correspondente torna-se inválido
--     via P0003 em get_assignment_context / submit_response.
--   - Idempotente: já cancelado retorna sem erro.
--   - Errcodes: P0010 assignment_not_found, P0011 not_authorized,
--     P0019 assignment_not_revocable (status=completed).
-- =====================================================================

-- ---------- change_member_role ----------
create or replace function app.change_member_role(
  p_user_id  uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id  uuid := app.current_tenant_id();
  v_caller_uid uuid;
  v_old_role   text;
  v_mbr_id     uuid;
begin
  -- Identidade do caller (auth_user_id → users.id).
  select u.id into v_caller_uid
  from public.users u
  where u.auth_user_id = auth.uid();

  -- Membership alvo: o user_id passado, no mesmo tenant.
  select tm.id, tm.role
    into v_mbr_id, v_old_role
  from public.tenant_memberships tm
  where tm.tenant_id = v_tenant_id
    and tm.user_id   = p_user_id
    and tm.status    = 'active';

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0010';
  end if;

  -- Não pode mudar o próprio papel.
  if p_user_id = v_caller_uid then
    raise exception 'cannot_change_own_role' using errcode = 'P0018';
  end if;

  -- Autorização:
  --   - Somente owner pode conceder ou revogar o papel 'owner'.
  --   - Admin pode alterar papéis não-owner.
  if v_old_role = 'owner' or p_new_role = 'owner' then
    if not app.is_owner() then
      raise exception 'not_authorized' using errcode = 'P0011';
    end if;
  else
    if not app.is_admin_or_owner() then
      raise exception 'not_authorized' using errcode = 'P0011';
    end if;
  end if;

  -- Atualiza (o trigger memberships_anti_escalation serve como segunda
  -- camada; a constraint de role na tabela garante valores válidos).
  update public.tenant_memberships
     set role = p_new_role
   where id = v_mbr_id;

  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'tenant_memberships', v_mbr_id, 'role_changed',
    jsonb_build_object(
      'user_id',   p_user_id,
      'old_role',  v_old_role,
      'new_role',  p_new_role
    )
  );

  return jsonb_build_object(
    'membership_id', v_mbr_id,
    'user_id',       p_user_id,
    'old_role',      v_old_role,
    'new_role',      p_new_role
  );
end$$;

grant execute on function app.change_member_role(uuid, text) to authenticated;

-- ---------- revoke_assignment ----------
create or replace function app.revoke_assignment(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status    text;
begin
  select a.tenant_id, a.status
    into v_tenant_id, v_status
  from public.assignments a
  where a.id = p_assignment_id;

  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0010';
  end if;

  -- Admin/owner do tenant correto.
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Assignments completados não podem ser revertidos.
  if v_status = 'completed' then
    raise exception 'assignment_not_revocable' using errcode = 'P0019';
  end if;

  -- Idempotente: já cancelado → retorna sem erro.
  if v_status = 'cancelled' then
    return jsonb_build_object(
      'assignment_id',    p_assignment_id,
      'status',           'cancelled',
      'already_cancelled', true
    );
  end if;

  update public.assignments
     set status = 'cancelled'
   where id = p_assignment_id;

  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'assignments', p_assignment_id, 'assignment_revoked',
    jsonb_build_object('previous_status', v_status)
  );

  return jsonb_build_object(
    'assignment_id',     p_assignment_id,
    'status',            'cancelled',
    'already_cancelled', false
  );
end$$;

grant execute on function app.revoke_assignment(uuid) to authenticated;

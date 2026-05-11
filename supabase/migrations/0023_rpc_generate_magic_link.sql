-- =====================================================================
-- 0023_rpc_generate_magic_link.sql
--
-- app.generate_magic_link(p_assignment_id, p_expires_days):
--   Gera (ou regenera) um magic token para um assignment.
--   Apenas admin/owner do tenant pode chamar.
--   Retorna o token cru para o frontend construir a URL de resposta.
--
--   Errcodes:
--     P0010  assignment_not_found
--     P0011  not_authorized
--     P0020  assignment_not_invitable (completed ou cancelled)
-- =====================================================================

create or replace function app.generate_magic_link(
  p_assignment_id uuid,
  p_expires_days  int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status    text;
  v_token     text;
  v_hash      text;
  v_expires   timestamptz;
begin
  -- Verifica que o assignment existe e pertence ao tenant do caller.
  select a.tenant_id, a.status
    into v_tenant_id, v_status
  from public.assignments a
  where a.id = p_assignment_id;

  if not found then
    raise exception 'assignment_not_found' using errcode = 'P0010';
  end if;

  -- Somente admin/owner do tenant correto.
  if not app.is_admin_or_owner()
     or app.current_tenant_id() is distinct from v_tenant_id
  then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Não é possível gerar link para assignments já concluídos ou cancelados.
  if v_status in ('completed', 'cancelled') then
    raise exception 'assignment_not_invitable: %', v_status using errcode = 'P0020';
  end if;

  -- Gera token cru (UUID sem hífens = 32 chars hex, alta entropia).
  v_token   := replace(gen_random_uuid()::text, '-', '');
  v_hash    := app.hash_token(v_token);
  v_expires := now() + (p_expires_days || ' days')::interval;

  -- Atualiza o assignment: salva hash, define expiração, muda status.
  update public.assignments
     set magic_token_hash = v_hash,
         token_expires_at = v_expires,
         invited_at       = now(),
         status           = 'invited'
   where id = p_assignment_id;

  -- Registra auditoria (token cru NUNCA é gravado no audit_log).
  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id,
    'assignments',
    p_assignment_id,
    'magic_link_generated',
    jsonb_build_object('expires_days', p_expires_days)
  );

  return jsonb_build_object(
    'assignment_id', p_assignment_id,
    'token',         v_token,
    'expires_at',    v_expires
  );
end$$;

grant execute on function app.generate_magic_link(uuid, int) to authenticated;

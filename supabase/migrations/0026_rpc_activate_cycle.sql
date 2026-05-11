-- =====================================================================
-- 0026_rpc_activate_cycle.sql
-- RPC para ativar um ciclo (draft → active).
-- =====================================================================

create or replace function app.activate_cycle(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_status    text;
begin
  select c.tenant_id, c.status
    into v_tenant_id, v_status
  from public.cycles c
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

  if v_status = 'active' then
    raise exception 'cycle_already_active' using errcode = 'P0014';
  end if;

  if v_status in ('closed','archived') then
    raise exception 'cycle_cannot_activate: %', v_status using errcode = 'P0015';
  end if;

  update public.cycles
     set status = 'active'
   where id = p_cycle_id;

  insert into public.audit_log
    (tenant_id, entity, entity_id, action, payload_json)
  values (
    v_tenant_id, 'cycles', p_cycle_id, 'cycle_activated',
    jsonb_build_object('activated_at', now()::text)
  );

  return jsonb_build_object('status', 'active', 'cycle_id', p_cycle_id);
end$$;

grant execute on function app.activate_cycle(uuid) to authenticated;

-- Public wrapper
create or replace function public.activate_cycle(p_cycle_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.activate_cycle(p_cycle_id);
$$;

grant execute on function public.activate_cycle(uuid) to authenticated;

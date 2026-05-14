-- 0043_fix_support_tenant_isolation.sql
--
-- Corrige o isolamento de dados no modo suporte do super admin.
--
-- Problema: current_tenant_id() sempre retorna o tenant mais antigo do usuário
-- (ORDER BY created_at ASC). No modo suporte o super admin tem duas memberships
-- mas a RLS continuava retornando dados do seu próprio tenant.
--
-- Solução: adicionar active_support_tenant_id em public.users.
-- current_tenant_id() passa a checar essa coluna primeiro (somente para
-- super admins). Quando definida, TODA a RLS automaticamente vê os dados
-- do tenant do cliente — sem precisar modificar nenhuma outra política.

-- ── 1. Coluna de override de tenant para super admin ─────────────────────────

alter table public.users
  add column if not exists active_support_tenant_id uuid
    references public.tenants(id) on delete set null;

-- ── 2. Recria current_tenant_id() com suporte ao override ────────────────────

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Super admin em modo suporte: retorna o tenant override se definido
    (
      select u.active_support_tenant_id
        from public.users u
       where u.auth_user_id = auth.uid()
         and u.is_super_admin = true
         and u.active_support_tenant_id is not null
    ),
    -- Caso normal: retorna a membership REAL mais antiga (ignora is_support_access)
    (
      select tm.tenant_id
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
       where u.auth_user_id = auth.uid()
         and tm.status = 'active'
         and tm.is_support_access = false
       order by tm.created_at asc
       limit 1
    )
  )
$$;

-- ── 3. Recria enter_tenant_as_admin: membership + override ───────────────────

create or replace function app.enter_tenant_as_admin(p_tenant_id uuid)
returns table(tenant_name text, tenant_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not app.is_super_admin() then
    raise exception 'Forbidden — super admin only' using errcode = 'P0401';
  end if;

  select id into v_user_id
    from public.users
   where auth_user_id = auth.uid();

  -- Cria membership de suporte (não toca memberships reais)
  insert into public.tenant_memberships
        (tenant_id, user_id, role, status, is_support_access)
  values (p_tenant_id, v_user_id, 'admin', 'active', true)
  on conflict (tenant_id, user_id) do nothing;

  -- Define o override: a partir daqui current_tenant_id() retorna p_tenant_id
  -- para este usuário, fazendo toda a RLS filtrar pelos dados do cliente
  update public.users
     set active_support_tenant_id = p_tenant_id
   where id = v_user_id;

  return query
    select t.name::text, t.slug::text
      from public.tenants t
     where t.id = p_tenant_id;
end
$$;

create or replace function public.enter_tenant_as_admin(p_tenant_id uuid)
returns table(tenant_name text, tenant_slug text)
language sql
security definer
set search_path = public
as $$
  select * from app.enter_tenant_as_admin(p_tenant_id)
$$;

-- ── 4. Recria exit_tenant: remove membership + limpa override ────────────────

create or replace function app.exit_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not app.is_super_admin() then
    raise exception 'Forbidden — super admin only' using errcode = 'P0401';
  end if;

  select id into v_user_id
    from public.users
   where auth_user_id = auth.uid();

  -- Remove apenas a membership de suporte (nunca toca memberships reais)
  delete from public.tenant_memberships
   where tenant_id         = p_tenant_id
     and user_id           = v_user_id
     and is_support_access = true;

  -- Limpa o override — current_tenant_id() volta ao tenant real do super admin
  update public.users
     set active_support_tenant_id = null
   where id = v_user_id;
end
$$;

create or replace function public.exit_tenant(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select app.exit_tenant(p_tenant_id)
$$;

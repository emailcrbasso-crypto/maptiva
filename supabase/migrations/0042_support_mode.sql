-- 0042_support_mode.sql
-- Suporte ao modo "customer impersonation" do super admin.
-- Permite que o operador da plataforma entre no contexto de qualquer tenant
-- para prestar suporte, sem precisar criar contas separadas.

-- ── 1. Marca memberships de suporte para distingui-las das reais ──────────────

alter table public.tenant_memberships
  add column if not exists is_support_access boolean not null default false;

-- ── 2. Entrar no tenant como admin de suporte ─────────────────────────────────
-- Cria uma membership temporária com is_support_access = true.
-- Se já existir uma membership real (is_support_access = false), não a toca.

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

  -- Insere membership de suporte; se já existe membership real não faz nada
  insert into public.tenant_memberships
        (tenant_id, user_id, role, status, is_support_access)
  values (p_tenant_id, v_user_id, 'admin', 'active', true)
  on conflict (tenant_id, user_id) do nothing;

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

grant execute on function app.enter_tenant_as_admin(uuid)    to authenticated;
grant execute on function public.enter_tenant_as_admin(uuid) to authenticated;

-- ── 3. Sair do tenant (remove apenas a membership de suporte) ─────────────────

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

  -- Remove apenas memberships de suporte — jamais toca em memberships reais
  delete from public.tenant_memberships
   where tenant_id       = p_tenant_id
     and user_id         = v_user_id
     and is_support_access = true;
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

grant execute on function app.exit_tenant(uuid)    to authenticated;
grant execute on function public.exit_tenant(uuid) to authenticated;

-- ── 4. Branding de um tenant específico (super admin) ────────────────────────
-- Versão de get_tenant_branding que aceita um tenant_id explícito.
-- Usado pelo TenantContext quando o super admin está em modo suporte.

create or replace function public.get_tenant_branding_by_id(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select jsonb_build_object(
    'id',                 t.id,
    'name',               coalesce(t.display_name, t.name),
    'slug',               t.slug,
    'logo_url',           t.logo_url,
    'favicon_url',        t.favicon_url,
    'primary_color',      coalesce(t.primary_color, '#111827'),
    'secondary_color',    coalesce(t.secondary_color, '#6b7280'),
    'hide_maptiva_brand', t.hide_maptiva_brand,
    'tagline',            t.tagline,
    'pdf_footer_text',    coalesce(t.pdf_footer_text, 'Relatório Confidencial'),
    'locale',             coalesce(t.locale, 'pt-BR'),
    'custom_domain',      t.custom_domain
  )
  from public.tenants t
  where t.id = p_tenant_id
    and app.is_super_admin()
$$;

grant execute on function public.get_tenant_branding_by_id(uuid) to authenticated;

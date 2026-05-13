-- 0041_super_admin.sql
-- Adds is_super_admin flag to users and RPCs for the super-admin panel.
-- The super-admin is a platform-level role (Maptiva operator), distinct from
-- tenant-level roles (owner/admin/manager).  Only set this flag manually in the
-- database for trusted operator accounts.

-- ── 1. Flag ──────────────────────────────────────────────────────────────────

alter table public.users
  add column is_super_admin boolean not null default false;

-- ── 2. Helper: am I super admin? ─────────────────────────────────────────────

create or replace function app.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.users where auth_user_id = auth.uid()),
    false
  )
$$;

-- Public wrapper so the frontend can call supabase.rpc('is_super_admin')
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select app.is_super_admin()
$$;

grant execute on function app.is_super_admin()    to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- ── 3. List all tenants ───────────────────────────────────────────────────────

create or replace function app.list_all_tenants()
returns table (
  id           uuid,
  name         text,
  slug         text,
  plan_code    text,
  status       text,
  created_at   timestamptz,
  member_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.slug,
    t.plan_code,
    t.status,
    t.created_at,
    count(tm.id) filter (where tm.status = 'active') as member_count
  from public.tenants t
  left join public.tenant_memberships tm on tm.tenant_id = t.id
  where app.is_super_admin()
  group by t.id
  order by t.created_at desc
$$;

-- Public wrapper
create or replace function public.list_all_tenants()
returns table (
  id           uuid,
  name         text,
  slug         text,
  plan_code    text,
  status       text,
  created_at   timestamptz,
  member_count bigint
)
language sql
security definer
set search_path = public
as $$
  select * from app.list_all_tenants()
$$;

grant execute on function app.list_all_tenants()    to authenticated;
grant execute on function public.list_all_tenants() to authenticated;

-- ── 4. Set tenant status ──────────────────────────────────────────────────────

create or replace function app.set_tenant_status(p_tenant_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_super_admin() then
    raise exception 'Forbidden — super admin only' using errcode = 'P0401';
  end if;
  if p_status not in ('active', 'suspended', 'archived') then
    raise exception 'Invalid status: must be active | suspended | archived' using errcode = 'P0002';
  end if;
  update public.tenants set status = p_status where id = p_tenant_id;
end
$$;

create or replace function public.set_tenant_status(p_tenant_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app.set_tenant_status(p_tenant_id, p_status);
end
$$;

grant execute on function app.set_tenant_status(uuid, text)    to authenticated;
grant execute on function public.set_tenant_status(uuid, text) to authenticated;

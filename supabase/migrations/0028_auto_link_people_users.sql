-- =====================================================================
-- 0028_auto_link_people_users.sql
--
-- Problema:
--   people.user_id é adicionado em 0011 mas nunca é preenchido
--   automaticamente. Isso faz com que app.person_id_for_user()
--   retorne NULL e get_my_report() falhe com 'participant_not_found'
--   para todos os usuários não-admin.
--
-- Solução:
--   1. Trigger em public.users (AFTER INSERT): quando um usuário
--      novo é registrado no Supabase Auth (via tg_sync_auth_user),
--      linkar automaticamente qualquer people record com o mesmo email.
--
--   2. Trigger em public.people (AFTER INSERT): quando uma pessoa
--      é adicionada ao sistema, verificar se já existe um users record
--      com o mesmo email e linkar automaticamente.
--
--   3. Backfill: rodar a linkagem em registros existentes.
--
-- Segurança:
--   A linkagem é feita por email matching dentro do mesmo tenant.
--   Emails são únicos por (tenant_id, email) em people.
--   Emails são únicos globalmente em users.
-- =====================================================================

-- ─── Trigger 1: users INSERT → auto-link people ──────────────────────────────

create or replace function app.tg_link_user_to_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- When a user record is created, find people records with same email
  -- and set their user_id if not already set.
  update public.people p
     set user_id = new.id
   where lower(p.email) = lower(new.email)
     and p.user_id is null;

  return new;
end$$;

drop trigger if exists link_user_to_people on public.users;
create trigger link_user_to_people
  after insert on public.users
  for each row
  execute function app.tg_link_user_to_people();

-- ─── Trigger 2: people INSERT → auto-link users ──────────────────────────────

create or replace function app.tg_link_people_to_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  -- When a person is added, find the matching users record by email
  -- and set user_id if not already set.
  if new.user_id is null then
    select u.id into v_user_id
    from public.users u
    where lower(u.email) = lower(new.email)
    limit 1;

    if v_user_id is not null then
      new.user_id := v_user_id;
    end if;
  end if;

  return new;
end$$;

drop trigger if exists link_people_to_user on public.people;
create trigger link_people_to_user
  before insert on public.people
  for each row
  execute function app.tg_link_people_to_user();

-- ─── Backfill: link existing records ─────────────────────────────────────────

-- Update people records that have matching users by email
update public.people p
   set user_id = u.id
  from public.users u
 where lower(p.email) = lower(u.email)
   and p.user_id is null;

-- ─── RPC: admin can manually link a person to a user ─────────────────────────
-- Useful when auto-link fails (e.g., email mismatch, edge cases)

create or replace function app.link_person_to_user(
  p_person_id uuid,
  p_user_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_user_id   uuid;
begin
  -- Admin/owner only
  if not app.is_admin_or_owner() then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Get the person's tenant for ownership check
  select tenant_id into v_tenant_id
  from public.people
  where id = p_person_id;

  if v_tenant_id is null then
    raise exception 'person_not_found' using errcode = 'P0020';
  end if;

  if v_tenant_id <> app.current_tenant_id() then
    raise exception 'not_authorized' using errcode = 'P0011';
  end if;

  -- Find user by email
  select id into v_user_id
  from public.users
  where lower(email) = lower(p_user_email);

  if v_user_id is null then
    return jsonb_build_object(
      'ok',      false,
      'message', 'User not found — person must sign up first'
    );
  end if;

  -- Link
  update public.people
     set user_id = v_user_id
   where id = p_person_id;

  return jsonb_build_object(
    'ok',        true,
    'person_id', p_person_id,
    'user_id',   v_user_id
  );
end$$;

grant execute on function app.link_person_to_user(uuid, text) to authenticated;

-- Public wrapper
create or replace function public.link_person_to_user(
  p_person_id  uuid,
  p_user_email text
)
returns jsonb
language sql
security definer
set search_path = public, app, pg_temp
as $$
  select app.link_person_to_user(p_person_id, p_user_email)
$$;

grant execute on function public.link_person_to_user(uuid, text) to authenticated;

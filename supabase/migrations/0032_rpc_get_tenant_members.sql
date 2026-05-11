-- =====================================================================
-- 0032_rpc_get_tenant_members.sql
--
-- 1. Corrige tenant_memberships.user_id NULL: faz backfill via email
--    (casos onde o membership foi criado antes do usuário fazer login).
--
-- 2. Cria RPC pública get_tenant_members():
--    Retorna membros do tenant atual com nome e email,
--    usando security definer para evitar problemas de RLS na tabela users.
-- =====================================================================

-- ── 1. Backfill: preenche user_id nulo via email ─────────────────────
UPDATE public.tenant_memberships tm
SET user_id = u.id
FROM public.users u
WHERE tm.user_id IS NULL
  AND lower(u.email) = lower(
    -- tenta recuperar o email do auth.users via auth_user_id
    (SELECT au.email FROM auth.users au
     WHERE au.id = u.auth_user_id
     LIMIT 1)
  );

-- ── 2. RPC get_tenant_members ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_tenant_members()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := app.current_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = 'P0011';
  END IF;

  RETURN (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',    tm.id,
          'role',  tm.role,
          'name',  coalesce(u.name, u.email, '—'),
          'email', coalesce(u.email, '—')
        )
        ORDER BY
          CASE tm.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            ELSE 3
          END,
          coalesce(u.name, u.email)
      ),
      '[]'::jsonb
    )
    FROM public.tenant_memberships tm
    LEFT JOIN public.users u ON u.id = tm.user_id
    WHERE tm.tenant_id = v_tenant_id
      AND tm.status = 'active'
  );
END$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_members() TO authenticated;

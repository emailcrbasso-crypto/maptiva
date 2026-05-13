-- =====================================================================
-- 0034_user_profile.sql
--
-- Expande o perfil do usuário de painel com:
--   1. avatar_url em public.users (identidade cross-tenant)
--   2. RLS em public.users: SELECT/UPDATE na própria linha
--   3. Policy para usuário atualizar seu próprio registro em people
--      (job_title, department — dados de avaliação, tenant-scoped)
--   4. Storage bucket "avatars" + policies de objeto
-- =====================================================================

-- ── 1. Coluna avatar_url em users ────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.users.avatar_url IS
  'URL pública do avatar do usuário. Armazenada no bucket "avatars" do Supabase Storage.
   Path convencionado: avatars/{auth_user_id}/avatar.<ext>
   É cross-tenant — a mesma foto aparece em todos os tenants que o usuário integrar.';

-- ── 2. RLS em public.users ────────────────────────────────────────────
-- Até agora users não tinha RLS: acesso controlado só via GRANT (0022).
-- Agora habilitamos RLS e adicionamos policies explícitas.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- SELECT: própria linha (para AuthContext.fetchProfile)
DROP POLICY IF EXISTS users_select_own    ON public.users;
DROP POLICY IF EXISTS users_select_tenant ON public.users;
DROP POLICY IF EXISTS users_update_own    ON public.users;

CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- SELECT: admin/owner pode ver todos os usuários do tenant
-- (necessário para joins manuais; get_tenant_members() usa SECURITY DEFINER)
CREATE POLICY users_select_tenant ON public.users
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT tm.user_id
      FROM   public.tenant_memberships tm
      WHERE  tm.tenant_id = app.current_tenant_id()
        AND  tm.status    = 'active'
    )
    AND app.is_admin_or_owner()
  );

-- UPDATE: usuário pode atualizar somente sua própria linha
-- (name, avatar_url — nunca auth_user_id ou email)
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING  (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── 3. Policy: usuário atualiza próprio registro em people ────────────
-- Permite que gestores/admins com vínculo em people editem
-- job_title e department sem precisar de role admin.
-- O RLS de people_select já permite SELECT da própria linha.
DROP POLICY IF EXISTS people_update_self ON public.people;

CREATE POLICY people_update_self ON public.people
  FOR UPDATE TO authenticated
  USING (
    id        = app.person_id_for_user()
    AND tenant_id = app.current_tenant_id()
  )
  WITH CHECK (
    id        = app.person_id_for_user()
    AND tenant_id = app.current_tenant_id()
  );

-- ── 4. Storage bucket: avatars ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB máximo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public           = true,
      file_size_limit  = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- SELECT (leitura pública — bucket público)
DROP POLICY IF EXISTS avatars_select ON storage.objects;
CREATE POLICY avatars_select ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- INSERT: só o próprio usuário, na sua pasta (avatars/{auth_uid}/*)
DROP POLICY IF EXISTS avatars_insert ON storage.objects;
CREATE POLICY avatars_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: idem
DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING  (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- DELETE: idem
DROP POLICY IF EXISTS avatars_delete ON storage.objects;
CREATE POLICY avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

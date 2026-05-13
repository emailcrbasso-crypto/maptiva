-- =====================================================================
-- 0035_fix_users_rls.sql
--
-- Corrige "infinite recursion detected in policy for relation users".
--
-- CAUSA RAIZ:
--   A policy users_select_tenant (criada em 0034) chama app.is_admin_or_owner()
--   → app.has_role() → JOIN public.users → aciona o RLS de users novamente
--   → avalia users_select_tenant → chama app.is_admin_or_owner() → loop.
--
--   O problema é que funções LANGUAGE sql STABLE podem ser inlined pelo
--   planner do Postgres. Quando isso ocorre, o corpo da função é substituído
--   diretamente na query e o SECURITY DEFINER não protege mais — o JOIN
--   dentro de app.has_role() passa a rodar como "authenticated", que tem
--   RLS ativo em users, criando a recursão.
--
-- SOLUÇÃO:
--   1. Dropar users_select_tenant — ela não é necessária para nenhum caso
--      de uso atual:
--        • get_tenant_members() é PL/pgSQL SECURITY DEFINER (não inlineable)
--          e bypassa RLS corretamente para listar membros.
--        • AuthContext só precisa ler a própria linha (users_select_own).
--   2. Garantir GRANT UPDATE nas colunas seguras: name e avatar_url.
--      Sem esse GRANT, o UPDATE da ProfilePage silenciosamente não afeta
--      nenhuma linha (o authenticated role não tinha permissão de UPDATE).
--
-- SEGURANÇA APÓS O FIX:
--   • users_select_own  → authenticated lê somente a própria linha
--   • users_update_own  → authenticated atualiza somente a própria linha
--   • Ambas as policies usam apenas (auth_user_id = auth.uid()) — sem
--     cross-table reference, sem risco de recursão.
-- =====================================================================

-- ── 1. Remover a policy que causa recursão ────────────────────────────
DROP POLICY IF EXISTS users_select_tenant ON public.users;

-- ── 2. Garantir GRANT UPDATE nas colunas editáveis pelo usuário ───────
-- Sem isso, o UPDATE em ProfilePage.handleSaveName falhava silenciosamente.
-- RLS (users_update_own) já restringe a linha; este grant habilita o comando.
GRANT UPDATE (name, avatar_url) ON public.users TO authenticated;

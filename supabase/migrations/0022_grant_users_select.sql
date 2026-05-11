-- =====================================================================
-- 0022_grant_users_select.sql
--
-- Concede SELECT em public.users para authenticated.
-- Necessário para o join tenant_memberships → users funcionar via
-- PostgREST (MembersPage, People, etc.).
--
-- RLS não é necessário aqui: a tabela users expõe apenas dados de
-- identidade (email, name) e o acesso real é filtrado pelo join com
-- tenant_memberships, que já tem RLS.
-- =====================================================================

grant select on public.users to authenticated;

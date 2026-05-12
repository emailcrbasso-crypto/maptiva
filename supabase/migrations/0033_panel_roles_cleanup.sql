-- =====================================================================
-- 0033_panel_roles_cleanup.sql
--
-- Clarifica a separação entre três entidades distintas do domínio:
--
--   1. USUÁRIO DO PAINEL  (auth.users → public.users → tenant_memberships)
--      Pessoa com login. Role define o que pode fazer no painel.
--      Roles válidos: owner, admin, manager.
--
--   2. PARTICIPANTE DA AVALIAÇÃO  (public.people → public.cycle_participants)
--      Pessoa avaliada num ciclo. Não precisa de conta no painel.
--      É um sujeito de dados, não um ator do sistema.
--      Pode opcionalmente ter uma conta de painel (people.user_id → users.id),
--      mas isso não implica membership automático.
--
--   3. RESPONDENTE / AVALIADOR EXTERNO  (public.assignments + magic link)
--      Responde questionários via /respond/:token.
--      Não tem conta, não precisa de membership.
--      Acesso via token de uso único sem autenticação Supabase.
--
-- NOTA SOBRE A DUALIDADE DE "manager":
--   a) tenant_memberships.role = 'manager'
--      → Papel de acesso ao painel. Usuário que gerencia equipe,
--        pode ver ciclos e relatórios dos seus reportes diretos.
--        Definido por: people.manager_person_id aponta para o gestor.
--
--   b) assignments.relationship_code = 'manager'
--      → Código de relacionamento numa avaliação. Indica que o
--        avaliador é o gestor hierárquico do avaliado naquele ciclo.
--        Contexto puro de scoring/anonimato, sem relação com login.
--
--   Os dois "manager" são independentes e podem coexistir na mesma
--   pessoa (alguém pode ser usuário-gestor do painel E avaliar
--   alguém como gestor num ciclo). A separação entre tabelas garante
--   que não há ambiguidade em nível de dados.
--
-- MUDANÇAS DESTA MIGRATION:
--   1. Backfill: rebaixa roles obsoletos para 'manager' (downgrade seguro)
--   2. Remove CHECK constraint antiga
--   3. Adiciona CHECK constraint nova: só owner, admin, manager
-- =====================================================================

-- ── 1. Backfill: converte roles obsoletos antes de restringir ────────
-- hr e analyst nunca foram ligados a nenhuma policy RLS — eram especulativos.
-- participant nunca deveria existir em tenant_memberships (ver comentário acima).
-- Downgrade para 'manager' é a opção mais conservadora:
-- preserva o acesso ao painel sem conceder privilégios elevados.
UPDATE public.tenant_memberships
SET    role = 'manager'
WHERE  role IN ('participant', 'hr', 'analyst');

-- ── 2. Remove constraint antiga ──────────────────────────────────────
-- O nome gerado pelo Postgres para inline CHECK é <tabela>_<coluna>_check.
ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;

-- ── 3. Adiciona constraint nova com apenas os roles de painel ─────────
ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role IN ('owner', 'admin', 'manager'));

-- ── 4. Atualiza comentários de coluna para documentação in-DB ─────────
COMMENT ON COLUMN public.tenant_memberships.role IS
  'Papel do usuário no painel do tenant.
   owner   — controle total, billing, exclusão. Só outro owner pode conceder.
   admin   — gestão operacional completa: templates, ciclos, pessoas, membros.
   manager — visibilidade do próprio time: vê ciclos e relatórios dos reportes diretos.

   NÃO confundir com assignments.relationship_code = ''manager'', que indica
   o relacionamento hierárquico de um avaliador num ciclo de avaliação.
   São conceitos distintos que compartilham o mesmo termo de domínio.';

COMMENT ON TABLE public.tenant_memberships IS
  'Vincula usuários com login (public.users) ao tenant e define seu papel no painel.
   Participantes da avaliação vivem em public.people + public.cycle_participants
   e NÃO precisam de membership. Respondentes externos usam magic links
   (public.assignments) sem qualquer conta no sistema.';

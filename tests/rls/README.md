# RLS Tests — Maptiva

Suite mínima de testes de segurança para validar as migrations `0011`–`0016`.

## Como rodar

Conecte com `psql` como usuário com privilégios para `auth`/`postgres` (em Supabase local: `postgres`):

```bash
# rodar tudo na ordem
for f in tests/rls/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1
done
```

Ou um a um:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls/00_setup.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls/01_cross_tenant.sql
# ...
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls/99_teardown.sql
```

Cada teste usa `\echo` + `RAISE EXCEPTION` em caso de falha. `ON_ERROR_STOP=1` interrompe na primeira falha.

## Convenção de fixtures

- Tenants: `rls_tenant_a`, `rls_tenant_b`
- Auth UUIDs determinísticos (prefixo `00000000-0000-0000-0000-0000000000`):
  - `a001` owner_a, `a002` admin_a, `a003` manager_a, `a004` participant_a
  - `b001` owner_b
- Pessoas/ciclos com nome `rls_*` para fácil cleanup.

## Cenários

| # | Arquivo | O que valida |
|---|---|---|
| 01 | `01_cross_tenant.sql` | Usuário do tenant A não enxerga linhas do tenant B |
| 02 | `02_anti_escalation.sql` | Admin não promove ninguém a `owner` nem altera owner existente |
| 03 | `03_manager_scope_people.sql` | Manager só vê `people` sob seu escopo |
| 04 | `04_assignments_anonymity.sql` | Manager/participant não acessa colunas sensíveis de `assignments` |
| 05 | `05_participant_release_gate.sql` | Participant não vê resultado antes de `report_release_at` |
| 06 | `06_anon_blocked.sql` | `anon` não tem nenhum acesso a tabelas/views |
| 07 | `07_snapshots_hidden.sql` | `score_snapshots` com `visibility_status='hidden'` invisíveis |
| 08 | `08_comments_n_minimum.sql` | `comments_published` só expõe quando `response_count >= n_minimum` |
| 09 | `09_responses_admin_raw.sql` | Admin não lê `responses` cruas sem `allow_admin_raw_read=true` |
| 10 | `10_manager_loses_scope.sql` | Manager perde acesso após `manager_person_id` ser realocado |

## Pendências para depois das RPCs

- Submit via token expirado (depende de `submit_response`).
- Audit log de mudança de papel (depende de trigger/RPC `change_member_role`).

Esses dois cenários ficam em `tests/rls/_pending_rpc.md` até as RPCs existirem.

# Cenários adiados — dependem das RPCs

Estes testes só fazem sentido depois que as RPCs `security definer`
estiverem implementadas. Adicionar a `tests/rls/` quando as RPCs entrarem.

## A. Submit via token expirado
- Pré-condição: assignment com `token_expires_at < now()`.
- RPC: `submit_response(token, answers)`.
- Esperado: erro `'token_expired'`, sem gravar `responses` nem mover `status`.

## B. Submit reutilizando token (single-use)
- Pré-condição: assignment com `used_at IS NOT NULL`.
- Esperado: erro `'token_already_used'`.

## C. Submit cross-tenant via token forjado
- Pré-condição: hash válido para um assignment, mas chamador tenta forçar
  `tenant_id` diferente no payload.
- Esperado: RPC ignora payload, deriva `tenant_id` do próprio assignment.

## D. Mudança de role gera linha em audit_log
- Pré-condição: trigger ou RPC `change_member_role`.
- Esperado: 1 linha em `audit_log` com `entity='tenant_memberships'`,
  `action='role_changed'`, payload com OLD/NEW.

## E. Fechamento de ciclo dispara scoring + audit
- Pré-condição: RPC `close_cycle(cycle_id)`.
- Esperado: cycles.status='closed', score_snapshots populados, audit_log com
  `action='cycle_closed'`.

## F. Download de export registra audit
- Pré-condição: RPC `download_export(id)`.
- Esperado: 1 linha em audit_log com `action='export_downloaded'`.

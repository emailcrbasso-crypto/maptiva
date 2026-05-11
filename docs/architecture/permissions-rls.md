# Permissions and RLS — Maptiva

## Objetivo deste documento

Este documento define o modelo de permissões e a estratégia de Row Level Security (RLS) do Maptiva.

O objetivo é garantir que o produto opere com segurança em um ambiente multi-tenant, restringindo acesso por tenant, papel, tipo de recurso e contexto operacional. Em um SaaS multi-tenant, toda decisão de autorização precisa ser tenant-aware, e o banco de dados deve reforçar esse isolamento por política, não apenas pela aplicação. [web:270][web:276][web:280]

## Princípios de segurança

A segurança do Maptiva deve seguir estes princípios:

### 1. Tenant-aware by default
Toda autorização deve responder três perguntas:
1. este recurso pertence ao tenant acessado?
2. o usuário é membro desse tenant?
3. o papel desse usuário permite a ação desejada nesse contexto? [web:276]

### 2. Least privilege
Usuários devem ter apenas o mínimo de acesso necessário para cumprir sua função. [web:270][web:278]

### 3. Backend e banco como fonte de verdade
A interface pode esconder botões, mas a autorização real deve ser garantida no backend e no banco por RLS. [web:276][web:280]

### 4. Toda tabela de negócio deve ser protegida
Não basta proteger tabelas principais. Toda tabela tenant-scoped precisa de RLS, inclusive tabelas auxiliares e analíticas. [web:280][web:281]

### 5. Separar acesso administrativo e acesso de avaliador
O acesso de administradores autenticados e o acesso de avaliadores por magic link devem seguir mecanismos diferentes. [file:1]

## Modelo de identidade e autorização

O Maptiva terá dois grandes tipos de acesso:

### 1. Usuários autenticados da plataforma
São usuários internos do tenant, como admins, RH, gestores e analistas. O acesso deles é baseado em:
- autenticação;
- membership no tenant;
- papel atribuído naquele tenant. [web:276][web:277]

### 2. Avaliadores via magic link
São usuários que podem não ter conta administrativa na plataforma. O acesso deles deve ser limitado ao assignment específico vinculado ao token, sem acesso amplo ao tenant nem ao banco. [file:1]

## Papéis iniciais

Papéis administrativos sugeridos para o MVP:

| Papel | Descrição |
|---|---|
| `owner` | Dono do tenant, com controle total do ambiente. [web:276] |
| `admin` | Administração operacional do tenant e dos ciclos. [web:276] |
| `hr` | Gestão de ciclos, participantes, relatórios e operações de RH. |
| `manager` | Acesso restrito a dados permitidos da própria equipe e relatórios específicos. |
| `analyst` | Acesso analítico ou operacional com escopo limitado. |

O MVP deve começar com poucos papéis estáveis para evitar explosão de complexidade. Em multi-tenant RBAC, papéis demais costumam gerar confusão e duplicidade. [web:276]

## Regras gerais de autorização

### Regra 1 — Membership obrigatório
Nenhum usuário autenticado pode acessar recursos de um tenant sem existir uma linha válida em `tenant_memberships`. [web:276][web:277]

### Regra 2 — Tenant isolation obrigatório
Mesmo usuários com papel elevado só podem ver linhas do tenant em que estão atuando. [web:270][web:271][web:275]

### Regra 3 — Acesso por papel
Depois de validar membership e tenant, a ação deve ser autorizada conforme o papel do usuário naquele tenant. [web:276]

### Regra 4 — Cadeia de pertencimento
Sempre que o recurso estiver abaixo de outro recurso, a autorização deve verificar também a cadeia de pertencimento. Exemplo: se um assignment pertence a um ciclo, e o ciclo pertence a um tenant, a autorização precisa respeitar essa hierarquia. [web:276]

### Regra 5 — Sem bypass por conveniência
Nenhuma query de produção deve assumir tenant implícito sem filtro ou RLS, mesmo que a UI já tenha restringido o acesso. [web:280][web:281]

## Estratégia de RLS no Maptiva

A estratégia base será:

- todas as tabelas de negócio com `tenant_id`;
- RLS ativado em todas elas;
- políticas separadas por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`);
- uso de membership para validar acesso;
- uso de papel para liberar ações sensíveis;
- uso de tabelas auxiliares ou funções para centralizar checagens repetidas. [web:270][web:277][web:280]

## Tabelas que devem ter RLS

As tabelas abaixo devem ter RLS obrigatoriamente:

- `tenants`
- `tenant_memberships`
- `assessment_templates`
- `template_relationship_rules`
- `competencies`
- `questionnaires`
- `questions`
- `assessment_cycles`
- `participants`
- `rater_assignments`
- `responses`
- `score_snapshots`
- `participant_result_profiles`
- `integration_exports`

Tabelas globais de referência, como `assessment_methods` ou `relationship_types`, podem ser públicas para leitura se não carregarem dados sensíveis e se isso fizer sentido para a aplicação. [web:281]

## Convenções estruturais

### Tenant key
Toda tabela tenant-scoped deve ter `tenant_id` com índice apropriado. [web:270][web:274][web:277]

### Created by
Sempre que fizer sentido, incluir `created_by` para auditoria e rastreabilidade. [web:277]

### Role checks
Checagens de papel não devem depender apenas do frontend. Devem ser reavaliadas no banco e/ou backend. [web:276][web:280]

### Force RLS
Quando apropriado, considerar `FORCE ROW LEVEL SECURITY` em tabelas críticas para impedir acessos acidentais fora das policies. [web:281]

## Matriz de permissões do MVP

### Tenants

| Recurso | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver dados do tenant | Sim | Sim | Sim | Limitado | Limitado |
| Editar configurações do tenant | Sim | Sim | Não | Não | Não |
| Gerenciar memberships | Sim | Sim | Não | Não | Não |

### Templates

| Recurso | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver templates | Sim | Sim | Sim | Não | Sim |
| Criar templates | Sim | Sim | Sim | Não | Não |
| Editar templates | Sim | Sim | Sim | Não | Não |
| Excluir templates | Sim | Sim | Limitado | Não | Não |

### Cycles

| Recurso | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver ciclos | Sim | Sim | Sim | Limitado | Sim |
| Criar ciclos | Sim | Sim | Sim | Não | Não |
| Editar ciclos | Sim | Sim | Sim | Não | Não |
| Fechar ciclos | Sim | Sim | Sim | Não | Não |

### Participants e assignments

| Recurso | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver participantes | Sim | Sim | Sim | Limitado | Sim |
| Importar participantes | Sim | Sim | Sim | Não | Não |
| Criar assignments | Sim | Sim | Sim | Não | Não |
| Enviar convites | Sim | Sim | Sim | Não | Não |

### Reports e analytics

| Recurso | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver dashboards operacionais | Sim | Sim | Sim | Limitado | Sim |
| Gerar relatório individual | Sim | Sim | Sim | Limitado | Sim |
| Gerar relatório executivo | Sim | Sim | Sim | Não | Limitado |
| Exportar dados consolidados | Sim | Sim | Sim | Não | Limitado |

Observação:
“Limitado” significa acesso condicionado ao escopo definido pela política do tenant e do produto, como equipe gerida ou visão analítica parcial. [web:276]

## Política por tipo de usuário

### Owner
Pode administrar o tenant, memberships, templates, ciclos, relatórios e exportações. [web:276]

### Admin
Tem quase os mesmos poderes operacionais do owner, sem necessariamente administrar tudo que seja estrutural ou financeiro do tenant. [web:276]

### HR
É o operador principal de ciclos. Deve poder criar, configurar, acompanhar e extrair os resultados necessários para gestão de pessoas. [file:1]

### Manager
Não deve ter acesso irrestrito ao tenant. Seu acesso precisa ser limitado ao que o tenant permitir sobre seus times, ciclos relevantes e resultados autorizados. [web:276]

### Analyst
Pode ter acesso de leitura e análise, mas não de configuração crítica. [web:276][web:278]

## Acesso via magic links

Magic links exigem um modelo separado do acesso administrativo.

### Regras para magic links

- Cada `rater_assignment` deve possuir um token único. [file:1]
- O token só pode liberar acesso ao assignment correspondente. [file:1]
- O token não concede acesso ao restante do tenant.
- O token deve respeitar status do assignment.
- Após conclusão, o token deve ser bloqueado ou controlado conforme regra de negócio. [file:1]
- O formulário deve expor apenas o mínimo necessário para responder. [file:1]

### Recomendação de implementação

Em vez de expor o banco diretamente ao avaliador anônimo, o ideal é que o fluxo de magic link seja intermediado por lógica de aplicação ou endpoint controlado, que valide:
- existência do token;
- vínculo com assignment válido;
- status permitido;
- expiração, se houver;
- e payload permitido de leitura/escrita. [file:1][web:279]

## Estratégia de policies

As policies devem ser escritas separando claramente operações e papéis. Criar uma única policy genérica para tudo tende a gerar erro, manutenção difícil e comportamento inesperado. [web:270][web:280]

### Padrão recomendado

Para cada tabela tenant-scoped:
- uma policy de `SELECT`;
- uma policy de `INSERT`;
- uma policy de `UPDATE`;
- uma policy de `DELETE`, se necessário. [web:270]

### Exemplo de regra conceitual

Para leitura de uma tabela como `assessment_cycles`, a policy conceitual é:

- usuário autenticado;
- membership ativo no tenant da linha;
- papel autorizado para ler ciclos naquele tenant. [web:270][web:276]

## Helpers e funções recomendadas

Para não duplicar lógica em dezenas de policies, o projeto deve considerar funções auxiliares do banco, como:

- `is_member_of_tenant(auth_user_id, tenant_id)`
- `has_tenant_role(auth_user_id, tenant_id, role)`
- `has_any_tenant_role(auth_user_id, tenant_id, roles[])`

Essas funções tornam as policies mais legíveis e mais fáceis de manter. [web:278][web:280]

## Tabelas de referência global

As tabelas abaixo podem ter leitura pública ou autenticada ampla, se não houver risco de exposição sensível:

- `assessment_methods`
- `relationship_types` do sistema

Mesmo nessas tabelas, escrita deve continuar restrita a contextos administrativos ou migratórios. [web:281]

## Regras específicas por módulo

### Tenants
- Usuário só vê tenants dos quais é membro. [web:270][web:276]
- Owner/admin podem atualizar configurações do tenant.
- Memberships só podem ser geridas por owner/admin.

### Templates
- Leitura liberada apenas dentro do tenant correspondente.
- Criação e edição por owner/admin/hr.
- Exclusão deve ser controlada para evitar quebra de ciclos existentes.

### Cycles
- Leitura por membros autorizados do tenant.
- Criação e edição por owner/admin/hr.
- Fechamento do ciclo deve exigir papel autorizado.

### Participants
- Leitura por perfis administrativos e, quando fizer sentido, por manager dentro do escopo autorizado.
- Alterações por owner/admin/hr.

### Assignments e responses
- Assignments visíveis para operadores autorizados do ciclo.
- Respostas administrativas nunca devem expor identidade de avaliadores anônimos além do permitido.
- Acesso do avaliador externo deve ser limitado ao seu próprio assignment via token. [file:1]

### Analytics e reports
- Perfis administrativos podem acessar dados consolidados do tenant.
- Managers só acessam relatórios autorizados pela política do tenant.
- Exports são ações sensíveis e devem ser restritas. [web:276][web:278]

## Auditoria

Mudanças de permissão, membership e exportações sensíveis devem ser auditáveis. Boas práticas de segurança recomendam registrar alterações relevantes de acesso e configuração para revisão posterior. [web:276][web:278]

Eventos mínimos a registrar:
- criação e remoção de memberships;
- mudança de papel;
- criação e fechamento de ciclos;
- geração de exportações;
- acessos administrativos críticos;
- mudanças em configurações do tenant.

## Testes de segurança recomendados

A estratégia de RLS deve ser validada com testes práticos cobrindo múltiplos cenários. [web:277][web:280]

Cenários mínimos:
- usuário A não acessa tenant B;
- manager não acessa recursos de admin;
- analyst não altera recursos críticos;
- tenant sem membership não vê nada;
- token inválido não acessa assignment;
- token expirado não acessa assignment;
- token concluído não reapresenta formulário, se essa for a política adotada. [file:1]

## Anti-padrões a evitar

- confiar apenas na UI para esconder ações;
- esquecer RLS em tabelas auxiliares;
- criar policies genéricas demais;
- não validar a cadeia tenant → recurso pai → recurso filho;
- usar service role em fluxos que poderiam operar com contexto normal;
- permitir que magic links acessem mais dados do que o necessário. [web:276][web:280][web:281]

## Resumo final

O modelo de permissões do Maptiva deve ser construído em torno de membership por tenant, papéis estáveis e políticas RLS explícitas por tabela e operação. O banco precisa reforçar a separação entre tenants e limitar tanto o acesso administrativo quanto o fluxo de avaliadores por magic link, garantindo confidencialidade, previsibilidade e segurança desde o início. [web:270][web:276][web:280]
# Permissions and RLS — Maptiva

## Objetivo do documento

Este documento define o modelo de permissões e a estratégia de Row Level Security (RLS) do Maptiva.

Ele existe para garantir isolamento multi-tenant, controle de acesso por papel, consistência entre frontend e banco de dados, e segurança estrutural para todos os módulos do produto. Em SaaS multi-tenant, a prática recomendada é aplicar isolamento por tenant no próprio banco e complementar isso com regras de papel e menor privilégio. [cite:270][cite:280][cite:276]

## Papel deste documento na arquitetura

Este documento é transversal ao produto inteiro.

Ele impacta diretamente:
- tenants e memberships;
- participants;
- templates;
- cycles;
- assignments;
- responses;
- scoring and analytics;
- reports and exports;
- integrações futuras. [cite:270][cite:277]

Sem uma política clara de permissões e RLS, o produto pode até funcionar do ponto de vista funcional, mas continuará vulnerável a vazamentos de dados entre tenants, acessos indevidos e inconsistência entre regras do app e regras do banco. [cite:283][cite:448]

## Princípios do modelo de acesso

### 1. Isolamento por tenant no banco

Toda entidade tenant-scoped deve ser protegida por `tenant_id` com políticas de RLS no banco. Em aplicações multi-tenant com base compartilhada, a recomendação mais consistente é usar uma coluna de tenant em cada tabela relevante e fazer o banco impor o isolamento. [cite:270][cite:274][cite:448]

### 2. Least privilege

Cada papel deve receber apenas o acesso necessário para executar sua função. O princípio de menor privilégio é uma prática central em matrizes de autorização e RBAC multi-tenant. [cite:447][cite:449][cite:276]

### 3. Separação entre autenticação, membership e permissão

Estar autenticado não significa ter acesso a um tenant ou módulo. O sistema deve separar claramente:
- identidade do usuário;
- vínculo com tenant;
- papel dentro do tenant;
- permissões efetivas por recurso. [cite:276][cite:447]

### 4. Banco como fonte final de proteção

Mesmo que o frontend esconda ações e filtros, a proteção real deve estar no banco por meio de RLS e políticas de operação. Regras somente na aplicação aumentam risco de erro humano e exposição acidental. [cite:270][cite:283][cite:448]

### 5. Uma política por operação e por contexto relevante

Ao definir RLS, é melhor ter políticas claras por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) e, quando necessário, por papel ou contexto de negócio. Esse padrão facilita manutenção e reduz ambiguidades. [cite:270][cite:280]

## Modelo conceitual de acesso

O modelo do Maptiva deve combinar:
- autenticação via Supabase Auth;
- membership por tenant;
- RBAC por tenant;
- RLS no Postgres/Supabase. [cite:276][cite:280]

### Camadas do modelo

1. `auth.users`: identidade autenticada.
2. `app_users` ou perfil interno opcional: dados complementares de conta.
3. `tenant_memberships`: vínculo entre usuário e tenant.
4. `role`: papel daquele usuário dentro do tenant.
5. RLS: enforcement final por linha. [cite:270][cite:277][cite:276]

## Papéis iniciais do sistema

O Maptiva deve começar com papéis simples e claros dentro de cada tenant.

| Papel | Objetivo principal |
|---|---|
| `owner` | Controle total do tenant e governança geral. |
| `admin` | Administração operacional ampla do tenant. |
| `hr` | Gestão de ciclos, participantes, analytics e relatórios. |
| `analyst` | Leitura analítica e operacional limitada conforme política. |
| `manager` | Acesso restrito ao próprio escopo gerencial autorizado. |
| `participant` | Acesso apenas à própria experiência de resposta e, quando permitido, ao próprio relatório. |

Papéis por tenant são um padrão comum em RBAC multi-tenant, porque um mesmo usuário pode ter níveis diferentes em diferentes organizações. [cite:276][cite:447]

## Escopo do papel

O papel sempre deve existir no contexto do tenant.

### Regra importante

Um mesmo usuário pode ser:
- `owner` em um tenant;
- `analyst` em outro;
- e `participant` em um ciclo específico, sem poder administrativo amplo. [cite:276]

Isso significa que permissões não devem ficar presas apenas ao usuário global, e sim ao membership dentro do tenant. [cite:270][cite:276]

## Estrutura mínima recomendada

A base do modelo deve incluir ao menos:
- `tenants`
- `tenant_memberships`
- tabelas tenant-scoped com `tenant_id`
- helpers SQL para resolver tenant e papel atual
- políticas RLS por tabela e operação. [cite:270][cite:277][cite:280]

## Tabela de memberships

### Entidade sugerida
`tenant_memberships`

### Campos mínimos sugeridos
- `id`
- `tenant_id`
- `user_id`
- `role`
- `status`
- `created_at`

### Função

Essa tabela é a base da autorização por tenant. O padrão de membership table é amplamente recomendado em RBAC multi-tenant, porque desacopla identidade global de permissão contextual. [cite:277][cite:276]

## Status de membership

Estados sugeridos:
- `active`
- `invited`
- `suspended`
- `revoked`

### Regras gerais
- apenas memberships `active` participam das políticas normais de acesso;
- memberships suspensos ou revogados não devem passar em RLS de leitura ou escrita do tenant. [cite:447][cite:451]

## Convenções obrigatórias de schema

Para tabelas tenant-scoped, este documento recomenda as seguintes colunas padrão:
- `tenant_id`
- `created_by` quando fizer sentido
- `created_at`
- `updated_at` quando fizer sentido [cite:277][cite:274]

### Regra importante

Toda tabela central do produto deve decidir explicitamente se ela é:
- global;
- tenant-scoped;
- ou derivada de acesso via token e não por login administrativo. [cite:270][cite:448]

## Classificação das tabelas

### 1. Tabelas globais

Exemplos:
- catálogos internos do produto;
- enums persistidos;
- tabelas de configuração global da plataforma.

Essas tabelas não precisam de `tenant_id`, mas devem ter acesso controlado por papel administrativo da plataforma, não do tenant. [cite:270]

### 2. Tabelas tenant-scoped

Exemplos:
- `participants`
- `assessment_templates`
- `assessment_cycles`
- `rater_assignments`
- `responses`
- `score_snapshots`
- `participant_result_profiles` [cite:270][cite:274]

Essas tabelas devem ter `tenant_id` e RLS obrigatória. [cite:270][cite:280]

### 3. Tabelas acessadas por token

Exemplos:
- fluxos públicos de resposta por magic link.

Esses casos exigem atenção especial, porque a pessoa pode não estar navegando como membro autenticado do tenant. Nesses cenários, costuma ser melhor intermediar acesso por RPC segura, edge function ou camada de validação controlada, em vez de abrir políticas genéricas demais. [cite:280][cite:448]

## Estratégia geral de RLS

### Regra base

Toda tabela tenant-scoped deve validar que o usuário autenticado pertence ao tenant da linha acessada. Esse é o padrão mais recomendado para multi-tenancy com RLS em Supabase/Postgres. [cite:270][cite:271][cite:283]

### Regra complementar

Além do tenant match, a política deve considerar o papel do membership para decidir leitura, inserção, edição e exclusão. [cite:276][cite:277]

## Helpers SQL recomendados

A implementação deve criar funções auxiliares para reduzir repetição e erro nas políticas.

### Exemplos conceituais
- `current_user_id()`
- `current_tenant_ids()`
- `has_tenant_role(tenant_uuid, role_text)`
- `has_any_tenant_role(tenant_uuid, role_array)`
- `is_active_member(tenant_uuid)` [cite:280][cite:270]

Funções auxiliares são úteis porque centralizam lógica, melhoram legibilidade e facilitam evolução das políticas. [cite:280][cite:448]

## Modelo de autorização por recurso

Abaixo está a visão macro por módulo.

| Recurso | owner | admin | hr | analyst | manager | participant |
|---|---|---|---|---|---|---|
| Tenants / settings | Total | Limitado alto | Não | Não | Não | Não |
| Memberships | Total | Limitado alto | Não | Não | Não | Não |
| Participants | Total | Sim | Sim | Leitura | Limitado | Não |
| Templates | Total | Sim | Sim | Leitura | Não | Não |
| Cycles | Total | Sim | Sim | Leitura | Limitado | Não |
| Assignments | Total | Sim | Sim | Leitura | Limitado | Não |
| Responses brutas | Muito restrito | Restrito | Restrito | Não por padrão | Não | Próprias em fluxo de resposta |
| Analytics consolidados | Sim | Sim | Sim | Limitado | Limitado | Próprio, quando liberado |
| Reports / exports | Sim | Sim | Sim | Limitado | Limitado | Próprio, quando liberado |

A matriz de autorização ajuda a visualizar claramente ações por papel e é uma prática recomendada para reduzir ambiguidade de acesso. [cite:447][cite:449][cite:451]

## Regras por módulo

## Tenants e memberships

### owner
- pode gerenciar configurações do tenant;
- pode convidar e remover membros;
- pode alterar papéis, com exceções de governança. [cite:276][cite:447]

### admin
- pode operar o tenant amplamente;
- pode gerenciar membros se a política permitir, mas idealmente com menos poderes que `owner`. [cite:276]

### hr
- não deve ter acesso nativo para governança total de membership, salvo decisão explícita do produto. [cite:447]

## Participants

### Leitura
- `owner`, `admin`, `hr`: leitura ampla do tenant;
- `analyst`: leitura conforme necessidade analítica;
- `manager`: leitura apenas do próprio escopo autorizado;
- `participant`: sem leitura ampla. [cite:447][cite:276]

### Escrita
- `owner`, `admin`, `hr`: criar e editar;
- `analyst` e `manager`: não devem editar cadastro base no MVP. [cite:447]

## Templates

### Leitura
- `owner`, `admin`, `hr`, `analyst`: sim;
- `manager` e `participant`: não por padrão. [cite:447]

### Escrita
- `owner`, `admin`, `hr`: sim;
- demais: não. [cite:276]

## Cycles

### Leitura
- `owner`, `admin`, `hr`, `analyst`: leitura do tenant;
- `manager`: leitura limitada a ciclos e visões onde haja escopo permitido;
- `participant`: não. [cite:447]

### Escrita
- `owner`, `admin`, `hr`: criar, editar, ativar, fechar;
- `analyst`: sem mutação no MVP. [cite:276]

## Assignments

### Leitura
- `owner`, `admin`, `hr`: ampla;
- `analyst`: leitura operacional limitada;
- `manager`: apenas o que fizer parte do escopo permitido;
- `participant`: apenas o assignment próprio no fluxo de resposta, preferencialmente por token, não por acesso aberto à tabela. [cite:280][cite:448]

### Escrita
- `owner`, `admin`, `hr`: sim;
- demais: não no MVP. [cite:447]

## Responses

### Regra geral

Responses são dados sensíveis e devem ter política mais restrita do que outras entidades. Em multi-tenant analytics, proteger linhas sensíveis com RLS fina é especialmente importante para evitar vazamento de conteúdo e identidade. [cite:448][cite:450]

### Leitura administrativa
- `owner`, `admin`, `hr`: apenas se realmente necessário e com cuidado;
- `analyst`: não por padrão na resposta bruta;
- `manager`: não por padrão;
- `participant`: apenas durante o próprio preenchimento, se aplicável. [cite:447][cite:448]

### Escrita

A inserção de responses pelo fluxo de avaliador não deve depender de permissões administrativas amplas. O ideal é usar fluxo controlado por token ou função segura que valide assignment, ciclo e estado antes de gravar. [cite:280][cite:448]

## Scoring and analytics

### Leitura
- `owner`, `admin`, `hr`: ampla dentro do tenant;
- `analyst`: leitura analítica autorizada;
- `manager`: leitura só do escopo gerencial permitido;
- `participant`: apenas do próprio resultado quando liberado. [cite:276][cite:447]

### Escrita e reprocessamento
- restrito a `owner`, `admin`, `hr` ou automação de sistema. [cite:447]

## Reports and exports

### Leitura
- alinhada às permissões da camada analítica consolidada. [cite:447]

### Exportação

Export é uma ação mais sensível do que simplesmente visualizar. A matriz deve tratar export como permissão própria, porque extração em massa aumenta risco operacional e de compliance. [cite:424][cite:447]

## Escopo especial de manager

O papel `manager` exige regra adicional além do tenant.

### Princípio

O manager não deve ver “todo o tenant”. Ele deve ver apenas o próprio escopo gerencial autorizado. [cite:447][cite:276]

### Escopo inicial recomendado
- próprios dados, quando aplicável;
- equipe direta ou conjunto explicitamente autorizado;
- relatórios ou analytics liberados para esse grupo. [cite:447]

### Observação

Esse escopo provavelmente exigirá tabela auxiliar ou função de resolução, por exemplo:
- `manager_scopes`
- ou leitura derivada de `participants.manager_participant_id` associada ao membership do usuário. [cite:270][cite:280]

## Escopo especial de participant

O papel `participant` deve ser tratado como experiência de acesso mínima.

### Acesso esperado
- responder próprio assignment;
- eventualmente visualizar próprio relatório, quando liberado;
- não navegar livremente pelo tenant. [cite:447]

### Recomendação

No fluxo de resposta, preferir autorização por token seguro e validado contra assignment específico, e não navegação geral sobre tabelas do tenant. [cite:280][cite:448]

## Estratégia para magic links e respostas

O fluxo de resposta por magic link merece política separada.

### Recomendação de arquitetura
- o link acessa uma página pública controlada;
- a página chama função segura ou endpoint que valida o token;
- a função retorna somente o contexto mínimo necessário;
- a submissão grava via RPC ou server-side logic validando estado do assignment. [cite:280][cite:448]

### O que evitar
- política `anon` ampla em `responses`;
- acesso direto de cliente anônimo a tabelas centrais sem validação forte. [cite:448][cite:450]

## Regras de escrita

As políticas de `INSERT` e `UPDATE` devem ser mais rígidas do que as de `SELECT`.

### Diretrizes
- `SELECT`: exige membership ativo e papel compatível;
- `INSERT`: exige membership ativo, papel compatível e `tenant_id` coerente;
- `UPDATE`: exige papel compatível e, quando necessário, ownership ou contexto adicional;
- `DELETE`: deve ser raro e fortemente restrito. [cite:270][cite:271][cite:446]

## Sobre DELETE

Para o Maptiva, a recomendação padrão é evitar `DELETE` amplo nas tabelas principais e preferir:
- `archived`
- `inactive`
- `cancelled`
- soft delete controlado [cite:447][cite:450]

Isso preserva histórico e reduz risco de dano operacional em dados de assessment. [cite:450]

## Políticas por operação

### SELECT
Objetivo: garantir leitura só dentro do tenant e do escopo do papel. [cite:270][cite:280]

### INSERT
Objetivo: impedir criação em tenant alheio e bloquear papéis sem autoridade. [cite:271][cite:277]

### UPDATE
Objetivo: permitir edição apenas quando o recurso e o papel justificarem a mutação. [cite:270][cite:446]

### DELETE
Objetivo: restringir ao mínimo absoluto. [cite:447][cite:450]

## Sincronia entre frontend e banco

O frontend deve refletir a mesma matriz de autorização, mas nunca substituí-la. Documentações de controle de acesso enfatizam que a matriz precisa ser mantida como documento vivo e refletida de forma consistente entre camadas. [cite:451][cite:449]

### Consequência prática
- esconder botão no frontend não é segurança;
- negar operação no banco é obrigatório;
- logs de erro de autorização devem ser tratáveis pelo produto. [cite:448][cite:447]

## Performance e indexação

RLS em tabelas multi-tenant exige atenção de performance.

### Recomendação
- indexar `tenant_id`;
- indexar chaves compostas críticas envolvendo `tenant_id`;
- evitar políticas excessivamente complexas ou com subqueries pesadas sem necessidade. Guias de Supabase multi-tenant e RLS recomendam indexação do identificador do tenant para escalar com segurança e desempenho. [cite:274][cite:280][cite:448]

## Testes obrigatórios

A política de RLS não deve ser considerada pronta sem testes.

### Cenários mínimos
- usuário do tenant A não lê dados do tenant B;
- usuário do tenant A não insere dados no tenant B;
- `analyst` não consegue mutações administrativas;
- `manager` não enxerga dados fora do próprio escopo;
- fluxo de participant/token não abre acesso lateral ao tenant. [cite:277][cite:280][cite:446]

Testar diferentes papéis e operações é uma recomendação recorrente em implementações robustas de RLS para SaaS. [cite:277][cite:280]

## Auditoria e governança

Além de RLS, o sistema deve registrar eventos sensíveis como:
- mudança de papel;
- convite e revogação de membership;
- exportações relevantes;
- reprocessamento analítico;
- acesso ou tentativa de acesso negado, quando viável. [cite:447][cite:451]

## Decisões práticas recomendadas para o MVP

### 1. Começar com RBAC simples

Evitar papéis demais no início reduz complexidade e facilita manutenção. Matrizes de autorização funcionam melhor quando os papéis são claros e enxutos. [cite:447][cite:449]

### 2. Todas as tabelas centrais com `tenant_id`

Essa decisão simplifica enforcement, debugging e evolução do produto. [cite:270][cite:274]

### 3. Membership obrigatório para acesso autenticado administrativo

Toda leitura ou escrita administrativa deve passar por membership ativo. [cite:276][cite:270]

### 4. Participant flow separado de admin flow

Fluxo de resposta por magic link não deve reutilizar a mesma superfície de acesso do painel administrativo. [cite:280][cite:448]

### 5. Exports como permissão separada

Mesmo quando alguém pode ver um dashboard, isso não significa que pode exportar o dataset completo. [cite:424][cite:447]

## Anti-padrões a evitar

- confiar só em filtro no frontend;
- esquecer `tenant_id` em tabelas centrais;
- permitir `service_role` fora de contextos controlados;
- abrir `anon` em tabelas sensíveis;
- escrever políticas genéricas demais para responses;
- não testar papéis e operações reais. [cite:270][cite:280][cite:448]

## Estrutura sugerida de implementação

Este documento recomenda a seguinte ordem:

1. criar `tenants`;
2. criar `tenant_memberships`;
3. adicionar `tenant_id` às tabelas centrais;
4. habilitar RLS em todas as tabelas tenant-scoped;
5. criar funções helper de membership e role;
6. criar políticas por operação;
7. escrever testes de acesso por papel;
8. alinhar frontend com a matriz documentada. [cite:270][cite:280][cite:276]

## Resumo final

O modelo de permissões e RLS do Maptiva deve ser construído sobre isolamento por `tenant_id`, memberships por tenant, RBAC simples e enforcement real no banco via Supabase/Postgres RLS. Essa combinação é a base mais segura e escalável para proteger dados de assessment, manter coerência entre módulos e preparar o produto para crescer sem comprometer segurança e governança. [cite:270][cite:280][cite:276]

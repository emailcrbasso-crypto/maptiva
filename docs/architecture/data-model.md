# Data Model — Maptiva

## Objetivo deste documento

Este documento descreve o modelo de dados conceitual e lógico do Maptiva, com foco nas entidades principais, seus relacionamentos, responsabilidades e regras estruturais.

O objetivo é garantir que o produto seja implementado com um modelo de dados consistente, multi-tenant, extensível e preparado para suportar:
- operação de ciclos 180° e 360°;
- templates reutilizáveis;
- anonimato por regra;
- snapshots analíticos;
- relatórios e exportações;
- integração futura com o Maptiva Grid. [file:1][web:256][web:257]

## Princípios do modelo de dados

O modelo de dados do Maptiva deve seguir estes princípios:

### 1. Multi-tenant por design
Toda entidade de negócio relevante deve estar vinculada a um `tenant_id`. [web:22][web:264]

### 2. Normalizar primeiro, otimizar depois
O modelo deve começar com estrutura relacional clara e baixo acoplamento. Otimizações e desnormalizações só devem ocorrer quando houver necessidade real de performance. [web:257][web:259]

### 3. Separação entre operacional e analítico
O dado operacional serve para executar o ciclo; o dado analítico serve para relatório, exportação e integração. Essas camadas não devem ser confundidas. [file:1][web:256]

### 4. Configuração orientada a templates
Métodos, competências, escalas e regras devem ser configuráveis por template, evitando lógica fixa no ciclo. [web:13]

### 5. Modelo extensível
O schema deve ser pensado para crescer em:
- novos tipos de relação;
- novos questionários;
- novos métodos de avaliação;
- novas dimensões analíticas;
- futuras integrações com o Maptiva Grid. [web:259][web:265]

## Visão geral do domínio

O domínio do Maptiva pode ser entendido em seis blocos:

1. tenancy e acesso;
2. métodos e templates;
3. ciclos e participantes;
4. assignments e coleta;
5. cálculos e analytics;
6. relatórios e exportações. [file:1][web:256]

## Mapa de entidades

```text
Tenant
 ├─ Users
 ├─ Memberships
 ├─ Assessment Templates
 │   ├─ Competencies
 │   ├─ Questions
 │   ├─ Questionnaires
 │   └─ Relationship Rules
 ├─ Assessment Cycles
 │   ├─ Participants
 │   ├─ Rater Assignments
 │   └─ Responses
 ├─ Score Snapshots
 ├─ Participant Result Profiles
 └─ Integration Exports
```

## Bloco 1 — Tenancy e acesso

### `tenants`

Representa a empresa cliente da plataforma.

Responsabilidades:
- isolar dados do cliente;
- armazenar configurações globais;
- servir como raiz de contexto para todas as entidades de negócio. [web:22][web:264]

Campos principais:
- `id`
- `name`
- `slug`
- `plan_code`
- `locale`
- `timezone`
- `status`
- `created_at`

### `users`

Representa usuários administrativos da plataforma.

Responsabilidades:
- identificar pessoas autenticadas;
- permitir participação em múltiplos tenants, se necessário;
- sustentar o controle de acesso administrativo. [web:22][web:262]

Campos principais:
- `id`
- `auth_user_id`
- `name`
- `email`
- `created_at`

### `tenant_memberships`

Relaciona usuários a tenants.

Responsabilidades:
- definir o papel do usuário em cada tenant;
- controlar autorização por contexto de cliente. [web:22]

Campos principais:
- `id`
- `tenant_id`
- `user_id`
- `role`
- `created_at`

Papéis iniciais sugeridos:
- `owner`
- `admin`
- `hr`
- `manager`
- `analyst`

## Bloco 2 — Métodos, templates e configuração

### `assessment_methods`

Catálogo de métodos de avaliação suportados pela plataforma.

Objetivo:
- padronizar presets como 180, 360 e custom. [web:13]

Campos principais:
- `code`
- `name`

Exemplos:
- `180`
- `360`
- `custom`

### `assessment_templates`

Representa modelos reutilizáveis de avaliação.

Responsabilidades:
- armazenar regras padrão de avaliação;
- centralizar configurações do método;
- servir de base para criação de ciclos. [web:13]

Campos principais:
- `id`
- `tenant_id`
- `name`
- `method_code`
- `scale_min`
- `scale_max`
- `allow_na`
- `anonymous_by_group`
- `n_minimum_default`
- `show_self_separately`
- `show_manager_separately`
- `weighting_json`
- `settings_json`
- `created_at`

### `relationship_types`

Catálogo de tipos de relação entre avaliador e avaliado.

Objetivo:
- permitir flexibilidade além de `self`, `manager`, `peer` e `subordinate`. [file:1][web:13]

Campos principais:
- `code`
- `name`
- `is_system`

Exemplos:
- `self`
- `manager`
- `peer`
- `subordinate`
- `client`
- `mentor`

### `template_relationship_rules`

Define quais relações são permitidas e como se comportam dentro de um template.

Responsabilidades:
- indicar relações obrigatórias;
- limitar quantidade mínima/máxima de avaliadores por papel;
- definir ordenação e comportamento de exibição. [web:13]

Campos principais:
- `id`
- `template_id`
- `relationship_code`
- `is_required`
- `min_raters`
- `max_raters`
- `display_order`

### `competencies`

Representa competências avaliadas em um template.

Responsabilidades:
- estruturar o eixo principal de avaliação;
- servir de base para agregação de scores;
- preparar mapeamento com dimensões futuras. [file:1][web:17]

Campos principais:
- `id`
- `tenant_id`
- `template_id`
- `name`
- `description`
- `dimension_code`
- `order_index`

### `questionnaires`

Representa conjuntos de perguntas associados ao template.

Responsabilidades:
- permitir questionários específicos por método ou papel;
- organizar a estrutura da coleta. [web:13][web:259]

Campos principais:
- `id`
- `tenant_id`
- `template_id`
- `name`
- `relationship_code`
- `settings_json`
- `created_at`

### `questions`

Representa perguntas quantitativas ou qualitativas.

Responsabilidades:
- compor questionários;
- conectar pergunta à competência;
- definir o tipo de resposta. [file:1]

Campos principais:
- `id`
- `tenant_id`
- `template_id`
- `competency_id`
- `relationship_code`
- `prompt`
- `response_type`
- `order_index`

Tipos de resposta sugeridos:
- `scale`
- `text`

## Bloco 3 — Ciclos e participantes

### `assessment_cycles`

Representa a execução concreta de um template em um período.

Responsabilidades:
- ativar a operação real da avaliação;
- carregar configurações específicas do ciclo;
- controlar status, prazo e release. [file:1]

Campos principais:
- `id`
- `tenant_id`
- `template_id`
- `name`
- `status`
- `start_at`
- `deadline_at`
- `report_release_at`
- `settings_override_json`
- `created_by`
- `created_at`

Status sugeridos:
- `draft`
- `active`
- `closed`

### `participants`

Representa os avaliados do ciclo.

Responsabilidades:
- armazenar metadados mínimos das pessoas avaliadas;
- estruturar relações hierárquicas;
- servir de base para assignments e analytics. [file:1]

Campos principais:
- `id`
- `tenant_id`
- `cycle_id`
- `external_person_id`
- `name`
- `email`
- `department`
- `job_title`
- `manager_participant_id`
- `metadata_json`
- `created_at`

Observação:
participantes são entidades ligadas ao ciclo, não necessariamente ao cadastro permanente de RH da empresa. Isso simplifica o MVP e evita dependência de um master data completo logo no início. [web:257][web:265]

## Bloco 4 — Assignments e coleta

### `rater_assignments`

Representa quem avalia quem, com qual relação e em qual contexto.

Responsabilidades:
- ser a unidade operacional da coleta;
- vincular avaliado, avaliador, papel, questionário e status;
- sustentar magic links e rastreamento de conclusão. [file:1]

Campos principais:
- `id`
- `tenant_id`
- `cycle_id`
- `evaluated_participant_id`
- `evaluator_participant_id`
- `relationship_code`
- `questionnaire_id`
- `magic_token`
- `token_expires_at`
- `status`
- `invited_at`
- `completed_at`
- `created_at`

Status sugeridos:
- `pending`
- `invited`
- `completed`
- `expired`
- `cancelled`

### `responses`

Representa respostas individuais submetidas em cada assignment.

Responsabilidades:
- armazenar dados quantitativos e qualitativos;
- preservar vínculo entre assignment e pergunta;
- permitir posterior consolidação analítica. [file:1]

Campos principais:
- `id`
- `tenant_id`
- `assignment_id`
- `question_id`
- `score`
- `text_answer`
- `created_at`

Regra importante:
deve existir `UNIQUE (assignment_id, question_id)` para impedir duplicidade da mesma pergunta dentro do mesmo assignment. [file:1]

## Bloco 5 — Analytics e consolidação

### `score_snapshots`

Representa dados consolidados por participante, competência, grupo e dimensão.

Responsabilidades:
- servir de base para relatórios;
- aplicar políticas de anonimato;
- armazenar versão calculada da leitura analítica do ciclo. [file:1][web:256]

Campos principais:
- `id`
- `tenant_id`
- `cycle_id`
- `participant_id`
- `competency_id`
- `dimension_code`
- `relationship_group`
- `score_avg`
- `response_count`
- `visibility_status`
- `generated_at`

Valores sugeridos para `visibility_status`:
- `visible`
- `merged`
- `hidden`

### `participant_result_profiles`

Representa a visão consolidada final de cada participante no ciclo.

Responsabilidades:
- resumir scores principais;
- registrar blind spots e hidden strengths;
- servir como base executiva para dashboards e integrações. [file:1][web:17]

Campos principais:
- `id`
- `tenant_id`
- `cycle_id`
- `participant_id`
- `overall_score`
- `self_score`
- `manager_score`
- `peer_score`
- `subordinate_score`
- `blind_spot_count`
- `hidden_strength_count`
- `report_json`
- `generated_at`

Observação:
essa tabela não substitui `score_snapshots`; ela resume o resultado final por participante. [web:256][web:259]

## Bloco 6 — Integrações e exportações

### `integration_exports`

Representa lotes ou registros de exportação analítica.

Responsabilidades:
- registrar payloads ou eventos de export;
- permitir rastreabilidade de integrações;
- preparar interoperabilidade com Maptiva Grid. [web:17][web:268]

Campos sugeridos:
- `id`
- `tenant_id`
- `cycle_id`
- `export_type`
- `target_system`
- `status`
- `payload_json`
- `generated_at`
- `processed_at`

Exemplos:
- `export_type = analytics_snapshot`
- `target_system = maptiva_grid`

## Relacionamentos principais

### Tenancy
- `tenants` 1:N `tenant_memberships`
- `users` 1:N `tenant_memberships`

### Configuração
- `tenants` 1:N `assessment_templates`
- `assessment_methods` 1:N `assessment_templates`
- `assessment_templates` 1:N `competencies`
- `assessment_templates` 1:N `questions`
- `assessment_templates` 1:N `questionnaires`
- `assessment_templates` 1:N `template_relationship_rules`

### Execução
- `assessment_templates` 1:N `assessment_cycles`
- `assessment_cycles` 1:N `participants`
- `assessment_cycles` 1:N `rater_assignments`
- `participants` 1:N `rater_assignments` como avaliados
- `participants` 1:N `rater_assignments` como avaliadores
- `rater_assignments` 1:N `responses`

### Analytics
- `assessment_cycles` 1:N `score_snapshots`
- `assessment_cycles` 1:N `participant_result_profiles`
- `participants` 1:N `score_snapshots`
- `participants` 1:1 ou 1:N `participant_result_profiles` por ciclo

## Regras estruturais importantes

### 1. Toda tabela de negócio deve ser tenant-scoped
Isso é obrigatório para isolamento e segurança do produto. [web:22][web:264]

### 2. Não usar respostas brutas como fonte final de relatório
Relatórios e integrações devem consumir snapshots ou perfis consolidados. [file:1][web:256]

### 3. Templates controlam comportamento
Ciclos herdam regras de templates, podendo sobrescrever apenas pontos específicos. [web:13]

### 4. Assignments são a unidade operacional central da coleta
Magic links, status, conclusão e controle da resposta devem girar em torno do assignment. [file:1]

### 5. Competências precisam carregar `dimension_code`
Mesmo que o Maptiva Grid seja um produto separado, o Maptiva deve produzir dados preparados para agrupamento por dimensão. [web:17]

## Convenções recomendadas

### Chaves
- UUID como chave primária.
- Foreign keys explícitas.
- índices em colunas de junção e contexto de tenant. [web:257]

### Timestamps
Usar `created_at` em todas as entidades centrais e `updated_at` onde houver edição relevante. [web:259]

### JSONs
Usar campos JSON somente onde a configuração for naturalmente variável, como:
- `settings_json`
- `weighting_json`
- `metadata_json`
- `report_json`
- `payload_json`

Evitar esconder dados estruturais importantes dentro de JSON sem necessidade. [web:257][web:259]

### Naming
- nomes consistentes, em inglês técnico;
- tabelas no plural;
- foreign keys explícitas;
- enums padronizados. [web:256][web:259]

## Dados sensíveis e confidencialidade

Este modelo armazena informações sensíveis, incluindo:
- dados pessoais básicos;
- relações hierárquicas;
- respostas qualitativas;
- resultados consolidados de avaliação.

Por isso, o modelo deve ser acompanhado por:
- RLS;
- autorização por papel;
- políticas de visibilidade;
- trilha de auditoria;
- regras de exportação controladas. [file:1][web:22]

## O que fica fora deste modelo no MVP

Para manter foco, o modelo inicial não precisa incluir:

- plano de sucessão;
- comitês de calibração;
- ranking cross-tenant;
- benchmarking entre empresas;
- gestão completa de cargos e trilhas;
- portal detalhado de PDI;
- recursos nativos de Nine Box. [web:257][web:265]

Esses recursos podem ser adicionados depois, preferencialmente no contexto do Maptiva Grid ou de módulos futuros. [web:17]

## Evolução futura do modelo

O modelo foi desenhado para suportar evoluções como:

- biblioteca global de competências;
- questionários condicionais;
- score por dimensão analítica;
- histórico longitudinal por pessoa;
- integração com HRIS;
- exportações assinadas para o Maptiva Grid;
- analytics comparativos entre ciclos. [web:17][web:259][web:268]

## Resumo final

O modelo de dados do Maptiva organiza o produto em torno de tenancy, templates, ciclos, assignments, respostas e consolidação analítica. Essa estrutura permite operar avaliações 180° e 360° com consistência, escalar para múltiplos clientes e preparar os dados para relatórios e integrações futuras sem depender de modelagens improvisadas. [file:1][web:256][web:257]
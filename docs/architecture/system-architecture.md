# System Architecture — Maptiva

## Objetivo deste documento

Este documento descreve a arquitetura de sistema do Maptiva em alto nível, cobrindo os principais componentes, camadas, responsabilidades, fluxos centrais e decisões técnicas que orientam a implementação do produto.

O foco é garantir que o Maptiva seja construído como um SaaS multi-tenant, seguro, modular e preparado para escalar em novos clientes, novos ciclos e futuras integrações, incluindo o produto separado Maptiva Grid. [web:22][web:245][web:252]

## Resumo arquitetural

O Maptiva será construído como uma aplicação SaaS multi-tenant com separação lógica por tenant, autenticação administrativa, execução de ciclos de avaliação, coleta de respostas, cálculo consolidado e geração de relatórios.

A arquitetura deve seguir uma divisão clara entre:
- camada de apresentação;
- camada de aplicação;
- camada de domínio;
- camada de persistência;
- camada analítica;
- camada de integração. [web:246][web:248][web:251]

## Princípios arquiteturais

A arquitetura do Maptiva deve respeitar os seguintes princípios:

### 1. Multi-tenancy como fundação
Todo o sistema deve assumir que há múltiplos clientes operando na mesma plataforma, com isolamento de dados, permissões e configurações por tenant. [web:22][web:252]

### 2. Tenant context obrigatório
Toda requisição, consulta e operação relevante deve carregar contexto explícito de tenant. Nenhum módulo de negócio deve operar “sem tenant” por conveniência. [web:22][web:252]

### 3. Separação entre transacional e analítico
A coleta de respostas e o cálculo analítico não devem ser tratados como a mesma camada. Relatórios e exportações devem consumir snapshots consolidados, não depender diretamente da leitura de tabelas brutas. [file:1][web:245]

### 4. Configuração acima de customização
Métodos 180°, 360° e custom devem ser configurados por templates, regras e parâmetros, evitando bifurcações de produto. [web:13][web:252]

### 5. Módulos coesos e desacoplados
Cada área do produto deve ter responsabilidade clara, com baixo acoplamento entre UI, lógica de negócio, persistência e geração de relatórios. [web:245][web:248]

### 6. Evolução orientada a produto
O Maptiva deve ser construído de forma que a evolução para o Maptiva Grid ocorra por integração de dados consolidados, não por compartilhamento improvisado de lógica de interface. [web:17][web:25]

## Visão em camadas

A arquitetura lógica do sistema é composta por seis camadas principais.

### 1. Presentation layer

Responsável por:
- telas administrativas;
- formulários de avaliação;
- dashboards;
- interfaces de geração de relatórios;
- componentes de UI.

Essa camada não deve concentrar regras de negócio críticas. Seu papel é orquestrar a experiência do usuário e consumir serviços da aplicação. [web:246][web:248]

### 2. Application layer

Responsável por:
- casos de uso;
- orquestração de fluxos;
- validação de entrada;
- coordenação entre módulos;
- integração entre UI, banco, cálculos, relatórios e serviços externos.

Exemplos:
- criar ciclo;
- importar participantes;
- disparar convites;
- fechar ciclo;
- gerar relatório. [web:245][web:248]

### 3. Domain layer

Responsável por:
- regras de negócio;
- entidades de domínio;
- políticas de anonimato;
- lógica de agrupamento;
- regras por método;
- engine de scoring;
- regras de visibilidade analítica.

Essa é a camada mais importante para manter o produto consistente ao longo do tempo. [file:1][web:245]

### 4. Persistence layer

Responsável por:
- acesso ao banco;
- repositórios;
- queries;
- policies RLS;
- migrations;
- versionamento de schema;
- operações de leitura e escrita por tenant. [web:22][web:173][web:252]

### 5. Analytics layer

Responsável por:
- snapshots consolidados;
- perfis de resultado por participante;
- agregações por competência, dimensão e grupo;
- dados de exportação;
- insumos para dashboards e relatórios;
- futura integração com Maptiva Grid. [file:1][web:17]

### 6. Integration layer

Responsável por:
- envio de e-mails;
- geração de arquivos PDF e Excel;
- exportações analíticas;
- integração futura entre Maptiva e Maptiva Grid;
- possíveis integrações externas posteriores. [file:1][web:248]

## Componentes principais do sistema

### 1. Tenant and identity module

Responsável por:
- tenants;
- memberships;
- papéis;
- autenticação administrativa;
- controle de acesso por contexto de tenant. [web:22][web:252]

Entidades principais:
- `tenants`
- `users`
- `tenant_memberships`

### 2. Template engine

Responsável por:
- métodos de avaliação;
- templates;
- regras de anonimato;
- escalas;
- competências;
- questionários;
- regras de relação entre avaliador e avaliado. [web:13]

Entidades principais:
- `assessment_methods`
- `assessment_templates`
- `relationship_types`
- `template_relationship_rules`
- `competencies`
- `questions`
- `questionnaires`

### 3. Cycle management module

Responsável por:
- criação e manutenção de ciclos;
- status do ciclo;
- participantes;
- importação;
- deadlines;
- settings específicos de execução. [file:1]

Entidades principais:
- `assessment_cycles`
- `participants`

### 4. Assignment module

Responsável por:
- mapear quem avalia quem;
- registrar relacionamento;
- gerar assignments;
- controlar convites e conclusão;
- gerenciar magic links. [file:1]

Entidades principais:
- `rater_assignments`

### 5. Response collection module

Responsável por:
- experiência de resposta;
- persistência das respostas;
- controle de submissão;
- respostas quantitativas e qualitativas. [file:1]

Entidades principais:
- `responses`

### 6. Scoring engine

Responsável por:
- cálculo de médias;
- agrupamento por papel;
- aplicação de N-mínimo;
- cálculo de gaps;
- classificação de blind spots e hidden strengths;
- produção de snapshots analíticos. [file:1]

Entidades principais:
- `score_snapshots`
- `participant_result_profiles`

### 7. Reporting module

Responsável por:
- relatórios individuais;
- relatórios consolidados;
- relatórios executivos;
- geração de PDF;
- exportações em Excel/CSV. [file:1]

### 8. Integration/export module

Responsável por:
- export analítico;
- payload estruturado para Maptiva Grid;
- interoperabilidade futura com outros sistemas. [web:17][web:25]

## Arquitetura lógica resumida

```text
[Admin UI / Evaluation UI]
          |
          v
[Application Services / Use Cases]
          |
          v
[Domain Modules]
  - Tenants
  - Templates
  - Cycles
  - Assignments
  - Responses
  - Scoring
  - Reports
          |
          v
[Persistence Layer / Supabase]
  - Postgres
  - Auth
  - Storage
  - Edge Functions
          |
          +--> [Analytics Layer]
          |
          +--> [Email / Export / PDF / Excel]
          |
          +--> [Future Maptiva Grid Integration]
```

Essa visão simplificada ajuda a preservar a separação entre o que é interface, o que é regra de negócio, o que é armazenamento e o que é integração. [web:245][web:251]

## Fluxos principais do sistema

### Fluxo 1 — Configuração de ciclo

1. Admin acessa o tenant.
2. Seleciona ou cria um template.
3. Cria o ciclo.
4. Importa ou cadastra participantes.
5. Define assignments.
6. Ativa o ciclo. [file:1]

### Fluxo 2 — Coleta de respostas

1. Sistema gera magic links por assignment.
2. Avaliadores recebem convite.
3. Avaliador acessa o formulário.
4. Responde perguntas quantitativas e qualitativas.
5. Sistema registra `completed_at` e fecha o assignment. [file:1]

### Fluxo 3 — Consolidação

1. Admin fecha o ciclo.
2. Engine de cálculo consolida respostas.
3. Sistema aplica regras de anonimato.
4. Gera snapshots analíticos.
5. Disponibiliza dados para relatórios e exportação. [file:1]

### Fluxo 4 — Relatórios e exportações

1. Admin solicita relatório.
2. Reporting module lê snapshots consolidados.
3. Gera PDF, dashboard e exportação.
4. Admin baixa ou compartilha o material. [file:1]

## Multi-tenancy model

O Maptiva deve adotar multi-tenancy lógica com banco compartilhado e isolamento por `tenant_id`, porque isso oferece boa relação entre simplicidade operacional, escalabilidade e custo para um SaaS B2B em estágio inicial. [web:22][web:249][web:252]

### Regras do modelo

- `tenant_id` em toda tabela de negócio.
- autorização sempre tenant-scoped.
- memberships vinculam usuários a tenants.
- nenhuma leitura de dados entre tenants.
- índices e constraints devem considerar tenant quando apropriado. [web:22][web:252]

Esse modelo deve ser mantido consistente desde o início para evitar retrabalho posterior. [web:22]

## Stack e componentes técnicos

### Frontend
- React + TypeScript
- Tailwind CSS
- biblioteca de gráficos
- geração de PDFs no cliente ou em fluxo controlado [file:1]

### Backend / plataforma
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Edge Functions
- Vercel para deploy da aplicação web [file:1][web:173]

### Documentos e artefatos
- PDF via `@react-pdf/renderer`
- gráficos via `recharts`
- captura quando necessário via `html2canvas`
- Excel/CSV via `xlsx` / SheetJS [file:1]

## Decisões técnicas iniciais

### 1. Banco compartilhado com isolamento lógico
Decisão:
Usar banco compartilhado com `tenant_id` e RLS, em vez de banco por tenant. [web:22][web:249]

Motivo:
Menor complexidade operacional e melhor aderência ao estágio inicial do produto. [web:22][web:252]

### 2. Templates como núcleo
Decisão:
Construir a arquitetura em torno de templates e ciclos, não em torno de ciclos independentes. [web:13]

Motivo:
Maior reuso, padronização e escalabilidade. [web:13]

### 3. Analytics separado do transacional
Decisão:
Criar snapshots e perfis de resultado consolidados. [file:1][web:17]

Motivo:
Relatórios consistentes, melhor performance e integração futura mais simples. [web:17][web:245]

### 4. Nine Box fora do core
Decisão:
Não implementar Nine Box dentro do Maptiva. [web:17][web:25]

Motivo:
Manter foco no problema principal do produto e separar coleta de feedback de calibração/talent review. [web:17]

## Responsabilidades por módulo

| Módulo | Responsabilidade principal |
|---|---|
| Tenants | Isolamento, memberships, papéis e contexto do cliente. [web:22] |
| Templates | Métodos, competências, questionários e regras de avaliação. [web:13] |
| Cycles | Execução concreta da avaliação em um período. [file:1] |
| Participants | Pessoas avaliadas e seus metadados. [file:1] |
| Assignments | Relações entre avaliador e avaliado. [file:1] |
| Responses | Coleta e persistência das respostas. [file:1] |
| Scoring | Cálculo, anonimato e consolidação. [file:1] |
| Reports | Geração de relatórios e arquivos. [file:1] |
| Integrations | Exportações e conexão futura com Maptiva Grid. [web:17] |

## Segurança e controle de acesso

A segurança do Maptiva depende principalmente de quatro mecanismos:

1. autenticação administrativa segura;
2. autorização por membership e papel;
3. tenant context obrigatório;
4. RLS no banco. [web:22][web:252]

Regras adicionais:
- service role nunca no frontend; [file:1]
- tokens de avaliação precisam estar vinculados a assignment válido; [file:1]
- secrets fora do repositório;
- trilha de auditoria para ações críticas. [web:245]

## Escalabilidade e evolução

O Maptiva deve ser construído para escalar em três dimensões:

### 1. Mais tenants
O sistema deve suportar novos clientes sem alterar a arquitetura-base. [web:22]

### 2. Mais complexidade de método
Novos tipos de avaliação devem entrar como configuração. [web:13]

### 3. Mais profundidade analítica
A camada de snapshots deve permitir relatórios mais ricos e integração posterior com Maptiva Grid. [web:17][web:25]

## Limites arquiteturais

Para evitar acoplamento e escopo confuso, esta arquitetura assume alguns limites:

- Maptiva não é HRIS completo.
- Maptiva não é Nine Box.
- Maptiva não deve centralizar regras de decisão sucessória.
- Maptiva não deve depender de cálculos ad hoc dentro dos relatórios.
- Maptiva Grid consumirá dados consolidados, não a base operacional bruta. [web:17][web:25]

## Próximos documentos relacionados

Este documento deve ser complementado por:

- `data-model.md`
- `multi-tenant-model.md`
- `permissions-rls.md`
- `modules-overview.md`
- `integrations.md`

## Resumo arquitetural final

O Maptiva será construído como uma plataforma SaaS multi-tenant com camadas claras de apresentação, aplicação, domínio, persistência, analytics e integração. O núcleo do sistema será orientado por templates, ciclos e regras configuráveis de avaliação, enquanto a camada analítica consolidada servirá de base para relatórios, exportações e futuras integrações com o Maptiva Grid. [file:1][web:22][web:245]
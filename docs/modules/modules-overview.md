# Modules Overview — Maptiva

## Objetivo deste documento

Este documento descreve os módulos funcionais do Maptiva, suas responsabilidades, dependências e papel dentro do produto.

O objetivo é transformar a visão de produto e a arquitetura técnica em um mapa operacional de implementação, facilitando planejamento, desenvolvimento incremental e organização da documentação por módulo. A documentação modular tende a escalar melhor quando cada módulo possui propósito claro, limites definidos e possibilidade de evolução independente. [web:290][web:293][web:296]

## Princípios de modularização

A divisão do Maptiva em módulos deve seguir estes princípios:

### 1. Cada módulo deve resolver um problema claro
Um módulo não deve existir apenas porque há uma pasta com esse nome. Ele deve representar uma responsabilidade funcional real do produto. [web:290][web:298]

### 2. Alta coesão, baixo acoplamento
Cada módulo deve concentrar sua própria lógica principal e depender o mínimo possível de detalhes internos de outros módulos. [web:291][web:297]

### 3. Interface clara entre módulos
Dependências entre módulos devem ser explícitas, especialmente em operações críticas como cálculo, relatórios, permissões e exportações. [web:289][web:298]

### 4. Evolução por fases
Os módulos devem permitir implementação incremental, começando pelo núcleo transacional e avançando para analytics, relatórios e integrações. [web:296][web:299]

### 5. Separação entre produto e tecnologia
Os módulos são definidos primeiro pela função de negócio e depois pela implementação técnica. Isso evita criar estruturas artificiais apenas com base no framework. [web:285][web:290]

## Visão geral dos módulos

O Maptiva pode ser organizado inicialmente em dez módulos principais:

1. Tenant and Access
2. Templates
3. Cycles
4. Participants
5. Assignments
6. Response Collection
7. Scoring and Analytics
8. Reports and Exports
9. Notifications
10. Integrations

Esses módulos cobrem o fluxo principal do produto, da configuração do tenant até a consolidação analítica e exportação dos resultados. [file:1]

## Módulo 1 — Tenant and Access

### Objetivo
Gerenciar tenants, memberships, autenticação e autorização.

### Responsabilidades
- cadastro e gestão do tenant;
- associação de usuários ao tenant;
- papéis e permissões;
- contexto de tenant na aplicação;
- base para RLS e segurança. [web:22][web:276]

### Entidades principais
- `tenants`
- `users`
- `tenant_memberships`

### Dependências
Esse módulo é base para todos os outros, porque quase toda operação do sistema depende de identidade e tenant context. [web:22]

### Status no MVP
P0 — obrigatório desde o início. [web:230]

## Módulo 2 — Templates

### Objetivo
Definir os modelos reutilizáveis de avaliação que serão usados para criar ciclos.

### Responsabilidades
- métodos 180°, 360° e custom;
- competências;
- escalas;
- perguntas;
- questionários;
- regras de relacionamento;
- políticas padrão de anonimato. [file:1][web:13]

### Entidades principais
- `assessment_methods`
- `assessment_templates`
- `relationship_types`
- `template_relationship_rules`
- `competencies`
- `questionnaires`
- `questions`

### Dependências
Depende de Tenant and Access. É base para o módulo de Cycles. [web:13]

### Status no MVP
P0 — obrigatório. [web:230][web:234]

## Módulo 3 — Cycles

### Objetivo
Executar um template em um período real de avaliação.

### Responsabilidades
- criação de ciclos;
- configuração operacional;
- status do ciclo;
- datas;
- ajustes específicos por ciclo;
- ativação e fechamento. [file:1]

### Entidades principais
- `assessment_cycles`

### Dependências
Depende de Templates e Tenant and Access. Serve de base para Participants, Assignments, Responses, Analytics e Reports. [file:1]

### Status no MVP
P0 — obrigatório. [web:230]

## Módulo 4 — Participants

### Objetivo
Gerenciar os participantes avaliados em cada ciclo.

### Responsabilidades
- cadastro manual;
- importação por planilha;
- organização de metadados;
- relação hierárquica básica;
- preparação para assignments. [file:1]

### Entidades principais
- `participants`

### Dependências
Depende de Cycles. Alimenta Assignments e Analytics. [file:1]

### Status no MVP
P0 — obrigatório. [web:227][web:234]

## Módulo 5 — Assignments

### Objetivo
Mapear e controlar quem avalia quem em cada ciclo.

### Responsabilidades
- geração de assignments;
- vínculo entre avaliador e avaliado;
- definição do tipo de relação;
- status do convite;
- controle de token/magic link;
- rastreamento da conclusão da avaliação. [file:1]

### Entidades principais
- `rater_assignments`

### Dependências
Depende de Cycles, Participants e Templates. Alimenta Response Collection. [file:1]

### Status no MVP
P0 — obrigatório. [web:230]

## Módulo 6 — Response Collection

### Objetivo
Coletar e persistir as respostas dos avaliadores.

### Responsabilidades
- experiência de preenchimento;
- submissão de respostas;
- validação por assignment;
- respostas quantitativas e qualitativas;
- bloqueio ou controle de reenvio. [file:1]

### Entidades principais
- `responses`

### Dependências
Depende de Assignments, Questions e regras do Template. Alimenta Scoring and Analytics. [file:1]

### Status no MVP
P0 — obrigatório. [web:230][web:234]

## Módulo 7 — Scoring and Analytics

### Objetivo
Transformar respostas brutas em resultados consolidados e utilizáveis.

### Responsabilidades
- cálculo de médias;
- agrupamento por relação;
- aplicação de anonimato por N-mínimo;
- cálculo de gaps;
- identificação de blind spots e hidden strengths;
- geração de snapshots;
- estruturação de dados para relatórios e futura integração com Maptiva Grid. [file:1][web:17]

### Entidades principais
- `score_snapshots`
- `participant_result_profiles`

### Dependências
Depende de Responses, Assignments, Templates e Cycles. Alimenta Reports, Exports e Integrations. [file:1]

### Status no MVP
P0 — obrigatório. [web:230][web:238]

## Módulo 8 — Reports and Exports

### Objetivo
Gerar entregáveis profissionais e úteis a partir da camada consolidada.

### Responsabilidades
- relatório individual;
- relatório consolidado;
- relatório executivo;
- heatmaps;
- exportação Excel/CSV;
- geração de PDFs;
- leitura de snapshots, não de dados brutos. [file:1]

### Dependências
Depende fortemente de Scoring and Analytics. Pode depender de Notifications para envio posterior. [file:1]

### Status no MVP
P0 — obrigatório. [web:230][web:234]

## Módulo 9 — Notifications

### Objetivo
Orquestrar comunicações automáticas e operacionais do sistema.

### Responsabilidades
- envio de convites;
- lembretes;
- notificações de status;
- mensagens transacionais relacionadas ao ciclo. [file:1]

### Dependências
Depende de Assignments, Cycles e Tenant settings. [file:1]

### Status no MVP
P1 funcional, mas com partes P0 mínimas, porque convites e lembretes são necessários para operar o ciclo. [web:227][web:234]

## Módulo 10 — Integrations

### Objetivo
Preparar o produto para interoperabilidade com sistemas externos e com o futuro Maptiva Grid.

### Responsabilidades
- export analítico estruturado;
- rastreabilidade de integrações;
- payloads reutilizáveis;
- camada de saída para produtos futuros. [web:17][web:268]

### Entidades principais
- `integration_exports`

### Dependências
Depende de Scoring and Analytics e Reports. [web:17]

### Status no MVP
P1, com ao menos export consolidado básico pronto. [web:230][web:234]

## Relações entre módulos

```text
Tenant and Access
        |
        v
     Templates
        |
        v
       Cycles
        |
        +------------------+
        |                  |
        v                  v
 Participants         Assignments
                            |
                            v
                    Response Collection
                            |
                            v
                    Scoring and Analytics
                        /           \
                       v             v
          Reports and Exports   Integrations
                       ^
                       |
                 Notifications
```

Essa estrutura mostra que o núcleo do produto está no fluxo Template → Cycle → Assignment → Response → Analytics. Os outros módulos existem para habilitar, operar ou ampliar esse núcleo. [file:1]

## Módulos centrais do MVP

Os módulos que formam o núcleo obrigatório do MVP são:

- Tenant and Access
- Templates
- Cycles
- Participants
- Assignments
- Response Collection
- Scoring and Analytics
- Reports and Exports

Sem esse conjunto, o produto não entrega o workflow principal prometido pelo MVP. [web:230][web:234][file:1]

## Módulos de suporte do MVP

Os módulos de suporte que entram de forma limitada no MVP são:

- Notifications
- Integrations

Eles são importantes, mas podem começar de forma mais simples, desde que o fluxo principal já funcione. Em documentação e arquitetura modulares, essa distinção entre núcleo e suporte ajuda a priorizar entrega sem perder visão sistêmica. [web:290][web:296]

## Ordem sugerida de implementação por módulo

### Fase 1 — Fundação
1. Tenant and Access
2. Templates
3. Cycles

### Fase 2 — Operação de coleta
4. Participants
5. Assignments
6. Response Collection

### Fase 3 — Valor analítico
7. Scoring and Analytics
8. Reports and Exports

### Fase 4 — Camadas de suporte
9. Notifications
10. Integrations

Essa ordem reduz risco, porque primeiro estabiliza estrutura e operação, depois entrega inteligência e saída de dados. [web:230][web:234][web:237]

## Como documentar cada módulo depois

Cada módulo deve ganhar um arquivo próprio conforme o projeto evoluir. O ideal é manter um padrão único de documentação por módulo para facilitar navegação e manutenção. [web:290][web:293][web:296]

Estrutura sugerida para cada arquivo de módulo:

- objetivo do módulo;
- problema que resolve;
- responsabilidades;
- entidades envolvidas;
- regras de negócio;
- permissões;
- fluxos principais;
- eventos importantes;
- dependências;
- fora de escopo;
- backlog futuro. [web:289][web:298]

## Limites de cada módulo

Para evitar sobreposição e acoplamento excessivo:

- Templates não executam ciclos.
- Cycles não calculam analytics diretamente.
- Response Collection não gera relatórios.
- Reports não leem respostas brutas como fonte principal.
- Integrations não devem reinventar lógica de scoring.
- Notifications não devem carregar lógica de autorização. [file:1]

Esses limites preservam clareza arquitetural e tornam manutenção e testes mais previsíveis. [web:291][web:297]

## Evolução futura dos módulos

Com a maturidade do produto, novos módulos podem surgir sem quebrar essa base, como:

- Benchmarking
- Development Plans
- Talent Review
- Grid Calibration
- AI Insights

Esses módulos devem nascer depois, e não ser misturados prematuramente ao núcleo transacional do Maptiva. [web:17][web:299]

## Resumo final

O Maptiva pode ser organizado em módulos coesos que acompanham o fluxo real do produto: acesso, configuração, execução, coleta, consolidação, relatórios e integração. Essa modularização facilita desenvolvimento incremental, reduz acoplamento e cria uma base documental mais escalável para o time e para o Claude Code. [web:290][web:293][web:296]
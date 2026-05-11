# Maptiva

Maptiva é um SaaS multi-tenant de avaliação 180° e 360° voltado para empresas e consultorias que precisam conduzir ciclos de feedback com segurança, anonimato, automação operacional e geração de relatórios executivos. O produto foi concebido para suportar múltiplos clientes, templates reutilizáveis, regras configuráveis por tenant e evolução futura para integrações analíticas. [file:1]

O objetivo do projeto é transformar o escopo inicial de uma avaliação 360° em uma plataforma escalável de **Feedback & Assessment**, capaz de operar com métodos 180°, 360° e modelos customizados, sem acoplamento rígido a um único formato. A arquitetura também está sendo preparada para integração futura com o **Maptiva Grid**, que será um SaaS separado para Nine Box e talent review. [file:1][web:17][web:22]

## Visão do produto

O Maptiva resolve o problema de empresas que ainda conduzem avaliações de desempenho e feedback por planilhas, formulários desconectados e consolidação manual. O sistema centraliza a configuração dos ciclos, o mapeamento de avaliadores, a coleta via links mágicos, os cálculos de anonimato e a geração de relatórios individuais, gerenciais e executivos. [file:1]

A proposta do produto é combinar:
- configuração flexível de métodos 180° e 360°,
- operação multi-tenant para diferentes clientes,
- regras de anonimato por N-mínimo,
- questionários e competências por template,
- relatórios exportáveis,
- e uma camada analítica preparada para uso posterior em Nine Box. [file:1][web:13][web:17]

## Produtos da família

### Maptiva
Produto principal de avaliação e feedback, responsável pela coleta, consolidação, visualização e exportação dos resultados de ciclos 180°, 360° e customizados. [file:1][web:13]

### Maptiva Grid
Produto futuro, separado do core de avaliação, voltado para Nine Box, talent review, calibração e leitura gerencial de performance versus potencial. O Maptiva Grid deverá consumir dados consolidados do Maptiva por API ou exportação estruturada, sem depender da camada transacional bruta. [web:17][web:23][web:25]

## Escopo inicial

O MVP do Maptiva deve incluir:

- autenticação administrativa;
- arquitetura multi-tenant;
- cadastro de tenants;
- templates de avaliação 180°, 360° e custom;
- ciclos de avaliação;
- cadastro/importação de participantes;
- matriz de avaliadores;
- envio de convites com magic links;
- formulário de avaliação;
- dashboard de progresso;
- lembretes para pendentes;
- engine de cálculo com regra de anonimato;
- relatórios PDF;
- exportação Excel/CSV;
- camada analítica consolidada. [file:1][web:13][web:22]

## Princípios do projeto

- Multi-tenant por design: toda entidade de negócio deve ser isolada por `tenant_id`. [web:22][web:28]
- Métodos como configuração: 180°, 360° e custom devem ser presets, não forks de código. [web:13]
- Templates reutilizáveis: o núcleo do sistema deve estar nos templates, não em ciclos recriados manualmente. [web:13]
- Analytics separado do transacional: relatórios e integrações devem ler snapshots consolidados, não respostas brutas. [file:1][web:17]
- Nine Box como produto separado: o Maptiva Grid será um produto distinto, conectado por contrato de dados. [web:17][web:25]
- Segurança e RLS obrigatórios no banco de dados. [file:1][web:22]

## Stack prevista

A stack base do projeto é:

- Frontend: React + TypeScript
- UI: Tailwind CSS
- Backend e banco: Supabase (Postgres, Auth, Storage, Edge Functions)
- Deploy: Vercel
- Relatórios PDF: `@react-pdf/renderer`
- Captura de gráficos: `html2canvas`
- Exportação de planilhas: `xlsx` / SheetJS
- Gráficos: `recharts`
- E-mail transacional: Resend ou SMTP já configurado [file:1][cite:154]

A decisão final entre React + Vite e Next.js deve ser mantida explícita na documentação técnica, mas a arquitetura do domínio permanece a mesma em qualquer uma das duas abordagens. [file:1]

## Arquitetura resumida

A arquitetura lógica do Maptiva é dividida em quatro camadas:

1. **Tenant layer**: clientes, usuários, memberships, branding e permissões. [web:22][web:28]
2. **Template layer**: métodos, competências, escalas, questionários e regras de avaliação. [web:13]
3. **Cycle execution layer**: participantes, assignments, convites, respostas, comentários e progresso do ciclo. [file:1]
4. **Analytics layer**: snapshots, scores consolidados, relatórios e exportações para BI e Maptiva Grid. [file:1][web:17]

## Estrutura inicial do repositório

```text
Maptiva/
├─ README.md
├─ CLAUDE.md
├─ .env.example
├─ .gitignore
├─ apps/
├─ supabase/
│  ├─ migrations/
│  └─ seed.sql
├─ docs/
│  ├─ prd/
│  ├─ architecture/
│  ├─ modules/
│  ├─ decisions/
│  └─ branding/
├─ prompts/
└─ .claude/
```

Essa estrutura foi pensada para facilitar o uso com Claude Code, mantendo no mesmo repositório o código, a documentação do produto, as decisões de arquitetura e os prompts de execução por etapa. [web:168][web:171][web:191]

## Documentação esperada

Os principais documentos esperados neste repositório são:

- `CLAUDE.md`: instruções de contexto para o Claude Code. [web:168][web:191]
- `docs/prd/`: visão do produto, escopo do MVP, fluxos e roadmap.
- `docs/architecture/`: arquitetura multi-tenant, schema, RLS e integrações.
- `docs/modules/`: detalhamento funcional por módulo.
- `prompts/`: prompts operacionais para implementação por fase.
- `supabase/migrations/`: versionamento do banco. [web:173]

## Módulos principais

Os módulos do produto devem evoluir nesta ordem lógica:

1. Tenant e autenticação.
2. Templates de avaliação.
3. Ciclos.
4. Participantes.
5. Assignments e magic links.
6. Questionários e respostas.
7. Scoring e anonimato.
8. Relatórios.
9. Exportações e integrações.
10. Camada analítica para Maptiva Grid. [file:1][web:17]

## Como começar

### 1. Criar o repositório e a estrutura base
Criar a pasta raiz do projeto, adicionar este `README.md`, o `CLAUDE.md`, a pasta `docs/` e a pasta `supabase/`. [web:192]

### 2. Formalizar a documentação mínima
Antes de iniciar a implementação, criar os seguintes arquivos:
- `CLAUDE.md`
- `docs/prd/product-vision.md`
- `docs/architecture/system-architecture.md`
- `docs/architecture/data-model.md`
- `docs/modules/modules-overview.md` [cite:157][cite:158]

### 3. Definir a base técnica
Escolher a base do app web, inicializar o projeto frontend, configurar Supabase local/remoto, migrations e variáveis de ambiente. [web:173][web:179]

### 4. Implementar por fases
O projeto deve ser construído por módulos, com documentação e validação a cada etapa, evitando pedir ao Claude Code para “construir tudo” sem contexto. Esse tipo de fluxo estruturado tende a funcionar melhor em projetos SaaS com mais regras de negócio. [cite:157][cite:158][web:171]

## Estado atual

Neste momento, o projeto está em fase de fundação e documentação. O nome definido para o produto principal é **Maptiva**, e o nome do produto futuro de Nine Box é **Maptiva Grid**. [cite:149][cite:150]

A prioridade atual é montar a base documental e estrutural correta para que o Claude Code possa implementar o sistema de maneira organizada, incremental e alinhada à arquitetura multi-tenant planejada. [cite:157][web:171]

## Próximos arquivos a criar

Depois do `README.md`, a próxima prioridade é criar:

- `CLAUDE.md`
- `docs/prd/product-vision.md`
- `docs/architecture/system-architecture.md`
- `docs/architecture/data-model.md`
- `docs/modules/modules-overview.md`

## Status

Projeto em estruturação inicial.
Produto principal: **Maptiva**
Produto futuro: **Maptiva Grid**
Modelo: SaaS multi-tenant de avaliação 180°/360° com preparação analítica para talent review. [web:17][web:22]
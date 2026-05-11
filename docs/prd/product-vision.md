# Product Vision — Maptiva

## Visão do produto

Maptiva é uma plataforma SaaS multi-tenant de avaliação e feedback corporativo, criada para ajudar empresas e consultorias a conduzir ciclos estruturados de avaliação 180°, 360° e formatos customizados com segurança, consistência metodológica e baixo esforço operacional.

A visão do Maptiva é substituir processos manuais, fragmentados e difíceis de escalar — normalmente baseados em planilhas, formulários soltos e consolidação manual — por uma plataforma clara, configurável e preparada para múltiplos clientes. O produto deve permitir que organizações conduzam avaliações com maior confiabilidade, mais qualidade analítica e melhor experiência para administradores, avaliadores e lideranças. [file:1][web:217][web:219]

## Declaração de visão

Capacitar empresas e consultorias a transformar avaliações de desempenho e feedback em ciclos escaláveis, configuráveis e confiáveis, gerando dados estruturados para desenvolvimento de pessoas e decisões futuras de talento. [web:211][web:218][web:221]

## Oportunidade de mercado

Muitas empresas ainda executam avaliações 180° e 360° de forma operacionalmente frágil: planilhas para mapear avaliadores, formulários desconectados para coletar respostas, dificuldade para garantir anonimato, consolidação manual das notas, baixa padronização entre clientes e alto esforço na geração de relatórios finais. [file:1]

Esse cenário cria uma oportunidade clara para um SaaS B2B focado em operação de ciclos de feedback com:
- configuração por método;
- reuso de templates;
- automação de convites e lembretes;
- regras de anonimato;
- relatórios padronizados;
- e camada analítica reaproveitável. [file:1][web:216][web:219]

## Problema que o produto resolve

O Maptiva existe para resolver cinco problemas centrais:

1. **Complexidade operacional**  
   Montar e conduzir ciclos de avaliação com muitos participantes e diferentes relações de avaliação gera retrabalho, erro humano e demora. [file:1]

2. **Baixa padronização**  
   Cada cliente ou ciclo acaba sendo executado de um jeito diferente, dificultando escala, comparabilidade e eficiência operacional. [web:216][web:219]

3. **Risco de confidencialidade**  
   Sem regras consistentes de anonimato e agrupamento, avaliações perdem confiança e credibilidade. [file:1]

4. **Consolidação analítica fraca**  
   Empresas e consultorias gastam muito tempo consolidando resultados, identificando gaps e produzindo relatórios úteis. [file:1]

5. **Desconexão entre avaliação e decisões futuras de talento**  
   Mesmo quando a coleta é bem feita, os dados gerados raramente ficam estruturados para apoiar etapas posteriores como calibração, talent review e Nine Box. [web:17][web:23]

## Público-alvo

O Maptiva deve ser desenhado inicialmente para dois perfis principais de cliente:

### 1. Consultorias e empresas de treinamento
Consultorias que conduzem avaliações para seus clientes e precisam de uma ferramenta padronizada, configurável e apresentável, com boa operação, automação e geração de entregáveis. [cite:141][file:1]

### 2. Empresas com operação interna de RH ou desenvolvimento
Empresas que desejam executar ciclos recorrentes de avaliação 180° ou 360° com mais governança, menos dependência de planilhas e mais qualidade nos dados finais. [web:216][web:219]

## Perfis de usuário

O sistema precisa atender diferentes usuários dentro do mesmo tenant:

- **Owner/Admin do tenant**: configura o ambiente, branding, métodos e acessos.
- **RH/Admin de ciclo**: cria templates, abre ciclos, importa participantes, monitora progresso e gera relatórios.
- **Gestor**: acompanha resultados permitidos e consolidados de sua equipe, conforme política do cliente.
- **Avaliador**: responde via magic link ou acesso controlado.
- **Liderança executiva**: consome relatórios executivos, heatmaps e consolidados.

## Proposta de valor

A proposta de valor do Maptiva é simples:

**Transformar avaliações 180° e 360° em uma operação confiável, repetível e escalável.**

Na prática, isso significa entregar:

- configuração flexível por cliente;
- operação de ciclos com menos esforço manual;
- anonimato protegido por regra;
- melhor experiência de resposta para avaliadores;
- geração rápida de relatórios profissionais;
- base de dados estruturada para análises futuras. [file:1][web:218][web:221]

## Diferenciais do produto

Os diferenciais estratégicos do Maptiva devem ser:

### 1. Multi-tenant desde o início
O produto não será um sistema “para um cliente”, mas uma plataforma pronta para operar vários clientes com isolamento de dados, branding, templates e regras próprias. [web:22][web:28]

### 2. Método configurável
180°, 360° e formatos customizados devem ser apenas presets de configuração do mesmo motor, evitando forks de produto e retrabalho arquitetural. [web:13][web:27]

### 3. Regras de anonimato incorporadas ao domínio
A lógica de N-mínimo, agrupamento e exceções deve fazer parte do núcleo do sistema, não de tratamentos manuais em relatório. [file:1]

### 4. Camada analítica consolidada
Relatórios, dashboards e integrações futuras devem ler dados consolidados, e não depender diretamente das respostas brutas. [file:1][web:17]

### 5. Preparação para linha de produtos
O Maptiva deve gerar dados compatíveis com o Maptiva Grid, futuro SaaS separado para Nine Box e talent review. [web:17][web:25]

## O que o produto é

Maptiva é:
- um SaaS de avaliação e feedback;
- uma plataforma multi-tenant;
- um motor configurável de ciclos 180° e 360°;
- uma base de dados analítica para desenvolvimento organizacional;
- um produto B2B orientado a empresas e consultorias.

## O que o produto não é

Maptiva não é:
- um sistema exclusivo de Nine Box;
- um software completo de RH generalista;
- um app de clima organizacional;
- um módulo de folha, recrutamento ou LMS;
- uma solução feita apenas para um único cliente.

Esses limites são importantes para evitar escopo difuso e manter foco no núcleo do produto. [web:214][web:219]

## Relação com o Maptiva Grid

O Maptiva Grid será um SaaS separado, focado em Nine Box, talent review, calibração e leitura de performance versus potencial. [web:17][web:23]

A relação entre os dois produtos deve funcionar assim:
- o **Maptiva** coleta, organiza, consolida e exporta dados de assessment;
- o **Maptiva Grid** consome dados estruturados e aplica lógica de matriz, calibração e leitura gerencial.

Essa separação é estratégica porque permite vender os produtos de forma independente, simplifica o escopo inicial e evita acoplamento desnecessário entre coleta de feedback e processos mais sensíveis de decisão de talento. [web:17][web:25]

## Princípios de produto

O desenvolvimento do Maptiva deve seguir estes princípios:

### 1. Clareza antes de complexidade
Se uma funcionalidade não aumenta clareza operacional, analítica ou de decisão, ela deve ser questionada. [web:217][web:218]

### 2. Escalabilidade por configuração
Novos clientes, novos métodos e novos ciclos devem ser absorvidos por configuração, e não por customização hardcoded. [web:13][web:22]

### 3. Confiança e confidencialidade
Anônimato, segurança e previsibilidade das regras são parte central da proposta de valor. [file:1]

### 4. Reutilização de ativos
Templates, bibliotecas de competências, questionários e relatórios devem ser reaproveitáveis entre ciclos e clientes. [web:216]

### 5. Analytics como ativo estratégico
Os dados produzidos pelo Maptiva precisam servir não apenas ao relatório atual, mas também a análises históricas, integrações e produtos futuros. [web:17][web:221]

## Escopo inicial do MVP

O MVP do Maptiva deve entregar a base operacional e analítica mínima para rodar ciclos reais com qualidade.

### Incluído no MVP
- autenticação administrativa;
- estrutura multi-tenant;
- cadastro de tenants e memberships;
- templates de avaliação;
- presets 180° e 360°;
- ciclos de avaliação;
- participantes;
- assignments entre avaliadores e avaliados;
- convites com magic links;
- formulário de resposta;
- dashboard de progresso;
- lembretes;
- engine de cálculo;
- regra de anonimato por N-mínimo;
- relatórios principais;
- exportação Excel/CSV;
- camada de snapshots analíticos. [file:1][web:13][web:22]

### Fora do MVP
- módulo completo de Nine Box;
- calibração colaborativa;
- plano de sucessão;
- avaliações contínuas tipo pulse/check-in;
- marketplace de competências;
- integrações profundas com ERPs ou HRIS;
- benchmarking entre empresas;
- automações avançadas de IA sobre feedback textual. [web:214][web:219]

## Resultado esperado para o cliente

Quando o Maptiva estiver bem implementado, o cliente deve conseguir:

- abrir um ciclo em menos tempo;
- reduzir trabalho operacional de RH ou consultoria;
- aumentar confiança no processo de avaliação;
- gerar relatórios mais rapidamente;
- manter histórico organizado de resultados;
- produzir dados consistentes para decisões futuras. [file:1][web:218][web:221]

## Métricas de sucesso

As métricas iniciais de sucesso do produto devem refletir adoção, eficiência operacional e valor entregue.

### Métricas de uso
- número de tenants ativos;
- número de ciclos criados por mês;
- número de participantes avaliados por ciclo;
- taxa de conclusão dos formulários.

### Métricas operacionais
- tempo para configurar um novo ciclo;
- tempo para gerar relatórios;
- volume de lembretes necessários por ciclo;
- taxa de erro em importação/mapeamento de avaliadores.

### Métricas de valor
- recorrência de clientes;
- número de ciclos recorrentes por cliente;
- adoção de templates reutilizáveis;
- percentual de clientes que avançam para analytics mais maduros ou para o futuro Maptiva Grid. [web:221]

## Visão de longo prazo

No longo prazo, o Maptiva deve se tornar o núcleo de uma linha de produtos voltada para assessment, desenvolvimento e leitura estratégica de talentos.

A evolução natural é:
1. Maptiva como plataforma de avaliação e feedback;
2. Maptiva Grid como produto de talent review e Nine Box;
3. integrações e analytics mais sofisticados ao redor dessa base.

Essa visão permite começar com um problema operacional muito claro e, ao mesmo tempo, construir uma fundação que suporte produtos de maior valor estratégico no futuro. [web:17][web:215][web:221]

## Resumo estratégico

Maptiva é um SaaS multi-tenant de avaliação 180° e 360° que nasce para organizar ciclos de feedback com método, escala e confiança. Seu foco inicial é resolver a operação e a consolidação das avaliações, enquanto prepara uma base de dados analítica que permitirá evoluir para o ecossistema Maptiva Grid sem inflar o escopo do produto principal. [file:1][web:17][web:22]
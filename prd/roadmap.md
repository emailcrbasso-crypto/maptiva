# Product Roadmap — Maptiva

## Objetivo deste documento

Este documento descreve o roadmap do Maptiva em alto nível, organizando a evolução do produto por fases, objetivos, entregas prioritárias e resultados esperados.

O roadmap do Maptiva deve funcionar como um plano vivo de execução, alinhando visão de produto, escopo do MVP e prioridades técnicas sem transformar hipóteses em promessas rígidas de calendário. Roadmaps de SaaS tendem a funcionar melhor quando comunicam direção, foco e prioridades, preservando espaço para aprendizado e ajuste. [web:328][web:329][web:341]

## Princípios do roadmap

O roadmap do Maptiva deve seguir estes princípios:

### 1. Orientado a resultados
As fases devem existir para produzir resultados de produto e negócio, não apenas para “entregar features”. Roadmaps mais eficazes conectam iniciativas a outcomes e metas reais. [web:334][web:338]

### 2. Flexível por natureza
Como o Maptiva é um SaaS em construção, o roadmap deve ser revisto continuamente com base em pilotos, feedback e aprendizados operacionais. Roadmaps de SaaS não devem ser tratados como documentos estáticos. [web:328][web:332]

### 3. Construção por fundação
A sequência deve respeitar dependências reais: segurança, multi-tenancy, modelo de dados e operação básica vêm antes de analytics sofisticados e integrações mais maduras. [web:333][web:339]

### 4. Separação entre Maptiva e Maptiva Grid
O roadmap do Maptiva deve preparar dados e integrações para o Grid, mas não inflar o escopo do produto principal com funcionalidades prematuras de Nine Box e talent review. [web:17][web:25]

### 5. Clareza sobre o que vem agora, depois e mais adiante
Um roadmap útil para early-stage SaaS costuma funcionar bem em faixas como Now / Next / Later ou por fases progressivas, porque isso comunica prioridade sem rigidez excessiva de datas. [web:329][web:334]

## Horizonte do roadmap

Este roadmap está organizado em seis fases:

1. Fundação do produto
2. MVP operacional
3. Analytics e relatórios maduros
4. Escalabilidade e experiência multi-cliente
5. Integrações e ecossistema
6. Preparação para linha de produtos

Essa estrutura permite visualizar evolução técnica e de produto sem misturar backlog tático com visão estratégica. [web:328][web:333][web:339]

## Fase 1 — Fundação do produto

### Objetivo
Construir a base técnica e estrutural do Maptiva para operar como SaaS multi-tenant desde o início.

### Resultado esperado
O produto passa a ter estrutura segura e consistente para suportar múltiplos clientes e módulos futuros. [web:333][web:339]

### Prioridades
- tenancy e memberships;
- autenticação e autorização;
- modelo de dados principal;
- RLS;
- convenções de arquitetura;
- estrutura inicial do frontend;
- setup de ambiente, deploy e observabilidade básica. [web:22][web:280]

### Entregas principais
- tenant context funcional;
- papéis administrativos iniciais;
- base do schema no Supabase;
- políticas iniciais de segurança;
- documentação central do repositório. [web:22][web:341]

### Critério de saída da fase
A plataforma já consegue sustentar usuários administrativos em tenants separados com base técnica confiável. [web:276][web:280]

## Fase 2 — MVP operacional

### Objetivo
Validar o fluxo principal do produto: configurar e executar um ciclo real de avaliação 180° ou 360°. [file:1][web:333]

### Resultado esperado
Um cliente piloto consegue rodar um ciclo ponta a ponta sem depender de planilhas paralelas para a operação central. [file:1][web:339]

### Prioridades
- templates;
- ciclos;
- participantes;
- assignments;
- convites;
- coleta de respostas;
- dashboard operacional;
- cálculo básico;
- relatórios iniciais;
- exportações mínimas. [file:1]

### Entregas principais
- criação de template 180° e 360°;
- criação de ciclo;
- importação de participantes;
- configuração de assignments;
- resposta via magic link;
- fechamento de ciclo;
- geração de relatório individual;
- exportação consolidada em CSV/XLSX. [file:1]

### Critério de saída da fase
O Maptiva consegue operar pelo menos um ciclo real com valor percebido por um cliente piloto. [web:333][web:339]

## Fase 3 — Analytics e relatórios maduros

### Objetivo
Transformar o Maptiva de uma ferramenta operacional em uma plataforma com leitura analítica mais forte.

### Resultado esperado
Os relatórios deixam de ser apenas consolidados básicos e passam a oferecer visão mais clara para RH, gestores e liderança. [file:1][web:334]

### Prioridades
- snapshots analíticos robustos;
- heatmaps;
- consolidação por competência;
- visão por dimensão;
- relatórios executivos;
- leitura de gaps e padrões;
- melhor estrutura para export analítico. [file:1][web:334]

### Entregas principais
- `score_snapshots` maduros;
- `participant_result_profiles`;
- relatórios executivos;
- filtros por área, gestor e grupo;
- versão mais sólida de export JSON para uso externo. [file:1]

### Critério de saída da fase
Os dados do produto passam a ser úteis não só para fechamento do ciclo, mas também para leitura gerencial e evolução futura do ecossistema. [web:334][web:338]

## Fase 4 — Escalabilidade e experiência multi-cliente

### Objetivo
Melhorar a operação da plataforma para múltiplos clientes, consultorias e uso recorrente.

### Resultado esperado
O produto se torna mais reutilizável, administrável e comercialmente preparado para atender diferentes perfis de cliente. [web:328][web:340]

### Prioridades
- branding por tenant;
- templates reutilizáveis mais robustos;
- bibliotecas de competências;
- duplicação de ciclos;
- UX administrativa melhorada;
- redução de tarefas manuais;
- trilhas de auditoria mais fortes. [web:328][web:341]

### Entregas principais
- configurações por tenant;
- reutilização ampliada de templates;
- melhorias em importação;
- notificações e lembretes mais estáveis;
- refinamento das permissões por perfil. [file:1]

### Critério de saída da fase
Um mesmo cliente ou consultoria consegue executar ciclos recorrentes com menos esforço operacional e mais padronização. [web:328][web:332]

## Fase 5 — Integrações e ecossistema

### Objetivo
Ampliar a capacidade do Maptiva de conversar com outros sistemas e de servir como fonte confiável de dados.

### Resultado esperado
O produto passa a se encaixar melhor em operações maiores e prepara terreno para o ecossistema Maptiva. [web:268][web:301]

### Prioridades
- export JSON versionado;
- registro de integrações;
- tokens de integração;
- endpoints autenticados;
- sync controlado com sistemas externos;
- estrutura de payload para Maptiva Grid. [web:303][web:306]

### Entregas principais
- contrato inicial de integração com Maptiva Grid;
- logs de exportação;
- payload versionado;
- primeira camada de API de integração. [web:303][web:304]

### Critério de saída da fase
Os dados do Maptiva podem ser consumidos com segurança e previsibilidade por produtos e serviços externos autorizados. [web:303][web:306]

## Fase 6 — Preparação para linha de produtos

### Objetivo
Transformar o Maptiva na base de uma linha mais ampla de produtos para assessment e talent review.

### Resultado esperado
O Maptiva deixa de ser apenas um sistema operacional de avaliação e passa a ocupar o papel de motor de coleta e consolidação de dados do ecossistema. [web:17][web:25]

### Prioridades
- enriquecimento analítico por dimensão;
- estrutura pronta para integração com Grid;
- histórico longitudinal;
- maior estabilidade do contrato de dados;
- governança de dados entre produtos. [web:17][web:303]

### Entregas principais
- payloads consistentes para o Maptiva Grid;
- visão histórica por pessoa e ciclo;
- readiness para leitura de performance e potencial em produto separado. [web:17]

### Critério de saída da fase
O Maptiva passa a operar como plataforma-base do ecossistema, enquanto o Grid evolui como produto separado para Nine Box e talent review. [web:17][web:25]

## Estrutura Now / Next / Later

Além das fases, o roadmap pode ser lido em três horizontes práticos.

### Now
Foco imediato:
- fundação;
- segurança;
- multi-tenancy;
- templates;
- ciclos;
- coleta;
- relatórios mínimos. [web:334][web:341]

### Next
Foco seguinte:
- analytics;
- relatórios executivos;
- melhor UX operacional;
- mais reutilização entre clientes;
- export estruturado. [web:328][web:332]

### Later
Foco mais adiante:
- integrações maduras;
- histórico longitudinal;
- ecossistema Maptiva;
- preparação completa para Grid. [web:301][web:340]

## Temas estratégicos do roadmap

Ao longo das fases, o roadmap do Maptiva gira em torno de cinco temas estratégicos:

| Tema | Objetivo |
|---|---|
| Operação de ciclos | Tornar a execução de avaliações simples, confiável e repetível. [file:1] |
| Segurança e governança | Garantir isolamento por tenant, permissões e confidencialidade. [web:22][web:276] |
| Analytics | Transformar respostas em leitura consolidada e utilizável. [file:1] |
| Escalabilidade comercial | Permitir operação com múltiplos clientes e uso recorrente. [web:328][web:340] |
| Ecossistema de produtos | Preparar integração com o Maptiva Grid e produtos futuros. [web:17][web:25] |

## O que não entra no roadmap imediato

Para evitar dispersão, os itens abaixo não devem competir com o foco atual:

- Nine Box dentro do Maptiva;
- comitê de calibração completo;
- marketplace de integrações;
- HRIS completo;
- benchmarking cross-company;
- IA avançada para feedback textual;
- suíte completa de performance management. [web:333][web:339]

Esses itens podem existir como visão futura, mas não devem desorganizar a construção do produto principal agora. [web:328][web:334]

## Dependências críticas do roadmap

A evolução do produto depende especialmente de:

- qualidade do modelo multi-tenant; [web:22]
- segurança e RLS bem implementadas; [web:280]
- boa estrutura de templates e assignments; [file:1]
- camada de snapshots analíticos confiável; [file:1]
- documentação consistente para o Claude Code e para futuras implementações. [web:285][web:287]

## Indicadores de progresso por fase

O roadmap deve ser acompanhado por indicadores simples que mostrem se a fase está realmente entregando valor.

### Fundação
- isolamento multi-tenant validado;
- autenticação funcional;
- schema base estável. [web:22][web:280]

### MVP operacional
- primeiro ciclo real executado;
- taxa de conclusão satisfatória;
- relatórios gerados com sucesso. [file:1][web:333]

### Analytics
- snapshots confiáveis;
- relatórios executivos usados por stakeholders;
- export analítico funcional. [file:1]

### Escalabilidade
- múltiplos tenants ativos;
- ciclos recorrentes por cliente;
- menor esforço operacional por ciclo. [web:328][web:340]

### Integrações
- payload versionado;
- export rastreável;
- primeiros consumidores externos. [web:303][web:306]

## Governança do roadmap

O roadmap deve ser revisado regularmente com base em:
- aprendizado com clientes piloto;
- gargalos operacionais;
- dependências técnicas descobertas;
- oportunidades comerciais mais relevantes. [web:328][web:332]

A recomendação é revisar o roadmap por fase ou por marcos relevantes, e não travá-lo como uma lista fixa de promessas. [web:329][web:341]

## Resumo final

O roadmap do Maptiva deve começar pela fundação e pelo MVP operacional, depois avançar para analytics, escalabilidade multi-cliente, integrações e preparação para o ecossistema Maptiva. Essa sequência mantém o foco no valor principal do produto, reduz risco técnico e prepara o terreno para expansão sem inflar o escopo cedo demais. [web:328][web:333][web:339]
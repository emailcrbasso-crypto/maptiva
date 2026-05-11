# Reports and Exports Module — Maptiva

## Objetivo do módulo

O módulo de Reports and Exports é responsável por transformar a camada analítica consolidada do Maptiva em saídas consumíveis por pessoas e sistemas.

No Maptiva, esse módulo entrega relatórios individuais, visões consolidadas, dashboards executivos e arquivos exportáveis, respeitando regras de visibilidade, anonimato, formato e contexto de uso. [file:1]

## Papel do módulo no produto

O módulo de Reports and Exports é a camada de distribuição dos resultados.

Ele conecta:
- scoring and analytics;
- regras de visibilidade;
- interface de leitura;
- geração de PDF;
- exportações estruturadas;
- integração com sistemas externos;
- preparação de dados para o Maptiva Grid. [file:1]

Sem esse módulo, o sistema até conseguiria consolidar dados, mas não conseguiria entregar valor final ao cliente, ao RH, ao gestor ou a produtos posteriores. [file:1][web:429]

## Problema que o módulo resolve

Resultados analíticos só geram valor quando chegam ao público certo, no formato certo e com a interpretação certa.

Sem esse módulo, surgem problemas como:
- dependência de leitura manual no banco;
- inconsistência entre dashboard e arquivo exportado;
- falta de controle sobre o que cada perfil pode ver;
- dificuldade de compartilhar resultados com stakeholders;
- retrabalho operacional para consultorias e RH. [file:1][web:424][web:430]

O módulo resolve isso ao transformar resultados consolidados em artefatos claros, reutilizáveis e governáveis. [web:416][web:429]

## O que este módulo faz

Este módulo deve ser responsável por:

1. disponibilizar relatórios individuais por participante;
2. disponibilizar leituras consolidadas por ciclo;
3. exibir dashboards analíticos de uso administrativo;
4. gerar PDFs e outras saídas visuais;
5. exportar dados estruturados para planilhas e integrações;
6. garantir que visibilidade e anonimato sejam respeitados em cada saída;
7. servir como ponto de distribuição para o Maptiva Grid e integrações futuras. [file:1]

## O que este módulo não faz

Este módulo não deve ser responsável por:
- coletar respostas;
- calcular scores primários;
- definir regras metodológicas do template;
- executar o pipeline analítico em si;
- modelar Nine Box. [file:1]

Ele consome resultados já consolidados e os distribui em formatos adequados. [file:1]

## Princípios do módulo

### 1. Reports não recalculam analytics
O módulo deve consumir snapshots e profiles consolidados, não refazer cálculo diretamente. [file:1]

### 2. Export deve refletir a política de visibilidade
O que é ocultado, agrupado ou anonimizado não pode reaparecer no PDF ou no CSV sem autorização explícita. [file:1]

### 3. Formato deve servir ao contexto
PDF serve à leitura e compartilhamento; CSV/XLSX servem à análise operacional; JSON serve à integração. Diferentes formatos atendem diferentes necessidades de stakeholders e downstream systems. [web:430][web:416]

### 4. Uma única fonte analítica
Dashboards, relatórios e exportações devem partir da mesma base consolidada, para manter consistência entre saídas. [file:1][web:424]

### 5. Leitura e export são governança
Entregar o dado certo para a pessoa errada é falha de produto, não apenas falha de permissão. [file:1]

## Entradas do módulo

As entradas principais são:

- `score_snapshots`
- `participant_result_profiles`
- dados estruturais do ciclo
- dados estruturais do participante
- configurações de visibilidade
- políticas de anonimato
- filtros operacionais do contexto de leitura. [file:1]

## Saídas do módulo

As saídas principais são:

- relatórios individuais;
- relatórios executivos;
- dashboards administrativos;
- PDF;
- CSV;
- XLSX;
- JSON de integração. [file:1][web:430]

## Tipos de saída do módulo

### 1. Relatório individual
Focado no participante avaliado.

### 2. Relatório executivo do ciclo
Focado em RH, liderança ou consultoria.

### 3. Dashboard administrativo
Focado em acompanhamento e leitura exploratória.

### 4. Export tabular
Focado em análise externa ou operação.

### 5. Export estruturado para integração
Focado em sistemas downstream, incluindo o Maptiva Grid. [file:1]

## Relatório individual

### Objetivo
Entregar ao participante ou ao gestor autorizado uma visão consolidada de resultado.

### Conteúdo esperado
- identificação do ciclo;
- resumo geral;
- score geral;
- leitura por competência;
- comparação entre self e outros grupos, quando aplicável;
- comentários consolidados;
- indicadores como blind spots e hidden strengths, quando habilitados. [file:1]

### Regras
- deve respeitar anonimato;
- não deve expor grupos abaixo do mínimo;
- deve usar apenas dados já consolidados e autorizados. [file:1]

## Relatório executivo do ciclo

### Objetivo
Oferecer uma visão macro do ciclo para RH, consultoria ou liderança.

### Conteúdo esperado
- visão geral da rodada;
- taxa de conclusão;
- padrões agregados por área ou grupo;
- competências com maior gap;
- leituras consolidadas da população avaliada;
- indicadores operacionais e analíticos. [file:1]

### Regras
- foco em visão agregada;
- evitar exposição de respostas brutas;
- seguir permissões do tenant. [file:1]

## Dashboard administrativo

### Objetivo
Permitir leitura operacional e analítica dentro do produto.

### Conteúdo esperado
- status do ciclo;
- progresso da coleta;
- quantidade de relatórios disponíveis;
- filtros por área, grupo, gestor ou relação;
- indicadores consolidados do ciclo. [file:1]

### Observação
O dashboard deve ler a mesma camada consolidada usada em reports e exports sempre que a leitura for analítica. [file:1]

## Export PDF

### Objetivo
Gerar um documento fechado, visualmente pronto para compartilhamento.

### Casos de uso
- devolutiva individual;
- compartilhamento com liderança;
- documentação formal do resultado;
- entrega para cliente. [web:429][web:430]

### Regras
- layout consistente;
- dados já consolidados;
- sem exposição de detalhes não autorizados;
- idealmente com carimbo do ciclo e momento de geração. [file:1]

## Export CSV / XLSX

### Objetivo
Permitir análise operacional ou analítica fora do produto.

### Casos de uso
- tratamento em planilha;
- auditoria;
- cruzamento com dados externos;
- consolidação em BI. [web:416][web:430]

### Regras recomendadas
- cabeçalhos claros;
- colunas estáveis;
- codificações previsíveis;
- filtros aplicados explicitamente;
- cuidado para não vazar campos ocultos. [web:416][web:424]

### Observação
Exports tabulares devem priorizar completude e consistência estrutural. Em ambientes analíticos, incluir colunas relevantes desde a origem reduz retrabalho posterior. [web:416]

## Export JSON

### Objetivo
Servir integrações e consumo por sistemas externos.

### Casos de uso
- integração com Maptiva Grid;
- consumo por data pipelines;
- sincronização com plataformas parceiras;
- automações externas. [file:1]

### Regras
- contrato explícito;
- versionamento do payload;
- nomenclatura estável;
- documentação clara dos campos;
- separação entre dados públicos, sensíveis e derivados. [web:427][web:430]

## Fonte de verdade dos relatórios

O módulo deve operar com uma hierarquia clara de fontes:

### Fonte prioritária
- `participant_result_profiles` para relatórios individuais;
- `score_snapshots` para visões analíticas e agregadas;
- metadados de `cycles`, `participants` e `templates` para contexto. [file:1]

### Regra importante
O módulo não deve buscar diretamente `responses` brutas para montar relatórios finais do MVP, salvo exceções controladas para comentários quando a arquitetura exigir. [file:1]

## Regras de visibilidade

Todo artefato gerado deve respeitar:
- permissões do perfil;
- tenant_id;
- política de anonimato;
- regras de grupo mínimo;
- configurações de exibição do ciclo ou template. [file:1]

### Consequência prática
Um dado que esteja oculto em um relatório web não pode reaparecer em um PDF ou export sem política explícita. [file:1]

## Regras de negócio importantes

### 1. Report sempre pertence a um contexto
Todo relatório precisa estar vinculado a um ciclo, participante ou visão consolidada bem definida. [file:1]

### 2. Export precisa ser rastreável
Exports sensíveis devem poder ser associados ao contexto e, idealmente, ao usuário que os gerou. [web:427][web:424]

### 3. Mesma base, múltiplas saídas
O módulo pode ter diferentes formatos, mas a origem dos dados precisa ser consistente. [file:1][web:424]

### 4. Formato não altera conteúdo metodológico
PDF, CSV, XLSX e JSON podem variar na estrutura de entrega, mas não devem alterar a lógica do resultado. [web:429][web:430]

### 5. Comentários textuais precisam de cuidado extra
Comentários qualitativos devem respeitar supressão, agrupamento e anonimato, especialmente em exports detalhados. [file:1]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. visualizar relatório individual;
2. visualizar relatório consolidado do ciclo;
3. gerar PDF;
4. gerar export tabular;
5. gerar export JSON;
6. registrar evento de exportação, quando aplicável. [file:1][web:427]

## Fluxo 1 — Visualizar relatório individual

### Objetivo
Exibir a leitura consolidada de um participante.

### Passos
1. sistema identifica contexto do usuário;
2. busca profile consolidado;
3. aplica regras de visibilidade;
4. monta layout do relatório;
5. entrega a leitura ao usuário autorizado. [file:1]

## Fluxo 2 — Gerar PDF

### Objetivo
Materializar o relatório em documento compartilhável.

### Passos
1. usuário autorizado aciona geração;
2. sistema busca profile ou snapshot consolidado;
3. aplica filtros e visibilidade;
4. renderiza layout;
5. gera PDF final. [file:1][web:429]

## Fluxo 3 — Gerar CSV / XLSX

### Objetivo
Entregar dados tabulares para uso externo.

### Passos
1. usuário autorizado escolhe contexto e filtros;
2. sistema monta dataset consolidado;
3. aplica política de visibilidade;
4. gera arquivo tabular;
5. registra metadados do export, se aplicável. [web:416][web:424][file:1]

## Fluxo 4 — Gerar JSON de integração

### Objetivo
Disponibilizar payload estruturado para consumo técnico.

### Passos
1. sistema recebe solicitação autenticada;
2. valida tenant e escopo;
3. monta payload versionado;
4. entrega ou registra exportação. [web:427][file:1]

## Dependências do módulo

O módulo de Reports and Exports depende de:
- Scoring and Analytics;
- Cycles;
- Participants;
- regras de visibilidade e permissões. [file:1]

Ele serve de base para:
- entrega ao cliente;
- devolutiva individual;
- leitura gerencial;
- integração com Maptiva Grid;
- consumo por ferramentas externas. [file:1]

## Permissões do módulo

As permissões devem variar por tipo de saída.

### Acesso típico esperado
- `owner`, `admin`, `hr`: relatórios amplos, exports e dashboards;
- `manager`: acesso limitado ao escopo autorizado;
- `analyst`: acesso analítico conforme política;
- participante final: relatório individual, quando liberado. [web:276][file:1]

### Observação
Permissão de visualizar relatório não implica permissão de exportar dataset detalhado. Essa distinção é importante em produtos analíticos com dados sensíveis. [web:424][web:427]

## Auditoria e rastreabilidade

O módulo deve registrar pelo menos:
- tipo de saída gerada;
- contexto do ciclo;
- usuário solicitante, quando autenticado;
- timestamp;
- filtros usados, se relevante;
- versão do payload ou layout, quando aplicável. [web:427][web:424]

Em exports e reports sensíveis, rastreabilidade melhora governança e suporte operacional. [web:424][web:427]

## Riscos e cuidados

### 1. Recalcular dentro do relatório
Se o report recalcular dados em vez de ler snapshots, a consistência do produto se perde. [file:1]

### 2. Vazamento por export
Exports tabulares e JSON podem vazar mais informação do que a UI se não seguirem a mesma política de visibilidade. [file:1][web:416]

### 3. Falta de contrato de payload
Sem estrutura estável, integrações futuras com o Grid e outros sistemas ficam frágeis. [web:427][file:1]

### 4. PDF bonito, mas inconsistente
Formato visual não pode sacrificar fidelidade metodológica do dado. [web:429]

### 5. Mistura entre visão operacional e analítica
O módulo deve deixar claro quando a saída é operacional e quando é analítica, para não gerar interpretação errada. [file:1]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- templates visuais de relatório por tenant;
- agendamento de exports;
- geração recorrente de relatórios;
- portal de compartilhamento seguro;
- exports por API com mais filtros;
- relatórios comparativos entre ciclos;
- dashboards embutidos para consultorias;
- assets visuais prontos para devolutiva executiva. [web:427][web:430]

## Métricas úteis do módulo

Algumas métricas importantes:
- número de relatórios gerados por ciclo;
- número de exports por tenant;
- formatos mais usados;
- taxa de falha de geração;
- tempo médio de geração por tipo de saída;
- uso de PDF vs. CSV/XLSX vs. JSON. [web:424][web:427][file:1]

## Resumo final

O módulo de Reports and Exports é a camada que entrega o valor final do Maptiva para pessoas e sistemas. Ele consome dados consolidados, aplica governança de visibilidade, gera relatórios e arquivos em múltiplos formatos e prepara o produto para compartilhamento, operação analítica e integração futura com o Maptiva Grid. Um desenho forte desse módulo é essencial para transformar analytics em comunicação útil, segura e escalável. [file:1][web:416][web:429]
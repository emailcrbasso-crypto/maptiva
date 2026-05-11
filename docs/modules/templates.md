# Templates Module — Maptiva

## Objetivo do módulo

O módulo de Templates é responsável por definir os modelos reutilizáveis de avaliação do Maptiva.

Ele existe para permitir que tenants criem, organizem e reutilizem configurações de assessment sem precisar reconstruir toda a lógica a cada novo ciclo. Em produtos SaaS com configurações recorrentes, templates funcionam como ativos reutilizáveis que aceleram setup, aumentam padronização e reduzem retrabalho operacional. [web:355][web:349]

## Papel do módulo no produto

O módulo de Templates é o núcleo configuracional do Maptiva.

Ele define:
- qual método de avaliação será usado;
- quais competências serão avaliadas;
- quais perguntas serão exibidas;
- quais relações de avaliador são aceitas;
- quais regras padrão de anonimato e exibição devem ser aplicadas;
- e quais parâmetros servirão de base para ciclos futuros. [file:1]

Sem esse módulo, cada ciclo precisaria ser construído do zero, o que aumentaria complexidade operacional e reduziria consistência entre execuções. [file:1][web:355]

## Problema que o módulo resolve

Empresas e consultorias normalmente repetem estruturas semelhantes de avaliação em diferentes ciclos, áreas ou clientes. Sem templates, essa repetição gera configuração manual, risco de erro, baixa padronização e dificuldade de escalar o produto. [file:1][web:355]

O módulo resolve isso permitindo:
- reuso de configurações;
- padronização metodológica;
- redução de setup operacional;
- consistência entre ciclos;
- adaptação controlada por tenant. [web:349][web:355]

## O que é um template no Maptiva

No contexto do Maptiva, um template é uma configuração reutilizável de avaliação que serve como base para criar ciclos.

Um template deve encapsular:
- método da avaliação;
- escala;
- competências;
- perguntas;
- questionários;
- relações permitidas entre avaliador e avaliado;
- políticas padrão de anonimato;
- regras de visualização e comportamento. [file:1]

Importante:
um template **não é** a execução da avaliação. A execução pertence ao módulo de Cycles. O template apenas define o modelo de referência. [file:1]

## Objetivos do módulo

Este módulo deve permitir que o tenant:

1. crie templates reutilizáveis;
2. duplique templates existentes;
3. configure métodos 180°, 360° e custom;
4. defina competências e perguntas;
5. defina regras por relação;
6. aplique políticas padrão de anonimato;
7. reutilize templates em múltiplos ciclos;
8. evolua templates sem quebrar ciclos já existentes. [file:1][web:355]

## Escopo do módulo

### Incluído
- criação e edição de templates;
- presets por método;
- configuração de escalas;
- gestão de competências;
- gestão de perguntas;
- questionários por relação;
- regras de relacionamento;
- políticas padrão de anonimato;
- duplicação de template;
- versionamento lógico por cópia ou snapshot aplicado no ciclo. [file:1]

### Fora de escopo
- execução do ciclo;
- importação de participantes;
- geração de assignments;
- coleta de respostas;
- scoring;
- geração de relatórios;
- Nine Box;
- calibração de talentos. [file:1]

## Entidades do módulo

As principais entidades associadas a este módulo são:

- `assessment_methods`
- `assessment_templates`
- `relationship_types`
- `template_relationship_rules`
- `competencies`
- `questionnaires`
- `questions` [file:1]

## Entidade principal: `assessment_templates`

### Função
Representa o template como ativo configurável do tenant.

### Campos principais
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
- `created_at` [file:1]

### Responsabilidade
Concentrar a configuração-mãe que será herdada por ciclos criados a partir dele. [file:1]

## Métodos suportados

O módulo deve suportar inicialmente três métodos:

| Método | Objetivo |
|---|---|
| `180` | Avaliações com escopo reduzido, normalmente self + manager ou self + manager + time definido. [web:13] |
| `360` | Avaliações com múltiplas perspectivas, como self, manager, peers e subordinados. [file:1][web:13] |
| `custom` | Método configurável por tenant, com regras próprias de relação. [web:13] |

Esses métodos devem funcionar como presets configuracionais, não como produtos separados. [web:13]

## Competências

### Objetivo
Permitir que o tenant defina o que está sendo avaliado.

### Regras
- uma competência pertence a um template;
- competências possuem ordenação;
- competências podem estar associadas a uma dimensão analítica;
- uma competência pode ter uma ou mais perguntas ligadas a ela. [file:1]

### Campos relevantes
- `name`
- `description`
- `dimension_code`
- `order_index` [file:1]

### Exemplo
Competência: “Liderança”
Perguntas vinculadas:
- “Demonstra clareza ao orientar o time.”
- “Constrói confiança na execução das prioridades.” [file:1]

## Perguntas

### Objetivo
Definir os itens respondidos pelo avaliador.

### Tipos iniciais
- escala (`scale`)
- texto (`text`) [file:1]

### Regras
- cada pergunta pertence a um template;
- pode estar associada a uma competência;
- pode ser geral ou específica por relação;
- deve ter ordenação definida;
- deve respeitar o tipo de resposta suportado. [file:1]

### Campos relevantes
- `competency_id`
- `relationship_code`
- `prompt`
- `response_type`
- `order_index` [file:1]

## Questionários

### Objetivo
Permitir agrupamento lógico de perguntas e variação por tipo de relação.

### Casos de uso
- mesmo questionário para todos os avaliadores;
- questionário específico para `manager`;
- questionário específico para `peer`;
- bloco de perguntas qualitativas separado. [file:1]

### Regras
- questionários pertencem ao template;
- podem ser vinculados a uma relação específica;
- podem carregar settings adicionais. [file:1]

## Relações de avaliação

O módulo precisa controlar quais papéis de avaliador podem existir em um template.

### Tipos iniciais do sistema
- `self`
- `manager`
- `peer`
- `subordinate`
- `client`
- `mentor` [file:1]

### Regras por template
Por meio de `template_relationship_rules`, o template deve conseguir definir:
- quais relações são permitidas;
- quais são obrigatórias;
- quantidade mínima de avaliadores por papel;
- quantidade máxima de avaliadores por papel;
- ordem de exibição. [file:1][web:13]

Isso é importante para garantir que 180°, 360° e custom sejam modelados por configuração. [web:13]

## Políticas padrão de anonimato

O template deve ser capaz de definir políticas que servirão como padrão para os ciclos.

### Configurações iniciais
- anonimato por grupo;
- valor mínimo de respondentes por grupo (`n_minimum_default`);
- exibição separada de `self`;
- exibição separada de `manager`;
- agrupamento ou ocultação de grupos pequenos. [file:1]

### Observação importante
A política no template é padrão. O ciclo pode ter override, mas o template continua sendo a origem recomendada da regra. [file:1]

## Configurações que o template controla

O template deve controlar principalmente:

- método da avaliação;
- estrutura das competências;
- estrutura das perguntas;
- questionários;
- tipos de relação permitidos;
- regras padrão de anonimato;
- escala de resposta;
- exibição de grupos específicos;
- pesos ou parâmetros adicionais, se existirem. [file:1]

## Configurações que o template não controla

O template não deve controlar:

- participantes;
- assignments concretos;
- datas do ciclo;
- convites;
- progresso;
- respostas;
- snapshots analíticos;
- relatórios finais do ciclo. [file:1]

Esses elementos pertencem a outros módulos e devem permanecer desacoplados para manter clareza arquitetural. [web:343][web:345]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. criar template;
2. editar template;
3. duplicar template;
4. consultar template;
5. usar template na criação de ciclo;
6. arquivar ou desativar template. [web:351][web:354]

## Fluxo 1 — Criar template

### Objetivo
Criar um novo modelo reutilizável de avaliação.

### Passos
1. usuário acessa a área de templates;
2. escolhe criar novo template;
3. seleciona método;
4. define configurações gerais;
5. adiciona competências;
6. adiciona perguntas;
7. configura relações;
8. define regras padrão;
9. salva template. [file:1]

### Resultado esperado
Template fica disponível para novos ciclos. [file:1]

## Fluxo 2 — Duplicar template

### Objetivo
Acelerar criação de novos templates com base em estruturas existentes.

### Passos
1. usuário seleciona um template existente;
2. clica em duplicar;
3. sistema cria nova cópia editável;
4. usuário ajusta nome e regras necessárias;
5. salva novo template. [web:355]

### Resultado esperado
Tenant reaproveita estrutura anterior com baixo esforço. [web:355]

## Fluxo 3 — Editar template

### Objetivo
Permitir evolução controlada dos templates.

### Regras
- editar template não deve quebrar ciclos já criados a partir dele;
- quando um ciclo já existir, o sistema deve considerar snapshot/configuração aplicada no ciclo, não leitura viva do template em tempo real. [file:1]

Essa separação é crítica para preservar consistência histórica. [file:1]

## Regras de negócio importantes

### 1. Template pertence a um tenant
Não deve existir leitura ou edição cross-tenant. [web:22][file:1]

### 2. Template precisa ter estrutura mínima válida
Um template não deve ser considerado pronto para uso sem:
- nome;
- método;
- ao menos uma competência ou bloco válido de perguntas;
- escala válida;
- pelo menos uma relação permitida. [file:1]

### 3. Método orienta o comportamento, mas não o engessa
O método 180° ou 360° deve servir de preset inicial. O tenant ainda pode ajustar regras dentro dos limites do produto. [web:13]

### 4. Questionários podem variar por relação
O módulo deve permitir que diferentes tipos de avaliador recebam conjuntos de perguntas distintos. [file:1]

### 5. Cópia aplicada no ciclo
Quando um ciclo é criado, a configuração relevante do template deve ser congelada no contexto daquele ciclo para preservar histórico e previsibilidade. [file:1]

## Validações do módulo

O módulo deve validar ao menos:

- nome obrigatório;
- método obrigatório;
- escala válida;
- perguntas com tipo de resposta válido;
- relações sem conflito de regra;
- mínimo não maior que máximo em `template_relationship_rules`;
- template não vazio;
- coerência entre relações permitidas e questionários associados. [file:1][web:350][web:353]

## Permissões do módulo

Perfis com acesso esperado:

| Ação | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver templates | Sim | Sim | Sim | Não | Sim |
| Criar templates | Sim | Sim | Sim | Não | Não |
| Editar templates | Sim | Sim | Sim | Não | Não |
| Duplicar templates | Sim | Sim | Sim | Não | Não |
| Arquivar templates | Sim | Sim | Limitado | Não | Não |

As permissões exatas devem seguir o documento de `permissions-rls.md`. [web:276][file:1]

## Dependências do módulo

O módulo de Templates depende de:
- Tenant and Access;
- catálogo de métodos e tipos de relação;
- regras de permissão e RLS. [web:22][web:276]

Ele serve de dependência para:
- Cycles;
- Assignments;
- Response Collection;
- Scoring and Analytics. [file:1]

## Estados sugeridos do template

Estados opcionais recomendados:
- `draft`
- `active`
- `archived`

### Uso sugerido
- `draft`: ainda em construção;
- `active`: disponível para uso em novos ciclos;
- `archived`: mantido para histórico, mas indisponível para novos ciclos. [web:351][web:354]

## Decisões de UX importantes

### 1. Começar com presets
A criação de template deve começar por um preset simples de método para acelerar setup. [web:355]

### 2. Exibir progresso de configuração
Se o template tiver múltiplas etapas, a UI deve mostrar claramente o que já foi definido e o que falta. [web:351][web:354]

### 3. Evitar complexidade excessiva no primeiro contato
Customizações avançadas devem existir, mas a primeira experiência precisa ser orientada e objetiva. [web:348][web:351]

## Riscos e cuidados

### 1. Template excessivamente flexível
Se o módulo permitir qualquer configuração sem limites, o produto pode ficar difícil de operar e validar. [web:350]

### 2. Template rígido demais
Se o módulo tratar 180° e 360° como estruturas fechadas, ele perde valor para consultorias e clientes com processos próprios. [web:13]

### 3. Alterações destrutivas
Editar perguntas, competências ou relações de um template já utilizado sem snapshot por ciclo pode corromper consistência histórica. [file:1]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- biblioteca global de competências;
- templates compartilháveis entre tenants internos da plataforma;
- recomendações de template por caso de uso;
- versionamento explícito de template;
- importação/exportação de template;
- builder visual mais avançado;
- dependências condicionais entre perguntas. [web:349][web:355]

## Métricas úteis do módulo

Algumas métricas para acompanhar valor e uso:
- número de templates criados por tenant;
- taxa de reutilização de templates;
- tempo para criar template;
- taxa de ciclos criados a partir de templates existentes;
- quantidade média de edições por template antes do primeiro uso. [web:348][web:354]

## Resumo final

O módulo de Templates é o núcleo configuracional do Maptiva. Ele define os modelos reutilizáveis de avaliação que sustentam os ciclos 180°, 360° e custom, organizando método, competências, perguntas, relações e políticas padrão de anonimato. Um bom desenho desse módulo reduz esforço operacional, aumenta consistência entre ciclos e prepara a base para escalar o produto com múltiplos tenants e múltiplos casos de uso. [file:1][web:355]
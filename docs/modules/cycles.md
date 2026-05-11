# Cycles Module — Maptiva

## Objetivo do módulo

O módulo de Cycles é responsável por transformar um template de avaliação em uma execução real, com contexto, prazo, participantes, status e operação ativa.

Se o módulo de Templates define o modelo da avaliação, o módulo de Cycles define **quando**, **onde**, **para quem** e **em que estado** essa avaliação será executada. Em sistemas de workflow, a execução precisa ser tratada como uma entidade própria, com etapas, validações e transições explícitas. [web:358][web:359][web:365]

## Papel do módulo no produto

O módulo de Cycles ocupa o centro operacional do Maptiva.

Ele conecta:
- templates;
- participantes;
- assignments;
- convites;
- respostas;
- scoring;
- relatórios. [file:1]

Na prática, o ciclo é a unidade operacional que organiza o processo de avaliação dentro de um tenant. Tudo o que acontece “de verdade” no produto durante uma rodada de assessment acontece dentro de um ciclo. [file:1]

## Problema que o módulo resolve

Sem um conceito claro de ciclo, o sistema ficaria preso a templates abstratos ou a execuções desorganizadas, dificultando:
- controle de datas;
- acompanhamento de progresso;
- separação entre rodadas diferentes;
- auditoria;
- reprocessamento analítico;
- histórico por período. [file:1][web:358]

O módulo resolve isso ao criar uma camada explícita de execução, com identidade própria, regras herdadas do template e configurações específicas daquela rodada. [file:1][web:365]

## O que é um ciclo no Maptiva

No contexto do Maptiva, um ciclo é a execução concreta de uma avaliação baseada em um template, dentro de um tenant, com participantes, assignments, respostas, prazo e resultados próprios.

Um ciclo deve representar:
- uma rodada específica de assessment;
- com início e fim definidos;
- com regras aplicadas naquele momento;
- com dados históricos preservados;
- e com outputs próprios de progresso, scoring e relatório. [file:1]

Exemplos:
- “Avaliação de Liderança 2026”
- “Ciclo Semestral Comercial 2026.1”
- “Feedback 180° Coordenadores Julho 2026” [file:1]

## Objetivos do módulo

Este módulo deve permitir que o tenant:

1. crie ciclos a partir de templates;
2. configure contexto operacional do ciclo;
3. defina prazos e estados;
4. acompanhe progresso;
5. congele a configuração relevante do template para preservar histórico;
6. feche o ciclo com segurança;
7. sirva de base para scoring, relatórios e exportações. [file:1]

## Escopo do módulo

### Incluído
- criação de ciclo;
- seleção de template;
- configuração de prazo;
- status do ciclo;
- snapshot de configurações do template;
- controle de ativação e fechamento;
- dashboards operacionais do ciclo;
- base para participantes e assignments;
- auditoria do lifecycle do ciclo. [file:1]

### Fora de escopo
- definição do template em si;
- criação de perguntas;
- resposta do avaliador;
- cálculo analítico detalhado;
- geração final de relatórios;
- integrações externas profundas;
- Nine Box. [file:1]

## Entidade principal: `assessment_cycles`

### Função
Representa a rodada operacional de avaliação.

### Campos principais
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
- `created_at` [file:1]

### Responsabilidade
Organizar o estado e o contexto de uma execução real de assessment. [file:1]

## Relação com o módulo de Templates

O ciclo nasce a partir de um template, mas não deve depender dele de forma viva após a criação.

### Regra importante
Quando o ciclo é criado, as configurações relevantes do template devem ser copiadas, congeladas ou versionadas no contexto do ciclo. [file:1]

Isso é importante porque:
- o template pode evoluir depois;
- o ciclo precisa preservar histórico;
- relatórios e analytics precisam refletir a configuração original daquela execução. [file:1][web:366][web:372]

## Configurações herdadas do template

O ciclo normalmente herda do template:
- método da avaliação;
- escala;
- competências;
- perguntas;
- regras por relação;
- política padrão de anonimato;
- parâmetros de exibição;
- pesos e settings padrão. [file:1]

## Configurações próprias do ciclo

O ciclo deve controlar:
- nome da rodada;
- prazo;
- status;
- data de abertura;
- data de fechamento;
- data de liberação de relatórios;
- overrides permitidos;
- participantes vinculados;
- progresso operacional;
- histórico de ações administrativas. [file:1]

## Status do ciclo

O módulo deve trabalhar com estados claros e bem definidos.

### Status iniciais recomendados

| Status | Significado |
|---|---|
| `draft` | Ciclo criado, mas ainda não ativo para coleta. [file:1] |
| `active` | Ciclo em andamento, com coleta liberada. [file:1] |
| `closed` | Ciclo encerrado para novas respostas. [file:1] |
| `archived` | Ciclo mantido apenas para histórico e consulta. |

Opcionalmente, no futuro:
- `processing`
- `cancelled`
- `scheduled`

Mas para o MVP, poucos estados claros são melhores do que excesso de granularidade. Em workflows, simplicidade e rastreabilidade costumam ser mais importantes do que estados em excesso. [web:358][web:365]

## Transições de estado

### Fluxo de estado recomendado

```text
draft --> active --> closed --> archived
```

### Regras principais
- `draft` pode virar `active` se houver estrutura mínima válida;
- `active` pode virar `closed` por ação administrativa ou prazo;
- `closed` não deve voltar para edição livre sem política explícita;
- `archived` deve ser estado final de histórico. [file:1]

### Observação
Se o produto futuramente permitir reabertura, isso deve acontecer como exceção controlada, com auditoria e possível reprocessamento analítico. [file:1][web:360]

## Estrutura mínima para ativação

Um ciclo não deve sair de `draft` para `active` sem cumprir critérios mínimos.

### Critérios sugeridos
- template válido associado;
- nome do ciclo definido;
- prazo definido;
- ao menos um participante cadastrado;
- estrutura de assignments pronta ou pronta para geração imediata;
- configurações mínimas de coleta consistentes. [file:1][web:359]

Essas validações evitam ciclos tecnicamente ativos, mas operacionalmente inviáveis. [web:358][web:371]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. criar ciclo;
2. editar ciclo em `draft`;
3. ativar ciclo;
4. acompanhar progresso;
5. fechar ciclo;
6. arquivar ciclo;
7. consultar histórico de ciclo. [file:1][web:359]

## Fluxo 1 — Criar ciclo

### Objetivo
Criar uma execução concreta a partir de um template.

### Passos
1. usuário acessa a área de ciclos;
2. escolhe criar novo ciclo;
3. seleciona um template;
4. define nome e prazo;
5. revisa configurações herdadas;
6. salva ciclo em `draft`. [file:1]

### Resultado esperado
O ciclo fica criado e pronto para receber participantes e assignments. [file:1]

## Fluxo 2 — Editar ciclo em draft

### Objetivo
Permitir ajustes antes da ativação.

### Pode editar
- nome;
- datas;
- regras de override;
- opções operacionais do ciclo. [file:1]

### Regras
Enquanto estiver em `draft`, o ciclo pode ser ajustado com mais liberdade. Depois de `active`, alterações precisam ser mais restritas para não comprometer consistência da operação. [file:1][web:365]

## Fluxo 3 — Ativar ciclo

### Objetivo
Iniciar a fase operacional de coleta.

### Passos
1. usuário revisa dados do ciclo;
2. sistema valida estrutura mínima;
3. usuário confirma ativação;
4. status muda para `active`;
5. coleta passa a estar permitida;
6. convites podem ser enviados ou já disparados conforme configuração. [file:1]

### Resultado esperado
O ciclo entra oficialmente em execução. [file:1]

## Fluxo 4 — Acompanhar progresso

### Objetivo
Permitir gestão operacional da rodada.

### Indicadores principais
- número total de participants;
- número total de assignments;
- assignments enviados;
- assignments concluídos;
- taxa de conclusão;
- pendências por participante;
- pendências por grupo. [file:1]

### Resultado esperado
Admin ou RH consegue agir rapidamente sobre atrasos, faltas de resposta e inconsistências operacionais. [file:1][web:359]

## Fluxo 5 — Fechar ciclo

### Objetivo
Encerrar coleta e preparar consolidação.

### Passos
1. usuário acessa ciclo ativo;
2. clica em fechar ciclo;
3. sistema pede confirmação;
4. novas respostas são bloqueadas;
5. scoring e snapshots podem ser disparados;
6. status muda para `closed`. [file:1]

### Resultado esperado
O ciclo encerra sua fase operacional e entra em fase analítica. [file:1]

## Fluxo 6 — Arquivar ciclo

### Objetivo
Manter histórico sem continuar tratando o ciclo como ativo ou operacional.

### Regras
- somente ciclos encerrados devem ser arquivados;
- ciclo arquivado continua consultável;
- ciclo arquivado não pode receber novas respostas nem voltar ao fluxo comum sem ação excepcional. [file:1]

## Regras de negócio importantes

### 1. Todo ciclo pertence a um tenant
O ciclo é sempre tenant-scoped e não pode ser acessado fora do contexto do tenant correto. [web:22][file:1]

### 2. Todo ciclo nasce de um template
O módulo deve impedir criação de ciclos “soltos” sem template, salvo se no futuro existir um wizard que internamente ainda crie um template-base. [file:1]

### 3. O template aplicado ao ciclo deve ser congelado
A execução do ciclo não pode depender de mudanças posteriores no template original. [file:1][web:366]

### 4. O ciclo é a unidade de histórico
Resultados, progresso, exportações e relatórios devem sempre ser interpretados no contexto do ciclo específico. [file:1]

### 5. Ciclo fechado não deve permitir mutações destrutivas livres
Após fechamento, mudanças críticas precisam ser bloqueadas ou exigir reprocessamento controlado. [file:1][web:360]

## Overrides permitidos no ciclo

O ciclo pode sobrescrever algumas configurações herdadas do template, desde que o produto permita explicitamente.

### Exemplos de override aceitável
- prazo;
- data de liberação de relatório;
- política específica de anonimato;
- mensagens operacionais;
- opções de lembrete. [file:1]

### Exemplos de override que exigem cuidado
- remoção de competência;
- alteração estrutural das relações;
- mudança profunda na escala após início da coleta. [file:1]

Essas mudanças podem quebrar consistência e devem ser limitadas ou bloqueadas depois da ativação. [file:1][web:365]

## Dependências do módulo

O módulo de Cycles depende de:
- Tenant and Access;
- Templates;
- regras de permissão e RLS. [web:22][web:276]

Ele serve de base para:
- Participants;
- Assignments;
- Response Collection;
- Scoring and Analytics;
- Reports and Exports;
- Notifications. [file:1]

## Permissões do módulo

Perfis com acesso esperado:

| Ação | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver ciclos | Sim | Sim | Sim | Limitado | Sim |
| Criar ciclos | Sim | Sim | Sim | Não | Não |
| Editar ciclos em draft | Sim | Sim | Sim | Não | Não |
| Ativar ciclos | Sim | Sim | Sim | Não | Não |
| Fechar ciclos | Sim | Sim | Sim | Não | Não |
| Arquivar ciclos | Sim | Sim | Limitado | Não | Não |

As regras exatas devem seguir `permissions-rls.md`. [web:276][file:1]

## Validações do módulo

O módulo deve validar pelo menos:

- template obrigatório;
- nome obrigatório;
- prazo coerente;
- status válido;
- ativação somente com estrutura mínima;
- fechamento somente para ciclos ativos;
- tenant_id consistente em todas as relações;
- alterações sensíveis bloqueadas em ciclos fechados. [file:1][web:359]

## Auditoria e rastreabilidade

O módulo de Cycles deve registrar eventos importantes do lifecycle da rodada.

### Eventos mínimos
- criação do ciclo;
- alteração de configuração;
- ativação;
- fechamento;
- arquivamento;
- reabertura excepcional, se existir no futuro. [web:360][web:372]

### Objetivo
- preservar histórico;
- facilitar suporte;
- permitir governança;
- sustentar reprocessamento quando necessário. [web:360][web:372]

## Dashboards e visibilidade operacional

O ciclo deve ser o eixo principal de monitoramento operacional do produto.

### Informações úteis na tela do ciclo
- resumo do template aplicado;
- prazo e status;
- quantidade de participantes;
- quantidade de assignments;
- progresso de resposta;
- pendências;
- lembretes enviados;
- data de fechamento e de liberação de relatórios. [file:1]

Esses indicadores ajudam o admin a entender rapidamente o estado real da rodada. [file:1][web:359]

## Riscos e cuidados

### 1. Editabilidade excessiva após ativação
Se o ciclo puder mudar livremente enquanto já está em coleta, isso pode gerar inconsistência entre convites, respostas e scoring. [file:1][web:365]

### 2. Falta de snapshot do template
Se o ciclo continuar lendo o template “ao vivo”, alterações posteriores podem distorcer histórico e relatórios. [file:1]

### 3. Estados mal definidos
Se os estados do ciclo forem ambíguos, a operação vira fonte de erro para convites, coleta e geração de outputs. [web:358][web:371]

### 4. Fechamento sem critérios claros
Encerrar coleta sem política definida pode afetar qualidade dos resultados e confiança do cliente. [file:1]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- ciclos agendados;
- duplicação de ciclos;
- calendário de ciclos;
- reabertura controlada com reprocessamento;
- workflows de aprovação;
- comparações entre ciclos;
- dependências entre etapas do ciclo;
- múltiplas janelas de resposta por grupo. [web:360][web:362]

## Métricas úteis do módulo

Algumas métricas importantes:
- número de ciclos criados por tenant;
- taxa de ativação de ciclos criados;
- tempo médio entre criação e ativação;
- taxa de conclusão por ciclo;
- tempo médio até fechamento;
- número de ciclos recorrentes por cliente. [file:1][web:371]

## Resumo final

O módulo de Cycles é o centro operacional do Maptiva. Ele transforma templates em execuções reais, organiza prazo, status, progresso e contexto histórico, e cria a estrutura sobre a qual participantes, assignments, respostas, analytics e relatórios passam a existir. Um desenho forte desse módulo é fundamental para garantir previsibilidade operacional, integridade histórica e escalabilidade do produto. [file:1][web:358][web:365]
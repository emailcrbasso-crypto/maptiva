# Assignments Module — Maptiva

## Objetivo do módulo

O módulo de Assignments é responsável por definir e controlar quem avalia quem, em qual relação, em qual ciclo e com qual unidade de coleta associada.

No Maptiva, o assignment é a unidade operacional central da coleta. Ele conecta o participante avaliado ao avaliador, define o papel daquela avaliação dentro do método do ciclo e cria a base para convites, respostas, rastreamento de status e analytics posteriores. [file:1]

## Papel do módulo no produto

O módulo de Assignments é a ponte entre a configuração do ciclo e a execução da coleta.

Ele conecta:
- participantes;
- regras do template;
- relações de avaliação;
- questionários;
- convites;
- respostas;
- progresso operacional. [file:1]

Sem assignments, o sistema saberia quais pessoas existem no ciclo, mas não saberia quem precisa avaliar quem, nem conseguiria rastrear convites, respostas e conclusão de forma precisa. [file:1]

## Problema que o módulo resolve

Em avaliações 180° e 360°, o maior desafio operacional não é apenas ter um formulário, mas organizar corretamente a rede de avaliação entre participantes.

Sem um módulo explícito de assignments, surgem problemas como:
- ambiguidade sobre quem responde para quem;
- erros de relacionamento;
- dificuldade em controlar self, manager, peer e subordinate;
- impossibilidade de rastrear progresso por unidade de coleta;
- convites sem controle individual;
- risco de respostas duplicadas ou faltantes. [file:1][web:373]

O módulo resolve isso ao tratar cada relação concreta de avaliação como um registro operacional próprio, auditável e controlável. [file:1][web:359]

## O que é um assignment no Maptiva

No contexto do Maptiva, um assignment é a instrução operacional que diz que um avaliador específico deve responder uma avaliação para um participante específico, dentro de um ciclo e em uma relação definida.

Cada assignment deve representar:
- um avaliado;
- um avaliador;
- um papel de relacionamento;
- um questionário aplicável;
- um status;
- um canal de acesso à resposta, como magic link;
- e, eventualmente, a resposta submetida. [file:1]

Exemplos:
- João avalia Maria como `manager`;
- Ana avalia Carlos como `peer`;
- Fernanda se autoavalia como `self`. [file:1]

## Objetivos do módulo

Este módulo deve permitir que o tenant:

1. gere assignments válidos para um ciclo;
2. organize assignments por papel de relacionamento;
3. vincule questionários adequados a cada assignment;
4. controle convites e status de resposta;
5. previna duplicidade e inconsistência;
6. permita acompanhamento operacional da coleta;
7. alimente o módulo de Responses e o dashboard do ciclo. [file:1]

## Escopo do módulo

### Incluído
- criação de assignments;
- definição de avaliado e avaliador;
- definição de relação (`self`, `manager`, `peer`, etc.);
- vínculo com questionário;
- geração de token/magic link;
- rastreamento de status;
- cancelamento ou expiração;
- reenvio operacional;
- validações de consistência;
- rastreabilidade da unidade de coleta. [file:1]

### Fora de escopo
- criação de participantes;
- definição do template;
- preenchimento da resposta em si;
- scoring;
- agrupamento analítico;
- geração de relatórios;
- cálculo de anonimato final. [file:1]

## Entidade principal: `rater_assignments`

### Função
Representa a unidade operacional de coleta entre um avaliador e um avaliado.

### Campos principais
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
- `created_at` [file:1]

### Responsabilidade
Ser o ponto único de controle da relação concreta de avaliação. [file:1]

## Componentes do assignment

Cada assignment precisa definir ao menos cinco dimensões:

### 1. Avaliado
Quem está sendo avaliado.

### 2. Avaliador
Quem responderá aquele assignment.

### 3. Relação
Qual é o papel do avaliador em relação ao avaliado.

### 4. Questionário
Qual conjunto de perguntas será apresentado naquele assignment.

### 5. Status operacional
Em que etapa o assignment está dentro do fluxo do ciclo. [file:1]

## Relações suportadas

Os assignments devem operar com base nos tipos de relação definidos no módulo de Templates.

### Relações iniciais
- `self`
- `manager`
- `peer`
- `subordinate`
- `client`
- `mentor` [file:1]

### Regra principal
A relação usada no assignment deve ser compatível com o template aplicado no ciclo. O módulo não deve aceitar relações fora da política configurada para aquele ciclo/template. [file:1][web:359]

## Status do assignment

Os assignments precisam ter estados claros, porque são a unidade principal de monitoramento da coleta.

### Status iniciais recomendados

| Status | Significado |
|---|---|
| `pending` | Assignment criado, mas ainda não enviado. [file:1] |
| `invited` | Convite enviado e aguardando resposta. [file:1] |
| `completed` | Resposta concluída e registrada. [file:1] |
| `expired` | Token ou janela de resposta expirada. [file:1] |
| `cancelled` | Assignment descontinuado e retirado da operação. [file:1] |

Opcionalmente no futuro:
- `draft`
- `in_progress`
- `failed_delivery`

Para o MVP, o conjunto acima é suficiente e operacionalmente claro. Workflows bem documentados tendem a funcionar melhor com poucos estados bem definidos do que com granularidade artificial. [web:373][web:375]

## Fluxo de estado recomendado

```text
pending --> invited --> completed
             |
             +--> expired
             |
             +--> cancelled
```

### Regras
- `pending` pode virar `invited`;
- `invited` pode virar `completed`;
- `invited` pode virar `expired`;
- `pending` ou `invited` podem virar `cancelled`;
- `completed` é terminal no MVP. [file:1]

## Origem dos assignments

Assignments podem ser gerados de diferentes formas.

### Formas iniciais
- geração manual pelo admin;
- geração semiassistida a partir de sugestões;
- importação estruturada;
- geração automática com base em regras simples do ciclo. [file:1]

### Recomendação para o MVP
Começar com geração manual + semiassistida, porque isso equilibra controle e simplicidade. [file:1]

## Geração de assignments

O módulo deve permitir gerar assignments respeitando:
- o método do template;
- as relações permitidas;
- mínimos e máximos por papel;
- a estrutura dos participantes no ciclo;
- regras de consistência. [file:1]

### Exemplos
- um template 180 pode exigir apenas `self` e `manager`;
- um template 360 pode exigir `self`, `manager`, `peer` e `subordinate`;
- um template custom pode permitir `mentor` e `client`. [web:13][file:1]

## Regras de negócio importantes

### 1. Assignment pertence a um ciclo
Nenhum assignment existe fora do contexto de um ciclo. [file:1]

### 2. Assignment pertence a um tenant
O assignment sempre deve herdar e respeitar o `tenant_id` do ciclo. [web:22][file:1]

### 3. Relação deve ser válida
A `relationship_code` do assignment deve estar permitida pelo template aplicado ao ciclo. [file:1]

### 4. Questionário deve ser compatível
O questionário vinculado ao assignment deve corresponder à relação e ao template corretos. [file:1]

### 5. Duplicidade precisa ser controlada
Não deve haver duplicidade indevida de assignment para o mesmo avaliador, avaliado, relação e ciclo, salvo regra explícita do produto. [file:1]

### 6. Assignment é a fonte de verdade do progresso
Convites, pendências e conclusão devem ser medidos a partir do estado do assignment, não de inferências externas. [file:1]

## Restrições e validações

O módulo deve validar ao menos:

- `cycle_id` obrigatório;
- `evaluated_participant_id` obrigatório;
- `evaluator_participant_id` obrigatório, exceto se houver caso especial futuro;
- `relationship_code` obrigatório;
- `questionnaire_id` compatível com template/ciclo;
- coerência entre avaliador e avaliado;
- prevenção de assignment duplicado;
- compatibilidade com regras mínimas/máximas por relação;
- bloqueio de criação em ciclos fechados. [file:1][web:359]

## Regras específicas por relação

### Self
- o avaliador e o avaliado são a mesma pessoa;
- só deve existir um assignment `self` por participante, salvo exceção futura. [file:1]

### Manager
- deve idealmente apontar para o gestor associado ao participante;
- se o participante não tiver gestor, o sistema deve alertar inconsistência. [file:1]

### Peer
- pode haver múltiplos assignments;
- deve respeitar mínimo e máximo por regra do template. [file:1]

### Subordinate
- só faz sentido quando houver liderados associados ou configurados;
- também deve respeitar mínimo e máximo por template. [file:1]

### Relações custom
- só podem ser usadas se o template as permitir;
- questionário e visibilidade devem ser coerentes com a configuração do ciclo. [file:1]

## Magic links e acesso do avaliador

Cada assignment deve poder gerar um acesso individual e controlado para resposta.

### Regras iniciais
- token único por assignment;
- acesso restrito àquele assignment;
- possibilidade de expiração;
- bloqueio ou controle de reuso após conclusão;
- registro de `invited_at` e `completed_at`. [file:1]

### Importante
O assignment é a unidade ideal para controle de token, porque ele já representa exatamente uma tarefa de resposta. [file:1]

## Relação com o módulo de Responses

O módulo de Responses não deve decidir “quem responde o quê”. Essa decisão pertence ao módulo de Assignments.

### Regra de integração
- o assignment define a unidade de coleta;
- a response grava as respostas daquela unidade. [file:1]

Isso mantém responsabilidades claras e reduz confusão entre mapeamento e preenchimento. [web:373][web:375]

## Relação com o dashboard operacional

O dashboard do ciclo deve usar assignments como principal fonte de leitura para:
- taxa de resposta;
- assignments pendentes;
- assignments concluídos;
- envios realizados;
- pendências por participante ou grupo. [file:1]

Em outras palavras, o assignment é uma métrica operacional, não apenas uma relação de dados. [file:1]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. criar assignment;
2. gerar assignments em lote;
3. editar assignment antes do envio;
4. enviar convite;
5. reenviar convite;
6. cancelar assignment;
7. expirar assignment;
8. concluir assignment por submissão da resposta. [file:1]

## Fluxo 1 — Criar assignment manual

### Objetivo
Cadastrar explicitamente uma relação de avaliação.

### Passos
1. usuário acessa o ciclo;
2. escolhe o participante avaliado;
3. escolhe o avaliador;
4. define a relação;
5. sistema seleciona ou sugere questionário compatível;
6. valida e salva assignment em `pending`. [file:1]

## Fluxo 2 — Gerar assignments em lote

### Objetivo
Criar múltiplos assignments com base em regras do ciclo e do template.

### Passos
1. usuário aciona geração em lote;
2. sistema lê participantes e regras do template;
3. propõe assignments por relação;
4. usuário revisa;
5. confirma geração;
6. assignments são criados em lote. [file:1]

### Resultado esperado
O ciclo fica estruturalmente pronto para envio de convites. [file:1]

## Fluxo 3 — Enviar convite

### Objetivo
Disponibilizar o assignment ao avaliador.

### Passos
1. assignment está em `pending`;
2. usuário ou automação aciona envio;
3. sistema gera ou valida token;
4. sistema dispara e-mail;
5. status passa para `invited`. [file:1]

## Fluxo 4 — Concluir assignment

### Objetivo
Marcar a unidade de coleta como concluída após resposta válida.

### Passos
1. avaliador acessa via token;
2. responde o questionário;
3. sistema valida envio;
4. grava responses;
5. assignment recebe `completed` e `completed_at`. [file:1]

## Fluxo 5 — Cancelar assignment

### Objetivo
Retirar da operação um assignment criado indevidamente ou não mais necessário.

### Regras
- assignments concluídos não devem ser cancelados livremente;
- o cancelamento deve ser auditado;
- o dashboard deve refletir essa exclusão operacional. [file:1]

## Dependências do módulo

O módulo de Assignments depende de:
- Tenant and Access;
- Templates;
- Cycles;
- Participants;
- Questionnaires. [file:1]

Ele serve de base para:
- Response Collection;
- Notifications;
- Dashboard operacional;
- parte da leitura analítica de completude. [file:1]

## Permissões do módulo

Perfis com acesso esperado:

| Ação | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver assignments | Sim | Sim | Sim | Limitado | Sim |
| Criar assignments | Sim | Sim | Sim | Não | Não |
| Editar assignments antes do envio | Sim | Sim | Sim | Não | Não |
| Enviar convites | Sim | Sim | Sim | Não | Não |
| Cancelar assignments | Sim | Sim | Sim | Não | Não |
| Ver progresso por assignment | Sim | Sim | Sim | Limitado | Sim |

As permissões finais devem seguir `permissions-rls.md`. [web:276][file:1]

## Auditoria e rastreabilidade

O módulo deve registrar eventos importantes de lifecycle do assignment.

### Eventos mínimos
- criação;
- edição;
- envio de convite;
- reenvio;
- cancelamento;
- expiração;
- conclusão. [web:373][web:375]

### Objetivo
- facilitar suporte;
- garantir governança;
- explicar inconsistências operacionais;
- permitir histórico confiável do ciclo. [web:373][web:378]

## Riscos e cuidados

### 1. Duplicidade de assignments
Sem validação forte, o mesmo avaliador pode receber múltiplos convites indevidos para a mesma combinação de contexto. [file:1]

### 2. Relações inconsistentes
Permitir assignments fora das regras do template enfraquece o método e contamina analytics. [file:1]

### 3. Falta de status claros
Se não houver estados explícitos, o dashboard operacional perde confiabilidade. [web:373][web:381]

### 4. Token mal controlado
Se o magic link não estiver preso ao assignment, o risco de acesso indevido aumenta. [file:1]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- sugestão automática mais inteligente de peers;
- bulk review visual de assignments;
- detecção avançada de inconsistências;
- delegação temporária de avaliador;
- substituição de avaliador com histórico;
- janela de resposta por grupo;
- status `in_progress`;
- integração com estruturas organizacionais externas. [web:377][web:380]

## Métricas úteis do módulo

Algumas métricas importantes:
- número de assignments por ciclo;
- taxa de conclusão por relação;
- tempo médio entre convite e conclusão;
- taxa de expiração;
- número de reenvios por ciclo;
- volume de inconsistências detectadas na geração. [file:1][web:373]

## Resumo final

O módulo de Assignments é o coração operacional da coleta no Maptiva. Ele transforma regras do template e participantes do ciclo em relações concretas de avaliação, controlando quem avalia quem, com qual papel, por qual questionário e em qual estado. Um desenho forte desse módulo é essencial para garantir coleta confiável, progresso rastreável e base sólida para respostas, analytics e relatórios. [file:1][web:359][web:373]
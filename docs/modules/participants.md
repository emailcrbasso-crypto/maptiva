# Participants Module — Maptiva

## Objetivo do módulo

O módulo de Participants é responsável por representar as pessoas que participam de um ciclo de avaliação dentro de um tenant.

No Maptiva, o participante é a entidade humana central do domínio. Ele pode assumir papéis diferentes em contextos diferentes, como ser avaliado, atuar como avaliador, aparecer em relatórios, compor análises e alimentar histórico longitudinal entre ciclos. [file:1]

## Papel do módulo no produto

O módulo de Participants funciona como a camada de identidade operacional das pessoas no sistema.

Ele conecta:
- tenants;
- ciclos;
- assignments;
- responses;
- scoring and analytics;
- reports and exports. [file:1]

Sem esse módulo, o produto conseguiria configurar templates e ciclos, mas não teria uma representação consistente de quem participa do processo, o que comprometeria coleta, rastreabilidade e histórico. [file:1]

## Problema que o módulo resolve

Em sistemas de assessment, é comum a mesma pessoa ocupar papéis diferentes ao longo do processo:
- ser avaliada em um ciclo;
- avaliar colegas em outro contexto;
- mudar de gestor;
- trocar de área;
- participar de múltiplas rodadas ao longo do tempo. [file:1]

Sem um módulo de participantes bem desenhado, surgem problemas como:
- duplicidade de pessoas;
- inconsistência entre ciclos;
- dificuldade de importação;
- problemas de relacionamento hierárquico;
- relatórios imprecisos;
- perda de histórico longitudinal. [file:1][web:432][web:437]

O módulo resolve isso ao centralizar a identidade do participante e organizar sua relação com ciclos, papéis operacionais e contexto organizacional. [web:437][web:443]

## O que é um participant no Maptiva

No contexto do Maptiva, um participant é o registro de uma pessoa dentro do tenant, apta a participar de processos de avaliação em um ou mais ciclos.

Esse participante pode:
- ser avaliado;
- avaliar outras pessoas;
- ter gestor associado;
- pertencer a uma área;
- ocupar um cargo;
- possuir atributos organizacionais relevantes para filtros e relatórios. [file:1]

Importante:
participant não é sinônimo de usuário autenticado do painel. Um participante pode existir no sistema mesmo sem ter login administrativo. [file:1]

## Objetivos do módulo

Este módulo deve permitir que o tenant:

1. registre participantes de forma padronizada;
2. importe participantes em lote;
3. mantenha atributos organizacionais relevantes;
4. relacione participantes a ciclos;
5. permita uso do participante como avaliado e/ou avaliador;
6. suporte histórico entre ciclos;
7. reduza duplicidade e inconsistência cadastral. [file:1][web:432]

## Escopo do módulo

### Incluído
- cadastro de participantes;
- atualização de dados principais;
- importação em lote;
- padronização de campos;
- vinculação ao tenant;
- suporte a metadados organizacionais;
- vínculo com ciclos;
- suporte a relações hierárquicas básicas;
- status do participante no contexto operacional. [file:1]

### Fora de escopo
- autenticação administrativa completa;
- definição de templates;
- criação de assignments;
- coleta de responses;
- scoring;
- geração de relatórios;
- gestão avançada de organograma corporativo externo. [file:1][web:437]

## Entidade principal: `participants`

### Função
Representar pessoas aptas a participar de ciclos dentro de um tenant.

### Campos principais
- `id`
- `tenant_id`
- `full_name`
- `email`
- `employee_code`
- `department`
- `job_title`
- `manager_participant_id`
- `metadata_json`
- `created_at` [file:1]

### Responsabilidade
Ser a fonte de verdade da identidade operacional da pessoa dentro do tenant. [file:1]

## Participant como entidade central de domínio

O participante precisa ser desenhado como entidade reutilizável entre ciclos, e não como cadastro descartável de uma rodada específica.

### Consequência prática
- um mesmo participant pode aparecer em múltiplos ciclos;
- assignments e resultados históricos podem apontar para o mesmo participant;
- mudanças organizacionais futuras não devem apagar rastros do passado. [file:1]

Essa abordagem melhora consistência e prepara o produto para análises longitudinales e futuras integrações. [file:1][web:443]

## Relação entre participant e cycle

Um participant pode existir no tenant sem necessariamente estar ativo em todos os ciclos.

### Regra importante
A participação no ciclo deve ser explicitada por entidade de vínculo ou pela presença em assignments e estruturas relacionadas ao ciclo. [file:1]

Isso significa:
- participant é entidade do tenant;
- participação no ciclo é contextual. [file:1]

## Papéis operacionais do participant

Um participant pode assumir múltiplos papéis no sistema, dependendo do ciclo e da situação.

### Papéis possíveis
- avaliado;
- avaliador;
- self evaluator;
- gestor de alguém;
- liderado de alguém;
- membro de grupo de análise. [file:1]

### Observação
Esses papéis não precisam virar campos fixos na entidade principal. Em geral, eles emergem das relações no ciclo, nos assignments e no vínculo hierárquico. [file:1]

## Dados principais do participante

O cadastro base do participant deve conter atributos mínimos para identificação e operação.

### Dados mínimos recomendados
- nome completo;
- e-mail;
- identificador interno opcional (`employee_code`);
- área/departamento;
- cargo;
- gestor, quando aplicável. [file:1]

### Justificativa
Esses dados são suficientes para:
- identificar a pessoa;
- enviar convites;
- organizar filtros;
- apoiar relatórios;
- gerar relações operacionais básicas. [file:1][web:432]

## Identidade e unicidade

O módulo deve definir critérios claros para evitar duplicidade.

### Estratégias recomendadas
- unicidade por `tenant_id + email`, quando houver e-mail confiável;
- ou `tenant_id + employee_code`, quando esse código for mais estável;
- revisão manual em casos ambíguos. [file:1]

### Observação
Nem todo cliente terá um identificador organizacional limpo. Por isso, o sistema deve prever importações imperfeitas e fluxo de saneamento. Padronização de entrada e revisão de dados são práticas importantes em sistemas de gestão de participantes. [web:432][web:438]

## Relação hierárquica

O módulo deve permitir modelar ao menos uma relação hierárquica básica.

### Campo inicial
- `manager_participant_id`

### Função
Permitir:
- identificação de gestor direto;
- geração de assignments do tipo `manager`;
- organização de filtros gerenciais;
- leitura analítica por liderança. [file:1]

### Limitação esperada no MVP
Essa modelagem cobre relação de linha simples, mas não substitui um organograma completo nem estruturas matriciais complexas. [file:1][web:437]

## Metadados organizacionais

Além dos campos principais, o módulo deve aceitar atributos adicionais por tenant.

### Exemplo de metadados
- unidade de negócio;
- localização;
- senioridade;
- regional;
- centro de custo;
- nível hierárquico;
- tags customizadas. [file:1]

### Recomendação
Esses atributos podem começar em `metadata_json`, desde que o produto defina convenções claras de uso. Isso ajuda flexibilidade no início, sem exigir explosão prematura de colunas estruturadas. [file:1]

## Estados do participante

O participant pode ter um estado simples no tenant e/ou no ciclo.

### Estados sugeridos para o tenant
- `active`
- `inactive`
- `archived`

### Uso sugerido
- `active`: pode ser usado em novos ciclos;
- `inactive`: permanece no histórico, mas não deve ser selecionado por padrão;
- `archived`: mantido apenas para rastreabilidade. [web:437][web:443]

### Observação
No MVP, esses estados podem ser opcionais ou simplificados, mas a necessidade aparece rápido quando há rotatividade organizacional. [file:1]

## Importação de participantes

A importação em lote é uma funcionalidade crítica do módulo.

### Objetivos da importação
- reduzir esforço manual;
- permitir onboarding rápido de ciclos;
- padronizar dados;
- viabilizar uso em empresas maiores. [file:1][web:432]

### Campos típicos em importação
- nome;
- e-mail;
- código interno;
- área;
- cargo;
- e-mail ou código do gestor;
- metadados adicionais. [file:1]

### Regras importantes
- validar duplicidade;
- sinalizar inconsistências;
- permitir preview antes da confirmação;
- registrar erros por linha. [web:432][web:438][file:1]

## Regras de negócio importantes

### 1. Todo participant pertence a um tenant
Não deve haver participant compartilhado entre tenants. [web:22][file:1]

### 2. Participant não depende de um ciclo para existir
O cadastro da pessoa deve poder ser reutilizado entre rodadas. [file:1]

### 3. Participant pode ser avaliado e avaliador
O módulo deve suportar ambos os papéis sem duplicar a pessoa. [file:1]

### 4. Dados históricos não devem ser apagados de forma destrutiva
Mesmo que o participante saia da empresa, ciclos passados e resultados precisam continuar coerentes. [file:1]

### 5. Hierarquia pode mudar ao longo do tempo
O sistema deve aceitar que a relação de gestor atual não seja igual à de ciclos antigos. [file:1]

### 6. Dados do participant devem ser suficientes para geração operacional
Assignments, filtros e relatórios dependem de um cadastro minimamente consistente. [file:1][web:432]

## Relação com assignments

O módulo de Assignments depende do participant para montar quem avalia quem.

### Aplicações diretas
- `evaluated_participant_id`
- `evaluator_participant_id`
- identificação de `manager`
- construção de grupos `peer`
- leitura de subordinados, quando aplicável. [file:1]

Sem participants consistentes, assignments perdem confiabilidade operacional. [file:1]

## Relação com analytics e reports

O participant também é a referência principal para:
- agregação de resultados por pessoa;
- filtros por área, cargo ou gestor;
- histórico por ciclo;
- entrega de relatório individual. [file:1]

Isso faz do participant uma entidade não apenas operacional, mas também analítica. [file:1]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. criar participant manualmente;
2. importar participants em lote;
3. editar dados do participant;
4. inativar ou arquivar participant;
5. consultar participant;
6. vincular participant ao uso em ciclos. [file:1][web:438]

## Fluxo 1 — Criar participant manual

### Objetivo
Cadastrar uma pessoa individualmente.

### Passos
1. usuário acessa a área de participants;
2. preenche dados principais;
3. opcionalmente define gestor e metadados;
4. sistema valida unicidade;
5. salva participant. [file:1]

## Fluxo 2 — Importar em lote

### Objetivo
Cadastrar ou atualizar múltiplas pessoas de uma só vez.

### Passos
1. usuário faz upload de arquivo;
2. sistema interpreta colunas;
3. valida estrutura e duplicidades;
4. apresenta preview;
5. usuário confirma importação;
6. sistema cria ou atualiza registros válidos;
7. sistema registra erros e alertas. [file:1][web:432]

## Fluxo 3 — Editar participant

### Objetivo
Atualizar dados cadastrais e organizacionais.

### Regras
- mudanças devem afetar usos futuros;
- histórico de ciclos passados não deve ser corrompido;
- alterações sensíveis idealmente devem ser auditadas. [file:1][web:437]

## Fluxo 4 — Inativar participant

### Objetivo
Retirar a pessoa de novas operações sem destruir histórico passado.

### Regras
- participant inativo não deve aparecer por padrão em novos ciclos;
- ciclos antigos permanecem intactos;
- vínculo histórico é preservado. [file:1]

## Validações do módulo

O módulo deve validar pelo menos:

- `full_name` obrigatório;
- identificador principal válido;
- unicidade dentro do tenant;
- e-mail com formato válido, quando presente;
- `manager_participant_id` consistente;
- prevenção de auto-referência inválida como gestor;
- estrutura mínima para importações em lote. [file:1][web:432]

## Permissões do módulo

Perfis com acesso esperado:

| Ação | owner | admin | hr | manager | analyst |
|---|---|---|---|---|---|
| Ver participants | Sim | Sim | Sim | Limitado | Sim |
| Criar participants | Sim | Sim | Sim | Não | Não |
| Importar participants | Sim | Sim | Sim | Não | Não |
| Editar participants | Sim | Sim | Sim | Não | Não |
| Inativar participants | Sim | Sim | Sim | Não | Não |

As regras finais devem seguir `permissions-rls.md`. [web:276][file:1]

## Auditoria e rastreabilidade

O módulo deve registrar ao menos:
- criação;
- atualização;
- importação;
- inativação;
- arquivamento, se existir;
- conflitos de importação ou deduplicação relevantes. [web:437][web:438]

Essa rastreabilidade ajuda suporte, governança e confiança nos dados do sistema. [web:443]

## Riscos e cuidados

### 1. Duplicidade de pessoas
Se o sistema não tratar deduplicação com cuidado, relatórios, assignments e histórico ficam fragmentados. [file:1]

### 2. Falta de padronização
Áreas, cargos e identificadores inconsistentes reduzem valor analítico e aumentam retrabalho. [web:432][web:438]

### 3. Mistura entre identidade e estado do ciclo
Participant é entidade do tenant; sua participação em um ciclo é contextual e não deve ficar embutida de forma confusa no cadastro base. [file:1]

### 4. Exclusão destrutiva
Apagar pessoas pode quebrar histórico, relatórios e integridade relacional. [file:1]

### 5. Hierarquia simplificada demais para certos clientes
O campo de gestor direto resolve o MVP, mas alguns casos podem exigir evolução futura. [web:437][web:443]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- deduplicação assistida;
- sincronização com HRIS;
- histórico temporal de cargo e área;
- organograma mais avançado;
- segmentações salvas;
- diretório interno de participantes;
- importações recorrentes automatizadas. [web:437][web:443]

## Métricas úteis do módulo

Algumas métricas importantes:
- número de participants por tenant;
- taxa de importação sem erro;
- quantidade de duplicidades detectadas;
- tempo médio de onboarding de participantes por ciclo;
- proporção de participants com gestor definido;
- completude dos campos organizacionais. [web:432][web:438][file:1]

## Resumo final

O módulo de Participants é a base humana do Maptiva. Ele representa as pessoas do tenant, sustenta assignments, coleta, analytics e relatórios, e permite que o produto opere com consistência entre ciclos sem perder histórico. Um desenho forte desse módulo é essencial para reduzir erros operacionais, melhorar qualidade analítica e preparar o sistema para escala e integrações futuras. [file:1][web:432][web:437]
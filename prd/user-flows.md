# User Flows — Maptiva

## Objetivo deste documento

Este documento descreve os principais fluxos de uso do Maptiva no MVP, com foco nos caminhos operacionais e analíticos mais importantes para administradores, avaliadores e usuários consumidores de resultados.

O objetivo é transformar o escopo funcional do produto em jornadas claras, com passos, decisões, estados alternativos e regras de comportamento esperadas. Boas práticas de documentação de user flows recomendam mapear não apenas o happy path, mas também desvios, erros e pontos de decisão importantes. [web:318][web:320][web:321]

## Princípios para os fluxos do Maptiva

Os fluxos do produto devem seguir estes princípios:

### 1. Valor principal primeiro
O sistema deve levar o usuário rapidamente à ação principal que justifica o uso do produto. Em SaaS, isso significa reduzir fricção no caminho até o primeiro resultado útil. [web:314][web:315]

### 2. Clareza operacional
O admin deve sempre entender em que etapa do ciclo está, o que falta e qual é a próxima ação recomendada. [web:318][web:322]

### 3. Menor fricção possível para avaliadores
A experiência de resposta deve ser simples, curta, segura e focada em completar o assignment com confiança. [file:1][web:315]

### 4. Decisões explícitas
Sempre que houver bifurcação relevante, o fluxo deve registrar qual decisão foi tomada e o que acontece em seguida. [web:320][web:321]

### 5. Estados de erro documentados
Fluxos incompletos geram lacunas de implementação. Cada fluxo importante deve prever pelo menos os erros e exceções mais prováveis. [web:318][web:320]

## Atores principais

Os fluxos do MVP envolvem principalmente estes atores:

- **Owner/Admin**: usuário com controle do tenant e da operação.
- **RH/Admin de ciclo**: operador principal dos ciclos.
- **Gestor**: usuário que acessa resultados permitidos ou relatórios de equipe.
- **Avaliador**: pessoa que responde avaliação via link seguro.
- **Liderança**: usuário que consome relatórios executivos. [file:1]

## Lista de fluxos prioritários do MVP

Os fluxos mais importantes para o MVP são:

1. acesso ao tenant;
2. criação de template;
3. criação de ciclo;
4. importação de participantes;
5. configuração de assignments;
6. envio de convites;
7. resposta do avaliador;
8. acompanhamento do progresso;
9. fechamento do ciclo;
10. geração de relatórios;
11. exportação para uso externo ou Maptiva Grid. [file:1]

## Fluxo 1 — Acesso ao tenant

### Objetivo
Permitir que um usuário administrativo acesse o tenant correto e entre no contexto operacional do produto.

### Ator principal
Owner, Admin ou RH.

### Gatilho
Usuário acessa a plataforma para operar um tenant.

### Happy path
1. Usuário faz login.
2. Sistema identifica memberships disponíveis.
3. Usuário acessa o tenant desejado, se houver mais de um.
4. Sistema carrega dashboard inicial do tenant.
5. Usuário vê visão resumida de ciclos, templates ou tarefas pendentes. [web:315][web:318]

### Decisões
- O usuário tem um único tenant?  
  - Sim: entra direto.  
  - Não: escolhe o tenant ativo.

### Estados alternativos
- usuário sem membership válido;
- tenant inativo;
- usuário autenticado, mas sem permissão para o recurso solicitado. [web:318][web:320]

## Fluxo 2 — Criar template de avaliação

### Objetivo
Permitir a criação de um template reutilizável de avaliação 180°, 360° ou custom.

### Ator principal
Owner, Admin ou RH.

### Gatilho
Usuário quer preparar a estrutura da avaliação antes de criar um ciclo.

### Happy path
1. Usuário acessa a área de templates.
2. Seleciona “novo template”.
3. Escolhe o método: 180°, 360° ou custom.
4. Define nome, escala e regras principais.
5. Seleciona ou cria competências.
6. Define perguntas e questionários.
7. Ajusta regras por relação.
8. Salva o template.
9. Sistema valida consistência mínima e disponibiliza o template para uso em ciclos. [file:1][web:320]

### Decisões
- usar preset padrão ou customizar?
- usar mesmo questionário para todos ou questionários por relação?
- habilitar anonimato por grupo?
- exibir self e manager separadamente? [file:1]

### Estados alternativos
- template sem competências;
- regra de relação inconsistente;
- escala inválida;
- questionário incompleto. [web:320][web:321]

## Fluxo 3 — Criar ciclo de avaliação

### Objetivo
Criar a execução concreta de um template em um período real.

### Ator principal
Admin ou RH.

### Gatilho
Usuário está pronto para iniciar um processo de avaliação.

### Happy path
1. Usuário acessa a área de ciclos.
2. Clica em “novo ciclo”.
3. Seleciona um template.
4. Define nome, período e prazo.
5. Ajusta configurações específicas do ciclo.
6. Salva o ciclo em `draft`.
7. Sistema exibe a próxima etapa recomendada: adicionar participantes. [file:1]

### Decisões
- o ciclo usará o template sem mudanças?
- haverá ajustes de prazo ou política de anonimato para esse ciclo? [file:1]

### Estados alternativos
- template incompatível com regras mínimas;
- prazo inválido;
- tentativa de ativar ciclo sem participantes. [web:320]

## Fluxo 4 — Importar participantes

### Objetivo
Permitir o cadastro em lote das pessoas que serão avaliadas.

### Ator principal
Admin ou RH.

### Gatilho
Ciclo foi criado e precisa receber participantes.

### Happy path
1. Usuário acessa o ciclo.
2. Entra na área de participantes.
3. Faz upload da planilha ou cadastra manualmente.
4. Sistema valida colunas obrigatórias.
5. Sistema exibe preview de importação.
6. Usuário confirma.
7. Participantes são criados e vinculados ao ciclo. [file:1]

### Decisões
- cadastro manual ou importação?
- atualização de participantes já existentes no ciclo ou criação de novas linhas?

### Estados alternativos
- planilha com colunas ausentes;
- e-mails duplicados;
- gestor inexistente;
- linhas inválidas;
- importação parcial com erros. [web:318][web:320]

## Fluxo 5 — Configurar assignments

### Objetivo
Mapear quem avalia quem e em qual papel.

### Ator principal
Admin ou RH.

### Gatilho
Participantes já estão cadastrados no ciclo.

### Happy path
1. Usuário acessa a etapa de assignments.
2. Seleciona participante avaliado.
3. Sistema sugere relações possíveis conforme o template.
4. Usuário confirma ou ajusta avaliadores por papel.
5. Sistema valida mínimo/máximo por relação.
6. Assignments são gerados com status inicial. [file:1][web:320]

### Decisões
- usar sugestão automática ou montar manualmente?
- manter apenas relações padrão ou adicionar relação custom?
- assignment será editável após convite enviado?

### Estados alternativos
- participante sem manager;
- peer insuficiente;
- subordinate inexistente;
- conflito entre regra do template e estrutura da equipe. [file:1]

## Fluxo 6 — Enviar convites

### Objetivo
Disparar os convites para que os avaliadores respondam seus assignments.

### Ator principal
Admin ou RH.

### Gatilho
Assignments foram configurados e o ciclo está pronto para coleta.

### Happy path
1. Usuário revisa assignments pendentes.
2. Clica em “enviar convites”.
3. Sistema gera magic links seguros.
4. Sistema envia e-mails por assignment.
5. Status muda para `invited`.
6. Dashboard passa a acompanhar a resposta. [file:1]

### Decisões
- enviar tudo de uma vez ou por grupo?
- reenviar convites apenas para pendentes?
- ativar lembretes automáticos? [file:1]

### Estados alternativos
- e-mail inválido;
- falha de envio;
- assignment cancelado;
- token expirado antes do uso. [web:303][web:306]

## Fluxo 7 — Responder avaliação

### Objetivo
Permitir que o avaliador complete seu assignment com o mínimo de fricção.

### Ator principal
Avaliador.

### Gatilho
Avaliador clica no magic link recebido por e-mail.

### Happy path
1. Avaliador abre o link.
2. Sistema valida token e status do assignment.
3. Exibe contexto mínimo da avaliação.
4. Exibe perguntas quantitativas e qualitativas.
5. Avaliador responde.
6. Submete o formulário.
7. Sistema salva respostas e marca assignment como `completed`. [file:1]

### Decisões
- pode salvar rascunho ou só enviar no final?
- pode voltar para revisar antes de concluir?
- formulário é paginado ou em página única?

### Estados alternativos
- token inválido;
- token expirado;
- assignment já concluído;
- erro de validação em resposta obrigatória;
- interrupção de conexão. [web:318][web:320]

## Fluxo 8 — Acompanhar progresso do ciclo

### Objetivo
Dar visibilidade operacional ao admin sobre andamento e pendências.

### Ator principal
Admin ou RH.

### Gatilho
Ciclo está ativo e convites já foram enviados.

### Happy path
1. Usuário acessa o dashboard do ciclo.
2. Sistema mostra progresso geral e por participante.
3. Usuário identifica pendências.
4. Pode filtrar assignments não respondidos.
5. Pode reenviar lembretes.
6. Sistema atualiza métricas em tempo real ou quase real. [file:1]

### Decisões
- reenviar lembrete individual ou em lote?
- manter ciclo aberto até completar tudo ou fechar no prazo?

### Estados alternativos
- ciclo com baixa taxa de resposta;
- assignment inconsistente;
- participante removido após convites enviados. [file:1]

## Fluxo 9 — Fechar ciclo

### Objetivo
Encerrar a coleta e disparar a consolidação dos resultados.

### Ator principal
Admin ou RH.

### Gatilho
Prazo encerrado ou decisão administrativa de fechamento.

### Happy path
1. Usuário acessa o ciclo.
2. Clica em “fechar ciclo”.
3. Sistema pede confirmação.
4. Sistema encerra novas respostas.
5. Engine de scoring é executada.
6. Snapshots são gerados.
7. Relatórios ficam disponíveis. [file:1]

### Decisões
- fechar mesmo com assignments pendentes?
- reabrir ciclo em caso excepcional?
- recalcular snapshots se alguma configuração mudar?

### Estados alternativos
- falha no processamento;
- dados inconsistentes;
- ciclo sem respostas suficientes para certos grupos;
- relatórios parciais bloqueados por regra de anonimato. [file:1]

## Fluxo 10 — Gerar relatório individual

### Objetivo
Apresentar a leitura consolidada de um participante avaliado.

### Ator principal
Admin, RH ou usuário autorizado.

### Gatilho
Ciclo foi fechado e snapshots estão prontos.

### Happy path
1. Usuário acessa a área de resultados.
2. Seleciona um participante.
3. Sistema lê `participant_result_profiles` e `score_snapshots`.
4. Monta relatório com scores, gaps e comentários agrupados.
5. Usuário visualiza ou exporta PDF. [file:1]

### Decisões
- exibir self e manager separados?
- ocultar grupos abaixo do N-mínimo?
- permitir export PDF ou apenas visualização interna?

### Estados alternativos
- participante sem dados suficientes;
- grupo ocultado por anonimato;
- snapshot não gerado;
- PDF falhou na geração. [file:1]

## Fluxo 11 — Gerar relatório executivo

### Objetivo
Fornecer visão consolidada para liderança ou RH.

### Ator principal
Owner, Admin, RH ou liderança autorizada.

### Gatilho
Ciclo fechado com analytics disponíveis.

### Happy path
1. Usuário acessa relatório executivo.
2. Sistema mostra agregados por área, competência, time ou grupo.
3. Usuário aplica filtros.
4. Pode exportar consolidado em planilha ou PDF. [file:1]

### Decisões
- visão por área, gestor ou ciclo?
- export detalhado ou apenas consolidado?
- heatmap ou tabela analítica?

### Estados alternativos
- acesso negado por papel;
- filtros vazios;
- baixa quantidade de dados em determinado corte. [web:320]

## Fluxo 12 — Exportar dados para uso externo ou Maptiva Grid

### Objetivo
Permitir que resultados consolidados sejam consumidos fora do fluxo principal do Maptiva.

### Ator principal
Admin, RH ou integração autorizada.

### Gatilho
Usuário deseja baixar dados ou preparar integração posterior.

### Happy path
1. Usuário acessa a área de exportações.
2. Seleciona tipo de export.
3. Escolhe ciclo e escopo.
4. Sistema valida permissão.
5. Gera arquivo ou payload estruturado.
6. Registra o evento de exportação.
7. Usuário faz download ou inicia integração. [web:303][web:306][file:1]

### Decisões
- CSV, XLSX ou JSON?
- export individual, consolidado ou Grid-ready?
- incluir dados organizacionais adicionais?

### Estados alternativos
- export bloqueado por papel;
- geração falhou;
- payload incompatível com versão esperada;
- tentativa de exportar dados sensíveis sem escopo permitido. [web:303]

## Fluxos secundários importantes

Além dos fluxos centrais, o MVP pode documentar depois fluxos secundários, como:

- editar template existente;
- duplicar template;
- duplicar ciclo;
- cancelar assignment;
- reabrir ciclo;
- reenviar relatório;
- trocar papel de usuário;
- configurar branding do tenant. [file:1]

Esses fluxos são úteis, mas devem vir depois dos caminhos principais. Em produtos SaaS, os primeiros fluxos a documentar costumam ser os de maior impacto operacional e maior risco de abandono ou erro. [web:320][web:323]

## Padrão de documentação para novos fluxos

Todo novo fluxo deve seguir este padrão:

- objetivo;
- ator principal;
- gatilho;
- happy path;
- decisões;
- estados alternativos;
- regras importantes;
- dependências com outros módulos. [web:320][web:321]

Esse padrão mantém consistência e ajuda design, produto e engenharia a trabalharem sobre a mesma estrutura. [web:321]

## Handoffs entre fluxos

Os handoffs mais importantes do Maptiva são:

- template → ciclo;
- participantes → assignments;
- assignments → respostas;
- respostas → scoring;
- scoring → relatórios;
- relatórios → exportações / Maptiva Grid. [file:1]

Em fluxos que atravessam módulos ou produtos, documentar claramente o ponto de transição reduz erro de experiência e de implementação. [web:320]

## Resumo final

Os user flows do Maptiva devem refletir o núcleo operacional do produto: configurar a avaliação, executar a coleta, consolidar os dados e disponibilizar resultados com segurança. Documentar esses fluxos com happy path, decisões e exceções ajuda a transformar o PRD em lógica implementável e reduz ambiguidade entre produto, design e engenharia. [web:318][web:320][web:321]
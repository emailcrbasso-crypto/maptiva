# MVP Scope — Maptiva

## Objetivo do MVP

O objetivo do MVP do Maptiva é provar que a plataforma consegue operar ciclos reais de avaliação 180° e 360° de forma confiável, repetível e escalável para empresas e consultorias, substituindo planilhas, formulários isolados e consolidação manual por um fluxo único e estruturado. [file:1][web:226][web:236]

O MVP não existe para resolver todo o universo de performance management. Ele existe para validar um recorte claro: **configurar um ciclo, coletar respostas, consolidar os dados com anonimato e entregar relatórios utilizáveis**. [web:230][web:234][web:238]

## Hipótese principal

Se empresas e consultorias tiverem uma plataforma simples para configurar avaliações 180° e 360°, enviar convites, aplicar regras de anonimato e gerar relatórios automaticamente, então elas reduzirão esforço operacional, ganharão confiança no processo e estarão mais dispostas a repetir ciclos e expandir o uso da solução. [file:1][web:226][web:227]

## Job principal do MVP

Um administrador de RH ou consultoria usa o Maptiva para configurar e executar um ciclo de avaliação, acompanhar o progresso das respostas e gerar relatórios consolidados com segurança e baixo esforço operacional. [file:1][web:230][web:235]

## Usuário principal do MVP

O usuário principal do MVP é o **administrador do ciclo**:
- profissional de RH,
- consultor,
- ou administrador da empresa cliente. [file:1][cite:141]

Ele é quem sente a dor operacional mais forte e é o usuário que mais valida o valor do produto na primeira versão. Em MVPs de SaaS, focar no workflow principal de um usuário central costuma acelerar aprendizado e reduzir escopo desnecessário. [web:230][web:234][web:235]

## Usuários secundários

- Avaliadores que respondem os formulários.
- Gestores que consomem resultados permitidos.
- Liderança executiva que acessa consolidado e relatórios finais. [file:1]

Esses usuários fazem parte do fluxo do produto, mas o MVP deve ser pensado principalmente para entregar valor operacional ao administrador do ciclo. [web:230][web:234]

## Workflow central do MVP

O fluxo mínimo que precisa funcionar ponta a ponta é:

1. Criar tenant e acessar o sistema como admin.
2. Criar ou selecionar um template de avaliação.
3. Criar um ciclo de avaliação.
4. Cadastrar ou importar participantes.
5. Definir quem avalia quem e em qual relação.
6. Disparar convites com magic links.
7. Coletar respostas quantitativas e qualitativas.
8. Monitorar progresso e enviar lembretes.
9. Fechar o ciclo.
10. Gerar relatórios e exportações. [file:1][web:230][web:234]

Se esse fluxo não estiver coeso, o MVP ainda não cumpre sua função. [web:235][web:237]

## Escopo incluído no MVP

### 1. Base multi-tenant

Incluído:
- cadastro de tenants;
- usuários administrativos;
- memberships por tenant;
- isolamento lógico por `tenant_id`;
- papéis mínimos de acesso. [web:22][web:28]

Justificativa:
Como o produto nasce para múltiplos clientes, a arquitetura multi-tenant não é extra; ela é parte do núcleo do MVP. [web:22][web:25]

### 2. Autenticação e autorização

Incluído:
- login administrativo;
- controle básico de papéis;
- acesso restrito por tenant;
- RLS nas tabelas principais. [file:1][web:22]

Justificativa:
Sem controle de acesso e isolamento, não existe SaaS B2B confiável para esse caso de uso. [web:22][web:28]

### 3. Métodos e templates

Incluído:
- presets de método 180° e 360°;
- suporte a método custom;
- templates reutilizáveis;
- competências associadas a templates;
- escalas de avaliação configuráveis;
- regras básicas de anonimato por template. [file:1][web:13]

Justificativa:
O produto não deve ser codado como “360 fixo”; o método precisa entrar no MVP como configuração. [web:13][web:27]

### 4. Ciclos de avaliação

Incluído:
- criação de ciclo;
- status do ciclo (`draft`, `active`, `closed`);
- prazo;
- configuração do template aplicado;
- ajustes básicos por ciclo. [file:1]

Justificativa:
O ciclo é a unidade operacional central do produto. [file:1]

### 5. Participantes

Incluído:
- cadastro manual;
- importação por planilha;
- associação ao ciclo;
- dados mínimos de identificação, cargo, área e gestor. [file:1]

Justificativa:
Sem importação e organização de participantes, o custo operacional do admin continua alto demais para um MVP útil. [file:1][web:227]

### 6. Assignments entre avaliadores e avaliados

Incluído:
- definição de quem avalia quem;
- relacionamento por papel (`self`, `manager`, `peer`, `subordinate`);
- possibilidade de expansão para relações customizadas;
- rastreamento de status do assignment. [file:1][web:13]

Justificativa:
Esse é o coração do motor de avaliação. [file:1]

### 7. Convites e coleta

Incluído:
- envio de convites;
- magic links;
- formulário de resposta;
- bloqueio ou controle de reuso do link após conclusão;
- registro de conclusão por assignment. [file:1]

Justificativa:
O MVP precisa ser executável sem exigir login de todos os avaliadores. [file:1]

### 8. Engine de cálculo

Incluído:
- cálculo de médias;
- agrupamento por relação;
- regra de N-mínimo;
- tratamento de self e manager conforme política;
- cálculo de blind spots e hidden strengths;
- geração de snapshots consolidados. [file:1]

Justificativa:
O produto só entrega valor real quando transforma respostas em informação confiável e reutilizável. [file:1][web:234]

### 9. Dashboard operacional

Incluído:
- status geral do ciclo;
- percentual de conclusão;
- assignments pendentes;
- acompanhamento por participante;
- disparo de lembretes. [file:1]

Justificativa:
O admin precisa ver o andamento do ciclo em tempo real para operar o processo. [file:1]

### 10. Relatórios e exportações

Incluído:
- relatório individual;
- relatório consolidado por gestor ou time;
- relatório executivo / heatmap;
- exportação Excel/CSV;
- leitura a partir da camada consolidada. [file:1]

Justificativa:
A geração de entregáveis é parte essencial do valor percebido do produto. [file:1]

## Escopo fora do MVP

Os itens abaixo devem ficar explicitamente fora da primeira versão:

- Nine Box visual e workflow de calibração;
- comitê de talent review;
- plano de sucessão;
- comparação histórica avançada entre múltiplos ciclos;
- benchmarking entre empresas;
- IA para resumir comentários automaticamente;
- integrações profundas com HRIS/ERP;
- SSO empresarial;
- builder avançado de formulários;
- relatórios altamente customizáveis por cliente;
- workflow de aprovação em múltiplas etapas;
- plano de desenvolvimento individual pós-avaliação;
- experiência mobile nativa;
- portal executivo separado;
- analytics preditivo. [web:232][web:234][web:237]

Em um MVP bem recortado, a lista de “fora” deve ser maior que a lista de “dentro”, justamente para proteger o foco. [web:232][web:237]

## Requisitos P0

Estes são os requisitos que **precisam** funcionar para o MVP ser considerado utilizável:

- Um tenant consegue acessar o sistema com segurança.
- Um admin consegue criar um ciclo a partir de um template.
- Um admin consegue importar participantes e assignments.
- Avaliadores conseguem responder via link.
- O sistema calcula resultados com regra de anonimato.
- O admin consegue acompanhar progresso e mandar lembretes.
- O ciclo pode ser fechado.
- O sistema gera pelo menos um relatório individual confiável.
- O sistema gera uma exportação consolidada.
- Os dados ficam preparados para consumo futuro pelo Maptiva Grid. [file:1][web:230][web:238]

## Requisitos P1

Importantes, mas não bloqueiam a validação inicial do produto:

- templates mais sofisticados com questionários por relação;
- branding por tenant;
- bibliotecas reutilizáveis de competências;
- filtros mais avançados no dashboard;
- relatórios gerenciais extras;
- reprocessamento de snapshots;
- melhorias de UX e onboarding. [web:227][web:234]

## Requisitos P2

Itens claramente pós-MVP:

- IA aplicada à leitura textual;
- sugestões automáticas de desenvolvimento;
- benchmark por setor;
- comparações históricas ricas;
- integração direta com o Maptiva Grid;
- experiências avançadas de calibração. [web:237][web:238]

## Critérios de aceite do MVP

O MVP pode ser considerado pronto quando for possível executar um ciclo real fim a fim com um cliente piloto e atender os seguintes critérios:

1. O admin cria o tenant e acessa a plataforma.
2. O admin cria um template ou usa um preset.
3. O admin cria o ciclo e carrega participantes.
4. O sistema gera e envia convites.
5. Os avaliadores respondem sem fricção relevante.
6. O dashboard reflete o progresso real.
7. O motor de cálculo consolida respostas corretamente.
8. O relatório individual é gerado com consistência.
9. O export consolidado é utilizável.
10. O cliente piloto entende valor suficiente para repetir o uso. [file:1][web:226][web:236]

## Dependências do MVP

O MVP depende de alguns blocos técnicos e operacionais:

- modelagem multi-tenant consistente;
- RLS bem definida;
- fluxo confiável de envio de e-mails;
- importação estruturada por planilha;
- engine de cálculo estável;
- geração de PDF e planilhas sem gargalos críticos. [file:1][web:22][web:173]

## Workarounds aceitáveis no MVP

Para acelerar a primeira versão, alguns workarounds são aceitáveis:

- pequenas manutenções manuais no banco por um admin técnico;
- branding limitado ou quase fixo;
- número reduzido de presets iniciais;
- exportações simples, desde que corretas;
- UX administrativa ainda sem alto refinamento visual;
- ausência de automações avançadas. [web:230][web:235]

Um MVP não precisa eliminar toda operação manual; ele precisa provar o valor central com um fluxo suficientemente funcional. [web:226][web:236]

## O que define sucesso inicial

O MVP será bem-sucedido se conseguir provar quatro coisas:

1. **Viabilidade operacional**  
   O ciclo roda de ponta a ponta sem depender de planilhas paralelas. [file:1]

2. **Confiabilidade dos resultados**  
   O cliente confia no anonimato, nas regras e nos relatórios. [file:1]

3. **Repetibilidade**  
   O mesmo cliente consegue rodar novo ciclo sem recomeçar do zero. [web:226][web:227]

4. **Base para expansão**  
   A arquitetura suporta evolução para analytics mais fortes e integração futura com o Maptiva Grid. [web:17][web:22]

## Métricas do MVP

### Métricas de uso
- número de tenants piloto ativos;
- número de ciclos executados;
- número de participantes por ciclo;
- taxa de conclusão dos assignments. [web:226]

### Métricas operacionais
- tempo médio para configurar um ciclo;
- tempo médio entre abertura e fechamento;
- número de lembretes por ciclo;
- número de erros de importação ou assignment. [file:1]

### Métricas de valor
- geração de relatório concluída com sucesso;
- cliente piloto disposto a rodar novo ciclo;
- interesse em expansão para mais áreas, mais ciclos ou mais tenants;
- interesse futuro em analytics ou Maptiva Grid. [web:226][web:236]

## Sequência recomendada de implementação

A ordem sugerida para desenvolvimento do MVP é:

1. tenancy e acesso;
2. schema base;
3. templates e métodos;
4. ciclos;
5. participantes;
6. assignments;
7. convites e coleta;
8. cálculo;
9. snapshots;
10. dashboard;
11. relatórios;
12. exportações. [file:1][web:230]

## Resumo executivo do escopo

O MVP do Maptiva deve ser enxuto, mas completo no fluxo principal. Ele precisa permitir que um admin configure e execute um ciclo de avaliação 180° ou 360°, acompanhe respostas, aplique regras de anonimato e gere relatórios consolidados com segurança. Tudo que não contribuir diretamente para esse workflow principal deve ficar fora da primeira versão. [file:1][web:230][web:234]
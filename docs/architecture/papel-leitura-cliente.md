# Papel de leitura do cliente (plano)

Status: proposta, aguardando decisões (ver "Decisões em aberto").
Contexto: hoje o cliente tem o papel `admin` no espaço e uma restrição **só de interface**
(`tenant_memberships.acesso_restrito`, migration 0113). Isso não protege contra chamadas à API.
Antes de entrarem dados reais do Setti Braga, o acesso do cliente precisa ser imposto pelo banco.

## Objetivo

Um papel `viewer` que:
1. só consegue ler **números agregados** da pesquisa (nunca respostas individuais, participantes,
   e-mails, tokens ou comentários brutos);
2. aplica o **mínimo de respondentes por recorte** no servidor (5 no Setti Braga);
3. pode ser limitado a **uma empresa** (RH da Diastur vê só a Diastur) ou ao **grupo todo**;
4. não consegue alterar nada.

## Desenho

### 1. Papel e escopo
- `tenant_memberships.role` passa a aceitar `viewer` (hoje: owner, admin, manager).
- Nova coluna `escopo_empresa text null`: `null` = grupo inteiro; valor = só aquela empresa.
- O servidor **força** o escopo; filtros enviados pelo navegador nunca o ampliam.
- `acesso_restrito` (0113) deixa de ser necessário: a interface restrita passa a vir do papel `viewer`.

### 2. Nenhum acesso direto às tabelas
- `viewer` não tem `select` em `dpa_participantes`, `dpa_respostas` nem `dpa_projetos`
  (esta última guarda `shared_link_token` e modelos de e-mail).
- Tudo passa por funções `security definer`, que checam o papel e o escopo.
- Funções existentes (`get_dpa_dashboard`, `get_dpa_dashboard_segmentos`, `get_dpa_resumo`) continuam
  exigindo admin/owner, então o `viewer` não as acessa.

### 3. Funções para o leitor
- `get_dpa_projeto_leitor(id)`: nome, descrição, status e a configuração **sem** campos sensíveis.
- `get_dpa_painel(id, filtros, dimensao)`: devolve só agregados já com mínimo aplicado:
  geral (fav/neutro/desf, respondentes), participação, por bloco, ranking de perguntas, riscos,
  importância por bloco, comparativo por grupo da dimensão, distribuição do perfil.
  Chamada de novo para a edição anterior quando há comparativo.
- Pesquisas sem `escopo` aceitam filtros de empresa, base e área; com `escopo`, a empresa é fixa.

### 4. Anonimato no servidor
- Mínimo por recorte final **e** por grupo exibido; categorias de perfil abaixo do mínimo viram
  "Outras respostas" ou somem.
- **Subtração**: se só um grupo some e o total aparece, o grupo oculto pode ser deduzido. Regra:
  quando exatamente um grupo é ocultado, oculta-se também o menor grupo visível.
- No máximo 2 filtros combinados; filtros de perfil pessoal ficam desligados para o leitor.
- Sem filtro por pergunta aberta nem por resposta individual.

### 5. Comentários (respostas abertas)
- O leitor nunca vê texto bruto. Tabela `dpa_comentarios_curados` (projeto, bloco/tema, texto,
  aprovado_por, aprovado_em), preenchida pela equipe após triagem. A função do leitor devolve só os
  aprovados. Até existir a triagem, a seção "Respostas abertas" fica oculta para o leitor.

### 6. Front-end
- Hoje a tela calcula tudo no navegador a partir das respostas brutas (`favorability.ts`,
  `segments.ts`, `insights.ts`). O leitor não pode receber essas linhas.
- Introduzir um **modelo de painel agregado** (DTO) consumido pela interface:
  - equipe/admin: o DTO é montado no navegador a partir das linhas (como hoje);
  - leitor: o DTO vem de `get_dpa_painel`.
- `buildInsights`, `exportClimaPdf` e `climaBatch` passam a receber o DTO (ou o produzem a partir das
  linhas no caminho da equipe). O PDF e o lote em ZIP funcionam para o leitor sem dados individuais.
- Risco de divergência entre a regra em SQL e a regra em TypeScript: mitigar com testes que rodam os
  mesmos dados nos dois caminhos e comparam os resultados.

### 7. Auditoria
- Tabela `acesso_log` (usuário, pesquisa, recorte, data) gravada pelas funções do leitor, para
  responder "quem viu o quê".

## Fases

| Fase | Entrega | Esforço aprox. |
|---|---|---|
| 1. Banco | papel `viewer`, `escopo_empresa`, bloqueio das tabelas, `get_dpa_projeto_leitor`, `get_dpa_painel` com mínimo e regra da subtração, testes SQL | 3 dias |
| 2. Tela | DTO agregado, caminho do leitor na página de resultados, PDF e lote a partir do DTO | 3 a 4 dias |
| 3. Complementos | curadoria de comentários, `acesso_log`, usuários por empresa | 2 dias |
| 4. Endurecimento | testes de isolamento com o leitor (script de impersonação), revisão de segurança, Supabase Pro e backup | 1 dia |

## Critérios de aceite
- Com a sessão do leitor, `select` em `dpa_participantes`, `dpa_respostas` e `dpa_projetos` devolve 0 linhas
  ou erro de permissão.
- Chamar `get_dpa_dashboard` e `get_dpa_dashboard_segmentos` como leitor falha.
- Leitor com escopo "Diastur" não obtém dados de outra empresa mesmo enviando filtros diferentes.
- Nenhuma resposta traz grupo com menos de 5 respondentes, nem permite deduzi-lo por subtração.
- Painel, PDF e ZIP do leitor coincidem com os da equipe para o mesmo recorte.
- Usuário `viewer` não vê "Participantes", Excel, PDF interno nem comentários brutos.

## Decisões em aberto
1. Haverá usuários **por empresa** já no início, ou só um acesso do grupo?
2. O cliente verá **comentários**? Se sim, quem faz a triagem e com que prazo?
3. Quantas pessoas do cliente terão login e quem as cadastra?
4. Prazo: antes de qual data os dados reais entram no sistema?

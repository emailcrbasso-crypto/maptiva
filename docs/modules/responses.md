# Responses Module — Maptiva

## Objetivo do módulo

O módulo de Responses é responsável por coletar, validar, persistir e finalizar as respostas submetidas pelos avaliadores em cada assignment.

No Maptiva, esse módulo transforma o assignment em dado real de avaliação. Ele recebe as respostas quantitativas e qualitativas do avaliador, garante que o preenchimento respeite o questionário e o contexto do assignment, e grava os dados de forma consistente para posterior consolidação analítica. [file:1]

## Papel do módulo no produto

O módulo de Responses é a camada de coleta efetiva do Maptiva.

Ele conecta:
- assignments;
- questionários;
- perguntas;
- experiência de preenchimento;
- submissão;
- persistência;
- conclusão operacional da unidade de coleta. [file:1]

Sem esse módulo, o sistema conseguiria mapear quem avalia quem, mas não conseguiria capturar o conteúdo da avaliação nem transformar o fluxo operacional em dados utilizáveis. [file:1]

## Problema que o módulo resolve

Em avaliações 180° e 360°, não basta enviar um link para um formulário. O sistema precisa garantir que:
- o avaliador veja o questionário correto;
- as respostas sejam consistentes com o assignment;
- a submissão aconteça com o menor atrito possível;
- o progresso seja rastreável;
- e a conclusão do assignment seja confiável. [file:1][web:387][web:390]

Sem um módulo robusto de Responses, surgem riscos como:
- respostas em questionário errado;
- duplicidade de envio;
- perda de dados;
- validações inconsistentes;
- baixa taxa de conclusão;
- contaminação do scoring com dados incompletos ou inválidos. [file:1][web:394][web:400]

## O que é uma response no Maptiva

No contexto do Maptiva, uma response representa a resposta dada a uma pergunta específica dentro de um assignment.

O conjunto de responses de um assignment forma a submissão completa daquele avaliador para aquele avaliado, naquela relação e naquele ciclo. [file:1]

Exemplo:
- Assignment: Ana avalia João como `peer`
- Pergunta 1: nota 4
- Pergunta 2: nota 5
- Pergunta 3: comentário textual
- Essas respostas são registradas como itens vinculados ao mesmo assignment. [file:1]

## Objetivos do módulo

Este módulo deve permitir que o sistema:

1. apresente o questionário correto ao avaliador;
2. valide cada resposta conforme o tipo da pergunta;
3. grave respostas por assignment e question_id;
4. suporte respostas quantitativas e qualitativas;
5. impeça duplicidade indevida;
6. marque o assignment como concluído ao final da submissão válida;
7. preserve dados suficientes para scoring, auditoria e análise posterior. [file:1]

## Escopo do módulo

### Incluído
- renderização de formulário a partir do assignment;
- validação das respostas;
- gravação de respostas por pergunta;
- submissão final;
- tratamento de campos obrigatórios;
- respostas quantitativas e textuais;
- atualização do status do assignment;
- proteção contra reenvio indevido;
- feedback de erro e sucesso. [file:1][web:387][web:390]

### Fora de escopo
- definição do template;
- mapeamento de quem avalia quem;
- geração de convites;
- cálculo de scores;
- aplicação analítica de anonimato;
- geração de relatórios;
- exportações. [file:1]

## Entidade principal: `responses`

### Função
Representa a resposta a uma pergunta específica dentro de um assignment.

### Campos principais
- `id`
- `tenant_id`
- `assignment_id`
- `question_id`
- `score`
- `text_answer`
- `created_at` [file:1]

### Responsabilidade
Persistir os dados enviados pelo avaliador de forma atômica, consistente e vinculada ao assignment correto. [file:1]

## Estrutura lógica da coleta

A lógica de coleta deve seguir esta hierarquia:

```text
Cycle
  -> Assignment
      -> Questionnaire
          -> Questions
              -> Responses
```

Essa estrutura garante que a resposta não exista isoladamente, mas sempre dentro de um contexto operacional válido. [file:1]

## Tipos de resposta suportados no MVP

### 1. Resposta de escala
Usada para perguntas quantitativas.

Campos usados:
- `score`

Regras:
- valor deve estar entre `scale_min` e `scale_max`;
- deve respeitar a configuração do template;
- pode permitir `N/A` se o template habilitar. [file:1]

### 2. Resposta textual
Usada para comentários qualitativos.

Campos usados:
- `text_answer`

Regras:
- pode ser obrigatória ou opcional;
- deve aceitar texto dentro de limites razoáveis;
- deve ser armazenada preservando o vínculo com a pergunta e o assignment. [file:1]

## Relação com o módulo de Assignments

O módulo de Responses depende integralmente do assignment para saber:
- quem está respondendo;
- para quem a resposta está sendo dada;
- qual é a relação;
- qual é o questionário válido;
- se a resposta ainda pode ser enviada. [file:1]

### Regra central
Responses não devem ser criadas “soltas”. Toda response deve estar vinculada a um assignment válido. [file:1]

## Relação com o questionário

O formulário apresentado ao avaliador deve ser derivado do questionário associado ao assignment.

### Isso significa:
- o assignment define qual questionário será exibido;
- o questionário define quais perguntas existem;
- cada pergunta aceita um tipo específico de resposta;
- o módulo de Responses só deve aceitar respostas que pertençam ao questionário esperado. [file:1]

Isso evita que o usuário envie dados fora de contexto ou incompatíveis com a estrutura do ciclo. [file:1][web:386]

## Regras de negócio importantes

### 1. Toda response pertence a um assignment
Responses só existem no contexto de um assignment válido. [file:1]

### 2. Toda response pertence implicitamente ao tenant e ciclo do assignment
O sistema deve manter consistência entre `tenant_id`, assignment e ciclo. [web:22][file:1]

### 3. Uma pergunta só pode ter uma resposta por assignment
Deve existir restrição lógica e técnica para impedir duplicidade.

### Restrição recomendada
`UNIQUE (assignment_id, question_id)` [file:1]

### 4. O assignment precisa estar em estado respondível
O sistema só deve aceitar submissão se o assignment estiver em estado permitido, normalmente `invited`. [file:1]

### 5. O questionário precisa ser compatível com o assignment
Não pode haver resposta para perguntas fora do questionário associado. [file:1]

### 6. A submissão deve ser atômica
A conclusão do assignment e a persistência das respostas precisam ocorrer de forma consistente, evitando estados quebrados. [file:1]

## Estrutura da submissão

Embora a tabela `responses` seja por item, a submissão do avaliador é o conjunto completo de respostas do assignment.

### Modelo conceitual
1. sistema carrega assignment e questionário;
2. avaliador responde;
3. frontend envia payload com respostas;
4. backend valida estrutura e conteúdo;
5. responses são gravadas;
6. assignment é marcado como `completed`;
7. sistema retorna confirmação. [file:1][web:395]

## Regras de validação

O módulo deve validar pelo menos:

- assignment válido;
- token válido, quando aplicável;
- status do assignment compatível com resposta;
- question_id pertencente ao questionário esperado;
- resposta obrigatória preenchida;
- score dentro da escala permitida;
- `text_answer` presente quando exigido;
- ausência de duplicidade;
- payload estruturalmente válido. [file:1][web:387][web:390]

## Estados do processo de resposta

Mesmo que o MVP não tenha uma tabela separada para sessão de resposta, o fluxo lógico do processo deve considerar estados operacionais.

### Estados lógicos do respondente
- acesso ao formulário;
- preenchimento;
- validação;
- submissão concluída;
- bloqueio pós-conclusão. [web:395]

### Observação
No MVP, esses estados podem ser refletidos pelo status do assignment e pelo comportamento da UI, sem exigir modelagem adicional complexa. [file:1]

## UX da coleta

A experiência de resposta deve priorizar clareza, confiança e rapidez de conclusão.

### Princípios recomendados
- formulário simples e focado;
- linguagem clara;
- introdução curta explicando contexto e confidencialidade;
- validação próxima do campo;
- mensagens de erro específicas;
- confirmação clara após envio. [web:387][web:390][web:394]

### Direções práticas
- evitar excesso de texto;
- reduzir distrações;
- mostrar apenas o necessário para responder;
- não exigir navegação complexa. [web:390][web:400]

## Estrutura da tela de resposta

A experiência de resposta deve conter, no mínimo:

1. contexto da avaliação;
2. explicação breve de confidencialidade;
3. perguntas do questionário;
4. validação dos campos;
5. ação de envio;
6. tela de confirmação. [web:394][web:400]

### Contexto mínimo recomendado
- nome da pessoa avaliada, quando apropriado;
- tipo de relação, se fizer sentido;
- tempo estimado;
- aviso sobre uso das respostas;
- instruções simples. [web:394]

## Erros e exceções

O módulo deve prever pelo menos estes cenários:

### 1. Token inválido
O formulário não deve carregar e o usuário deve ver mensagem clara.

### 2. Token expirado
O sistema deve bloquear submissão e orientar o próximo passo apropriado.

### 3. Assignment já concluído
O usuário não deve conseguir reenviar respostas sem política explícita.

### 4. Payload inválido
O sistema deve rejeitar com mensagem compreensível.

### 5. Falha de persistência
A operação não deve marcar o assignment como concluído se as respostas não forem gravadas corretamente. [file:1][web:387][web:390]

## Submissão e atomicidade

A submissão final deve ser tratada como operação transacional.

### Regra importante
Ou:
- todas as respostas válidas são salvas e o assignment vira `completed`;

ou:
- nada é concluído e o assignment continua respondível. [file:1]

Essa atomicidade é essencial para evitar casos em que o dashboard mostra conclusão, mas parte das respostas não foi persistida. [file:1][web:393]

## Feedback pós-submissão

Depois do envio, o sistema deve:
- confirmar claramente a conclusão;
- impedir duplicidade de envio;
- atualizar o assignment;
- refletir o progresso no ciclo. [file:1][web:395]

### Mensagem recomendada
Curta, humana e objetiva, sem expor detalhes internos. Boas práticas de formulário recomendam feedback claro e imediato após submissão. [web:387][web:390]

## Segurança e confidencialidade

As respostas são dados sensíveis e exigem tratamento cuidadoso.

### Regras principais
- acesso restrito ao assignment;
- gravação com `tenant_id` consistente;
- proteção contra leitura indevida;
- comentários qualitativos não devem ser expostos fora da política do tenant;
- identidade do avaliador anônimo não deve vazar no fluxo posterior. [file:1]

### Importante
O módulo de Responses coleta os dados, mas a política de visibilidade final será aplicada depois por analytics e reports. [file:1]

## Dependências do módulo

O módulo de Responses depende de:
- Assignments;
- Questionnaires;
- Questions;
- Tenant and Access ou fluxo de token validado. [file:1]

Ele serve de base para:
- Scoring and Analytics;
- dashboards operacionais de completude;
- relatórios;
- exportações. [file:1]

## Permissões do módulo

A lógica de acesso ao módulo se divide em dois tipos:

### 1. Avaliador via token
Pode:
- acessar apenas o assignment autorizado;
- visualizar apenas o questionário correspondente;
- submeter respostas daquele assignment. [file:1]

### 2. Usuário administrativo
Pode:
- consultar status de resposta conforme papel e política;
- não deve editar respostas livremente no MVP;
- pode visualizar progresso, mas a leitura detalhada de conteúdo deve obedecer regras posteriores de analytics e anonimato. [file:1][web:276]

## Auditoria e metadados

Mesmo no MVP, é útil registrar metadados mínimos do processo de resposta.

### Itens relevantes
- `created_at` das responses;
- `completed_at` do assignment;
- status final do assignment;
- origem de submissão, se necessário no futuro;
- logs de erro, quando houver. [file:1][web:395]

Esses dados ajudam em suporte, análise operacional e integridade do processo. [web:395]

## Riscos e cuidados

### 1. Duplicidade de envio
Sem restrição clara, o mesmo assignment pode gerar respostas duplicadas. [file:1]

### 2. Questionário incompatível
Se a resposta aceitar perguntas fora do assignment, o dataset fica contaminado. [file:1]

### 3. Validação ruim
Mensagens genéricas ou tardias aumentam abandono e erro de preenchimento. [web:387][web:390]

### 4. Conclusão inconsistente
Marcar assignment como concluído sem salvar tudo corretamente quebra confiança no sistema. [file:1]

### 5. Exposição indevida de texto
Comentários qualitativos podem conter conteúdo sensível e precisam de tratamento adequado nas etapas seguintes. [file:1]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- auto-save / draft;
- status `in_progress`;
- paginação do formulário;
- edição controlada pós-submissão;
- lógica condicional entre perguntas;
- tempo estimado por questionário;
- indicadores de abandono;
- observabilidade mais rica da jornada de resposta. [web:395][web:400]

## Métricas úteis do módulo

Algumas métricas importantes:
- taxa de conclusão por assignment;
- tempo médio de resposta;
- taxa de erro de submissão;
- abandono por formulário;
- taxa de expiração sem resposta;
- proporção de respostas qualitativas preenchidas. [web:394][web:400][file:1]

## Resumo final

O módulo de Responses é a camada de coleta efetiva do Maptiva. Ele recebe as respostas do avaliador dentro de um assignment válido, aplica validações, persiste dados quantitativos e qualitativos e conclui a unidade operacional da avaliação com segurança. Um desenho forte desse módulo é essencial para garantir qualidade do dado, confiabilidade da operação e base consistente para scoring, relatórios e futuras integrações. [file:1][web:387][web:395]
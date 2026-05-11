# Maptiva Grid Integration — Maptiva

## Objetivo do documento

Este documento define a integração entre o Maptiva e o Maptiva Grid.

O objetivo da integração é permitir que os dados consolidados do Maptiva alimentem uma camada posterior de leitura, calibração e visualização de Nine Box e talent review, sem acoplar o produto principal à lógica completa dessa etapa. Em integrações SaaS bem desenhadas, o contrato entre sistemas precisa deixar claro o que é enviado, como é enviado, quando é enviado e como isso será mantido ao longo do tempo. [web:268][web:301][web:454][web:460]

## Papel da integração na arquitetura

A integração com o Maptiva Grid existe para separar responsabilidades.

### Maptiva
Responsável por:
- cadastro de participantes;
- criação de templates;
- execução de ciclos;
- coleta de respostas;
- scoring e analytics consolidados;
- relatórios e exportações base. [file:1]

### Maptiva Grid
Responsável por:
- leitura analítica de performance e potencial;
- calibração;
- Nine Box;
- visualizações de posicionamento;
- apoio à decisão de talento. [file:1]

Essa separação evita que o Maptiva se torne pesado demais no núcleo operacional e permite que o Grid evolua como produto próprio. [file:1]

## Princípios da integração

### 1. Contrato explícito
A integração deve ter um contrato documentado de payload, campos, frequência e regras de compatibilidade. Em integrações B2B, tratar a interface como contrato reduz falhas e facilita evolução independente dos sistemas. [web:453][web:459][web:460]

### 2. Dados consolidados, não brutos
O Grid deve consumir dados já consolidados pelo módulo de scoring e analytics do Maptiva, e não respostas brutas. [file:1]

### 3. Versionamento
O payload de integração precisa ser versionado para permitir evolução sem quebrar consumidores. [web:427][web:460]

### 4. Segurança e governança
A integração deve respeitar autenticação, autorização, auditoria e políticas de acesso por tenant. [web:301][web:302][web:461]

### 5. Independência evolutiva
O Maptiva e o Grid devem poder evoluir em ritmos diferentes, desde que o contrato versionado continue compatível. [web:453][web:459]

## Escopo da integração

### Incluído
- export de perfis consolidados;
- export de indicadores analíticos;
- envio de dados por ciclo;
- envio de dados por participante;
- estrutura para performance/potential;
- suporte a leitura histórica;
- logs de integração;
- versionamento de payload. [file:1]

### Fora de escopo
- execução de coleta;
- criação de assignments;
- coleta de responses;
- processamento primário de scoring;
- permissões administrativas do Maptiva dentro do Grid. [file:1]

## Modelo de integração

A integração deve ser pensada como um fluxo de saída do Maptiva para o Grid, com possibilidade futura de sincronização bidirecional limitada.

### Fase 1
Export unidirecional do Maptiva para o Grid. [file:1]

### Fase 2
Possível retorno de anotações, calibrações ou marcações de leitura do Grid para o Maptiva, se o produto decidir suportar esse fluxo. [file:1]

### Recomendação
Começar com integração unidirecional para reduzir complexidade e risco de inconsistência. Em projetos de integração, começar com o fluxo mínimo necessário costuma facilitar validação e governança. [web:301][web:458][web:460]

## Quando a integração acontece

A integração pode ser disparada em momentos específicos:

- após o fechamento do ciclo;
- após a geração dos `score_snapshots`;
- após a geração do `participant_result_profiles`;
- sob demanda, com escopo autorizado;
- em lote programado, conforme configuração do tenant. [file:1]

### Recomendação para o MVP
Disparar somente após o fechamento do ciclo e a consolidação analítica estar pronta. [file:1]

## Unidades de envio

A integração deve trabalhar com duas unidades principais:

### 1. Cycle payload
Resumo de um ciclo fechado com informações agregadas.

### 2. Participant payload
Dados consolidados por participante, prontos para análise no Grid. [file:1]

## Entidades consumidas

A integração deve consumir preferencialmente:

- `participant_result_profiles`
- `score_snapshots`
- metadados do ciclo
- metadados do participante
- dados de relacionamento autorizados
- indicadores derivados úteis para talent review. [file:1]

## Payload principal

O payload pode ser estruturado em camadas.

### Envelope
- `integration_version`
- `tenant_id`
- `cycle_id`
- `generated_at`
- `source_system`
- `target_system` [web:427][web:460]

### Bloco de contexto
- nome do ciclo;
- período do ciclo;
- método aplicado;
- template de origem;
- status do ciclo;
- data de geração. [file:1]

### Bloco de participante
- `participant_id`
- nome;
- cargo;
- área;
- gestor;
- status organizacional;
- metadados relevantes. [file:1]

### Bloco analítico
- score geral;
- score por competência/dimensão;
- self score;
- manager score;
- peer score;
- subordinate score;
- blind spots;
- hidden strengths;
- indicadores adicionais. [file:1]

### Bloco de governança
- nível de visibilidade;
- status de anonimato;
- flags de supressão;
- versão do cálculo;
- versão do mapeamento. [file:1]

## Modelo conceitual do payload

Exemplo conceitual:

```json
{
  "integration_version": "v1",
  "tenant_id": "uuid",
  "cycle_id": "uuid",
  "source_system": "maptiva",
  "target_system": "maptiva-grid",
  "generated_at": "2026-05-07T13:00:00Z",
  "cycle": {
    "name": "Avaliação de Liderança 2026",
    "method": "360",
    "status": "closed"
  },
  "participant": {
    "id": "uuid",
    "full_name": "Maria Silva",
    "job_title": "Gerente",
    "department": "Comercial"
  },
  "analytics": {
    "overall_score": 4.2,
    "self_score": 4.5,
    "manager_score": 4.1,
    "peer_score": 4.0,
    "subordinate_score": 4.3,
    "blind_spot_count": 1,
    "hidden_strength_count": 2
  },
  "governance": {
    "visibility_status": "visible",
    "anonymity_applied": true,
    "analytics_version": "2026.05.01"
  }
}
```

Esse é apenas um exemplo conceitual de estrutura; o contrato final deve ser fechado na implementação real. [web:453][web:459][web:460]

## Versionamento do contrato

A integração precisa declarar explicitamente sua versão.

### Regras
- toda mudança estrutural relevante deve gerar nova versão;
- o Grid deve saber qual versão está consumindo;
- versões antigas podem coexistir por um período de migração. [web:427][web:459][web:460]

### Exemplo de estratégia
- `v1`: estrutura inicial para nine box básica;
- `v2`: inclusão de campos históricos;
- `v3`: inclusão de anotações de calibração, se existir. [web:460]

## Autenticação e autorização

A integração deve ser protegida por mecanismos próprios de sistema.

### Requisitos mínimos
- token de integração por tenant;
- escopo explícito;
- rotação de credenciais;
- revogação possível;
- registro de quem disparou ou autorizou o export. [web:301][web:302][web:461]

### Regra importante
Um tenant só pode exportar dados para o Grid do seu próprio contexto. [file:1]

## Frequência de sincronização

A integração pode operar em três modos.

### 1. Manual
Um usuário autorizado dispara a exportação.

### 2. Programado
A sincronização acontece em horários definidos.

### 3. Event-driven
A integração é acionada quando um ciclo é fechado ou um snapshot é gerado. [web:302][web:458][web:461]

### Recomendação para o MVP
Começar com manual ou event-driven após fechamento do ciclo. [file:1]

## Regras de consistência

### 1. Não exportar ciclos incompletos
O Grid deve consumir apenas ciclos fechados e consolidados. [file:1]

### 2. Não exportar respostas brutas
O contrato deve usar analytics já processado. [file:1]

### 3. Exportar somente o que foi autorizado
Dados ocultos por anonimato ou política de visibilidade não devem aparecer. [file:1]

### 4. Manter rastreabilidade
Cada export deve poder ser rastreado no Maptiva. [web:301][web:302]

## Campos sensíveis e governança

Alguns campos exigem cuidado extra:

- comentários textuais;
- identificação de grupos pequenos;
- detalhes de feedback anônimo;
- flags de visibilidade;
- dados que possam reidentificar avaliadores. [file:1]

### Recomendação
O contrato do Grid deve ser construído com foco em leitura calibrada e não em exposição total do dataset. [file:1]

## Erros e exceções

A integração deve prever os seguintes cenários:

### 1. Falha de autenticação
Export não autorizado.

### 2. Ciclo ainda aberto
Export bloqueado até fechamento.

### 3. Payload inválido
Contrato rejeitado por validação.

### 4. Falha de transmissão
Export deve poder ser reprocessado.

### 5. Versão incompatível
Grid deve sinalizar incompatibilidade de esquema. [web:453][web:459][web:460]

## Logs de integração

Cada export ou sync deve registrar:
- tenant;
- ciclo;
- versão do payload;
- timestamp;
- status de sucesso ou erro;
- origem da chamada;
- destino. [web:301][web:302][web:427]

## Relação com Nine Box

A integração com o Grid é o caminho natural para construir Nine Box sobre o Maptiva.

### O que precisa existir antes
- scores consolidados por pessoa;
- dimensão de performance/potential, ou dados suficientes para derivação;
- histórico por ciclo;
- regras de visibilidade e governança;
- estrutura de calibragem, se o Grid suportar. [file:1]

### O que o Maptiva não precisa resolver sozinho
- layout final da Nine Box;
- refinamento de célula;
- decisão de movimentação de talento;
- workflow de calibração completo. [file:1]

## Fluxos principais da integração

### Fluxo 1 — Exportar ciclo fechado
1. ciclo é fechado;
2. analytics são gerados;
3. usuário ou automação dispara export;
4. payload é montado;
5. Grid recebe os dados;
6. log de integração é gravado. [file:1]

### Fluxo 2 — Reexportar ciclo
1. ciclo é reprocessado ou corrigido;
2. nova versão de payload é gerada;
3. Grid recebe versão atualizada;
4. versão anterior permanece rastreável. [web:459][web:460]

## Dependências da integração

A integração depende de:
- Scoring and Analytics;
- Reports and Exports;
- controle de permissões;
- versionamento de schema;
- governança de tenant. [file:1]

## Próximos passos técnicos

Para implementar a integração com segurança, os próximos passos recomendados são:
1. definir o schema de export v1;
2. definir regras de versionamento;
3. definir autenticação da integração;
4. definir taxa e gatilho de envio;
5. implementar logs e auditoria;
6. implementar contrato de leitura no Grid. [web:454][web:460]

## Resumo final

O Maptiva Grid deve ser tratado como um produto downstream que consome dados já consolidados pelo Maptiva, por meio de um contrato explícito, versionado e governado. Essa integração prepara o ecossistema para Nine Box e talent review sem acoplar o núcleo operacional do Maptiva a essa camada posterior. [file:1][web:301][web:453][web:460]
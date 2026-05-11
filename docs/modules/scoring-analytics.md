# Scoring and Analytics Module — Maptiva

## Objetivo do módulo

O módulo de Scoring and Analytics é responsável por transformar respostas brutas em resultados consolidados, interpretáveis e utilizáveis para dashboards, relatórios, exportações e produtos futuros.

No Maptiva, esse módulo existe para sair do nível operacional da coleta e entregar uma camada analítica confiável. Ele calcula médias, organiza grupos de relação, aplica regras de anonimato, identifica gaps e produz snapshots consistentes para leitura posterior. [file:1]

## Papel do módulo no produto

O módulo de Scoring and Analytics é a ponte entre coleta e decisão.

Ele conecta:
- responses;
- assignments;
- templates;
- ciclos;
- regras de anonimato;
- relatórios;
- exportações;
- integração futura com o Maptiva Grid. [file:1]

Sem esse módulo, o sistema teria dados coletados, mas não conseguiria convertê-los em leitura estruturada para desenvolvimento, gestão e análise de talento. [file:1][web:401]

## Problema que o módulo resolve

Respostas brutas, isoladamente, não são um resultado de negócio. Elas precisam ser:
- agregadas;
- segmentadas;
- validadas;
- tratadas conforme regras metodológicas;
- convertidas em sinais legíveis. [web:401][web:405][web:408]

Sem uma camada analítica consistente, surgem problemas como:
- relatórios inconsistentes;
- cálculo manual fora do sistema;
- baixa confiabilidade metodológica;
- dificuldade de reaproveitar dados;
- fragilidade para integrar com produtos posteriores;
- alto custo de operação para RH e consultorias. [file:1][web:402][web:407]

## O que este módulo faz

Este módulo deve ser responsável por:

1. consolidar respostas quantitativas e qualitativas;
2. calcular médias e agregados por competência;
3. agrupar resultados por relação;
4. aplicar regras de anonimato;
5. destacar gaps relevantes;
6. identificar blind spots e hidden strengths;
7. gerar perfis consolidados por participante;
8. disponibilizar dados estruturados para relatórios e exportações;
9. preparar dados para integração futura com o Maptiva Grid. [file:1]

## O que este módulo não faz

Este módulo não deve ser responsável por:
- criar templates;
- mapear assignments;
- coletar respostas;
- renderizar relatórios finais;
- definir permissões de leitura na UI;
- executar Nine Box. [file:1]

Ele gera a camada analítica consumível; outros módulos exibem, exportam ou usam essa camada. [file:1]

## Princípios do módulo

### 1. Consolidado acima do bruto
Relatórios e integrações devem consumir resultados consolidados, não consultar respostas brutas diretamente. [file:1][web:408]

### 2. Reprodutibilidade
O mesmo conjunto de respostas, sob as mesmas regras, deve gerar o mesmo resultado consolidado. [web:408][web:409]

### 3. Documentação das regras
Cálculo, filtros, agrupamentos e supressões precisam ser documentados e previsíveis. [web:403][web:408]

### 4. Separação entre cálculo e apresentação
A camada analítica deve existir independentemente do layout do relatório ou da tela. [file:1][web:401]

### 5. Preparação para evolução
O módulo deve ser desenhado para permitir novas dimensões, comparações históricas e consumo por produtos futuros. [web:405][web:407][file:1]

## Entradas do módulo

As principais entradas são:

- ciclo;
- template aplicado;
- assignments válidos;
- responses válidas;
- competências;
- perguntas;
- relações configuradas;
- regras de anonimato;
- parâmetros de agrupamento e visibilidade. [file:1]

## Saídas do módulo

As principais saídas são:

- médias por competência;
- médias por grupo de relação;
- scores por dimensão;
- indicadores gerais por participante;
- perfis consolidados;
- sinais como blind spots e hidden strengths;
- snapshots para relatórios;
- dados exportáveis e integráveis. [file:1]

## Camadas analíticas do módulo

A lógica do módulo pode ser entendida em quatro níveis.

### 1. Resposta bruta
Cada resposta vinculada a pergunta e assignment. [file:1]

### 2. Agregação básica
Cálculo de médias por pergunta, competência e grupo. [web:405][web:415]

### 3. Consolidação interpretável
Aplicação de regras de agrupamento, anonimato e comparação entre self e demais grupos. [file:1]

### 4. Perfil final
Produção de snapshots e perfis consolidados por participante, prontos para relatórios e integração. [file:1]

## Entidades principais do módulo

As principais entidades analíticas são:

- `score_snapshots`
- `participant_result_profiles` [file:1]

## Entidade: `score_snapshots`

### Função
Armazenar resultados consolidados em nível analítico intermediário.

### Campos principais
- `id`
- `tenant_id`
- `cycle_id`
- `participant_id`
- `competency_id`
- `dimension_code`
- `relationship_group`
- `score_avg`
- `response_count`
- `visibility_status`
- `generated_at` [file:1]

### Papel
Servir como base estruturada para relatórios, visualizações e integrações. [file:1]

## Entidade: `participant_result_profiles`

### Função
Armazenar o perfil consolidado final do participante no ciclo.

### Campos principais
- `id`
- `tenant_id`
- `cycle_id`
- `participant_id`
- `overall_score`
- `self_score`
- `manager_score`
- `peer_score`
- `subordinate_score`
- `blind_spot_count`
- `hidden_strength_count`
- `report_json`
- `generated_at` [file:1]

### Papel
Resumir o resultado final da leitura daquele participante. [file:1]

## Pipeline conceitual de scoring

O módulo deve seguir um pipeline claro.

```text
Responses
  -> validação de consistência
  -> agregação por assignment / question / competência
  -> agrupamento por relationship group
  -> aplicação de políticas de anonimato
  -> cálculo de scores consolidados
  -> geração de snapshots
  -> geração de profiles
  -> disponibilização para reports / exports / integrations
```

Separar a análise em pipeline ajuda reprodutibilidade, manutenção e auditoria. Arquiteturas de scoring genéricas e extensíveis costumam se beneficiar dessa decomposição em etapas. [web:409][web:406]

## Tipos de cálculo do MVP

O MVP deve focar em cálculos simples, claros e metodologicamente defensáveis.

### Incluído no MVP
- média por competência;
- média por grupo de relação;
- média geral;
- contagem de respondentes por grupo;
- diferença entre self e others;
- identificação básica de blind spots;
- identificação básica de hidden strengths. [file:1]

### Fora do MVP
- modelos estatísticos avançados;
- benchmark externo sofisticado;
- análise preditiva;
- NLP avançado sobre texto;
- algoritmos de recomendação de desenvolvimento. [web:402][web:407]

## Agrupamento por relationship group

O módulo precisa consolidar scores respeitando grupos de relação.

### Grupos iniciais
- `self`
- `manager`
- `peer`
- `subordinate`
- `others` ou grupos customizados, quando necessário. [file:1]

### Observação
Em alguns casos, grupos pequenos podem ser fundidos ou ocultados conforme política de anonimato. [file:1]

## Regras de anonimato

O módulo deve aplicar anonimato como regra analítica, não apenas visual.

### Configurações principais
- anonimato por grupo;
- mínimo de respondentes por grupo;
- tratamento especial para `self`;
- tratamento especial para `manager`;
- agrupamento ou ocultação de grupos abaixo do mínimo. [file:1]

### Consequências
Se um grupo não atingir o `n_minimum`, o módulo deve:
- marcar `visibility_status` adequadamente;
- ocultar, fundir ou sinalizar o grupo;
- impedir que o relatório exponha leitura indevida. [file:1]

## Blind spots e hidden strengths

O módulo deve identificar sinais comparativos entre autoavaliação e percepção externa.

### Blind spot
Quando o `self_score` estiver significativamente acima do score consolidado dos demais grupos. [file:1]

### Hidden strength
Quando o score consolidado dos demais grupos estiver significativamente acima do `self_score`. [file:1]

### Observação metodológica
O limiar exato pode começar simples no MVP, mas deve ser explícito, configurável ou ao menos documentado. A transparência das regras de análise é importante para consistência e confiança. [web:403][web:408]

## Dimensões analíticas

O módulo deve estar preparado para consolidar competências em dimensões superiores.

### Exemplos
- liderança;
- execução;
- colaboração;
- comunicação. [file:1]

### Função
Essas dimensões são importantes porque:
- organizam relatórios executivos;
- reduzem complexidade de leitura;
- preparam compatibilidade futura com o Maptiva Grid. [file:1]

## Cálculo de score geral

O módulo deve produzir um score geral por participante, respeitando a política definida pelo template ou ciclo.

### Abordagens iniciais possíveis
- média simples de competências;
- média ponderada;
- média apenas de grupos visíveis. [web:415][file:1]

### Recomendação para o MVP
Começar com uma regra simples e bem documentada, preferencialmente média simples ou ponderação leve definida no template. Sistemas de scoring configuráveis costumam funcionar melhor quando começam com regras transparentes antes de evoluírem para modelos mais sofisticados. [web:409][web:415]

## Tratamento de respostas textuais

Respostas textuais não entram no cálculo numérico da mesma forma que scores, mas fazem parte da camada analítica.

### No MVP, o módulo deve:
- agrupar comentários por competência ou tema simples;
- preservar vínculo com relação de origem;
- respeitar anonimato;
- entregar material pronto para o módulo de Reports. [file:1][web:401]

### Não obrigatório no MVP
- sumarização com IA;
- classificação semântica avançada;
- modelagem de sentimento automática. [web:402][web:407]

## Regras de negócio importantes

### 1. Apenas assignments válidos entram no cálculo
Assignments cancelados, expirados ou incompletos não devem contaminar a análise. [file:1]

### 2. Apenas responses válidas entram na consolidação
O módulo deve ignorar dados estruturalmente inválidos ou inconsistentes. [web:408][file:1]

### 3. O cálculo é contextual ao ciclo
Scores não devem misturar dados de ciclos distintos. [file:1]

### 4. O cálculo precisa respeitar a configuração congelada do ciclo
Não se deve recalcular usando o estado atual do template se o ciclo foi criado sob outra configuração. [file:1]

### 5. A visibilidade é parte do resultado
Não basta calcular; é preciso registrar se aquele resultado é visível, agrupado ou oculto. [file:1]

## Fluxos principais do módulo

Os fluxos principais deste módulo são:

1. iniciar processamento analítico do ciclo;
2. consolidar responses válidas;
3. agrupar scores por competência e relação;
4. aplicar anonimato;
5. gerar snapshots;
6. gerar perfis consolidados;
7. disponibilizar dados para reports e exports;
8. reprocessar quando necessário, sob controle administrativo. [file:1]

## Fluxo 1 — Processar ciclo fechado

### Objetivo
Gerar a camada analítica quando a coleta termina.

### Passos
1. ciclo muda para `closed`;
2. sistema seleciona assignments válidos;
3. busca responses válidas;
4. executa pipeline de consolidação;
5. grava snapshots;
6. grava perfis finais. [file:1]

### Resultado esperado
O ciclo passa a ter resultados analíticos estruturados disponíveis. [file:1]

## Fluxo 2 — Reprocessar analytics

### Objetivo
Permitir recalcular resultados em caso de correção ou mudança autorizada.

### Regras
- deve ser operação restrita;
- precisa de auditoria;
- deve preservar consistência do histórico;
- idealmente deve versionar ou ao menos registrar nova geração. [web:408][web:409][file:1]

## Dependências do módulo

O módulo de Scoring and Analytics depende de:
- Templates;
- Cycles;
- Assignments;
- Responses;
- regras de anonimato e exibição. [file:1]

Ele serve de base para:
- Reports and Exports;
- dashboards analíticos;
- integrações;
- Maptiva Grid. [file:1][web:407]

## Permissões do módulo

O cálculo e reprocessamento devem ser restritos.

### Perfis com acesso esperado
- `owner`
- `admin`
- `hr` [file:1]

### Ações sensíveis
- disparar cálculo;
- reprocessar;
- visualizar snapshots brutos;
- exportar analytics consolidados. [file:1][web:276]

### Ações de leitura limitada
- `manager` e `analyst` podem acessar resultados já autorizados pela política do tenant, mas não necessariamente a camada analítica completa. [web:276][file:1]

## Auditoria e rastreabilidade

O módulo deve registrar:
- quando o cálculo rodou;
- para qual ciclo;
- por qual versão de regra;
- por qual usuário ou processo;
- quantos registros foram processados;
- se houve falha ou supressão relevante. [web:408][web:411]

A documentação de análise e transformação é importante para replicabilidade e interpretação correta dos resultados. [web:403][web:408]

## Riscos e cuidados

### 1. Misturar bruto com consolidado
Se relatórios lerem diretamente respostas brutas, a consistência do produto se perde. [file:1][web:408]

### 2. Anonimato aplicado só na UI
Se a política de visibilidade não estiver no dado analítico, o risco de vazamento aumenta. [file:1]

### 3. Regras implícitas demais
Se blind spots, pesos e agrupamentos não forem claros, o produto perde credibilidade metodológica. [web:403][web:408]

### 4. Reprocessamento sem controle
Recalcular resultados sem auditoria pode quebrar confiança histórica. [web:409][file:1]

### 5. Acoplamento com Nine Box cedo demais
O módulo deve preparar dados para o Maptiva Grid, mas não assumir toda a lógica de talent review neste estágio. [web:17][web:25]

## Backlog futuro do módulo

Possíveis evoluções futuras:
- benchmarking longitudinal;
- comparação entre ciclos;
- score por tendência histórica;
- análises por área e nível;
- sumarização de comentários com IA;
- insights automáticos;
- readiness mais avançado para Nine Box e performance/potential mapping. [web:402][web:405][web:407]

## Métricas úteis do módulo

Algumas métricas importantes:
- tempo de processamento por ciclo;
- taxa de ciclos processados sem erro;
- quantidade de grupos ocultados por anonimato;
- consistência entre cycles e snapshots;
- uso de relatórios baseados na camada consolidada;
- volume de reprocessamentos. [web:401][web:408][file:1]

## Resumo final

O módulo de Scoring and Analytics é a camada que transforma respostas em valor de produto no Maptiva. Ele consolida dados, aplica regras metodológicas, protege anonimato, produz snapshots e perfis interpretáveis e disponibiliza uma base confiável para relatórios, exportações e integração futura com o Maptiva Grid. Um desenho forte desse módulo é essencial para garantir credibilidade analítica, escalabilidade e continuidade do ecossistema do produto. [file:1][web:401][web:409]
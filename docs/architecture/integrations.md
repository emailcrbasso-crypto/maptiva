# Integrations — Maptiva

## Objetivo deste documento

Este documento descreve a estratégia de integrações do Maptiva, cobrindo exportações, APIs, serviços externos, padrões de troca de dados e a preparação da plataforma para interoperabilidade futura.

O foco principal é garantir que o Maptiva:
- consiga se integrar com serviços operacionais essenciais;
- produza dados analíticos reutilizáveis;
- mantenha segurança, auditoria e previsibilidade;
- e se conecte futuramente ao Maptiva Grid sem criar acoplamento indevido entre os dois produtos. [web:268][web:301][web:304]

## Princípios de integração

A estratégia de integração do Maptiva deve seguir estes princípios:

### 1. Dados consolidados primeiro
Integrações externas não devem depender diretamente das respostas brutas quando o objetivo for analytics, relatório ou leitura executiva. O padrão preferido é integrar a partir da camada consolidada. [file:1][web:308]

### 2. Segurança e governança por padrão
Toda integração deve considerar autenticação, autorização, trilha de auditoria, criptografia em trânsito e escopo mínimo de dados. Em SaaS, cada ponto de integração é também um ponto de risco. [web:301][web:303]

### 3. Construção em camadas
As integrações devem evoluir em estágios:
1. export manual;
2. export estruturado;
3. API controlada;
4. automação entre produtos. [web:306]

### 4. Baixo acoplamento
Maptiva e Maptiva Grid devem se comunicar por contratos de dados estáveis, não por dependência direta de banco, UI ou lógica interna compartilhada. [web:304][web:308]

### 5. Documentação viva
Campos, payloads, autenticação, fluxos e erros precisam ser documentados e mantidos atualizados. Documentação de integração desatualizada costuma gerar mais dano do que ausência de documentação. [web:268][web:306]

## Visão geral das integrações do Maptiva

No estágio inicial, o Maptiva terá quatro grandes grupos de integração:

1. integrações de comunicação;
2. integrações de exportação de dados;
3. integrações entre produtos do ecossistema Maptiva;
4. integrações futuras com sistemas externos corporativos. [web:300][web:304]

## Grupo 1 — Integrações de comunicação

### Objetivo
Permitir operação dos ciclos por envio de convites, lembretes e notificações.

### Casos de uso
- envio de convite para avaliadores;
- envio de lembrete para assignments pendentes;
- envio de notificações administrativas;
- comunicação de fechamento ou disponibilidade de relatórios. [file:1]

### Tipo de integração
- serviço de e-mail transacional;
- eventualmente webhook para automações futuras.

### Dados trocados
- nome do ciclo;
- nome do participante;
- link seguro de resposta;
- status do assignment;
- datas relevantes;
- mensagens parametrizadas por tenant. [file:1]

### Regras
- links devem ser assinados ou protegidos;
- o conteúdo do e-mail deve respeitar branding e idioma do tenant quando aplicável;
- logs de envio devem ser auditáveis. [web:301][web:302]

## Grupo 2 — Exportações de dados

### Objetivo
Permitir que clientes, consultorias e sistemas downstream consumam os resultados gerados pelo Maptiva.

### Formatos iniciais
- CSV
- XLSX
- JSON estruturado [file:1][web:308]

### Tipos de exportação
- export operacional de participantes e status;
- export consolidado por participante;
- export por competência;
- export executivo por ciclo;
- export preparado para consumo pelo Maptiva Grid. [file:1][web:308]

### Regra central
Exports devem privilegiar dados consolidados, com estrutura estável e rastreável. [file:1][web:303]

## Grupo 3 — Integração com Maptiva Grid

### Objetivo
Permitir que o Maptiva Grid consuma dados estruturados produzidos pelo Maptiva, especialmente para Nine Box, talent review e calibração.

### Estratégia
O Maptiva Grid deve ser tratado como um produto separado, consumidor de dados, e não como parte interna da mesma aplicação. [web:304][web:308]

### O que o Maptiva entrega ao Grid
- identificação do tenant;
- identificação do ciclo;
- identificação do participante;
- scores consolidados;
- scores por dimensão;
- metadados organizacionais relevantes;
- indicadores necessários para leitura gerencial. [web:17][file:1]

### O que o Maptiva não entrega por padrão
- respostas brutas irrestritas;
- identidade de avaliadores anônimos;
- dados sensíveis sem necessidade de uso;
- acesso direto à base transacional. [file:1][web:301]

### Modelo recomendado
Primeiro estágio:
- export manual em JSON/CSV.

Segundo estágio:
- endpoint autenticado de export por ciclo.

Terceiro estágio:
- integração automatizada entre produtos, com versionamento de payload e trilha de sincronização. [web:303][web:306]

## Grupo 4 — Integrações externas futuras

Essas integrações não precisam entrar completas no MVP, mas o design atual deve permitir sua evolução.

### Possíveis integrações futuras
- HRIS / sistema de RH;
- diretórios corporativos;
- ERP ou bases mestre de colaboradores;
- BI / data warehouse;
- ferramentas de comunicação;
- automações via webhook;
- SSO e identidade corporativa. [web:300][web:305][web:312]

### Objetivo dessas integrações
- evitar cadastro manual;
- importar estrutura organizacional;
- sincronizar participantes;
- ampliar analytics;
- encaixar o Maptiva em ecossistemas corporativos maiores. [web:302][web:312]

## Padrões de integração recomendados

### 1. API-first quando houver integração contínua
Sempre que a integração precisar ser recorrente, rastreável e automatizável, o ideal é expor uma interface estável por API. [web:303][web:311]

### 2. Export-first no MVP
No início, exportações controladas podem resolver bem o problema sem aumentar a complexidade prematuramente. [web:306][web:309]

### 3. Contratos versionados
Payloads e endpoints devem ter versionamento explícito para evitar quebra quando o modelo evoluir. [web:303]

### 4. Idempotência
Integrações que criem ou atualizem dados devem ser desenhadas para suportar reprocessamento sem efeitos colaterais imprevisíveis. [web:303]

### 5. Logging e monitoramento
Toda integração relevante deve registrar execução, erros, tentativas, status e timestamps. [web:302][web:303][web:306]

## Tipos de dados integráveis

O Maptiva deve organizar os dados de integração em quatro grupos:

### 1. Dados de referência
Exemplos:
- tenant;
- template;
- ciclo;
- competência;
- dimensão;
- relationship type.

### 2. Dados operacionais
Exemplos:
- participante;
- assignment;
- status de convite;
- progresso do ciclo.

### 3. Dados analíticos
Exemplos:
- score médio;
- score por grupo;
- gap;
- blind spot;
- hidden strength;
- score por dimensão;
- score geral. [file:1]

### 4. Dados de auditoria
Exemplos:
- data de geração do export;
- origem da integração;
- usuário solicitante;
- versão do payload;
- status do processamento. [web:301][web:306]

## Contrato de saída recomendado para Maptiva Grid

A integração com o Maptiva Grid deve trabalhar com um contrato de saída previsível.

### Estrutura conceitual do payload

```json
{
  "version": "v1",
  "tenant": {
    "id": "tenant_uuid",
    "name": "Example Tenant"
  },
  "cycle": {
    "id": "cycle_uuid",
    "name": "Leadership Review 2026",
    "method": "360",
    "closed_at": "2026-05-01T12:00:00Z"
  },
  "participant": {
    "id": "participant_uuid",
    "name": "Person Name",
    "email": "person@example.com",
    "department": "Sales",
    "job_title": "Manager"
  },
  "scores": {
    "overall": 4.2,
    "self": 4.7,
    "manager": 4.1,
    "peer": 3.9,
    "subordinate": 4.3
  },
  "dimensions": [
    {
      "code": "leadership",
      "score": 4.4
    },
    {
      "code": "execution",
      "score": 3.8
    }
  ],
  "signals": {
    "blind_spot_count": 2,
    "hidden_strength_count": 1
  },
  "metadata": {
    "exported_at": "2026-05-07T10:00:00Z",
    "source": "maptiva"
  }
}
```

Esse contrato é apenas uma referência conceitual, mas mostra o tipo de separação que a integração deve preservar: dados organizados, consolidados e sem dependência de resposta bruta. [web:303][web:308]

## Modelo de autenticação para integrações

### No MVP
- export manual autenticado por usuário administrativo;
- acesso via painel interno;
- geração de arquivos ou payloads controlados. [web:306]

### Pós-MVP
- tokens de integração por tenant;
- escopos específicos de leitura;
- endpoints com autenticação forte;
- expiração e rotação de credenciais;
- trilha de auditoria por chave de integração. [web:301][web:303]

## Estratégia de autorização

Integrações devem respeitar as mesmas regras de segurança do produto principal:

- apenas usuários ou sistemas autorizados podem gerar exportações;
- export sensível deve ser restrito por papel;
- o payload deve conter apenas o mínimo necessário;
- dados anônimos ou protegidos não devem ser reidentificados por integração. [web:301][web:303]

## Registro e auditoria

Cada integração relevante deve ter rastreabilidade.

### Campos importantes de log
- tipo da integração;
- sistema de destino;
- usuário ou serviço que iniciou;
- data/hora;
- status;
- número de registros;
- erros encontrados;
- versão do contrato. [web:301][web:302][web:306]

### Objetivo
- diagnosticar falhas;
- facilitar suporte;
- comprovar governança;
- reduzir risco em integrações recorrentes. [web:301]

## Tratamento de erros

A arquitetura de integração do Maptiva deve prever falhas como cenário normal, não excepcional. Tratamento robusto de erro e feedback útil são apontados como práticas fundamentais em APIs e integrações SaaS. [web:303][web:306]

### Regras recomendadas
- erros devem retornar status claros;
- payload inválido deve ser rejeitado com mensagem legível;
- integrações assíncronas devem registrar falhas e possibilidade de reprocessamento;
- exports quebrados não devem ser tratados como sucesso parcial silencioso. [web:303]

## Versionamento

Toda interface de integração relevante deve ser versionada.

### O que versionar
- endpoints;
- payloads;
- formatos de export;
- contratos para o Maptiva Grid. [web:303][web:304]

### Regra
Mudanças incompatíveis devem criar nova versão, não sobrescrever silenciosamente a versão anterior. [web:303]

## O que entra no MVP

No MVP, o Maptiva deve suportar:

- envio de e-mails transacionais;
- export CSV/XLSX;
- export JSON consolidado;
- registro básico de exports;
- estrutura inicial de payload para Maptiva Grid. [file:1][web:306][web:308]

## O que fica fora do MVP

Ficam fora do MVP:

- sync bidirecional com HRIS;
- webhooks complexos;
- marketplace de integrações;
- iPaaS embutido;
- API pública completa;
- sincronização automática contínua com múltiplos sistemas;
- painel avançado de gestão de integrações. [web:300][web:306][web:309]

## Sequência recomendada de evolução

### Fase 1 — Operacional
- e-mails;
- exports básicos;
- logs simples.

### Fase 2 — Estruturada
- export JSON versionado;
- contrato de dados para Maptiva Grid;
- reprocessamento de export.

### Fase 3 — Programática
- endpoints autenticados;
- tokens de integração;
- observabilidade ampliada.

### Fase 4 — Ecossistema
- integrações externas recorrentes;
- sync parcial com HRIS;
- eventos e automações. [web:303][web:306]

## Resumo final

A estratégia de integrações do Maptiva deve começar simples, segura e orientada a dados consolidados. O produto precisa sair do MVP com exportações úteis, governança mínima e um contrato claro de saída para o Maptiva Grid, preservando baixo acoplamento, versionamento e capacidade de evolução para integrações mais maduras no futuro. [web:268][web:301][web:303]
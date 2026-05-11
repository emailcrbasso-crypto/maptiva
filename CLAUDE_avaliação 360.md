# CLAUDE.md — Avaliação 360° Digital (CR BASSO)

## Visão Geral do Projeto

Sistema web completo para condução de ciclos de Avaliação 360° para grupos de até 50 participantes. O sistema gerencia quem avalia quem, coleta as respostas via magic links (sem senha), e gera automaticamente 4 níveis de relatórios exportáveis em PDF e Excel/CSV.

**Stack obrigatória:**
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend/DB: Supabase (Postgres + Auth + Edge Functions + Storage)
- Deploy: Vercel
- PDF: `@react-pdf/renderer` + captura de gráficos via `html2canvas`
- Excel: `xlsx` (SheetJS)
- Charts: `recharts` (radar, bar, heatmap)
- Email: Resend (SMTP para magic links e lembretes)

---

## Arquitetura de Dados — Schema Supabase

### Tabela: `cycles`
Representa um ciclo de avaliação (ex: "360° Q2 2025").

```sql
CREATE TABLE cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                        -- "Ciclo 360° Q2 2025"
  company_name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',               -- draft | active | closed
  deadline TIMESTAMPTZ,
  n_minimum INT DEFAULT 3,                   -- regra de anonimato
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: `competencies`
Competências avaliadas no ciclo.

```sql
CREATE TABLE competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- "Comunicação", "Liderança"...
  description TEXT,
  order_index INT DEFAULT 0
);
```

### Tabela: `participants`
Todos os participantes do ciclo (avaliados).

```sql
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,                  -- usado no heatmap
  role TEXT,
  manager_id UUID REFERENCES participants(id), -- quem é o gestor direto
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: `evaluators`
Define quem avalia quem e em qual papel.

```sql
CREATE TABLE evaluators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID REFERENCES cycles(id) ON DELETE CASCADE,
  evaluated_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,               -- 'self' | 'manager' | 'peer' | 'subordinate'
  magic_token UUID DEFAULT gen_random_uuid() UNIQUE,
  completed_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: `responses`
Respostas numéricas por competência.

```sql
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id UUID REFERENCES evaluators(id) ON DELETE CASCADE,
  competency_id UUID REFERENCES competencies(id) ON DELETE CASCADE,
  score INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(evaluator_id, competency_id)
);
```

### Tabela: `comments`
Respostas qualitativas (dissertativas) por competência.

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator_id UUID REFERENCES evaluators(id) ON DELETE CASCADE,
  competency_id UUID REFERENCES competencies(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Regras de Negócio Críticas

### 1. Regra N-Mínimo (Anonimato)
- Se um grupo de avaliadores (ex: pares) tiver **menos de 3 respondentes**, as notas desse grupo NÃO aparecem separadas no relatório individual.
- Nesses casos, as notas são aglutinadas na **média geral** sem identificar a origem.
- **Exceção**: A nota do `manager` (gestor direto) SEMPRE aparece individualizada, independente do N-mínimo.
- A autoavaliação (`self`) sempre aparece individualizada.

```typescript
// Lógica de cálculo — aplicar antes de montar qualquer relatório
function applyNMinimum(scores: GroupedScores, nMin: number): SafeScores {
  const safe: SafeScores = {};
  let mergePool: number[] = [];

  for (const [relationship, values] of Object.entries(scores)) {
    if (relationship === 'self' || relationship === 'manager') {
      safe[relationship] = values; // sempre exibe separado
    } else if (values.length >= nMin) {
      safe[relationship] = values; // grupo seguro, exibe separado
    } else {
      mergePool.push(...values);   // insuficiente → aglutina
    }
  }

  if (mergePool.length > 0) {
    safe['merged'] = mergePool;    // aparece como "Outros" no relatório
  }

  return safe;
}
```

### 2. Cálculo de Pontos Cegos e Forças Ocultas
```typescript
// Threshold: diferença >= 1.0 ponto é considerada significativa
const BLIND_SPOT_THRESHOLD = 1.0;

function calculateGaps(selfScore: number, othersAvg: number) {
  const diff = selfScore - othersAvg;
  if (diff >= BLIND_SPOT_THRESHOLD)  return 'blind_spot';   // Ponto Cego
  if (diff <= -BLIND_SPOT_THRESHOLD) return 'hidden_strength'; // Força Oculta
  return 'aligned';
}
```

### 3. Magic Links (Acesso sem Senha)
- Cada linha de `evaluators` tem um `magic_token` UUID único.
- URL de acesso: `/avaliar/{magic_token}`
- Ao acessar, o sistema verifica se `completed_at` é null → exibe formulário.
- Ao completar, seta `completed_at = NOW()` e redireciona para tela de agradecimento.
- O token é de uso único: após `completed_at` preenchido, o formulário fica bloqueado.

### 4. Importação da Matriz (Planilha)
- O admin faz upload de um `.xlsx` com colunas: `avaliado_email`, `avaliador_email`, `relacao`
- O sistema valida, cria os registros em `evaluators` e dispara os magic links por email.
- Relações aceitas: `self`, `manager`, `peer`, `subordinate`

---

## Estrutura de Pastas do Projeto

```
src/
├── components/
│   ├── charts/
│   │   ├── RadarChart.tsx          # recharts — radar de competências
│   │   ├── HeatmapChart.tsx        # heatmap departamento × competência
│   │   └── BarComparison.tsx       # comparativo de liderados
│   ├── reports/
│   │   ├── IndividualReport.tsx    # PDF individual (react-pdf)
│   │   ├── TeamReport.tsx          # PDF consolidado do time
│   │   └── ExecutiveReport.tsx     # PDF executivo / heatmap
│   └── ui/                         # componentes de interface
├── pages/
│   ├── admin/
│   │   ├── Dashboard.tsx           # status geral do ciclo
│   │   ├── CycleSetup.tsx          # configurar ciclo + importar planilha
│   │   └── Reports.tsx             # tela de geração de relatórios
│   ├── eval/
│   │   └── [token].tsx             # formulário de avaliação (magic link)
│   └── index.tsx
├── lib/
│   ├── supabase.ts                 # cliente Supabase
│   ├── calculations.ts             # médias, gaps, n-mínimo
│   ├── pdf-generator.ts            # orquestra geração de PDF
│   └── excel-export.ts             # data dump Excel
└── hooks/
    ├── useCycle.ts
    └── useParticipantReport.ts
```

---

## Módulo de Relatórios — Especificação Detalhada

### A) Relatório Individual (PDF por participante)

**Seções obrigatórias:**

1. **Capa** — Nome do avaliado, cargo, departamento, data do ciclo, logo da empresa.

2. **Gráfico de Radar** — Renderizar via Recharts no browser, capturar com `html2canvas`, embutir como imagem base64 no PDF.
   - Séries: Autoavaliação (linha azul tracejada), Gestor (linha laranja), Pares (linha verde), Liderados (linha roxa)
   - Eixos: uma aresta por competência, escala 1–5

3. **Matriz de Gaps** — Tabela com colunas: Competência | Autoavaliação | Média Outros | Diferença | Classificação
   - Células coloridas: Ponto Cego = vermelho, Força Oculta = verde, Alinhado = neutro

4. **Ranking de Competências**
   - Top 3 Maiores Notas (Fortalezas) com ícone ⭐
   - Top 3 Menores Notas (Oportunidades) com ícone 🎯
   - Usar média geral (todos os avaliadores)

5. **Extrato de Comentários** — Agrupados por competência. Comentários de pares e liderados aparecem misturados (sem identificar autor). Comentários do gestor podem aparecer separados com label "Gestor Direto".

**Implementação do PDF:**
```typescript
// Estratégia de geração
// 1. Renderizar gráficos em um <div> offscreen
// 2. Capturar via html2canvas → base64
// 3. Passar base64 para @react-pdf/renderer como <Image>
// 4. Gerar blob do PDF → download ou Storage do Supabase

async function generateIndividualPDF(participantId: string, cycleId: string) {
  const data = await fetchReportData(participantId, cycleId);
  const chartImage = await captureChartAsBase64('radar-chart-offscreen');
  const pdfBlob = await pdf(<IndividualReportPDF data={data} chartImage={chartImage} />).toBlob();
  return pdfBlob;
}
```

### B) Relatório Consolidado do Time (PDF por gestor)

- **Média da equipe** por competência (barra horizontal)
- **Tabela comparativa**: linhas = liderados, colunas = competências, células = nota média recebida
- Destacar quem está acima/abaixo da média do time com cor

### C) Relatório Executivo / Heatmap

- **Heatmap**: linhas = departamentos, colunas = competências
  - Verde: média ≥ 4.0 | Amarelo: 3.0–3.9 | Vermelho: < 3.0
- **Ranking organizacional**: competências com menor média em toda a empresa (top 5 gaps)
- Renderizar heatmap via recharts/custom SVG → capturar → embutir no PDF

### D) Data Dump Excel

```typescript
// Estrutura da planilha Excel exportada
// Aba 1: "Médias por Participante"
// Colunas: Nome | Departamento | Cargo | [Competência1 - Auto] | [Competência1 - Gestor] | [Competência1 - Pares] | [Competência1 - Liderados] | [Competência1 - Média Geral] | ... (repetir para cada competência)

// Aba 2: "Médias por Departamento"
// Colunas: Departamento | [Competência1 - Média] | [Competência2 - Média] | ...

// Aba 3: "Respostas Brutas" (apenas para admin)
// Todas as respostas com evaluator_id anônimo (sem nome do avaliador)
```

---

## Dashboard Admin — Funcionalidades

### Tela principal do ciclo (`/admin/cycles/{cycleId}`)

**Cards de status:**
- Total de participantes
- % de conclusão geral (avaliações completas / total)
- Avaliações pendentes (número)
- Prazo restante

**Tabela de status por participante:**
```
Nome | Dept | Autoav. | Gestor | Pares (X/Y) | Liderados (X/Y) | Total | Ação
João Silva | Vendas | ✅ | ✅ | 2/3 | 1/2 | 75% | [Lembrar]
```
- Botão "Lembrar" dispara email individual para avaliadores pendentes daquele avaliado
- Botão "Lembrar Todos Pendentes" em massa

### Envio de lembretes (Edge Function)
```typescript
// supabase/functions/send-reminders/index.ts
// Consulta evaluators onde completed_at IS NULL
// Envia email com magic link para cada um
// Registra email_sent_at = NOW()
// Rate limit: não enviar para o mesmo avaliador mais de 1x por dia
```

---

## Fluxo de Uso (User Journey)

```
Admin
  │
  ├─ Cria ciclo (nome, empresa, prazo, competências)
  ├─ Faz upload da planilha matriz (avaliado × avaliador × relação)
  ├─ Sistema cria evaluators + gera magic_tokens
  ├─ Dispara emails com magic links
  │
  │   Avaliador (recebe email)
  │     └─ Clica no magic link → /avaliar/{token}
  │         └─ Preenche scores 1–5 por competência + comentários
  │         └─ Confirma → completed_at registrado → "Obrigado!"
  │
  ├─ Admin monitora dashboard (% conclusão)
  ├─ Admin dispara lembretes para pendentes
  ├─ Admin fecha o ciclo (status = 'closed')
  │
  └─ Admin gera relatórios
       ├─ PDF Individual (por participante)
       ├─ PDF Consolidado do Time (por gestor)
       ├─ PDF Executivo / Heatmap
       └─ Data Dump Excel (todos os dados)
```

---

## Variáveis de Ambiente (.env)

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # apenas Edge Functions
RESEND_API_KEY=re_...              # envio de emails
VITE_APP_URL=https://360.crbasso.com.br
```

---

## Ordem de Implementação Recomendada

1. **Schema Supabase** — rodar migrations, configurar RLS
2. **Autenticação admin** — login com email/senha para admin (não magic link)
3. **Cadastro de ciclo** — criar ciclo, competências, participantes
4. **Importação da planilha matriz** — upload xlsx → criar evaluators
5. **Envio de magic links** — Edge Function Resend
6. **Formulário de avaliação** — `/avaliar/[token]` — scores + comentários
7. **Dashboard de status** — tabela de progresso + lembretes
8. **Engine de cálculos** — médias, n-mínimo, gaps, rankings
9. **Relatório Individual PDF** — o mais complexo, prioridade máxima
10. **Relatório Consolidado do Time PDF**
11. **Relatório Executivo / Heatmap PDF**
12. **Data Dump Excel**
13. **Polimento de UI** — tema visual, responsividade, loading states

---

## Restrições e Decisões de Arquitetura

- **NUNCA** usar `<form>` HTML nativo — usar `onSubmit` via React state
- **NUNCA** expor `service_role_key` no frontend — apenas em Edge Functions
- **RLS obrigatório**: avaliador só acessa seus próprios formulários via magic_token
- PDF gerado no **browser** (client-side) para os 3 relatórios principais — evita timeout em Edge Functions com 50 PDFs simultâneos
- Data Dump Excel também gerado client-side via SheetJS
- Gráficos renderizados em `<div>` com `visibility: hidden` antes da captura — nunca `display: none` (quebra o canvas)
- Comentários de pares e liderados **SEMPRE misturados** antes de renderizar — nunca separar por autor nesses grupos
- Threshold de gap padrão = 1.0 ponto — pode ser configurável por ciclo no futuro

---

## Comandos de Setup

```bash
# Criar projeto
npm create vite@latest avaliacao-360 -- --template react-ts
cd avaliacao-360
npm install

# Dependências principais
npm install @supabase/supabase-js
npm install @react-pdf/renderer
npm install html2canvas
npm install recharts
npm install xlsx
npm install resend
npm install react-router-dom
npm install tailwindcss @tailwindcss/vite

# Supabase CLI
npx supabase init
npx supabase db push   # rodar migrations
```

---

## Contato e Contexto do Projeto

- **Cliente:** CR BASSO — empresa de treinamento corporativo
- **Demanda inicial:** 50 participantes por ciclo
- **Base existente:** DPA (Diagnóstico Prévio Anônimo) — reutilizar lógica de magic links e formulários anônimos
- **Diferencial comercial:** qualidade visual e automação dos relatórios finais

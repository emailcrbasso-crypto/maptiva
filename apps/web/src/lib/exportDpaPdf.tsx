/**
 * exportDpaPdf.tsx
 * Relatório executivo PDF do Diagnóstico Prévio Anônimo.
 * Gerado com @react-pdf/renderer.
 */

import {
  Document, Page, Text, View, StyleSheet, pdf, Image,
} from '@react-pdf/renderer'
import type { PdfBranding } from './exportReportPdf'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pergunta {
  id:         string
  texto:      string
  tipo:       'escala_5' | 'texto_livre' | 'multipla_escolha'
  opcoes?:    string[]
}

interface DpaConfig {
  label_unidade: string
  perguntas:     Pergunta[]
}

interface DpaProject {
  id:        string
  nome:      string
  descricao: string | null
  status:    string
  config:    DpaConfig
}

interface UnidadeStat {
  unidade:     string
  total:       number
  respondidos: number
}

interface Resposta {
  id:            string
  unidade:       string | null
  respondido_em: string | null
  respostas:     Record<string, string | number | string[]>
}

interface DashboardData {
  total_participantes: number
  total_respondidos:   number
  taxa_resposta:       number
  label_unidade:       string
  por_unidade:         UnidadeStat[]
  respostas:           Resposta[]
}

// ─── Modo do relatório ──────────────────────────────────────────────────────────
// 'interno'   → uso da CR BASSO: mostra respostas de texto livre e write-ins.
// 'compilado' → entregável ao cliente: só dados agregados/anônimos, nenhum
//               comentário individual (podem conter nomes ou detalhes que
//               identifiquem a pessoa). Grupos pequenos (< N_MIN_UNIDADE)
//               também são ocultados para não permitir reidentificação por
//               cruzamento (ex.: "só 2 pessoas no RH" + comentário específico).
export type DpaReportMode = 'interno' | 'compilado'

const N_MIN_UNIDADE = 3

// ─── Color helpers ────────────────────────────────────────────────────────────

function scoreBarColor(avg: number): string {
  if (avg >= 4) return '#16a34a'
  if (avg >= 3) return '#ca8a04'
  return '#dc2626'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#111827', backgroundColor: '#ffffff' },

  // Header
  header:      { marginBottom: 20 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  companyName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#9ca3af' },
  title:       { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle:    { fontSize: 8, color: '#6b7280' },
  dateText:    { fontSize: 8, color: '#9ca3af' },

  // KPI row
  kpiRow:      { flexDirection: 'row', gap: 12, marginBottom: 20 },
  kpiCard:     { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 12 },
  kpiValue:    { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },
  kpiLabel:    { fontSize: 7, color: '#9ca3af' },

  // Progress bar
  barBg:       { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  barFill:     { height: 6, borderRadius: 3 },

  // Section
  section:     { marginBottom: 18 },
  sectionTitle:{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 8 },

  // Unit table
  tableRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 5 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 5, backgroundColor: '#f9fafb' },
  cellUnit:    { flex: 3, fontSize: 8, color: '#374151' },
  cellCount:   { flex: 1, fontSize: 8, color: '#6b7280', textAlign: 'center' },
  cellPct:     { flex: 1, fontSize: 8, color: '#6b7280', textAlign: 'right' },
  headerLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af' },

  // Question result
  qCard:       { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 10, marginBottom: 8 },
  qNum:        { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginBottom: 3 },
  qTexto:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 6 },
  avgVal:      { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  scaleRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  scaleLabel:  { fontSize: 7, color: '#6b7280', width: 16, textAlign: 'right' },
  scalePct:    { fontSize: 7, color: '#9ca3af', width: 30, textAlign: 'right' },
  textBubble:  { backgroundColor: '#f9fafb', borderRadius: 4, padding: 6, marginBottom: 4 },
  textAnswer:  { fontSize: 7, color: '#374151', lineHeight: 1.4 },
  fillerBlock: { marginTop: 2 },
  fillerText:  { fontSize: 6.5, color: '#9ca3af', lineHeight: 1.5 },

  // Highlights (executive summary)
  hlRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  hlLabel:     { flex: 3, fontSize: 7.5, color: '#374151' },
  hlValue:     { flex: 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#111827', textAlign: 'right' },

  // Outro (write-in) block
  outroBlock:  { marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#e5e7eb' },
  outroLabel:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginBottom: 2 },
  outroText:   { fontSize: 7, color: '#4b5563', lineHeight: 1.4, marginBottom: 2 },

  // Keywords (respostas de texto livre)
  keywordsText: { fontSize: 6.5, color: '#2563eb', marginBottom: 6, lineHeight: 1.4 },

  // Cross-tab por unidade
  crossTab:      { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  crossTabLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginBottom: 3 },
  crossTabRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1.5 },
  crossTabUnit:  { fontSize: 7, color: '#4b5563', flex: 2 },
  crossTabValue: { fontSize: 7, color: '#111827', fontFamily: 'Helvetica-Bold', flex: 1, textAlign: 'right' },

  // Footer
  footer:      { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#9ca3af' },

  // Confidentiality banner (modo compilado)
  confBanner:  { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 6, padding: 10, marginBottom: 16 },
  confText:    { fontSize: 7.5, color: '#1e40af', lineHeight: 1.4 },
  noticeText:  { fontSize: 7, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 },
})

// ─── Question stats ───────────────────────────────────────────────────────────

function computeScaleStats(perguntaId: string, respostas: Resposta[]) {
  const nums = respostas
    .map((r) => r.respostas[perguntaId])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(Number)
    .filter((v) => !isNaN(v))

  if (nums.length === 0) return null
  const avg  = nums.reduce((s, v) => s + v, 0) / nums.length
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const v of nums) dist[v] = (dist[v] || 0) + 1
  return { avg, dist, total: nums.length }
}

function computeChoiceStats(perguntaId: string, opcoes: string[], respostas: Resposta[]) {
  // Respostas podem ser string (escolha única) ou string[] (múltipla).
  const raw = respostas
    .map((r) => r.respostas[perguntaId])
    .filter((v) => v !== undefined && v !== null && v !== ''
      && !(Array.isArray(v) && v.length === 0))
  const respondents = raw.length

  const selections: string[] = []
  for (const v of raw) {
    if (Array.isArray(v)) selections.push(...v.map(String))
    else selections.push(String(v))
  }

  const rows = opcoes.map((o) => ({
    opcao: o,
    count: selections.filter((v) => v === o).length,
    total: respondents,
  }))

  // Linha agregada de "Outro" quando há entradas "Outro: <texto>"
  const outroCount = selections.filter((v) => v.startsWith('Outro:')).length
  if (outroCount > 0) {
    rows.push({ opcao: 'Outro', count: outroCount, total: respondents })
  }
  return rows
}

function computeTextAnswers(perguntaId: string, respostas: Resposta[]) {
  return respostas
    .map((r) => r.respostas[perguntaId])
    .filter((v) => typeof v === 'string' && (v as string).trim() !== '') as string[]
}

// Texto digitado nas seleções "Outro: <texto>" de perguntas de múltipla escolha
function computeOutroDetails(perguntaId: string, respostas: Resposta[]): string[] {
  const out: string[] = []
  for (const r of respostas) {
    const v   = r.respostas[perguntaId]
    const arr = Array.isArray(v) ? v : v !== undefined && v !== null ? [v] : []
    for (const item of arr) {
      const s = String(item)
      if (s.startsWith('Outro:')) {
        const detail = s.replace(/^Outro:\s*/, '').trim()
        if (detail) out.push(detail)
      }
    }
  }
  return out
}

// ─── Filler detection (respostas sem conteúdo analítico: "n/a", "nenhuma"...) ──

const FILLER_TEXTS = new Set([
  'na', 'nao', 'n a', 'nda', 'nenhuma', 'nenhum', 'nenhuma observacao',
  'nenhuma opiniao', 'sem resposta', 'sem observacao', 'sem comentario',
  'sem comentarios', 'nulo', 'nao tenho', 'nao sei',
])

function normalizeFiller(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function isFillerAnswer(text: string): boolean {
  const n = normalizeFiller(text)
  return n.length <= 2 || FILLER_TEXTS.has(n)
}

// ─── Palavras-chave mais citadas (respostas de texto livre) ────────────────────

const STOPWORDS_PT = new Set([
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'nao', 'uma',
  'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'ao', 'ele',
  'das', 'tem', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'ha', 'nos', 'ja',
  'esta', 'eu', 'tambem', 'so', 'pelo', 'pela', 'ate', 'isso', 'ela', 'entre',
  'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem', 'nas', 'me',
  'esse', 'eles', 'estao', 'voce', 'tinha', 'foram', 'essa', 'num', 'nem', 'suas',
  'meu', 'minha', 'numa', 'pelos', 'elas', 'havia', 'seja', 'qual', 'sera',
  'tenho', 'lhe', 'deles', 'essas', 'esses', 'pelas', 'este', 'fosse', 'dele',
  'tu', 'te', 'voces', 'vos', 'lhes', 'meus', 'minhas', 'teu', 'tua', 'teus',
  'tuas', 'nosso', 'nossa', 'nossos', 'nossas', 'dela', 'delas', 'estes', 'estas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'aquilo', 'estou', 'estamos',
  'sou', 'somos', 'sao', 'eramos', 'eram', 'fui', 'foi', 'fomos', 'temos',
  'tinham', 'tive', 'teve', 'tivemos', 'tiveram', 'todo', 'toda', 'todos',
  'todas', 'outro', 'outra', 'outros', 'outras', 'algum', 'alguma', 'alguns',
  'algumas', 'nenhum', 'nenhuma', 'qualquer', 'quaisquer', 'cada', 'tudo',
  'nada', 'algo', 'alguem', 'ninguem', 'onde', 'aqui', 'ali', 'la', 'assim',
  'entao', 'porque', 'porem', 'portanto', 'contudo', 'todavia', 'enquanto',
  'durante', 'ainda', 'sempre', 'nunca', 'hoje', 'ontem', 'amanha', 'agora',
  'antes', 'apos', 'sobre', 'sob', 'atraves', 'dentro', 'fora', 'acima',
  'abaixo', 'perto', 'longe', 'pouco', 'bastante', 'demais', 'tanto', 'tao',
  'menos', 'bem', 'mal',
])

function extractKeywords(
  perguntaId: string, respostas: Resposta[], limit = 6,
): { word: string; count: number }[] {
  const texts = computeTextAnswers(perguntaId, respostas).filter((t) => !isFillerAnswer(t))
  const freq: Record<string, number> = {}

  for (const t of texts) {
    const words = t
      .toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)

    // Conta cada palavra 1x por resposta (evita 1 resposta longa dominar)
    const seen = new Set<string>()
    for (const w of words) {
      if (w.length < 4 || STOPWORDS_PT.has(w) || seen.has(w)) continue
      seen.add(w)
      freq[w] = (freq[w] || 0) + 1
    }
  }

  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }))
}

// ─── Cross-tab por unidade (perguntas quantitativas) ───────────────────────────

function groupByUnidade(respostas: Resposta[]): Record<string, Resposta[]> {
  const groups: Record<string, Resposta[]> = {}
  for (const r of respostas) {
    const key = r.unidade?.trim() || 'Sem unidade'
    ;(groups[key] ??= []).push(r)
  }
  return groups
}

// ─── Executive highlights (síntese das perguntas objetivas) ────────────────────

interface Highlight { label: string; value: string }

function buildHighlights(perguntas: Pergunta[], respostas: Resposta[]): Highlight[] {
  const items: Highlight[] = []
  for (const p of perguntas) {
    if (p.tipo === 'escala_5') {
      const stats = computeScaleStats(p.id, respostas)
      if (stats) items.push({ label: p.texto, value: `${stats.avg.toFixed(2)} / 5.0` })
    } else if (p.tipo === 'multipla_escolha' && p.opcoes) {
      const rows = computeChoiceStats(p.id, p.opcoes, respostas)
      const top  = [...rows].sort((a, b) => b.count - a.count)[0]
      if (top && top.count > 0) {
        const pct = top.total > 0 ? Math.round((top.count / top.total) * 100) : 0
        items.push({ label: p.texto, value: `${top.opcao} (${pct}%)` })
      }
    }
  }
  return items
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function DpaDocument({
  project,
  dashboard,
  branding,
  mode = 'interno',
}: {
  project:   DpaProject
  dashboard: DashboardData
  branding:  PdfBranding
  mode?:     DpaReportMode
}) {
  const today       = new Date().toLocaleDateString('pt-BR')
  const config      = project.config
  const perguntas   = config.perguntas
  const isCompilado = mode === 'compilado'
  // Cross-tab só faz sentido quando o projeto de fato segmenta por mais de 1 unidade
  const unidadesMultiplas = dashboard.por_unidade.length > 1
  const unidadesVisiveis  = isCompilado
    ? dashboard.por_unidade.filter((u) => u.total >= N_MIN_UNIDADE)
    : dashboard.por_unidade
  const unidadesOcultas   = dashboard.por_unidade.length - unidadesVisiveis.length

  const footerLeft = branding.hideMaptiva
    ? `${branding.companyName} · ${branding.footerText}`
    : branding.companyName !== 'Maptiva'
    ? `${branding.companyName} · ${branding.footerText} · Powered by Maptiva`
    : `Maptiva · ${branding.footerText}`

  return (
    <Document title={`DPA — ${project.nome}`}>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View style={S.headerTop}>
            <View>
              {branding.logoUrl ? (
                <Image
                  src={branding.logoUrl}
                  style={{ height: 22, marginBottom: 6, objectFit: 'contain', objectPositionX: 0 }}
                />
              ) : (
                <Text style={S.companyName}>{branding.companyName}</Text>
              )}
              <Text style={S.title}>{project.nome}</Text>
              <Text style={S.subtitle}>
                Diagnóstico Prévio Anônimo — {isCompilado ? 'Relatório Compilado' : 'Relatório Executivo'}
              </Text>
            </View>
            <Text style={S.dateText}>Gerado em {today}</Text>
          </View>
        </View>

        {/* ── Confidentiality banner (modo compilado) ── */}
        {isCompilado && (
          <View style={S.confBanner}>
            <Text style={S.confText}>
              🔒 Este relatório apresenta apenas dados agregados e anônimos. Comentários individuais
              não são incluídos, e grupos com menos de {N_MIN_UNIDADE} respondentes são omitidos, para
              preservar o sigilo de cada participante.
            </Text>
          </View>
        )}

        {/* ── KPIs ── */}
        <View style={S.kpiRow}>
          <View style={S.kpiCard}>
            <Text style={S.kpiValue}>{dashboard.taxa_resposta}%</Text>
            <Text style={S.kpiLabel}>Taxa de resposta</Text>
            <View style={S.barBg}>
              <View style={[S.barFill, { width: `${dashboard.taxa_resposta}%`, backgroundColor: '#16a34a' }]} />
            </View>
          </View>
          <View style={S.kpiCard}>
            <Text style={S.kpiValue}>{dashboard.total_respondidos}</Text>
            <Text style={S.kpiLabel}>Responderam</Text>
          </View>
          <View style={S.kpiCard}>
            <Text style={S.kpiValue}>{dashboard.total_participantes - dashboard.total_respondidos}</Text>
            <Text style={S.kpiLabel}>Pendentes</Text>
          </View>
        </View>

        {/* ── Highlights (síntese executiva) ── */}
        {(() => {
          const highlights = buildHighlights(perguntas, dashboard.respostas)
          if (highlights.length === 0) return null
          return (
            <View style={S.section}>
              <Text style={S.sectionTitle}>Principais destaques</Text>
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 10 }}>
                {highlights.map((h, i) => (
                  <View key={i} style={[S.hlRow, i === highlights.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                    <Text style={S.hlLabel}>{h.label}</Text>
                    <Text style={S.hlValue}>{h.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )
        })()}

        {/* ── Participation by unit ── */}
        {unidadesVisiveis.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Participação por {config.label_unidade}</Text>
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <View style={S.tableHeader}>
                <Text style={[S.cellUnit, S.headerLabel]}>{config.label_unidade.toUpperCase()}</Text>
                <Text style={[S.cellCount, S.headerLabel]}>RESPONDERAM</Text>
                <Text style={[S.cellCount, S.headerLabel]}>TOTAL</Text>
                <Text style={[S.cellPct, S.headerLabel]}>TAXA</Text>
              </View>
              {unidadesVisiveis.map((u) => {
                const pct = u.total > 0 ? Math.round((u.respondidos / u.total) * 100) : 0
                return (
                  <View key={u.unidade} style={S.tableRow}>
                    <Text style={S.cellUnit}>{u.unidade}</Text>
                    <Text style={S.cellCount}>{u.respondidos}</Text>
                    <Text style={S.cellCount}>{u.total}</Text>
                    <Text style={[S.cellPct, {
                      color: pct >= 80 ? '#16a34a' : pct >= 50 ? '#ca8a04' : '#dc2626',
                      fontFamily: 'Helvetica-Bold',
                    }]}>{pct}%</Text>
                  </View>
                )
              })}
            </View>
            {unidadesOcultas > 0 && (
              <Text style={S.noticeText}>
                {unidadesOcultas} {unidadesOcultas > 1 ? 'unidades com menos' : 'unidade com menos'} de{' '}
                {N_MIN_UNIDADE} respondentes {unidadesOcultas > 1 ? 'foram omitidas' : 'foi omitida'} por confidencialidade.
              </Text>
            )}
          </View>
        )}

        {/* ── Questions ── */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Resultados por pergunta</Text>

          {perguntas.map((p, idx) => {
            if (p.tipo === 'escala_5') {
              const stats = computeScaleStats(p.id, dashboard.respostas)
              return (
                <View key={p.id} style={S.qCard} wrap={false}>
                  <Text style={S.qNum}>Pergunta {idx + 1}</Text>
                  <Text style={S.qTexto}>{p.texto}</Text>
                  {stats ? (
                    <>
                      <Text style={[S.avgVal, { color: scoreBarColor(stats.avg) }]}>
                        {stats.avg.toFixed(2)} <Text style={{ fontSize: 8, color: '#9ca3af', fontFamily: 'Helvetica' }}>/ 5.0</Text>
                      </Text>
                      {[5, 4, 3, 2, 1].map((val) => {
                        const count = stats.dist[val] || 0
                        const pct   = stats.total > 0 ? (count / stats.total) * 100 : 0
                        return (
                          <View key={val} style={S.scaleRow}>
                            <Text style={S.scaleLabel}>{val}</Text>
                            <View style={[S.barBg, { flex: 1 }]}>
                              <View style={[S.barFill, {
                                width: `${pct}%`,
                                backgroundColor: scoreBarColor(val),
                              }]} />
                            </View>
                            <Text style={S.scalePct}>{count} ({pct.toFixed(0)}%)</Text>
                          </View>
                        )
                      })}
                    </>
                  ) : (
                    <Text style={{ fontSize: 8, color: '#9ca3af' }}>Sem respostas.</Text>
                  )}
                  {stats && unidadesMultiplas && (
                    <View style={S.crossTab}>
                      <Text style={S.crossTabLabel}>MÉDIA POR {config.label_unidade.toUpperCase()}</Text>
                      {Object.entries(groupByUnidade(dashboard.respostas)).map(([unidade, group]) => {
                        if (isCompilado && group.length < N_MIN_UNIDADE) return null
                        const gStats = computeScaleStats(p.id, group)
                        if (!gStats) return null
                        return (
                          <View key={unidade} style={S.crossTabRow}>
                            <Text style={S.crossTabUnit}>{unidade}</Text>
                            <Text style={S.crossTabValue}>{gStats.avg.toFixed(2)} / 5.0</Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            }

            if (p.tipo === 'multipla_escolha' && p.opcoes) {
              const choiceStats = computeChoiceStats(p.id, p.opcoes, dashboard.respostas)
              const outroTexts  = computeOutroDetails(p.id, dashboard.respostas)
              return (
                <View key={p.id} style={S.qCard} wrap={false}>
                  <Text style={S.qNum}>Pergunta {idx + 1}</Text>
                  <Text style={S.qTexto}>{p.texto}</Text>
                  {choiceStats.map((c) => {
                    const pct = c.total > 0 ? (c.count / c.total) * 100 : 0
                    return (
                      <View key={c.opcao} style={S.scaleRow}>
                        <Text style={[S.scaleLabel, { width: 80, textAlign: 'left' }]}>{c.opcao}</Text>
                        <View style={[S.barBg, { flex: 1 }]}>
                          <View style={[S.barFill, { width: `${pct}%`, backgroundColor: '#3b82f6' }]} />
                        </View>
                        <Text style={S.scalePct}>{c.count} ({pct.toFixed(0)}%)</Text>
                      </View>
                    )
                  })}
                  {!isCompilado && outroTexts.length > 0 && (
                    <View style={S.outroBlock}>
                      <Text style={S.outroLabel}>
                        DETALHAMENTO DE "OUTRO" ({outroTexts.length})
                      </Text>
                      {outroTexts.map((t, i) => (
                        <Text key={i} style={S.outroText}>— {t}</Text>
                      ))}
                    </View>
                  )}
                  {isCompilado && outroTexts.length > 0 && (
                    <Text style={S.noticeText}>
                      Detalhamento de "Outro" disponível apenas na versão interna.
                    </Text>
                  )}
                  {unidadesMultiplas && (
                    <View style={S.crossTab}>
                      <Text style={S.crossTabLabel}>OPÇÃO MAIS CITADA POR {config.label_unidade.toUpperCase()}</Text>
                      {Object.entries(groupByUnidade(dashboard.respostas)).map(([unidade, group]) => {
                        if (isCompilado && group.length < N_MIN_UNIDADE) return null
                        const gRows = computeChoiceStats(p.id, p.opcoes!, group)
                        const gTop  = [...gRows].sort((a, b) => b.count - a.count)[0]
                        if (!gTop || gTop.count === 0) return null
                        const gPct = gTop.total > 0 ? Math.round((gTop.count / gTop.total) * 100) : 0
                        return (
                          <View key={unidade} style={S.crossTabRow}>
                            <Text style={S.crossTabUnit}>{unidade}</Text>
                            <Text style={S.crossTabValue}>{gTop.opcao} ({gPct}%)</Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            }

            if (p.tipo === 'texto_livre') {
              const texts       = computeTextAnswers(p.id, dashboard.respostas)
              const substantive = texts.filter((t) => !isFillerAnswer(t))
              const filler      = texts.filter((t) => isFillerAnswer(t))
              const keywords    = extractKeywords(p.id, dashboard.respostas)
              return (
                <View key={p.id} style={S.qCard}>
                  <Text style={S.qNum}>Pergunta {idx + 1}</Text>
                  <Text style={S.qTexto}>{p.texto}</Text>
                  <Text style={{ fontSize: 7, color: '#9ca3af', marginBottom: keywords.length > 0 ? 2 : 6 }}>
                    {texts.length} resposta{texts.length !== 1 ? 's' : ''}
                    {filler.length > 0 ? ` · ${substantive.length} com conteúdo` : ''}
                  </Text>
                  {keywords.length > 0 && (
                    <Text style={S.keywordsText}>
                      Palavras mais citadas: {keywords.map((k) => `${k.word} (${k.count})`).join(' · ')}
                    </Text>
                  )}
                  {isCompilado ? (
                    substantive.length > 0 && (
                      <Text style={S.noticeText}>
                        Respostas individuais disponíveis apenas na versão interna, para preservar o
                        sigilo dos participantes.
                      </Text>
                    )
                  ) : (
                    <>
                      {substantive.map((text, i) => (
                        <View key={i} style={S.textBubble} wrap={false}>
                          <Text style={S.textAnswer}>{text}</Text>
                        </View>
                      ))}
                      {filler.length > 0 && (
                        <View style={S.fillerBlock} wrap={false}>
                          <Text style={S.fillerText}>
                            Sem observação relevante ({filler.length}): {filler.join(' · ')}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )
            }

            return null
          })}
        </View>

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerLeft}</Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  )
}

// ─── Export function ──────────────────────────────────────────────────────────

export async function exportDpaPdf(
  project:   DpaProject,
  dashboard: DashboardData,
  branding:  PdfBranding,
  mode:      DpaReportMode = 'interno',
): Promise<void> {
  const blob = await pdf(
    <DpaDocument project={project} dashboard={dashboard} branding={branding} mode={mode} />
  ).toBlob()

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const safeName = project.nome.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  const suffix   = mode === 'compilado' ? '_compilado' : ''
  a.href         = url
  a.download     = `DPA_${safeName}${suffix}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

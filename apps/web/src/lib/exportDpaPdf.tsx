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
  respostas:     Record<string, string | number>
}

interface DashboardData {
  total_participantes: number
  total_respondidos:   number
  taxa_resposta:       number
  label_unidade:       string
  por_unidade:         UnidadeStat[]
  respostas:           Resposta[]
}

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

  // Footer
  footer:      { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#9ca3af' },
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
  const vals = respostas
    .map((r) => r.respostas[perguntaId])
    .filter((v) => v !== undefined && v !== null && v !== '') as string[]

  return opcoes.map((o) => ({
    opcao: o,
    count: vals.filter((v) => v === o).length,
    total: vals.length,
  }))
}

function computeTextAnswers(perguntaId: string, respostas: Resposta[]) {
  return respostas
    .map((r) => r.respostas[perguntaId])
    .filter((v) => typeof v === 'string' && (v as string).trim() !== '') as string[]
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function DpaDocument({
  project,
  dashboard,
  branding,
}: {
  project:   DpaProject
  dashboard: DashboardData
  branding:  PdfBranding
}) {
  const today     = new Date().toLocaleDateString('pt-BR')
  const config    = project.config
  const perguntas = config.perguntas

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
              <Text style={S.subtitle}>Diagnóstico Prévio Anônimo — Relatório Executivo</Text>
            </View>
            <Text style={S.dateText}>Gerado em {today}</Text>
          </View>
        </View>

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

        {/* ── Participation by unit ── */}
        {dashboard.por_unidade.length > 0 && (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Participação por {config.label_unidade}</Text>
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <View style={S.tableHeader}>
                <Text style={[S.cellUnit, S.headerLabel]}>{config.label_unidade.toUpperCase()}</Text>
                <Text style={[S.cellCount, S.headerLabel]}>RESPONDERAM</Text>
                <Text style={[S.cellCount, S.headerLabel]}>TOTAL</Text>
                <Text style={[S.cellPct, S.headerLabel]}>TAXA</Text>
              </View>
              {dashboard.por_unidade.map((u) => {
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
                </View>
              )
            }

            if (p.tipo === 'multipla_escolha' && p.opcoes) {
              const choiceStats = computeChoiceStats(p.id, p.opcoes, dashboard.respostas)
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
                </View>
              )
            }

            if (p.tipo === 'texto_livre') {
              const texts = computeTextAnswers(p.id, dashboard.respostas)
              return (
                <View key={p.id} style={S.qCard}>
                  <Text style={S.qNum}>Pergunta {idx + 1}</Text>
                  <Text style={S.qTexto}>{p.texto}</Text>
                  <Text style={{ fontSize: 7, color: '#9ca3af', marginBottom: 6 }}>
                    {texts.length} resposta{texts.length !== 1 ? 's' : ''}
                  </Text>
                  {texts.slice(0, 10).map((text, i) => (
                    <View key={i} style={S.textBubble}>
                      <Text style={S.textAnswer}>{text}</Text>
                    </View>
                  ))}
                  {texts.length > 10 && (
                    <Text style={{ fontSize: 7, color: '#9ca3af' }}>
                      + {texts.length - 10} respostas adicionais no export Excel.
                    </Text>
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
): Promise<void> {
  const blob = await pdf(
    <DpaDocument project={project} dashboard={dashboard} branding={branding} />
  ).toBlob()

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const safeName = project.nome.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href         = url
  a.download     = `DPA_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

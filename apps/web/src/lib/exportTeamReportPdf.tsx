/**
 * exportTeamReportPdf.tsx
 * Generates a PDF of the Team Report (participants ranked by department).
 * Uses @react-pdf/renderer — keep rendering logic out of UI components.
 */

import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import type { PdfBranding } from './exportReportPdf'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamParticipant {
  cycle_participant_id:  string
  person_name:           string
  has_profile:           boolean
  overall_score:         number | null
  self_score:            number | null
  manager_score:         number | null
  peer_score:            number | null
  blind_spot_count:      number
  hidden_strength_count: number
  department:            string | null
  job_title:             string | null
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function scoreBarColor(v: number | null): string {
  if (v == null) return '#e5e7eb'
  if (v >= 4)    return '#4ade80'   // green-400
  if (v >= 3)    return '#facc15'   // yellow-400
  return '#f87171'                  // red-400
}

function scoreTextColor(v: number | null): string {
  if (v == null) return '#d1d5db'
  if (v >= 4)    return '#15803d'
  if (v >= 3)    return '#a16207'
  return '#b91c1c'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:      'Helvetica',
    fontSize:        9,
    padding:         40,
    color:           '#111827',
    backgroundColor: '#ffffff',
  },

  // Header
  header:      { marginBottom: 20 },
  companyLine: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginBottom: 4 },
  title:       { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  subtitle:    { fontSize: 8, color: '#6b7280' },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statBox:  {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    padding: 10, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  statLabel: { fontSize: 7, color: '#9ca3af', marginTop: 2 },

  // Department block
  deptBlock:   { marginBottom: 14 },
  deptHeader:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderTopLeftRadius: 8, borderTopRightRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  deptName:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  deptCount: { fontSize: 7, color: '#9ca3af' },

  // Table inside department
  tableWrap: {
    borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  tableHead: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  headText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase' },

  dataRow: {
    flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#f9fafb', alignItems: 'center',
  },

  // Column widths
  colRank:     { width: 20 },
  colName:     { flex: 3 },
  colOverall:  { flex: 2 },
  colScore:    { width: 46, alignItems: 'center' },
  colInsights: { width: 56, alignItems: 'center' },

  // Rank number
  rankText: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },

  // Name + title
  nameText:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827' },
  titleText: { fontSize: 7, color: '#9ca3af', marginTop: 1 },

  // Score bar
  barTrack: { height: 5, backgroundColor: '#f3f4f6', borderRadius: 3, flex: 1, marginRight: 5 },
  barFill:  { height: 5, borderRadius: 3 },
  barValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', width: 30, textAlign: 'right' },

  // Insight badges
  insightRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  blindBadge: {
    backgroundColor: '#fffbeb', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  strengthBadge: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  blindText:    { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#d97706' },
  strengthText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#2563eb' },

  // No-score row
  noScoreRow: { paddingHorizontal: 10, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  noScoreText:{ fontSize: 7, color: '#9ca3af' },

  // Legend
  legend:     { marginTop: 16, backgroundColor: '#f9fafb', borderRadius: 8, padding: 10 },
  legendTitle:{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', marginBottom: 5 },
  legendRow:  { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem: { fontSize: 7, color: '#9ca3af' },

  // Footer
  footer:     { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

// ─── Score bar component ──────────────────────────────────────────────────────

function PdfScoreBar({ value }: { value: number | null }) {
  const pct   = value != null ? Math.max(0, Math.min(1, value / 5)) : 0
  const color = scoreBarColor(value)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
      <View style={S.barTrack}>
        <View style={[S.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[S.barValue, { color: scoreTextColor(value) }]}>
        {value != null ? value.toFixed(2) : '—'}
      </Text>
    </View>
  )
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function TeamReportDocument({
  cycleName,
  grouped,
  statsWithProfile,
  avgOverall,
  totalBlindSpots,
  totalStrengths,
  branding,
}: {
  cycleName:        string
  grouped:          [string, TeamParticipant[]][]
  statsWithProfile: number
  avgOverall:       number | null
  totalBlindSpots:  number
  totalStrengths:   number
  branding:         PdfBranding
}) {
  const today = new Date().toLocaleDateString('pt-BR')

  const footerLeft = branding.hideMaptiva
    ? `${branding.companyName} · ${branding.footerText}`
    : branding.companyName !== 'Maptiva'
    ? `${branding.companyName} · ${branding.footerText} · Powered by Maptiva`
    : `Maptiva · ${branding.footerText}`

  return (
    <Document title={`Equipe — ${cycleName}`}>
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              style={{ height: 22, marginBottom: 6, objectFit: 'contain', objectPositionX: 0 }}
            />
          ) : (
            <Text style={S.companyLine}>{branding.companyName}</Text>
          )}
          <Text style={S.title}>{cycleName}</Text>
          <Text style={S.subtitle}>
            Relatório consolidado da equipe · Gerado em {today}
          </Text>
        </View>

        {/* ── Summary stats ── */}
        <View style={S.statsRow}>
          <View style={S.statBox}>
            <Text style={[S.statValue, { color: '#111827' }]}>{statsWithProfile}</Text>
            <Text style={S.statLabel}>Com scores</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statValue, { color: scoreTextColor(avgOverall) }]}>
              {avgOverall != null ? avgOverall.toFixed(2) : '—'}
            </Text>
            <Text style={S.statLabel}>Média geral</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statValue, { color: '#d97706' }]}>{totalBlindSpots}</Text>
            <Text style={S.statLabel}>Pontos cegos</Text>
          </View>
          <View style={S.statBox}>
            <Text style={[S.statValue, { color: '#2563eb' }]}>{totalStrengths}</Text>
            <Text style={S.statLabel}>Forças ocultas</Text>
          </View>
        </View>

        {/* ── Department groups ── */}
        {grouped.map(([dept, members]) => {
          const ranked  = [...members]
            .filter((m) => m.has_profile)
            .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
          const noScore = members.filter((m) => !m.has_profile)

          if (ranked.length === 0 && noScore.length === 0) return null

          return (
            <View key={dept} style={S.deptBlock} wrap={false}>
              {/* Department header */}
              <View style={S.deptHeader}>
                <Text style={S.deptName}>{dept}</Text>
                <Text style={S.deptCount}>
                  {members.length} pessoa{members.length !== 1 ? 's' : ''}
                </Text>
              </View>

              <View style={S.tableWrap}>
                {/* Column headers */}
                {ranked.length > 0 && (
                  <View style={S.tableHead}>
                    <View style={S.colRank}><Text style={S.headText}>#</Text></View>
                    <View style={S.colName}><Text style={S.headText}>Participante</Text></View>
                    <View style={S.colOverall}><Text style={S.headText}>Overall</Text></View>
                    <View style={S.colScore}><Text style={[S.headText, { textAlign: 'center' }]}>Self</Text></View>
                    <View style={S.colScore}><Text style={[S.headText, { textAlign: 'center' }]}>Gestor</Text></View>
                    <View style={S.colScore}><Text style={[S.headText, { textAlign: 'center' }]}>Pares</Text></View>
                    <View style={S.colInsights}><Text style={[S.headText, { textAlign: 'center' }]}>Insights</Text></View>
                  </View>
                )}

                {/* Ranked rows */}
                {ranked.map((m, idx) => {
                  const rankColor =
                    idx === 0 ? '#eab308' :   // gold
                    idx === 1 ? '#9ca3af' :   // silver
                    idx === 2 ? '#b45309' :   // bronze
                    '#d1d5db'

                  return (
                    <View
                      key={m.cycle_participant_id}
                      style={[
                        S.dataRow,
                        idx === ranked.length - 1 && noScore.length === 0
                          ? { borderBottomWidth: 0 }
                          : {},
                      ]}
                    >
                      {/* Rank */}
                      <View style={S.colRank}>
                        <Text style={[S.rankText, { color: rankColor }]}>{idx + 1}</Text>
                      </View>

                      {/* Name + job title */}
                      <View style={S.colName}>
                        <Text style={S.nameText}>{m.person_name}</Text>
                        {m.job_title ? (
                          <Text style={S.titleText}>{m.job_title}</Text>
                        ) : null}
                      </View>

                      {/* Score bar */}
                      <View style={[S.colOverall, { flexDirection: 'row', alignItems: 'center' }]}>
                        <PdfScoreBar value={m.overall_score} />
                      </View>

                      {/* Self */}
                      <View style={S.colScore}>
                        <Text style={[S.rankText, { color: scoreTextColor(m.self_score) }]}>
                          {m.self_score != null ? m.self_score.toFixed(2) : '—'}
                        </Text>
                      </View>

                      {/* Gestor */}
                      <View style={S.colScore}>
                        <Text style={[S.rankText, { color: scoreTextColor(m.manager_score) }]}>
                          {m.manager_score != null ? m.manager_score.toFixed(2) : '—'}
                        </Text>
                      </View>

                      {/* Pares */}
                      <View style={S.colScore}>
                        <Text style={[S.rankText, { color: scoreTextColor(m.peer_score) }]}>
                          {m.peer_score != null ? m.peer_score.toFixed(2) : '—'}
                        </Text>
                      </View>

                      {/* Insights */}
                      <View style={S.colInsights}>
                        <View style={S.insightRow}>
                          {m.blind_spot_count > 0 && (
                            <View style={S.blindBadge}>
                              <Text style={S.blindText}>{m.blind_spot_count} cego{m.blind_spot_count !== 1 ? 's' : ''}</Text>
                            </View>
                          )}
                          {m.hidden_strength_count > 0 && (
                            <View style={S.strengthBadge}>
                              <Text style={S.strengthText}>{m.hidden_strength_count} forca{m.hidden_strength_count !== 1 ? 's' : ''}</Text>
                            </View>
                          )}
                          {m.blind_spot_count === 0 && m.hidden_strength_count === 0 && (
                            <Text style={{ fontSize: 8, color: '#d1d5db' }}>—</Text>
                          )}
                        </View>
                      </View>
                    </View>
                  )
                })}

                {/* No-score members */}
                {noScore.length > 0 && (
                  <View style={S.noScoreRow}>
                    <Text style={S.noScoreText}>
                      Sem scores: {noScore.map((m) => m.person_name).join(', ')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )
        })}

        {/* ── Legend ── */}
        <View style={S.legend}>
          <Text style={S.legendTitle}>Legenda</Text>
          <View style={S.legendRow}>
            <Text style={S.legendItem}>Pontos cegos = avaliacao externa menor que autoavaliacao</Text>
            <Text style={S.legendItem}>Forcas ocultas = avaliacao externa maior que autoavaliacao</Text>
            <Text style={[S.legendItem, { color: '#15803d' }]}>Verde >= 4.0</Text>
            <Text style={[S.legendItem, { color: '#a16207' }]}>Amarelo >= 3.0</Text>
            <Text style={[S.legendItem, { color: '#b91c1c' }]}>Vermelho &lt; 3.0</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerLeft}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}

// ─── Export function ──────────────────────────────────────────────────────────

export async function exportTeamReportPdf(
  cycleName:        string,
  grouped:          [string, TeamParticipant[]][],
  statsWithProfile: number,
  avgOverall:       number | null,
  totalBlindSpots:  number,
  totalStrengths:   number,
  branding:         PdfBranding,
): Promise<void> {
  const blob = await pdf(
    <TeamReportDocument
      cycleName={cycleName}
      grouped={grouped}
      statsWithProfile={statsWithProfile}
      avgOverall={avgOverall}
      totalBlindSpots={totalBlindSpots}
      totalStrengths={totalStrengths}
      branding={branding}
    />
  ).toBlob()

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const safeName = cycleName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href         = url
  a.download     = `Equipe_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

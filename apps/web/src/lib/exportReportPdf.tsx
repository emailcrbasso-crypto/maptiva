/**
 * exportReportPdf.tsx
 * Generates a PDF of the cycle report using @react-pdf/renderer.
 * Supports tenant branding (company name, footer text, primary color).
 * Keep rendering logic here — out of UI components.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Image,
  Svg,
  Circle,
  Line,
  Polygon,
} from '@react-pdf/renderer'
import type { CycleSummary, ParticipantSummary } from './exportReport'

// ─── Branding params (passed from ReportPage via useTenant) ───────────────────

export interface PdfBranding {
  companyName:  string       // display_name ?? name
  logoUrl:      string | null
  primaryColor: string       // hex e.g. "#111827"
  footerText:   string       // pdf_footer_text ?? "Relatório Confidencial"
  hideMaptiva:  boolean
}

// ─── Snapshot / competency types (mirror ReportPage) ─────────────────────────

export interface PdfSnapshotRow {
  cycle_participant_id: string
  competency_id:        string | null
  relationship_code:    string
  score_avg:            number | null
  response_count:       number
  visibility_status:    string
}

export interface PdfCompetencyRow {
  id:             string
  name:           string
  dimension_code: string | null
}

// ─── Relationship labels ──────────────────────────────────────────────────────

const REL_SHORT: Record<string, string> = {
  self: 'Self', manager: 'Gestor', peer: 'Pares',
  subordinate: 'Subord.', client: 'Cliente',
}

const REL_LABEL: Record<string, string> = {
  self: 'Autoavaliação', manager: 'Gestor', peer: 'Pares',
  subordinate: 'Subordinados', client: 'Clientes',
}

const RADAR_COLORS: Record<string, string> = {
  self:        '#6366f1',
  manager:     '#10b981',
  peer:        '#f59e0b',
  subordinate: '#3b82f6',
  client:      '#ec4899',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#111827',
    backgroundColor: '#ffffff',
  },

  // Header
  header: { marginBottom: 24 },
  headerTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  headerSub: { fontSize: 10, color: '#6b7280' },

  // Section title
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 20,
  },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111827' },
  statLabel: { fontSize: 8, color: '#9ca3af', marginTop: 2 },

  // Participant card
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  cardName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 8 },

  // Score grid
  scoreRow: { flexDirection: 'row', gap: 8 },
  scoreBox: {
    flex: 1,
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  scoreLabel: { fontSize: 7, marginBottom: 2 },
  scoreValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },

  // Badges row
  badgesRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold' },

  // Subsection header (radar / competency)
  subHeader: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },

  // No profile row
  noProfileRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 6,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  noProfileName: { fontSize: 10, color: '#374151' },
  noProfileNote: { fontSize: 9, color: '#9ca3af' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: '#9ca3af' },
})

// ─── Score colour helpers ──────────────────────────────────────────────────────

function scoreColors(value: number | null): { bg: string; text: string } {
  if (value == null) return { bg: '#f9fafb', text: '#d1d5db' }
  if (value >= 4)    return { bg: '#f0fdf4', text: '#15803d' }
  if (value >= 3)    return { bg: '#fefce8', text: '#a16207' }
  return               { bg: '#fef2f2', text: '#b91c1c' }
}

function scoreTextColor(value: number | null): string {
  if (value == null) return '#d1d5db'
  if (value >= 4)    return '#15803d'
  if (value >= 3)    return '#a16207'
  return '#b91c1c'
}

function fmtScore(value: number | null): string {
  return value != null ? value.toFixed(2) : '—'
}

function ptBrDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── Score box ────────────────────────────────────────────────────────────────

function ScoreBox({ value, label }: { value: number | null; label: string }) {
  const { bg, text } = scoreColors(value)
  return (
    <View style={[S.scoreBox, { backgroundColor: bg }]}>
      <Text style={[S.scoreLabel, { color: text, opacity: 0.8 }]}>{label}</Text>
      <Text style={[S.scoreValue, { color: text }]}>{fmtScore(value)}</Text>
    </View>
  )
}

// ─── SVG Radar chart ──────────────────────────────────────────────────────────
// Renders a spider/radar chart using @react-pdf/renderer SVG primitives.
// Labels are rendered below as a separate View (avoids SVG text complexity).

const CX = 115          // svg center x
const CY = 100          // svg center y
const R  = 78           // outer radius
const SCALE_MAX = 5     // score domain max

function radarAngle(i: number, n: number): number {
  return (i / n) * 2 * Math.PI - Math.PI / 2
}

function polarToCart(i: number, n: number, value: number): { x: number; y: number } {
  const a = radarAngle(i, n)
  const r = (value / SCALE_MAX) * R
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function axisEnd(i: number, n: number): { x: number; y: number } {
  return polarToCart(i, n, SCALE_MAX)
}

function PdfRadarChart({
  cpId,
  snapshots,
  competencies,
}: {
  cpId:         string
  snapshots:    PdfSnapshotRow[]
  competencies: PdfCompetencyRow[]
}) {
  const mySnaps = snapshots.filter(
    (s) =>
      s.cycle_participant_id === cpId &&
      s.competency_id != null &&
      s.visibility_status === 'visible' &&
      s.score_avg != null
  )
  if (mySnaps.length === 0) return null

  const compIds = [...new Set(mySnaps.map((s) => s.competency_id))] as string[]
  if (compIds.length < 3) return null

  const relationships = [...new Set(mySnaps.map((s) => s.relationship_code))].sort()
  const N = compIds.length

  // Grid levels: concentric circle radii
  const gridLevels = [1, 2, 3, 4, 5]

  // Build polygon points string for a given relationship
  function polygonPoints(rel: string): string {
    return compIds
      .map((cId, i) => {
        const snap = mySnaps.find(
          (s) => s.competency_id === cId && s.relationship_code === rel
        )
        const pt = polarToCart(i, N, snap?.score_avg ?? 0)
        return `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`
      })
      .join(' ')
  }

  // Axis label text (truncated)
  function labelFor(cId: string): string {
    const comp = competencies.find((c) => c.id === cId)
    if (!comp) return '—'
    return comp.name.length > 16 ? comp.name.slice(0, 14) + '…' : comp.name
  }

  // Axis label position (outside the circle)
  function labelPos(i: number): { x: number; y: number; anchor: string } {
    const a = radarAngle(i, N)
    const dist = R + 16
    const x = CX + dist * Math.cos(a)
    const y = CY + dist * Math.sin(a)
    const anchor = Math.cos(a) > 0.15 ? 'start' : Math.cos(a) < -0.15 ? 'end' : 'middle'
    return { x, y, anchor }
  }

  // SVG total size
  const SVG_W = 230
  const SVG_H = 210

  return (
    <View>
      <Text style={S.subHeader}>Radar de competências</Text>

      {/* Chart SVG */}
      <Svg width={SVG_W} height={SVG_H}>
        {/* Grid circles */}
        {gridLevels.map((lvl) => (
          <Circle
            key={lvl}
            cx={CX}
            cy={CY}
            r={(lvl / SCALE_MAX) * R}
            stroke="#e5e7eb"
            strokeWidth={0.5}
            fill="none"
          />
        ))}

        {/* Axis lines */}
        {compIds.map((_, i) => {
          const ep = axisEnd(i, N)
          return (
            <Line
              key={i}
              x1={CX}
              y1={CY}
              x2={ep.x}
              y2={ep.y}
              stroke="#d1d5db"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Filled polygons per relationship */}
        {relationships.map((rel) => {
          const color = RADAR_COLORS[rel] ?? '#94a3b8'
          return (
            <Polygon
              key={rel}
              points={polygonPoints(rel)}
              fill={color}
              fillOpacity={0.1}
              stroke={color}
              strokeWidth={1.5}
            />
          )
        })}

        {/* Axis index dots (small circles at extremes) */}
        {compIds.map((cId, i) => {
          const ep = axisEnd(i, N)
          const lp = labelPos(i)
          // Number label on axis
          return (
            <Circle
              key={`dot-${cId}`}
              cx={ep.x}
              cy={ep.y}
              r={2}
              fill="#9ca3af"
              stroke="none"
            />
          )
          // Note: SVG Text in react-pdf requires import alias; skipping inline labels.
          // Competency names are shown in the axis legend below instead.
          void lp // suppress lint
        })}
      </Svg>

      {/* Axis labels rendered as View/Text below chart — two columns */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 4 }}>
        {compIds.map((cId, i) => (
          <View key={cId} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: '45%' }}>
            <View style={{
              width: 14, height: 14, borderRadius: 7,
              backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 6, color: '#6b7280', fontFamily: 'Helvetica-Bold' }}>
                {i + 1}
              </Text>
            </View>
            <Text style={{ fontSize: 7, color: '#374151' }}>{labelFor(cId)}</Text>
          </View>
        ))}
      </View>

      {/* Legend: relationship colors */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        {relationships.map((rel) => (
          <View key={rel} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{
              width: 10, height: 10, borderRadius: 5,
              backgroundColor: RADAR_COLORS[rel] ?? '#94a3b8',
            }} />
            <Text style={{ fontSize: 7, color: '#6b7280' }}>
              {REL_LABEL[rel] ?? rel}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Competency breakdown table ───────────────────────────────────────────────

function PdfCompetencyTable({
  cpId,
  snapshots,
  competencies,
}: {
  cpId:         string
  snapshots:    PdfSnapshotRow[]
  competencies: PdfCompetencyRow[]
}) {
  const mySnaps = snapshots.filter(
    (s) =>
      s.cycle_participant_id === cpId &&
      s.competency_id != null &&
      s.visibility_status === 'visible'
  )
  if (mySnaps.length === 0) return null

  const compMap = new Map(competencies.map((c) => [c.id, c]))

  // Group by competency_id preserving insertion order
  const byComp = new Map<string, PdfSnapshotRow[]>()
  for (const s of mySnaps) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }

  const relationships = [...new Set(mySnaps.map((s) => s.relationship_code))].sort()

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={S.subHeader}>Por competência</Text>

      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
          paddingBottom: 4,
          marginBottom: 2,
        }}
      >
        <Text style={{ flex: 3, fontSize: 7, color: '#9ca3af', fontFamily: 'Helvetica-Bold' }}>
          Competência
        </Text>
        {relationships.map((r) => (
          <Text
            key={r}
            style={{ flex: 1, fontSize: 7, color: '#9ca3af', fontFamily: 'Helvetica-Bold', textAlign: 'center' }}
          >
            {REL_SHORT[r] ?? r}
          </Text>
        ))}
      </View>

      {/* Data rows */}
      {[...byComp.entries()].map(([compId, snaps], rowIdx) => {
        const comp = compMap.get(compId)
        return (
          <View
            key={compId}
            style={{
              flexDirection: 'row',
              paddingVertical: 4,
              paddingHorizontal: 2,
              backgroundColor: rowIdx % 2 === 0 ? '#f9fafb' : '#ffffff',
              borderRadius: 3,
            }}
          >
            <Text style={{ flex: 3, fontSize: 8, color: '#374151' }}>
              {comp?.name ?? '—'}
            </Text>
            {relationships.map((r) => {
              const snap = snaps.find((s) => s.relationship_code === r)
              const val  = snap?.score_avg ?? null
              return (
                <Text
                  key={r}
                  style={{
                    flex: 1,
                    fontSize: 8,
                    fontFamily: 'Helvetica-Bold',
                    textAlign: 'center',
                    color: scoreTextColor(val),
                  }}
                >
                  {val != null ? val.toFixed(2) : '—'}
                </Text>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

// ─── Participant card ─────────────────────────────────────────────────────────

function ParticipantCard({
  p,
  snapshots,
  competencies,
}: {
  p:            ParticipantSummary
  snapshots:    PdfSnapshotRow[]
  competencies: PdfCompetencyRow[]
}) {
  const hasCompData = snapshots.some(
    (s) =>
      s.cycle_participant_id === p.cycle_participant_id &&
      s.competency_id != null &&
      s.visibility_status === 'visible'
  )

  return (
    <View style={S.card}>
      {/* Name */}
      <Text style={S.cardName}>{p.person_name}</Text>

      {/* Score grid */}
      <View style={S.scoreRow}>
        <ScoreBox value={p.overall_score}     label="Overall" />
        <ScoreBox value={p.self_score}        label="Autoaval." />
        <ScoreBox value={p.manager_score}     label="Gestor" />
        <ScoreBox value={p.peer_score}        label="Pares" />
        <ScoreBox value={p.subordinate_score} label="Subordin." />
      </View>

      {/* Badges */}
      {(p.blind_spot_count > 0 || p.hidden_strength_count > 0) && (
        <View style={S.badgesRow}>
          {p.blind_spot_count > 0 && (
            <View style={[S.badge, { backgroundColor: '#fffbeb' }]}>
              <Text style={[S.badgeText, { color: '#d97706' }]}>
                {p.blind_spot_count} ponto{p.blind_spot_count !== 1 ? 's' : ''} cego{p.blind_spot_count !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {p.hidden_strength_count > 0 && (
            <View style={[S.badge, { backgroundColor: '#eff6ff' }]}>
              <Text style={[S.badgeText, { color: '#2563eb' }]}>
                {p.hidden_strength_count} força{p.hidden_strength_count !== 1 ? 's' : ''} oculta{p.hidden_strength_count !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Radar chart (only when competency snapshots exist) */}
      {hasCompData && (
        <PdfRadarChart
          cpId={p.cycle_participant_id}
          snapshots={snapshots}
          competencies={competencies}
        />
      )}

      {/* Competency breakdown table */}
      {hasCompData && (
        <PdfCompetencyTable
          cpId={p.cycle_participant_id}
          snapshots={snapshots}
          competencies={competencies}
        />
      )}
    </View>
  )
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

const DEFAULT_BRANDING: PdfBranding = {
  companyName:  'Maptiva',
  logoUrl:      null,
  primaryColor: '#111827',
  footerText:   'Relatório Confidencial',
  hideMaptiva:  false,
}

function ReportDocument({
  summary,
  branding = DEFAULT_BRANDING,
  snapshots = [],
  competencies = [],
}: {
  summary:       CycleSummary
  branding?:     PdfBranding
  snapshots?:    PdfSnapshotRow[]
  competencies?: PdfCompetencyRow[]
}) {
  const completionPct =
    summary.total_assignments > 0
      ? Math.round((summary.completed_assignments / summary.total_assignments) * 100)
      : 0

  const withProfile    = summary.participants.filter((p) => p.has_profile)
  const withoutProfile = summary.participants.filter((p) => !p.has_profile)
  const today          = new Date().toLocaleDateString('pt-BR')

  const footerLeft = branding.hideMaptiva
    ? `${branding.companyName} · ${branding.footerText}`
    : branding.companyName !== 'Maptiva'
    ? `${branding.companyName} · ${branding.footerText} · Powered by Maptiva`
    : `Maptiva · ${branding.footerText}`

  return (
    <Document title={`Relatório — ${summary.cycle_name}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          {branding.logoUrl ? (
            <Image
              src={branding.logoUrl}
              style={{ height: 28, marginBottom: 8, objectFit: 'contain', objectPositionX: 0 }}
            />
          ) : (
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#9ca3af', marginBottom: 4 }}>
              {branding.companyName}
            </Text>
          )}
          <Text style={S.headerTitle}>{summary.cycle_name}</Text>
          <Text style={S.headerSub}>
            Relatório de resultados · Gerado em {today}
            {summary.report_release_at
              ? ` · Liberado em ${ptBrDate(summary.report_release_at)}`
              : ''}
          </Text>
        </View>

        {/* Stats */}
        <Text style={S.sectionTitle}>Visão geral</Text>
        <View style={S.statsRow}>
          <View style={S.statBox}>
            <Text style={S.statValue}>{summary.participants.length}</Text>
            <Text style={S.statLabel}>Participantes</Text>
          </View>
          <View style={S.statBox}>
            <Text style={S.statValue}>{summary.completed_assignments}/{summary.total_assignments}</Text>
            <Text style={S.statLabel}>Respostas ({completionPct}%)</Text>
          </View>
          <View style={S.statBox}>
            <Text style={S.statValue}>{withProfile.length}</Text>
            <Text style={S.statLabel}>Com scores</Text>
          </View>
        </View>

        {/* Participants with scores */}
        {withProfile.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Resultados por participante</Text>
            {withProfile.map((p) => (
              <ParticipantCard
                key={p.cycle_participant_id}
                p={p}
                snapshots={snapshots}
                competencies={competencies}
              />
            ))}
          </>
        )}

        {/* Participants without scores */}
        {withoutProfile.length > 0 && (
          <>
            <Text style={[S.sectionTitle, { marginTop: 24 }]}>Sem avaliações concluídas</Text>
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              {withoutProfile.map((p, i) => (
                <View
                  key={p.cycle_participant_id}
                  style={[
                    S.noProfileRow,
                    i === withoutProfile.length - 1 ? { borderBottomWidth: 0 } : {},
                  ]}
                >
                  <Text style={S.noProfileName}>{p.person_name}</Text>
                  <Text style={S.noProfileNote}>Nenhum avaliador concluiu</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{footerLeft}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

// ─── Export function ──────────────────────────────────────────────────────────

/**
 * exportCycleReportPdf
 * Generates and triggers download of a PDF report for the given cycle summary.
 * Pass `branding` from `useTenant()` to apply company white-label.
 * Pass `snapshots` and `competencies` to include radar chart and breakdown table.
 */
export async function exportCycleReportPdf(
  summary:      CycleSummary,
  branding?:    PdfBranding,
  snapshots?:   PdfSnapshotRow[],
  competencies?: PdfCompetencyRow[],
): Promise<void> {
  const blob = await pdf(
    <ReportDocument
      summary={summary}
      branding={branding}
      snapshots={snapshots}
      competencies={competencies}
    />
  ).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const safeName = summary.cycle_name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href     = url
  a.download = `Relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * ReportPDF.tsx
 *
 * Documento PDF do relatório individual 360 gerado com @react-pdf/renderer.
 * Espelha todas as seções do ReportDisplay do painel web:
 *   Participação · Scores · Roda da Liderança · GAP · Top/Bottom 5
 *   Benchmark · Scores por perspectiva · Distribuição · Competências · Comentários
 */

import {
  Document, Page, Text, View, StyleSheet, Image,
  Svg, Line, Polygon, Circle,
} from '@react-pdf/renderer'
import {
  type ProfileData,
  type SnapshotRow,
  type CompetencyRow,
  type CommentRow,
  type BenchmarkMap,
  REL_LABEL,
  REL_ORDER,
  REL_SHORT,
  RADAR_PALETTE,
} from './reportShared'
import { getScale, scoreToPercent } from '@/lib/scales'

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  primary:   '#6366f1',
  dark:      '#1e1b4b',
  text:      '#111827',
  muted:     '#6b7280',
  light:     '#9ca3af',
  border:    '#e5e7eb',
  bg:        '#f9fafb',
  green:     '#16a34a',
  yellow:    '#d97706',
  red:       '#dc2626',
  amber:     '#b45309',
  blue:      '#1d4ed8',
  white:     '#ffffff',
  bgGreen:   '#f0fdf4',
  bgAmber:   '#fffbeb',
  bgBlue:    '#eff6ff',
  bgRed:     '#fef2f2',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Pages
  coverPage: { backgroundColor: C.dark, padding: 0, display: 'flex', flexDirection: 'column' },
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.text,
    paddingTop: 44,
    paddingBottom: 52,
    paddingLeft: 52,
    paddingRight: 52,
    backgroundColor: C.white,
  },

  // Cover
  coverTopBar:      { backgroundColor: C.primary, height: 6 },
  coverBody:        { flex: 1, paddingTop: 80, paddingBottom: 60, paddingLeft: 60, paddingRight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  coverLogo:        { height: 36, objectFit: 'contain', objectPosition: 'left center', marginBottom: 60 },
  coverCompanyName: { fontSize: 14, color: '#a5b4fc', fontFamily: 'Helvetica-Bold', marginBottom: 60 },
  coverTitle:       { fontSize: 11, color: '#c7d2fe', fontFamily: 'Helvetica', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  coverName:        { fontSize: 30, color: C.white, fontFamily: 'Helvetica-Bold', lineHeight: 1.2, marginBottom: 16 },
  coverCycle:       { fontSize: 13, color: '#a5b4fc', fontFamily: 'Helvetica', marginBottom: 8 },
  coverDate:        { fontSize: 10, color: '#818cf8' },
  coverFooter:      { borderTop: `1pt solid #3730a3`, paddingTop: 16, display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  coverFooterText:  { fontSize: 8, color: '#6366f1' },

  // Section header
  sectionTitle: {
    fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.muted,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 4, paddingBottom: 4, borderBottom: `1pt solid ${C.border}`,
  },
  sectionSubtitle: { fontSize: 8, color: C.light, marginBottom: 10 },

  // Section spacing
  section:  { marginBottom: 22 },
  section2: { marginBottom: 22, display: 'flex', flexDirection: 'row' },

  // Score badge row
  scoresRow:      { display: 'flex', flexDirection: 'row', marginBottom: 14 },
  scoreBadge:     { flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 10, alignItems: 'center', marginRight: 6 },
  scoreBadgeLast: { flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 10, alignItems: 'center' },
  scoreBadgeLabel: { fontSize: 7, color: C.muted, marginBottom: 4 },
  scoreBadgeValue: { fontSize: 16, fontFamily: 'Helvetica-Bold' },

  // Self-awareness bar
  indexRow:   { display: 'flex', flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  indexLabel: { fontSize: 8, color: C.muted, width: 130 },
  indexBarBg: { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginRight: 8 },
  indexValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', width: 32, textAlign: 'right' },

  // Tables
  tableHeader:     { display: 'flex', flexDirection: 'row', borderBottom: `1.5pt solid ${C.border}`, paddingBottom: 5, marginBottom: 2 },
  tableRow:        { display: 'flex', flexDirection: 'row', paddingTop: 5, paddingBottom: 5, borderBottom: `0.5pt solid ${C.border}` },
  tableCell:       { fontSize: 8.5, color: C.text },
  tableHeaderCell: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // GAP badge
  gapBadge: { borderRadius: 4, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center' },

  // Top 5
  rankRow:   { display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  rankNumber:{ fontSize: 8, fontFamily: 'Helvetica-Bold', width: 16, color: C.muted },
  rankName:  { flex: 1, fontSize: 8.5, color: C.text },
  rankScore: { fontSize: 9, fontFamily: 'Helvetica-Bold', width: 32, textAlign: 'right' },
  rankBarBg: { height: 3, backgroundColor: C.border, borderRadius: 2, marginTop: 2 },

  // Comments
  commentBox:  { backgroundColor: C.bg, borderLeft: `3pt solid ${C.border}`, borderRadius: 4, padding: 8, marginBottom: 6 },
  commentText: { fontSize: 8.5, color: C.text, lineHeight: 1.5, fontStyle: 'italic' },

  // Page footer
  pageFooter: {
    position: 'absolute', bottom: 18, left: 52, right: 52,
    display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
    borderTop: `0.5pt solid ${C.border}`, paddingTop: 5,
  },
  footerText: { fontSize: 7, color: C.light },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(value: number | null, pct: number): string {
  if (value == null) return C.light
  if (pct >= 80) return C.green
  if (pct >= 60) return C.yellow
  return C.red
}

function fmtScore(value: number | null): string {
  return value != null ? value.toFixed(2) : '—'
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── SVG Radar Chart ─────────────────────────────────────────────────────────

function PdfRadarChart({
  N,
  datasets,
  scaleMax,
  size = 180,
}: {
  N:        number
  datasets: Array<{ color: string; fillOpacity: number; values: number[] }>
  scaleMax: number
  size?:    number
}) {
  if (N < 3) return null

  const cx = size / 2
  const cy = size / 2
  const r  = size * 0.34  // data radius (leaves room for labels)
  const labelR = size * 0.47  // label text radius

  const axisAngle = (i: number) => (2 * Math.PI * i / N) - Math.PI / 2
  const ptX = (frac: number, i: number) => cx + r * frac * Math.cos(axisAngle(i))
  const ptY = (frac: number, i: number) => cy + r * frac * Math.sin(axisAngle(i))

  const gridPolys = Array.from({ length: scaleMax }, (_, gi) => {
    const frac = (gi + 1) / scaleMax
    return Array.from({ length: N }, (_, i) =>
      `${ptX(frac, i).toFixed(1)},${ptY(frac, i).toFixed(1)}`
    ).join(' ')
  })

  const dataPolys = datasets.map((ds) => ({
    color: ds.color,
    fillOpacity: ds.fillOpacity,
    points: Array.from({ length: N }, (_, i) => {
      const frac = Math.min(Math.max((ds.values[i] ?? 0) / scaleMax, 0), 1)
      return `${ptX(frac, i).toFixed(1)},${ptY(frac, i).toFixed(1)}`
    }).join(' ')
  }))

  // Tip positions for axis numbers
  const tipPositions = Array.from({ length: N }, (_, i) => {
    const angle = axisAngle(i)
    return {
      x: cx + labelR * Math.cos(angle),
      y: cy + labelR * Math.sin(angle),
      anchor: (Math.cos(angle) < -0.15 ? 'end' : Math.cos(angle) > 0.15 ? 'start' : 'middle') as 'start' | 'middle' | 'end',
    }
  })

  return (
    <Svg width={size} height={size}>
      {/* Grid polygons */}
      {gridPolys.map((pts, gi) => (
        <Polygon key={`g${gi}`} points={pts} fill="none" stroke="#e5e7eb" strokeWidth={0.5} />
      ))}
      {/* Axis lines */}
      {Array.from({ length: N }, (_, i) => (
        <Line key={`a${i}`} x1={cx} y1={cy} x2={ptX(1, i)} y2={ptY(1, i)} stroke="#d1d5db" strokeWidth={0.5} />
      ))}
      {/* Center dot */}
      <Circle cx={cx} cy={cy} r={2} fill="#d1d5db" />
      {/* Data polygons */}
      {[...dataPolys].reverse().map((dp, ri) => (
        <Polygon key={`d${ri}`} points={dp.points} fill={dp.color} fillOpacity={dp.fillOpacity} stroke={dp.color} strokeWidth={1.5} />
      ))}
      {/* Axis number labels */}
      {tipPositions.map((tp, i) => (
        <Text
          key={`l${i}`}
          x={tp.x}
          y={tp.y + 2}
          textAnchor={tp.anchor}
          style={{ fontSize: 6.5, fill: '#9ca3af', fontFamily: 'Helvetica-Bold' } as object}
        >
          {String(i + 1)}
        </Text>
      ))}
    </Svg>
  )
}

// ─── Page footer ─────────────────────────────────────────────────────────────

function PageFooter({ name, cycle }: { name: string; cycle: string }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.footerText}>{name} · {cycle}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages} · Confidencial`} />
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

// ─── Cover page ──────────────────────────────────────────────────────────────

function CoverPage({
  personName, cycleName, generatedAt, brandingName, brandingLogoUrl,
}: {
  personName: string; cycleName: string; generatedAt: string | null
  brandingName: string; brandingLogoUrl: string | null
}) {
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverTopBar} />
      <View style={s.coverBody}>
        <View>
          {brandingLogoUrl
            ? <Image src={brandingLogoUrl} style={s.coverLogo} />
            : <Text style={s.coverCompanyName}>{brandingName}</Text>
          }
          <Text style={s.coverTitle}>Relatório 360° de Avaliação</Text>
          <Text style={s.coverName}>{personName}</Text>
          <Text style={s.coverCycle}>{cycleName}</Text>
          {generatedAt && <Text style={s.coverDate}>Gerado em {fmtDate(generatedAt)}</Text>}
        </View>
        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>Documento confidencial — uso exclusivo do participante</Text>
          <Text style={s.coverFooterText}>Maptiva · maptiva.com</Text>
        </View>
      </View>
    </Page>
  )
}

// ─── 1. Participation section ─────────────────────────────────────────────────

function ParticipationSectionPDF({ snapshots }: { snapshots: SnapshotRow[] }) {
  const rows = snapshots
    .filter((s) => !s.competency_id && s.response_count > 0)
    .sort((a, b) => REL_ORDER.indexOf(a.relationship_code) - REL_ORDER.indexOf(b.relationship_code))

  if (rows.length === 0) return null

  const totalAll      = rows.reduce((sum, r) => sum + r.response_count, 0)
  const totalExternal = rows.filter((r) => r.relationship_code !== 'self').reduce((sum, r) => sum + r.response_count, 0)

  return (
    <View style={s.section}>
      <SectionTitle>Participação na avaliação</SectionTitle>
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, { flex: 1 }]}>Perspectiva</Text>
        <Text style={[s.tableHeaderCell, { width: 80, textAlign: 'center' }]}>Respostas</Text>
      </View>
      {rows.map((r) => (
        <View key={r.relationship_code} style={s.tableRow} wrap={false}>
          <Text style={[s.tableCell, { flex: 1 }]}>{REL_LABEL[r.relationship_code] ?? r.relationship_code}</Text>
          <Text style={[s.tableCell, { width: 80, textAlign: 'center', fontFamily: 'Helvetica-Bold' }]}>{r.response_count}</Text>
        </View>
      ))}
      <View style={{ display: 'flex', flexDirection: 'row', marginTop: 8 }}>
        <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 6, padding: 8, marginRight: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.text }}>{totalAll}</Text>
          <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>respostas no total</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#eef2ff', borderRadius: 6, padding: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.primary }}>{totalExternal}</Text>
          <Text style={{ fontSize: 7, color: C.primary, marginTop: 2 }}>avaliadores externos</Text>
        </View>
      </View>
    </View>
  )
}

// ─── 2. Scores section ────────────────────────────────────────────────────────

function ScoresSection({
  profile, snapshots, competencies, scaleId,
}: {
  profile: ProfileData; snapshots: SnapshotRow[]
  competencies: CompetencyRow[]; scaleId: string
}) {
  const scale  = getScale(scaleId)
  const scores = [
    { label: 'Overall',    value: profile.overall_score },
    { label: 'Autoaval.',  value: profile.self_score },
    { label: 'Gestor',     value: profile.manager_score },
    { label: 'Pares',      value: profile.peer_score },
    { label: 'Subordin.',  value: profile.subordinate_score },
  ]

  // Self-awareness index
  const gaps = competencies.map((c) => {
    const self = snapshots.find((s) => s.competency_id === c.id && s.relationship_code === 'self')?.score_avg
    const extSnaps = snapshots.filter((s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null)
    const ext = extSnaps.length > 0 ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length : null
    if (self == null || ext == null) return null
    return Math.abs(self - ext)
  }).filter((g): g is number => g != null)

  const selfIndex = gaps.length > 0
    ? Math.max(0, Math.round((1 - (gaps.reduce((a, b) => a + b, 0) / gaps.length) / scale.max) * 100))
    : null
  const indexColor = selfIndex == null ? C.muted : selfIndex >= 85 ? C.green : selfIndex >= 70 ? C.yellow : C.red

  return (
    <View style={s.section}>
      <SectionTitle>Scores consolidados</SectionTitle>
      <View style={s.scoresRow}>
        {scores.map((sc, i) => {
          const pct = sc.value != null ? scoreToPercent(sc.value, scale) : 0
          const col = scoreColor(sc.value, pct)
          return (
            <View key={sc.label} style={i < scores.length - 1 ? s.scoreBadge : s.scoreBadgeLast}>
              <Text style={s.scoreBadgeLabel}>{sc.label}</Text>
              <Text style={[s.scoreBadgeValue, { color: col }]}>{fmtScore(sc.value)}</Text>
            </View>
          )
        })}
      </View>

      {selfIndex != null && (
        <View style={s.indexRow}>
          <Text style={s.indexLabel}>Índice de Autoconhecimento</Text>
          <View style={s.indexBarBg}>
            <View style={{ height: 6, width: `${selfIndex}%`, backgroundColor: indexColor, borderRadius: 3 }} />
          </View>
          <Text style={[s.indexValue, { color: indexColor }]}>{selfIndex}%</Text>
        </View>
      )}

      {(profile.blind_spot_count > 0 || profile.hidden_strength_count > 0) && (
        <View style={{ display: 'flex', flexDirection: 'row', marginTop: 10 }}>
          {profile.blind_spot_count > 0 && (
            <View style={{ backgroundColor: C.bgAmber, borderRadius: 6, padding: 8, marginRight: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.amber }}>{profile.blind_spot_count}</Text>
              <Text style={{ fontSize: 8, color: C.amber, marginTop: 2 }}>Ponto{profile.blind_spot_count !== 1 ? 's' : ''} cego{profile.blind_spot_count !== 1 ? 's' : ''}</Text>
              <Text style={{ fontSize: 7, color: C.amber, marginTop: 3, lineHeight: 1.4 }}>Outros te avaliam abaixo da sua autoavaliação</Text>
            </View>
          )}
          {profile.hidden_strength_count > 0 && (
            <View style={{ backgroundColor: C.bgBlue, borderRadius: 6, padding: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.blue }}>{profile.hidden_strength_count}</Text>
              <Text style={{ fontSize: 8, color: C.blue, marginTop: 2 }}>Força{profile.hidden_strength_count !== 1 ? 's' : ''} oculta{profile.hidden_strength_count !== 1 ? 's' : ''}</Text>
              <Text style={{ fontSize: 7, color: C.blue, marginTop: 3, lineHeight: 1.4 }}>Outros te avaliam acima da sua autoavaliação</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─── 3. Roda da liderança (Dual Radar) ───────────────────────────────────────

function DualRadarSectionPDF({
  snapshots, competencies, scaleId,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale = getScale(scaleId)

  const compWithSnaps = competencies.filter((c) =>
    snapshots.some((s) => s.competency_id === c.id && s.score_avg != null)
  )
  if (compWithSnaps.length < 3) return null

  const N = compWithSnaps.length

  // Self dataset
  const selfValues = compWithSnaps.map((c) =>
    snapshots.find((s) => s.competency_id === c.id && s.relationship_code === 'self')?.score_avg ?? 0
  )
  const hasSelf = selfValues.some((v) => v > 0)

  // External relationships
  const externalRels = [...new Set(
    snapshots
      .filter((s) => s.competency_id && s.score_avg != null && s.relationship_code !== 'self')
      .map((s) => s.relationship_code)
  )].sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b))

  const externalDatasets = externalRels.map((rel) => ({
    color: RADAR_PALETTE[rel] ?? '#94a3b8',
    fillOpacity: 0.1,
    values: compWithSnaps.map((c) =>
      snapshots.find((s) => s.competency_id === c.id && s.relationship_code === rel)?.score_avg ?? 0
    ),
    name: REL_LABEL[rel] ?? rel,
  }))

  // Legend of competency axis numbers
  const legendItems = compWithSnaps.map((c, i) => ({
    num: i + 1,
    name: c.name.length > 30 ? c.name.slice(0, 28) + '…' : c.name,
  }))

  const CHART_SIZE = 200

  return (
    <View style={s.section} break>
      <SectionTitle>Roda da liderança</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Escala de 0 a {scale.max}. Os números nos eixos correspondem às competências listadas abaixo.
      </Text>

      <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
        {/* Left: Self */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Autoavaliação
          </Text>
          {hasSelf ? (
            <PdfRadarChart
              N={N}
              datasets={[{ color: C.primary, fillOpacity: 0.18, values: selfValues }]}
              scaleMax={scale.max}
              size={CHART_SIZE}
            />
          ) : (
            <View style={{ width: CHART_SIZE, height: CHART_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 8, color: C.light }}>Sem autoavaliação</Text>
            </View>
          )}
        </View>

        {/* Right: External */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#059669', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Avaliadores externos
          </Text>
          {externalDatasets.length > 0 ? (
            <PdfRadarChart
              N={N}
              datasets={externalDatasets}
              scaleMax={scale.max}
              size={CHART_SIZE}
            />
          ) : (
            <View style={{ width: CHART_SIZE, height: CHART_SIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 8, color: C.light }}>Sem avaliações externas</Text>
            </View>
          )}
        </View>
      </View>

      {/* External legend */}
      {externalDatasets.length > 1 && (
        <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {externalDatasets.map((ds) => (
            <View key={ds.name} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 3 }}>
              <View style={{ width: 8, height: 8, backgroundColor: ds.color, borderRadius: 2, marginRight: 4 }} />
              <Text style={{ fontSize: 7.5, color: C.muted }}>{ds.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Competency axis legend */}
      <View style={{ backgroundColor: C.bg, borderRadius: 6, padding: 8 }}>
        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Legenda dos eixos
        </Text>
        <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
          {legendItems.map((item) => (
            <View key={item.num} style={{ width: '50%', display: 'flex', flexDirection: 'row', marginBottom: 3 }}>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.primary, width: 14 }}>{item.num}.</Text>
              <Text style={{ fontSize: 7, color: C.text, flex: 1 }}>{item.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

// ─── 4. GAP section ───────────────────────────────────────────────────────────

function GAPSection({ snapshots, competencies }: { snapshots: SnapshotRow[]; competencies: CompetencyRow[] }) {
  const rows = competencies
    .map((c) => {
      const selfScore = snapshots.find((s) => s.competency_id === c.id && s.relationship_code === 'self')?.score_avg ?? null
      const extSnaps  = snapshots.filter((s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null)
      const extAvg    = extSnaps.length > 0 ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length : null
      const gap       = selfScore != null && extAvg != null ? selfScore - extAvg : null
      return { id: c.id, name: c.name, selfScore, extAvg, gap }
    })
    .filter((r) => r.selfScore != null || r.extAvg != null)
    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))

  if (rows.length === 0) return null

  return (
    <View style={s.section} break>
      <SectionTitle>GAP — Autoavaliação × Avaliadores</SectionTitle>
      <Text style={s.sectionSubtitle}>Diferença por competência, ordenada pela maior divergência.</Text>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, { flex: 3 }]}>Competência</Text>
        <Text style={[s.tableHeaderCell, { width: 48, textAlign: 'center' }]}>Auto</Text>
        <Text style={[s.tableHeaderCell, { width: 52, textAlign: 'center' }]}>Aval.</Text>
        <Text style={[s.tableHeaderCell, { width: 44, textAlign: 'center' }]}>GAP</Text>
        <Text style={[s.tableHeaderCell, { width: 90 }]}>Interpretação</Text>
      </View>

      {rows.map((r) => {
        const isBlind  = r.gap != null && r.gap > 0.5
        const isHidden = r.gap != null && r.gap < -0.5
        const gapColor = isBlind ? C.amber : isHidden ? C.blue : C.muted
        const gapBg    = isBlind ? C.bgAmber : isHidden ? C.bgBlue : C.bg
        const gapLabel = isBlind ? 'Ponto cego' : isHidden ? 'Forca oculta' : r.gap != null ? 'Alinhado' : '—'

        return (
          <View key={r.id} style={s.tableRow} wrap={false}>
            <Text style={[s.tableCell, { flex: 3 }]}>{r.name}</Text>
            <Text style={[s.tableCell, { width: 48, textAlign: 'center', color: C.primary }]}>{fmtScore(r.selfScore)}</Text>
            <Text style={[s.tableCell, { width: 52, textAlign: 'center', color: C.green }]}>{fmtScore(r.extAvg)}</Text>
            <View style={{ width: 44, alignItems: 'center' }}>
              <View style={[s.gapBadge, { backgroundColor: gapBg }]}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: gapColor }}>
                  {r.gap != null ? (r.gap > 0 ? `+${r.gap.toFixed(2)}` : r.gap.toFixed(2)) : '—'}
                </Text>
              </View>
            </View>
            <Text style={[s.tableCell, { width: 90, color: gapColor }]}>{gapLabel}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── 5. Scores por perspectiva ────────────────────────────────────────────────

function SnapshotsByRelationshipPDF({ snapshots, scaleId }: { snapshots: SnapshotRow[]; scaleId: string }) {
  const scale = getScale(scaleId)
  const rows = snapshots
    .filter((s) => !s.competency_id && s.score_avg != null)
    .sort((a, b) => REL_ORDER.indexOf(a.relationship_code) - REL_ORDER.indexOf(b.relationship_code))

  if (rows.length === 0) return null

  return (
    <View style={s.section}>
      <SectionTitle>Scores por perspectiva</SectionTitle>
      <Text style={s.sectionSubtitle}>Média geral por grupo de avaliadores.</Text>
      {rows.map((r) => {
        const pct   = r.score_avg != null ? scoreToPercent(r.score_avg, scale) : 0
        const color = scoreColor(r.score_avg, pct)
        const relColor = RADAR_PALETTE[r.relationship_code] ?? '#9ca3af'
        return (
          <View key={r.relationship_code} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
            <View style={{ width: 8, height: 8, backgroundColor: relColor, borderRadius: 2, marginRight: 6 }} />
            <Text style={{ fontSize: 8, color: C.text, width: 90 }}>{REL_LABEL[r.relationship_code] ?? r.relationship_code}</Text>
            <View style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, marginRight: 8 }}>
              <View style={{ height: 6, width: `${pct}%`, backgroundColor: relColor, borderRadius: 3 }} />
            </View>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color, width: 32, textAlign: 'right' }}>
              {fmtScore(r.score_avg)}
            </Text>
            <Text style={{ fontSize: 7.5, color: C.light, width: 60, textAlign: 'right' }}>
              {r.response_count} resp.
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── 6. Top 5 / Bottom 5 ─────────────────────────────────────────────────────

function TopBottomSection({ snapshots, competencies, scaleId }: { snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string }) {
  const scale  = getScale(scaleId)
  const scored = competencies
    .map((c) => {
      const ext = snapshots.filter((s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null)
      const extAvg = ext.length > 0 ? ext.reduce((sum, s) => sum + s.score_avg!, 0) / ext.length : null
      return { id: c.id, name: c.name, extAvg }
    })
    .filter((c) => c.extAvg != null)
    .sort((a, b) => b.extAvg! - a.extAvg!)

  if (scored.length < 3) return null

  const top    = scored.slice(0, Math.min(5, scored.length))
  const bottom = [...scored].reverse().slice(0, Math.min(5, scored.length))

  function RankList({ items, color }: { items: typeof top; color: string }) {
    return (
      <View>
        {items.map((c, i) => {
          const pct = (c.extAvg! / scale.max) * 100
          return (
            <View key={c.id} style={s.rankRow} wrap={false}>
              <Text style={[s.rankNumber, { color }]}>{i + 1}.</Text>
              <View style={{ flex: 1 }}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={s.rankName}>{c.name}</Text>
                  <Text style={[s.rankScore, { color }]}>{c.extAvg!.toFixed(2)}</Text>
                </View>
                <View style={[s.rankBarBg]}>
                  <View style={{ height: 3, width: `${pct}%`, backgroundColor: color, borderRadius: 2 }} />
                </View>
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View style={s.section} break>
      <SectionTitle>Pontos fortes e oportunidades de melhoria</SectionTitle>
      <Text style={s.sectionSubtitle}>Ranking baseado na média das avaliações externas.</Text>
      <View style={{ display: 'flex', flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 24 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.green, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Pontos fortes
          </Text>
          <RankList items={top} color={C.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.yellow, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Oportunidades
          </Text>
          <RankList items={bottom} color={C.yellow} />
        </View>
      </View>
    </View>
  )
}

// ─── 7. Benchmark section ─────────────────────────────────────────────────────

function BenchmarkSectionPDF({
  snapshots, competencies, benchmark,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]
  benchmark: BenchmarkMap; scaleId: string
}) {
  const rows = competencies
    .map((c) => {
      const bmEntry = benchmark[c.id]
      if (!bmEntry) return null
      const extSnaps = snapshots.filter((s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null)
      const myAvg = extSnaps.length > 0 ? extSnaps.reduce((sum, s) => sum + s.score_avg!, 0) / extSnaps.length : null
      if (myAvg == null) return null
      const delta = myAvg - bmEntry.score_avg
      return { id: c.id, name: c.name, myAvg, cycleAvg: bmEntry.score_avg, delta, participantCount: bmEntry.participant_count }
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b!.delta) - Math.abs(a!.delta)) as {
      id: string; name: string; myAvg: number; cycleAvg: number
      delta: number; participantCount: number
    }[]

  if (rows.length === 0) return null

  return (
    <View style={s.section} break>
      <SectionTitle>Comparativo com a média do ciclo</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Sua média (avaliadores externos) vs. a média geral do ciclo. Ordenado pela maior diferença.
      </Text>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, { flex: 3 }]}>Competência</Text>
        <Text style={[s.tableHeaderCell, { width: 52, textAlign: 'center' }]}>Você</Text>
        <Text style={[s.tableHeaderCell, { width: 52, textAlign: 'center' }]}>Ciclo</Text>
        <Text style={[s.tableHeaderCell, { width: 52, textAlign: 'center' }]}>Diferença</Text>
        <Text style={[s.tableHeaderCell, { width: 60, textAlign: 'center' }]}>Participantes</Text>
      </View>

      {rows.map((r) => {
        const isAbove  = r.delta > 0.15
        const isBelow  = r.delta < -0.15
        const deltaCol = isAbove ? C.green : isBelow ? C.red : C.muted
        const deltaLbl = isAbove ? '▲' : isBelow ? '▼' : '≈'

        return (
          <View key={r.id} style={s.tableRow} wrap={false}>
            <Text style={[s.tableCell, { flex: 3 }]}>{r.name}</Text>
            <Text style={[s.tableCell, { width: 52, textAlign: 'center', color: C.primary, fontFamily: 'Helvetica-Bold' }]}>{r.myAvg.toFixed(2)}</Text>
            <Text style={[s.tableCell, { width: 52, textAlign: 'center', color: C.muted }]}>{r.cycleAvg.toFixed(2)}</Text>
            <Text style={[s.tableCell, { width: 52, textAlign: 'center', fontFamily: 'Helvetica-Bold', color: deltaCol }]}>
              {deltaLbl} {r.delta > 0 ? `+${r.delta.toFixed(2)}` : r.delta.toFixed(2)}
            </Text>
            <Text style={[s.tableCell, { width: 60, textAlign: 'center', color: C.light }]}>{r.participantCount}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── 8. Score distribution ────────────────────────────────────────────────────

const DIST_COLORS_PDF: Record<number, string> = {
  1: '#f87171', // red-400
  2: '#fb923c', // orange-400
  3: '#facc15', // yellow-400
  4: '#a3e635', // lime-400
  5: '#22c55e', // green-500
}

function ScoreDistributionSectionPDF({
  snapshots, competencies, scaleId,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale  = getScale(scaleId)
  const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i)

  const rows = competencies
    .map((c) => {
      const extSnaps = snapshots.filter(
        (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_avg != null && s.score_distribution
      )
      if (extSnaps.length === 0) return null
      const dist: Record<string, number> = {}
      for (const snap of extSnaps) {
        if (!snap.score_distribution) continue
        for (const [k, v] of Object.entries(snap.score_distribution)) {
          dist[k] = (dist[k] ?? 0) + v
        }
      }
      const total = Object.values(dist).reduce((s, n) => s + n, 0)
      if (total === 0) return null
      return { id: c.id, name: c.name, dist, total }
    })
    .filter(Boolean) as { id: string; name: string; dist: Record<string, number>; total: number }[]

  if (rows.length === 0) return null

  return (
    <View style={s.section} break>
      <SectionTitle>Distribuição das respostas por competência</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Como avaliadores externos distribuíram suas notas — revela consenso ou divergência.
      </Text>

      {/* Legend */}
      <View style={{ display: 'flex', flexDirection: 'row', marginBottom: 8 }}>
        {values.map((v) => (
          <View key={v} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
            <View style={{ width: 8, height: 8, backgroundColor: DIST_COLORS_PDF[v] ?? '#d1d5db', borderRadius: 2, marginRight: 3 }} />
            <Text style={{ fontSize: 7, color: C.muted }}>{v} — {scale.labels.find((l) => l.value === v)?.short ?? v}</Text>
          </View>
        ))}
      </View>

      {rows.map((r) => (
        <View key={r.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 5 }} wrap={false}>
          <Text style={{ fontSize: 8, color: C.text, width: 130 }}>{r.name.length > 22 ? r.name.slice(0, 20) + '…' : r.name}</Text>
          <View style={{ flex: 1, display: 'flex', flexDirection: 'row', height: 10, borderRadius: 4, overflow: 'hidden' }}>
            {values.map((v) => {
              const count = r.dist[v.toString()] ?? 0
              const pct   = (count / r.total) * 100
              if (pct === 0) return null
              return (
                <View key={v} style={{ width: `${pct}%`, height: 10, backgroundColor: DIST_COLORS_PDF[v] ?? '#d1d5db' }} />
              )
            })}
          </View>
          <Text style={{ fontSize: 7, color: C.light, width: 40, textAlign: 'right' }}>{r.total} resp.</Text>
        </View>
      ))}
    </View>
  )
}

// ─── 9. Competency breakdown table ────────────────────────────────────────────

function CompetencyDetailSection({ snapshots, competencies, scaleId }: { snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string }) {
  const scale      = getScale(scaleId)
  const withComp   = snapshots.filter((s) => s.competency_id && s.score_avg != null)
  if (withComp.length === 0) return null

  const relationships = [...new Set(withComp.map((s) => s.relationship_code))]
    .sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b))
  const compMap = new Map(competencies.map((c) => [c.id, c]))
  const byComp  = new Map<string, SnapshotRow[]>()
  for (const s of withComp) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }
  const COL_W = 42

  return (
    <View style={s.section} break>
      <SectionTitle>Avaliação por competência</SectionTitle>

      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell, { flex: 1 }]}>Competência</Text>
        {relationships.map((r) => (
          <Text key={r} style={[s.tableHeaderCell, { width: COL_W, textAlign: 'center' }]}>
            {REL_SHORT[r] ?? r}
          </Text>
        ))}
      </View>

      {[...byComp.entries()].map(([compId, snaps]) => {
        const comp = compMap.get(compId)
        return (
          <View key={compId} style={s.tableRow} wrap={false}>
            <Text style={[s.tableCell, { flex: 1 }]}>{comp?.name ?? '—'}</Text>
            {relationships.map((rel) => {
              const snap = snaps.find((s) => s.relationship_code === rel)
              const pct  = snap?.score_avg != null ? scoreToPercent(snap.score_avg, scale) : 0
              const col  = scoreColor(snap?.score_avg ?? null, pct)
              return (
                <Text key={rel} style={[s.tableCell, { width: COL_W, textAlign: 'center', fontFamily: 'Helvetica-Bold', color: col }]}>
                  {snap?.score_avg != null ? snap.score_avg.toFixed(2) : '—'}
                </Text>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

// ─── 10. Comments ─────────────────────────────────────────────────────────────

function CommentsSection({ comments }: { comments: CommentRow[] }) {
  const unique = [...new Map(comments.map((c) => [c.id, c])).values()]
  if (unique.length === 0) return null

  const byRel = new Map<string, string[]>()
  for (const c of unique) {
    if (!byRel.has(c.relationship_group)) byRel.set(c.relationship_group, [])
    byRel.get(c.relationship_group)!.push(c.body)
  }

  return (
    <View style={s.section} break>
      <SectionTitle>Comentários qualitativos</SectionTitle>
      <Text style={s.sectionSubtitle}>Anônimos e agregados, respeitando o número mínimo de avaliadores.</Text>

      {[...byRel.entries()].map(([rel, bodies]) => (
        <View key={rel} style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
            {REL_LABEL[rel] ?? rel}
          </Text>
          {bodies.map((body, i) => (
            <View key={i} style={s.commentBox}>
              <Text style={s.commentText}>"{body}"</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

// ─── Main document ────────────────────────────────────────────────────────────

export interface ReportPDFProps {
  personName:      string
  cycleName:       string
  generatedAt:     string | null
  profile:         ProfileData
  snapshots:       SnapshotRow[]
  competencies:    CompetencyRow[]
  comments:        CommentRow[]
  scaleId:         string
  benchmark?:      BenchmarkMap
  brandingName:    string
  brandingLogoUrl: string | null
}

export function ReportPDFDocument({
  personName, cycleName, generatedAt,
  profile, snapshots, competencies, comments,
  scaleId, benchmark,
  brandingName, brandingLogoUrl,
}: ReportPDFProps) {
  const hasCompetencies = competencies.length > 0
  const hasBenchmark    = benchmark != null && Object.keys(benchmark).length > 0

  return (
    <Document
      title={`Relatório 360° — ${personName}`}
      author="Maptiva"
      subject={cycleName}
      creator="Maptiva"
    >
      {/* 1. Cover */}
      <CoverPage
        personName={personName}
        cycleName={cycleName}
        generatedAt={generatedAt}
        brandingName={brandingName}
        brandingLogoUrl={brandingLogoUrl}
      />

      {/* 2. Content pages — react-pdf paginates automatically */}
      <Page size="A4" style={s.page}>
        <PageFooter name={personName} cycle={cycleName} />

        {/* Participação */}
        <ParticipationSectionPDF snapshots={snapshots} />

        {/* Scores consolidados + Autoconhecimento + Insights */}
        <ScoresSection profile={profile} snapshots={snapshots} competencies={competencies} scaleId={scaleId} />

        {/* Roda da liderança */}
        {hasCompetencies && (
          <DualRadarSectionPDF snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* GAP autoavaliação × avaliadores */}
        {hasCompetencies && (
          <GAPSection snapshots={snapshots} competencies={competencies} />
        )}

        {/* Scores por perspectiva */}
        <SnapshotsByRelationshipPDF snapshots={snapshots} scaleId={scaleId} />

        {/* Top 5 / Bottom 5 */}
        {hasCompetencies && (
          <TopBottomSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Benchmark */}
        {hasCompetencies && hasBenchmark && (
          <BenchmarkSectionPDF snapshots={snapshots} competencies={competencies} benchmark={benchmark!} scaleId={scaleId} />
        )}

        {/* Distribuição de respostas */}
        {hasCompetencies && (
          <ScoreDistributionSectionPDF snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Avaliação por competência */}
        {hasCompetencies && (
          <CompetencyDetailSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Comentários */}
        <CommentsSection comments={comments} />

        {/* Confidentiality notice */}
        <View style={{ backgroundColor: C.bgBlue, borderRadius: 6, padding: 10, marginTop: 8 }}>
          <Text style={{ fontSize: 7.5, color: C.blue, lineHeight: 1.5 }}>
            Privacidade e anonimato: Os resultados são apresentados de forma agregada. Scores de grupos com
            menos de 3 avaliadores não são exibidos individualmente para preservar a confidencialidade.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

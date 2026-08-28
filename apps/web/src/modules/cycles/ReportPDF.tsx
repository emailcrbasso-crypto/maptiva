/**
 * ReportPDF.tsx
 *
 * Documento PDF do relatório individual 360 gerado com @react-pdf/renderer.
 * Espelha todas as seções do ReportDisplay do painel web:
 *   Participação · Scores · Roda da Liderança · GAP · Top/Bottom 5
 *   Benchmark · Scores por perspectiva · Distribuição · Competências · Comentários
 */

import type { ReactNode } from 'react'
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
  type QuestionScoreRow,
  REL_LABEL,
  REL_ORDER,
  REL_SHORT,
  RADAR_PALETTE,
  computeFavorability,
} from './reportShared'
import { getScale, scoreToPercent, type ScaleDefinition } from '@/lib/scales'

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
  goalValue,
}: {
  N:        number
  datasets: Array<{ color: string; fillOpacity: number; values: number[] }>
  scaleMax: number
  size?:    number
  /** Valor (na escala) da meta — desenhado como polígono tracejado, sem preenchimento. */
  goalValue?: number
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

  const goalPoints = goalValue != null
    ? Array.from({ length: N }, (_, i) => {
        const frac = Math.min(Math.max(goalValue / scaleMax, 0), 1)
        return `${ptX(frac, i).toFixed(1)},${ptY(frac, i).toFixed(1)}`
      }).join(' ')
    : null

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
      {/* Goal polygon (tracejado, sem preenchimento) */}
      {goalPoints && (
        <Polygon points={goalPoints} fill="none" stroke="#16a34a" strokeWidth={1} strokeDasharray="3,2" />
      )}
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
    { label: 'Média Geral', value: profile.overall_score },
    { label: 'Autoavaliação', value: profile.self_score },
    { label: 'Gestor',     value: profile.manager_score },
    { label: 'Pares',      value: profile.peer_score },
    { label: 'Subordinados', value: profile.subordinate_score },
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

// ─── 2.5 Favorabilidade geral ─────────────────────────────────────────────────

function FavorabilityBarPDF({ fav }: { fav: { favoravel: number; neutro: number; desfavoravel: number } }) {
  return (
    <View style={{ display: 'flex', flexDirection: 'row', height: 10, borderRadius: 4, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
      {fav.favoravel > 0 && <View style={{ width: `${fav.favoravel}%`, height: 10, backgroundColor: '#22c55e' }} />}
      {fav.neutro > 0 && <View style={{ width: `${fav.neutro}%`, height: 10, backgroundColor: '#93c5fd' }} />}
      {fav.desfavoravel > 0 && <View style={{ width: `${fav.desfavoravel}%`, height: 10, backgroundColor: '#f87171' }} />}
    </View>
  )
}

function mergeDist(snaps: SnapshotRow[]): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const snap of snaps) {
    if (!snap.score_distribution) continue
    for (const [k, v] of Object.entries(snap.score_distribution)) {
      dist[k] = (dist[k] ?? 0) + v
    }
  }
  return dist
}

export interface RelationshipDetailFavorabilityRowPDF {
  relationship_code:   string
  relationship_detail: string | null
  distribution:        Record<string, number> | null | undefined
  response_count:      number
  rater_count:         number
}

const REL_DETAIL_ORDER_PDF: { code: string; detail: string | null }[] = [
  { code: 'self',        detail: null },
  { code: 'manager',     detail: null },
  { code: 'subordinate', detail: 'Direto' },
  { code: 'subordinate', detail: 'Indireto' },
  { code: 'peer',        detail: 'Direto' },
  { code: 'peer',        detail: 'Indireto' },
  { code: 'client',      detail: null },
]

const REL_DETAIL_LABEL_PDF: Record<string, string> = {
  'self|':                'Auto Avaliação',
  'manager|':             'Gestor',
  'subordinate|Direto':   'Equipe Direta',
  'subordinate|Indireto': 'Equipe Indireta',
  'peer|Direto':          'Pares Direto',
  'peer|Indireto':        'Pares Indireto',
  'client|':              'Clientes',
}

function FavorabilityByRelationshipSectionPDF({
  snapshots, scaleId, detailedRows,
}: {
  snapshots: SnapshotRow[]; scaleId: string
  detailedRows?: RelationshipDetailFavorabilityRowPDF[]
}) {
  const scale = getScale(scaleId)

  let rows: { key: string; label: string; fav: ReturnType<typeof computeFavorability> }[]

  if (detailedRows && detailedRows.length > 0) {
    rows = REL_DETAIL_ORDER_PDF
      .map(({ code, detail }) => {
        const row = detailedRows.find(
          (r) => r.relationship_code === code && (r.relationship_detail ?? null) === detail
        )
        if (!row || !row.distribution) return null
        const fav = computeFavorability(row.distribution, scale)
        if (fav.total === 0) return null
        const key = `${code}|${detail ?? ''}`
        return { key, label: REL_DETAIL_LABEL_PDF[key] ?? key, fav }
      })
      .filter(Boolean) as { key: string; label: string; fav: ReturnType<typeof computeFavorability> }[]
  } else {
    rows = REL_ORDER
      .map((rel) => {
        const snaps = snapshots.filter((s) => s.relationship_code === rel && s.score_distribution)
        if (snaps.length === 0) return null
        const fav = computeFavorability(mergeDist(snaps), scale)
        if (fav.total === 0) return null
        return { key: rel, label: REL_LABEL[rel] ?? rel, fav }
      })
      .filter(Boolean) as { key: string; label: string; fav: ReturnType<typeof computeFavorability> }[]
  }

  if (rows.length < 2) return null

  return (
    <View style={s.section}>
      <SectionTitle>Favorabilidade por nível de avaliador</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Percentual de favorabilidade por grupo de avaliadores, incluindo autoavaliação.
      </Text>

      {rows.map((r) => (
        <View key={r.key} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 5 }} wrap={false}>
          <Text style={{ fontSize: 8, color: C.text, width: 90 }}>{r.label}</Text>
          <View style={{ flex: 1 }}><FavorabilityBarPDF fav={r.fav} /></View>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.text, width: 32, textAlign: 'right' }}>
            {r.fav.favoravel.toFixed(0)}%
          </Text>
        </View>
      ))}
    </View>
  )
}

function FavorabilitySectionPDF({
  snapshots, competencies, scaleId,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale = getScale(scaleId)

  const allExtSnaps = snapshots.filter((s) => s.relationship_code !== 'self' && s.score_distribution)
  const overall = computeFavorability(mergeDist(allExtSnaps), scale)
  if (overall.total === 0) return null

  const rows = competencies
    .map((c) => {
      const extSnaps = snapshots.filter(
        (s) => s.competency_id === c.id && s.relationship_code !== 'self' && s.score_distribution
      )
      if (extSnaps.length === 0) return null
      const fav = computeFavorability(mergeDist(extSnaps), scale)
      if (fav.total === 0) return null
      return { id: c.id, name: c.name, fav }
    })
    .filter(Boolean) as { id: string; name: string; fav: ReturnType<typeof computeFavorability> }[]
  rows.sort((a, b) => b.fav.favoravel - a.fav.favoravel)

  return (
    <View style={s.section}>
      <SectionTitle>Favorabilidade geral</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Favorável = notas {scale.max - 1} e {scale.max} · Neutro = intermediárias · Desfavorável = notas {scale.min} e {scale.min + 1}.
      </Text>

      <View style={{ backgroundColor: '#f0fdf4', borderRadius: 6, padding: 10, marginBottom: 10 }}>
        <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#15803d' }}>{overall.favoravel.toFixed(1)}%</Text>
        <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>
          {overall.neutro.toFixed(1)}% neutro · {overall.desfavoravel.toFixed(1)}% desfavorável
        </Text>
      </View>

      {rows.map((r) => (
        <View key={r.id} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginBottom: 5 }} wrap={false}>
          <Text style={{ fontSize: 8, color: C.text, width: 130 }}>{r.name.length > 22 ? r.name.slice(0, 20) + '…' : r.name}</Text>
          <View style={{ flex: 1 }}><FavorabilityBarPDF fav={r.fav} /></View>
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.text, width: 32, textAlign: 'right' }}>
            {r.fav.favoravel.toFixed(0)}%
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── 3. Roda da liderança (Dual Radar) ───────────────────────────────────────

function DualRadarSectionPDF({
  snapshots, competencies, scaleId, goalPct = 80,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
  /** Meta de favorabilidade (%) exibida como polígono tracejado. Passe null para ocultar. */
  goalPct?: number | null
}) {
  const scale = getScale(scaleId)
  const goalValue = goalPct != null ? (goalPct / 100) * scale.max : undefined

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
        {goalValue != null ? ` Linha tracejada verde indica a meta de ${goalPct}%.` : ''}
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
              goalValue={goalValue}
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
              goalValue={goalValue}
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

// ─── 6.5 Top 5 / Bottom 5 por PERGUNTA ───────────────────────────────────────

interface QRowColPDF { key: string; label: string }

const QROW_REL_COLS_PDF: QRowColPDF[] = [
  { key: 'self|',        label: 'Auto' },
  { key: 'manager|',     label: 'Gestor' },
  { key: 'peer|',        label: 'Pares' },
  { key: 'subordinate|', label: 'Subord.' },
]

const QROW_REL_COLS_DETAILED_PDF: QRowColPDF[] = [
  { key: 'self|',                label: 'Auto' },
  { key: 'subordinate|Direto',   label: 'Eq. Direta' },
  { key: 'subordinate|Indireto', label: 'Eq. Indireta' },
  { key: 'peer|Direto',          label: 'P. Direto' },
  { key: 'peer|Indireto',        label: 'P. Indireto' },
]

function qrowKeyPDF(code: string, detail: string | null | undefined): string {
  return `${code}|${detail ?? ''}`
}

function pickQuestionColsPDF(questionScores: QuestionScoreRow[]): QRowColPDF[] {
  return questionScores.some((q) => q.relationship_detail) ? QROW_REL_COLS_DETAILED_PDF : QROW_REL_COLS_PDF
}

interface QRowPDF {
  id: string; prompt: string; competencyName: string | null; order_index: number
  geral: number; perRel: Record<string, number | null>
}

function buildQuestionRowsPDF(questionScores: QuestionScoreRow[], competencies: CompetencyRow[]): QRowPDF[] {
  const compMap = new Map(competencies.map((c) => [c.id, c.name]))

  const byQuestion = new Map<string, {
    prompt: string; competency_id: string | null; order_index: number
    sums: Record<string, { code: string; sum: number; n: number }>
  }>()
  for (const q of questionScores) {
    if (q.score_avg == null) continue
    if (!byQuestion.has(q.question_id)) {
      byQuestion.set(q.question_id, { prompt: q.prompt, competency_id: q.competency_id, order_index: q.order_index, sums: {} })
    }
    byQuestion.get(q.question_id)!.sums[qrowKeyPDF(q.relationship_code, q.relationship_detail)] = {
      code: q.relationship_code, sum: q.score_avg * q.response_count, n: q.response_count,
    }
  }

  return [...byQuestion.entries()]
    .map(([id, q]) => {
      const extEntries = Object.values(q.sums).filter((s) => s.code !== 'self')
      const extN   = extEntries.reduce((s, e) => s + e.n, 0)
      if (extN === 0) return null
      const extSum = extEntries.reduce((s, e) => s + e.sum, 0)
      const perRel: Record<string, number | null> = {}
      for (const key of Object.keys(q.sums)) {
        perRel[key] = q.sums[key].sum / q.sums[key].n
      }
      return {
        id, prompt: q.prompt, order_index: q.order_index,
        competencyName: q.competency_id ? compMap.get(q.competency_id) ?? null : null,
        geral: extSum / extN, perRel,
      } as QRowPDF
    })
    .filter(Boolean) as QRowPDF[]
}

function QuestionGroupTablePDF({
  rows, cols, scale, title, color, calloutLabel,
}: {
  rows: QRowPDF[]; cols: QRowColPDF[]; scale: ScaleDefinition; title: string; color: string; calloutLabel: string
}) {
  if (rows.length === 0) return null

  let worst: { row: QRowPDF; label: string; value: number } | null = null
  for (const r of rows) {
    for (const { key, label } of cols) {
      if (key === 'self|') continue
      const v = r.perRel[key]
      if (v != null && (worst == null || v < worst.value)) worst = { row: r, label, value: v }
    }
  }

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingBottom: 3, marginBottom: 3 }}>
        <Text style={{ flex: 1, fontSize: 6.5, color: C.light }}>Pergunta</Text>
        <Text style={{ width: 34, fontSize: 6.5, color: C.light, textAlign: 'right' }}>Geral</Text>
        {cols.map((c) => (
          <Text key={c.key} style={{ width: 34, fontSize: 6.5, color: C.light, textAlign: 'right' }}>{c.label}</Text>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.id} style={{ display: 'flex', flexDirection: 'row', marginBottom: 4 }} wrap={false}>
          <View style={{ flex: 1, paddingRight: 4 }}>
            <Text style={{ fontSize: 7, color: C.text, lineHeight: 1.3 }}>{r.prompt}</Text>
            {r.competencyName && <Text style={{ fontSize: 6, color: C.light, marginTop: 1 }}>{r.competencyName}</Text>}
          </View>
          <Text style={{ width: 34, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: scoreColor(r.geral, scoreToPercent(r.geral, scale)) }}>
            {r.geral.toFixed(2)}
          </Text>
          {cols.map((c) => {
            const v = r.perRel[c.key]
            return (
              <Text
                key={c.key}
                style={{ width: 34, fontSize: 7, textAlign: 'right', color: v != null ? scoreColor(v, scoreToPercent(v, scale)) : C.light }}
              >
                {v != null ? v.toFixed(2) : '—'}
              </Text>
            )
          })}
        </View>
      ))}
      {color === C.yellow && worst && worst.value / scale.max < 0.6 && (
        <Text style={{ fontSize: 6.5, color: C.red, backgroundColor: '#fef2f2', borderRadius: 4, padding: 5, marginTop: 3 }}>
          ⚠ {calloutLabel}: "{worst.row.prompt.length > 70 ? worst.row.prompt.slice(0, 68) + '…' : worst.row.prompt}" —
          apenas {worst.value.toFixed(2)} entre {worst.label}.
        </Text>
      )}
    </View>
  )
}

function TopBottomQuestionsSectionPDF({
  questionScores, competencies, scaleId,
}: {
  questionScores: QuestionScoreRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale  = getScale(scaleId)
  const scored = buildQuestionRowsPDF(questionScores, competencies)
  const cols   = pickQuestionColsPDF(questionScores)

  if (scored.length === 0) return null

  const sorted   = [...scored].sort((a, b) => b.geral - a.geral)
  const overlaps = scored.length <= 5
  const top      = sorted.slice(0, Math.min(5, scored.length))
  const bottom   = overlaps ? [] : sorted.slice(-5).reverse()

  return (
    <View style={s.section} break>
      <SectionTitle>Perguntas com maiores e menores notas</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Granularidade por pergunta, com a nota de cada grupo de avaliador.
      </Text>
      <QuestionGroupTablePDF
        rows={top} cols={cols} scale={scale} color={C.green}
        title={bottom.length > 0 ? 'Pontos fortes' : 'Ranking por pergunta'}
        calloutLabel="Ponto de atenção"
      />
      <QuestionGroupTablePDF
        rows={bottom} cols={cols} scale={scale} color={C.yellow}
        title="Oportunidades de melhoria"
        calloutLabel="Atenção especial"
      />
      <Text style={{ fontSize: 6.5, color: C.light, marginTop: 2 }}>
        "Geral" = média das avaliações externas (gestor, pares e subordinados) por pergunta.
      </Text>
    </View>
  )
}

// ─── 6b. Resultado detalhado — todas as perguntas ──────────────────────────────

function AllQuestionsDetailSectionPDF({
  questionScores, competencies, scaleId,
}: {
  questionScores: QuestionScoreRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale = getScale(scaleId)
  const rows  = buildQuestionRowsPDF(questionScores, competencies).sort((a, b) => a.order_index - b.order_index)
  const cols  = pickQuestionColsPDF(questionScores)

  if (rows.length === 0) return null

  return (
    <View style={s.section} break>
      <SectionTitle>Resultado detalhado — todas as perguntas</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Ordenado pela ordem do questionário. Verde ≥ {(0.8 * scale.max).toFixed(1)} · Amarelo{' '}
        {(0.6 * scale.max).toFixed(1)}–{(0.8 * scale.max).toFixed(1)} · Vermelho &lt; {(0.6 * scale.max).toFixed(1)}.
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb', paddingBottom: 3, marginBottom: 3 }}>
        <Text style={{ width: 16, fontSize: 6.5, color: C.light }}>Nº</Text>
        <Text style={{ flex: 2, fontSize: 6.5, color: C.light }}>Pergunta</Text>
        <Text style={{ flex: 1, fontSize: 6.5, color: C.light }}>Dimensão</Text>
        <Text style={{ width: 30, fontSize: 6.5, color: C.light, textAlign: 'right' }}>Geral</Text>
        {cols.map((c) => (
          <Text key={c.key} style={{ width: 30, fontSize: 6.5, color: C.light, textAlign: 'right' }}>{c.label}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r.id} style={{ display: 'flex', flexDirection: 'row', marginBottom: 4 }} wrap={false}>
          <Text style={{ width: 16, fontSize: 7, color: C.light }}>{i + 1}</Text>
          <Text style={{ flex: 2, fontSize: 7, color: C.text, lineHeight: 1.3, paddingRight: 4 }}>{r.prompt}</Text>
          <Text style={{ flex: 1, fontSize: 6.5, color: C.light }}>{r.competencyName ?? '—'}</Text>
          <Text style={{ width: 30, fontSize: 7, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: scoreColor(r.geral, scoreToPercent(r.geral, scale)) }}>
            {r.geral.toFixed(2)}
          </Text>
          {cols.map((c) => {
            const v = r.perRel[c.key]
            return (
              <Text
                key={c.key}
                style={{ width: 30, fontSize: 7, textAlign: 'right', color: v != null ? scoreColor(v, scoreToPercent(v, scale)) : C.light }}
              >
                {v != null ? v.toFixed(2) : '—'}
              </Text>
            )
          })}
        </View>
      ))}
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

// ─── 8a. Favorabilidade por perfil do avaliador (best-effort) ─────────────────

function FavorabilityByDemographicSectionPDF({ groups, scaleId }: { groups: DemographicGroupPDF[]; scaleId: string }) {
  const scale = getScale(scaleId)

  const byDimension = new Map<string, { value: string; fav: ReturnType<typeof computeFavorability> }[]>()
  for (const g of groups) {
    if (!g.distribution) continue
    const fav = computeFavorability(g.distribution, scale)
    if (fav.total === 0) continue
    if (!byDimension.has(g.dimension)) byDimension.set(g.dimension, [])
    byDimension.get(g.dimension)!.push({ value: g.value, fav })
  }

  const dimensions = [...byDimension.entries()]
    .filter(([, rows]) => rows.length >= 2)
    .map(([dim, rows]) => ({ dim, rows: rows.sort((a, b) => b.fav.favoravel - a.fav.favoravel) }))

  if (dimensions.length === 0) return null

  return (
    <View style={s.section} break>
      <SectionTitle>Favorabilidade por perfil do avaliador</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Como a favorabilidade varia entre diferentes grupos de avaliadores.
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        {dimensions.map(({ dim, rows }) => (
          <View key={dim} style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {DEMOGRAPHIC_DIMENSION_LABEL_PDF[dim as DemographicGroupPDF['dimension']]}
            </Text>
            {rows.map((r) => (
              <View key={r.value} style={{ marginBottom: 6 }} wrap={false}>
                <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 7, color: C.text }}>{r.value}</Text>
                  <Text style={{ fontSize: 6.5, color: C.light }}>{r.fav.favoravel.toFixed(0)}%</Text>
                </View>
                <FavorabilityBarPDF fav={r.fav} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── 8b. Análise demográfica (Opção A — best-effort) ──────────────────────────

function DemographicBreakdownSectionPDF({ groups }: { groups: DemographicGroupPDF[] }) {
  if (groups.length === 0) return null

  const byDimension = groups.reduce<Record<string, DemographicGroupPDF[]>>((acc, g) => {
    ;(acc[g.dimension] ??= []).push(g)
    return acc
  }, {})
  const maxScore = Math.max(...groups.map((g) => g.avg_score), 1)

  return (
    <View style={s.section} break>
      <SectionTitle>Análise demográfica</SectionTitle>
      <Text style={s.sectionSubtitle}>
        Média geral (excluindo autoavaliação) por perfil do avaliador. Grupos com poucos
        respondentes são omitidos para preservar o anonimato.
      </Text>

      <View style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        {(Object.keys(byDimension) as DemographicGroupPDF['dimension'][]).map((dim) => (
          <View key={dim} style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {DEMOGRAPHIC_DIMENSION_LABEL_PDF[dim]}
            </Text>
            {byDimension[dim].map((g) => (
              <View key={g.value} style={{ marginBottom: 6 }} wrap={false}>
                <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 7, color: C.text }}>{g.value}</Text>
                  <Text style={{ fontSize: 6.5, color: C.light }}>
                    {g.avg_score.toFixed(2)} · {g.respondent_count} resp.
                  </Text>
                </View>
                <View style={{ height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ width: `${(g.avg_score / maxScore) * 100}%`, height: 4, backgroundColor: C.primary, borderRadius: 2 }} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
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

export interface DemographicGroupPDF {
  dimension:        'sexo' | 'geracao' | 'cargo' | 'tempo_casa' | 'nivel_detalhe'
  value:             string
  avg_score:         number
  respondent_count:  number
  distribution:      Record<string, number> | null | undefined
  response_count:    number
}

const DEMOGRAPHIC_DIMENSION_LABEL_PDF: Record<DemographicGroupPDF['dimension'], string> = {
  sexo:          'Sexo',
  geracao:       'Geração',
  cargo:         'Tipo de Cargo',
  tempo_casa:    'Tempo de Casa',
  nivel_detalhe: 'Nível Detalhado',
}

export interface ReportPDFProps {
  personName:       string
  cycleName:        string
  generatedAt:      string | null
  profile:          ProfileData
  snapshots:        SnapshotRow[]
  competencies:     CompetencyRow[]
  comments:         CommentRow[]
  scaleId:          string
  benchmark?:       BenchmarkMap
  evaluatorWeights?: Record<string, number>
  demographics?:    DemographicGroupPDF[]
  questionScores?:  QuestionScoreRow[]
  competencyWeights?: { name: string; weight: number }[]
  nMinimum?:        number
  relationshipDetailFavorability?: RelationshipDetailFavorabilityRowPDF[]
  /** Meta de favorabilidade (%) no radar. Default 80; passe null para ocultar. */
  goalPct?:         number | null
  brandingName:     string
  brandingLogoUrl:  string | null
}

const REL_SHORT_PDF: Record<string, string> = {
  self: 'Auto', manager: 'Gestor', peer: 'Pares', subordinate: 'Subord.', client: 'Cliente',
}
const REL_ORDER_PDF = ['self', 'manager', 'peer', 'subordinate', 'client']

function lrPct(entries: [string, number][]): [string, number][] {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total === 0) return entries.map(([c]) => [c, 0])
  const items = entries.map(([code, w]) => {
    const exact = (w / total) * 100
    return { code, floor: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  let rem = 100 - items.reduce((s, i) => s + i.floor, 0)
  items.sort((a, b) => b.remainder - a.remainder).forEach((i) => { if (rem > 0) { i.floor++; rem-- } })
  return items.map((i) => [i.code, i.floor])
}

function MethodologyBannerPDF({ evaluatorWeights }: { evaluatorWeights: Record<string, number> }) {
  const active = Object.entries(evaluatorWeights).filter(([, w]) => w > 0)
  if (active.length === 0) return null
  const sorted = active.sort((a, b) => REL_ORDER_PDF.indexOf(a[0]) - REL_ORDER_PDF.indexOf(b[0]))
  const withPct = lrPct(sorted)
  const parts = withPct
    .filter(([, pct]) => pct > 0)
    .map(([code, pct]) => `${REL_SHORT_PDF[code] ?? code} ${pct}%`)
    .join('  ·  ')
  return (
    <View style={{ backgroundColor: '#eef2ff', borderRadius: 6, padding: 8, marginBottom: 14, display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontSize: 9, color: C.primary, marginRight: 6 }}>⚖</Text>
      <View>
        <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary }}>Metodologia de ponderação</Text>
        <Text style={{ fontSize: 7.5, color: '#4f46e5', marginTop: 2 }}>{parts}</Text>
      </View>
    </View>
  )
}

function ConsultantNotesSectionPDF({ notes }: { notes: string }) {
  return (
    <View style={{ backgroundColor: '#eef2ff', borderRadius: 6, padding: 10, marginBottom: 14 }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 4 }}>
        📝 Leitura do consultor
      </Text>
      <Text style={{ fontSize: 8, color: C.text, lineHeight: 1.4 }}>{notes}</Text>
    </View>
  )
}

function MethodologyAppendixSectionPDF({
  scaleId, nMinimum, evaluatorWeights, competencyWeights, generatedAt,
}: {
  scaleId: string
  nMinimum: number
  evaluatorWeights?: Record<string, number>
  competencyWeights?: { name: string; weight: number }[]
  generatedAt: string | null
}) {
  const scale = getScale(scaleId)
  const hasEvaluatorWeights  = evaluatorWeights  != null && Object.values(evaluatorWeights).some((w) => w > 0)
  const hasCompetencyWeights = competencyWeights != null && competencyWeights.length > 0

  function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
      <View style={{ marginBottom: 8 }} wrap={false}>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 2 }}>{title}</Text>
        {children}
      </View>
    )
  }

  return (
    <View style={s.section} break>
      <SectionTitle>Metodologia deste relatório</SectionTitle>
      <Block title={`Escala utilizada — ${scale.name}`}>
        <Text style={{ fontSize: 7, color: C.light, marginBottom: 2 }}>{scale.description}</Text>
        {scale.labels.map((l) => (
          <Text key={l.value} style={{ fontSize: 6.5, color: C.light }}>{l.value} = {l.label}</Text>
        ))}
        {scale.allowNa && (
          <Text style={{ fontSize: 6.5, color: C.light, marginTop: 2 }}>
            Avaliadores podiam optar por "{scale.naLabel}" — essas respostas não entram nas médias.
          </Text>
        )}
      </Block>
      <Block title="Favorabilidade">
        <Text style={{ fontSize: 7, color: C.light }}>
          Favorável = notas {scale.max - 1} e {scale.max} · Neutro = notas intermediárias ·
          Desfavorável = notas {scale.min} e {scale.min + 1}. Calculada sobre as avaliações externas
          (exclui autoavaliação).
        </Text>
      </Block>
      <Block title="Regra de N-mínimo (anonimato)">
        <Text style={{ fontSize: 7, color: C.light }}>
          Grupos de avaliadores não-gestor (pares, subordinados) com menos de {nMinimum} respondentes
          são ocultados, para impedir que uma nota individual seja atribuída a um avaliador específico.
        </Text>
      </Block>
      <Block title="Ponto cego / força oculta">
        <Text style={{ fontSize: 7, color: C.light }}>
          Autoavaliação supera a média externa em 1,0 ponto ou mais = ponto cego; média externa supera
          a autoavaliação em 1,0 ponto ou mais = força oculta.
        </Text>
      </Block>
      <Block title="Matriz de Johari">
        <Text style={{ fontSize: 7, color: C.light, marginBottom: 2 }}>
          Classifica cada competência em quatro quadrantes, cruzando autoavaliação e percepção
          externa como "alta" ou "baixa": Arena (autoavaliação alta, externa alta), Ponto cego
          (autoavaliação alta, externa baixa), Fachada (autoavaliação baixa, externa alta) e
          Desconhecido (autoavaliação baixa, externa baixa).
        </Text>
        <Text style={{ fontSize: 7, color: C.light }}>
          O corte alto/baixo em cada eixo é a mediana das próprias competências da pessoa, não um
          valor fixo da escala — critério diferente do ponto cego/força oculta acima, complementar
          a ele.
        </Text>
      </Block>
      <Block title="Pesos por avaliador">
        {hasEvaluatorWeights ? (
          Object.entries(evaluatorWeights!).filter(([, w]) => w > 0).map(([rel, w]) => (
            <Text key={rel} style={{ fontSize: 6.5, color: C.light }}>{REL_LABEL[rel] ?? rel}: peso {w}</Text>
          ))
        ) : (
          <Text style={{ fontSize: 7, color: C.light }}>Não configurado — todos os grupos têm o mesmo peso (média simples).</Text>
        )}
      </Block>
      <Block title="Pesos por competência">
        {hasCompetencyWeights ? (
          competencyWeights!.map((c) => (
            <Text key={c.name} style={{ fontSize: 6.5, color: C.light }}>{c.name}: peso {c.weight}</Text>
          ))
        ) : (
          <Text style={{ fontSize: 7, color: C.light }}>Não configurado — todas as competências têm o mesmo peso na Média Geral.</Text>
        )}
      </Block>
      <Block title="Média simples × Média Geral ponderada">
        <Text style={{ fontSize: 7, color: C.light }}>
          A "Média Geral" no topo do relatório é a média entre os grupos de avaliadores visíveis
          {hasEvaluatorWeights || hasCompetencyWeights ? ', ajustada pelos pesos acima.' : ', sem peso configurado — equivale à média simples.'}
        </Text>
      </Block>
      {generatedAt && (
        <Block title="Data de fechamento">
          <Text style={{ fontSize: 7, color: C.light }}>
            Scores calculados em {new Date(generatedAt).toLocaleString('pt-BR')}.
          </Text>
        </Block>
      )}
    </View>
  )
}

export function ReportPDFDocument({
  personName, cycleName, generatedAt,
  profile, snapshots, competencies, comments,
  scaleId, benchmark, evaluatorWeights, demographics, questionScores = [], goalPct = 80,
  competencyWeights, nMinimum, relationshipDetailFavorability,
  brandingName, brandingLogoUrl,
}: ReportPDFProps) {
  const hasCompetencies = competencies.length > 0
  const hasBenchmark    = benchmark != null && Object.keys(benchmark).length > 0
  const hasWeights      = evaluatorWeights != null && Object.values(evaluatorWeights).some((w) => w > 0)
  const hasDemographics = demographics != null && demographics.length > 0

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

        {/* Metodologia de ponderação */}
        {hasWeights && <MethodologyBannerPDF evaluatorWeights={evaluatorWeights!} />}

        {/* Leitura do consultor */}
        {profile.consultant_notes && <ConsultantNotesSectionPDF notes={profile.consultant_notes} />}

        {/* Participação */}
        <ParticipationSectionPDF snapshots={snapshots} />

        {/* Scores consolidados + Autoconhecimento + Insights */}
        <ScoresSection profile={profile} snapshots={snapshots} competencies={competencies} scaleId={scaleId} />

        {/* Roda da liderança */}
        {hasCompetencies && (
          <DualRadarSectionPDF snapshots={snapshots} competencies={competencies} scaleId={scaleId} goalPct={goalPct} />
        )}

        {/* Avaliação por competência */}
        {hasCompetencies && (
          <CompetencyDetailSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* GAP autoavaliação × avaliadores */}
        {hasCompetencies && (
          <GAPSection snapshots={snapshots} competencies={competencies} />
        )}

        {/* Scores por perspectiva */}
        <SnapshotsByRelationshipPDF snapshots={snapshots} scaleId={scaleId} />

        {/* Top 5 / Bottom 5 (por competência) */}
        {hasCompetencies && (
          <TopBottomSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Top 5 / Bottom 5 (por pergunta) */}
        {questionScores.length > 0 && (
          <TopBottomQuestionsSectionPDF questionScores={questionScores} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Favorabilidade por nível de avaliador */}
        <FavorabilityByRelationshipSectionPDF
          snapshots={snapshots}
          scaleId={scaleId}
          detailedRows={relationshipDetailFavorability}
        />

        {/* Favorabilidade geral */}
        {hasCompetencies && (
          <FavorabilitySectionPDF snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Benchmark */}
        {hasCompetencies && hasBenchmark && (
          <BenchmarkSectionPDF snapshots={snapshots} competencies={competencies} benchmark={benchmark!} scaleId={scaleId} />
        )}

        {/* Distribuição de respostas */}
        {hasCompetencies && (
          <ScoreDistributionSectionPDF snapshots={snapshots} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Resultado detalhado — todas as perguntas */}
        {questionScores.length > 0 && (
          <AllQuestionsDetailSectionPDF questionScores={questionScores} competencies={competencies} scaleId={scaleId} />
        )}

        {/* Favorabilidade por perfil do avaliador */}
        {hasDemographics && (
          <FavorabilityByDemographicSectionPDF groups={demographics!} scaleId={scaleId} />
        )}

        {/* Análise demográfica */}
        {hasDemographics && (
          <DemographicBreakdownSectionPDF groups={demographics!} />
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

        {/* Apêndice metodológico */}
        {nMinimum != null && (
          <MethodologyAppendixSectionPDF
            scaleId={scaleId}
            nMinimum={nMinimum}
            evaluatorWeights={evaluatorWeights}
            competencyWeights={competencyWeights}
            generatedAt={profile.generated_at}
          />
        )}
      </Page>
    </Document>
  )
}

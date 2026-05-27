/**
 * ReportPDF.tsx
 *
 * Documento PDF do relatório individual 360 gerado com @react-pdf/renderer.
 * Inclui: capa, scores, índice de autoconhecimento, GAP, Top 5 / Bottom 5,
 * detalhamento por competência e comentários qualitativos.
 *
 * Uso:
 *   import { pdf } from '@react-pdf/renderer'
 *   const blob = await pdf(<ReportPDFDocument {...props} />).toBlob()
 */

import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import {
  type ProfileData,
  type SnapshotRow,
  type CompetencyRow,
  type CommentRow,
  REL_LABEL,
  REL_ORDER,
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
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Pages
  coverPage: {
    backgroundColor: C.dark,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.text,
    paddingTop: 44,
    paddingBottom: 44,
    paddingLeft: 52,
    paddingRight: 52,
    backgroundColor: C.white,
  },

  // Cover elements
  coverTopBar: {
    backgroundColor: C.primary,
    height: 6,
  },
  coverBody: {
    flex: 1,
    paddingTop: 80,
    paddingBottom: 60,
    paddingLeft: 60,
    paddingRight: 60,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  coverLogo: {
    height: 36,
    objectFit: 'contain',
    objectPosition: 'left center',
    marginBottom: 60,
  },
  coverCompanyName: {
    fontSize: 14,
    color: '#a5b4fc',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 60,
  },
  coverTitle: {
    fontSize: 11,
    color: '#c7d2fe',
    fontFamily: 'Helvetica',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  coverName: {
    fontSize: 30,
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.2,
    marginBottom: 16,
  },
  coverCycle: {
    fontSize: 13,
    color: '#a5b4fc',
    fontFamily: 'Helvetica',
    marginBottom: 8,
  },
  coverDate: {
    fontSize: 10,
    color: '#818cf8',
  },
  coverFooter: {
    borderTop: `1pt solid #3730a3`,
    paddingTop: 16,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverFooterText: {
    fontSize: 8,
    color: '#6366f1',
  },

  // Section header
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    paddingBottom: 4,
    borderBottom: `1pt solid ${C.border}`,
  },
  sectionSubtitle: {
    fontSize: 8,
    color: C.light,
    marginBottom: 12,
  },

  // Score badge row
  scoresRow: {
    display: 'flex',
    flexDirection: 'row',
    marginBottom: 16,
  },
  scoreBadge: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  scoreBadgeLast: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  scoreBadgeLabel: {
    fontSize: 7,
    color: C.muted,
    marginBottom: 4,
  },
  scoreBadgeValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },

  // Self-awareness
  indexRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  indexLabel: {
    fontSize: 8,
    color: C.muted,
    width: 130,
  },
  indexBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    marginRight: 8,
  },
  indexValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    width: 32,
    textAlign: 'right',
  },

  // Tables
  tableHeader: {
    display: 'flex',
    flexDirection: 'row',
    borderBottom: `1.5pt solid ${C.border}`,
    paddingBottom: 5,
    marginBottom: 2,
  },
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
    paddingTop: 5,
    paddingBottom: 5,
    borderBottom: `0.5pt solid ${C.border}`,
  },
  tableCell: {
    fontSize: 8.5,
    color: C.text,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // GAP badge
  gapBadge: {
    borderRadius: 4,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 2,
    paddingBottom: 2,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  // Section spacing
  section: {
    marginBottom: 24,
  },

  // Top 5 list
  rankRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  rankNumber: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    width: 16,
    color: C.muted,
  },
  rankName: {
    flex: 1,
    fontSize: 8.5,
    color: C.text,
  },
  rankScore: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    width: 32,
    textAlign: 'right',
  },
  rankBarBg: {
    height: 3,
    backgroundColor: C.border,
    borderRadius: 2,
    marginTop: 2,
  },

  // Comments
  commentBox: {
    backgroundColor: C.bg,
    borderLeft: `3pt solid ${C.border}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  commentText: {
    fontSize: 8.5,
    color: C.text,
    lineHeight: 1.5,
    fontStyle: 'italic',
  },

  // Page footer
  pageFooter: {
    position: 'absolute',
    bottom: 20,
    left: 52,
    right: 52,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5pt solid ${C.border}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: C.light,
  },
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageFooter({ name, cycle }: { name: string; cycle: string }) {
  return (
    <View style={s.pageFooter} fixed>
      <Text style={s.footerText}>{name} · {cycle}</Text>
      <Text style={s.footerText}>Confidencial · Gerado por Maptiva</Text>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>
}

// ─── Cover page ──────────────────────────────────────────────────────────────

function CoverPage({
  personName, cycleName, generatedAt,
  brandingName, brandingLogoUrl,
}: {
  personName: string; cycleName: string; generatedAt: string | null
  brandingName: string; brandingLogoUrl: string | null
}) {
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverTopBar} />
      <View style={s.coverBody}>
        <View>
          {brandingLogoUrl ? (
            <Image src={brandingLogoUrl} style={s.coverLogo} />
          ) : (
            <Text style={s.coverCompanyName}>{brandingName}</Text>
          )}

          <Text style={s.coverTitle}>Relatório 360° de Avaliação</Text>
          <Text style={s.coverName}>{personName}</Text>
          <Text style={s.coverCycle}>{cycleName}</Text>
          {generatedAt && (
            <Text style={s.coverDate}>Gerado em {fmtDate(generatedAt)}</Text>
          )}
        </View>

        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>Documento confidencial — uso exclusivo do participante</Text>
          <Text style={s.coverFooterText}>Maptiva · maptiva.com</Text>
        </View>
      </View>
    </Page>
  )
}

// ─── Scores page ─────────────────────────────────────────────────────────────

function ScoresSection({
  profile, snapshots, competencies, scaleId,
}: {
  profile: ProfileData; snapshots: SnapshotRow[]
  competencies: CompetencyRow[]; scaleId: string
}) {
  const scale   = getScale(scaleId)
  const scores  = [
    { label: 'Overall',     value: profile.overall_score },
    { label: 'Autoaval.',   value: profile.self_score },
    { label: 'Gestor',      value: profile.manager_score },
    { label: 'Pares',       value: profile.peer_score },
    { label: 'Subordin.',   value: profile.subordinate_score },
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
        <View style={{ display: 'flex', flexDirection: 'row', marginTop: 12 }}>
          {profile.blind_spot_count > 0 && (
            <View style={{ backgroundColor: '#fffbeb', borderRadius: 6, padding: 8, marginRight: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.amber }}>{profile.blind_spot_count}</Text>
              <Text style={{ fontSize: 8, color: C.amber, marginTop: 2 }}>Ponto{profile.blind_spot_count !== 1 ? 's' : ''} cego{profile.blind_spot_count !== 1 ? 's' : ''}</Text>
            </View>
          )}
          {profile.hidden_strength_count > 0 && (
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 6, padding: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.blue }}>{profile.hidden_strength_count}</Text>
              <Text style={{ fontSize: 8, color: C.blue, marginTop: 2 }}>Força{profile.hidden_strength_count !== 1 ? 's' : ''} oculta{profile.hidden_strength_count !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

// ─── GAP section ─────────────────────────────────────────────────────────────

function GAPSection({
  snapshots, competencies,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]
}) {
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
        const isBlind   = r.gap != null && r.gap > 0.5
        const isHidden  = r.gap != null && r.gap < -0.5
        const gapColor  = isBlind ? C.amber : isHidden ? C.blue : C.muted
        const gapBg     = isBlind ? '#fffbeb' : isHidden ? '#eff6ff' : C.bg
        const gapLabel  = isBlind ? 'Ponto cego' : isHidden ? 'Forca oculta' : r.gap != null ? 'Alinhado' : '—'

        return (
          <View key={r.id} style={s.tableRow} wrap={false}>
            <Text style={[s.tableCell, { flex: 3 }]}>{r.name}</Text>
            <Text style={[s.tableCell, { width: 48, textAlign: 'center', color: C.primary }]}>
              {fmtScore(r.selfScore)}
            </Text>
            <Text style={[s.tableCell, { width: 52, textAlign: 'center', color: C.green }]}>
              {fmtScore(r.extAvg)}
            </Text>
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

// ─── Top 5 / Bottom 5 ────────────────────────────────────────────────────────

function TopBottomSection({
  snapshots, competencies, scaleId,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
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
                <View style={[s.rankBarBg, { marginLeft: 0 }]}>
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

// ─── Competency breakdown table ───────────────────────────────────────────────

function CompetencyDetailSection({
  snapshots, competencies, scaleId,
}: {
  snapshots: SnapshotRow[]; competencies: CompetencyRow[]; scaleId: string
}) {
  const scale = getScale(scaleId)
  const withComp = snapshots.filter((s) => s.competency_id && s.score_avg != null)
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
            {r === 'self' ? 'Auto' : r === 'manager' ? 'Gestor' : r === 'peer' ? 'Pares' : r === 'subordinate' ? 'Subord.' : r}
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

// ─── Comments ─────────────────────────────────────────────────────────────────

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
  brandingName:    string
  brandingLogoUrl: string | null
}

export function ReportPDFDocument({
  personName, cycleName, generatedAt,
  profile, snapshots, competencies, comments,
  scaleId, brandingName, brandingLogoUrl,
}: ReportPDFProps) {
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

      {/* 2. Report content — flows across pages automatically */}
      <Page size="A4" style={s.page}>
        <PageFooter name={personName} cycle={cycleName} />

        <ScoresSection
          profile={profile}
          snapshots={snapshots}
          competencies={competencies}
          scaleId={scaleId}
        />

        <GAPSection snapshots={snapshots} competencies={competencies} />

        <TopBottomSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />

        <CompetencyDetailSection snapshots={snapshots} competencies={competencies} scaleId={scaleId} />

        <CommentsSection comments={comments} />

        {/* Confidentiality footer */}
        <View style={{ backgroundColor: '#eff6ff', borderRadius: 6, padding: 10, marginTop: 8 }}>
          <Text style={{ fontSize: 7.5, color: C.blue, lineHeight: 1.5 }}>
            Privacidade e anonimato: Os resultados são apresentados de forma agregada. Scores de grupos com
            menos de 3 avaliadores não são exibidos individualmente para preservar a confidencialidade.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

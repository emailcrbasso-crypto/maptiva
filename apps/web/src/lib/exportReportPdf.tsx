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

// ─── Participant card ─────────────────────────────────────────────────────────

function ParticipantCard({ p }: { p: ParticipantSummary }) {
  return (
    <View style={S.card} wrap={false}>
      <Text style={S.cardName}>{p.person_name}</Text>
      <View style={S.scoreRow}>
        <ScoreBox value={p.overall_score}     label="Overall" />
        <ScoreBox value={p.self_score}        label="Autoaval." />
        <ScoreBox value={p.manager_score}     label="Gestor" />
        <ScoreBox value={p.peer_score}        label="Pares" />
        <ScoreBox value={p.subordinate_score} label="Subordin." />
      </View>
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
}: {
  summary:   CycleSummary
  branding?: PdfBranding
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
              <ParticipantCard key={p.cycle_participant_id} p={p} />
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
 */
export async function exportCycleReportPdf(
  summary:   CycleSummary,
  branding?: PdfBranding,
): Promise<void> {
  const blob = await pdf(<ReportDocument summary={summary} branding={branding} />).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const safeName = summary.cycle_name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href     = url
  a.download = `Relatorio_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

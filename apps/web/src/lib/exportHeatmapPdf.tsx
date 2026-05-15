/**
 * exportHeatmapPdf.tsx
 * Generates a landscape PDF of the executive heatmap
 * (Departments × Competencies) using @react-pdf/renderer.
 */

import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import type { PdfBranding } from './exportReportPdf'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeatmapCompetency {
  id:   string
  name: string
}

// ─── Color helpers ────────────────────────────────────────────────────────────

/** HSL → HEX so react-pdf renders the gradient correctly. */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a  = sn * Math.min(ln, 1 - ln)
  const f  = (n: number) => {
    const k     = (n + h / 30) % 12
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Same gradient as the web heatmap: red → yellow → green on 0–5. */
function heatBg(value: number | null): string {
  if (value == null) return '#f3f4f6'
  const v   = Math.max(0, Math.min(5, value))
  const hue = (v / 5) * 120
  const sat = v < 0.5 ? 30 : 65
  return hslToHex(hue, sat, 40)
}

function heatText(value: number | null): string {
  if (value == null) return '#9ca3af'
  return Math.max(0, Math.min(5, value)) >= 2 ? '#ffffff' : '#374151'
}

function overallText(value: number | null): string {
  if (value == null) return '#d1d5db'
  if (value >= 4)    return '#15803d'
  if (value >= 3)    return '#a16207'
  return '#b91c1c'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page: {
    fontFamily:      'Helvetica',
    fontSize:        9,
    padding:         36,
    color:           '#111827',
    backgroundColor: '#ffffff',
  },

  // Header
  header:     { marginBottom: 20 },
  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  companyName:{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#9ca3af' },
  titleBlock: {},
  title:      { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle:   { fontSize: 8, color: '#6b7280' },
  dateText:   { fontSize: 8, color: '#9ca3af' },

  // Table
  table:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' },
  headerRow:  { flexDirection: 'row', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  dataRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  totalRow:   { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb' },

  // Cells
  deptCell:   { width: 130, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' },
  compCell:   { flex: 1, paddingHorizontal: 4, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  headerDept: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  headerComp: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#6b7280', textAlign: 'center' },
  deptLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151' },
  cellValue:  { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  totalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280' },
  totalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },

  // Legend
  legendRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  gradBar:    { flexDirection: 'row', height: 8, width: 160, borderRadius: 4, overflow: 'hidden' },
  legendText: { fontSize: 7, color: '#6b7280' },
  legendNote: { fontSize: 7, color: '#9ca3af', marginLeft: 16 },

  // Footer
  footer:     { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#9ca3af' },
})

// ─── PDF Document ─────────────────────────────────────────────────────────────

function HeatmapDocument({
  cycleName,
  departments,
  competencies,
  cellValues,
  compOverall,
  filterRel,
  branding,
}: {
  cycleName:    string
  departments:  string[]
  competencies: HeatmapCompetency[]
  cellValues:   Map<string, Map<string, number | null>>
  compOverall:  Map<string, number | null>
  filterRel:    'external' | 'all'
  branding:     PdfBranding
}) {
  const today     = new Date().toLocaleDateString('pt-BR')
  const relLabel  = filterRel === 'external'
    ? 'Baseado em avaliações externas (gestor + pares + subordinados)'
    : 'Baseado em todas as perspectivas (incluindo autoavaliação)'

  const footerLeft = branding.hideMaptiva
    ? `${branding.companyName} · ${branding.footerText}`
    : branding.companyName !== 'Maptiva'
    ? `${branding.companyName} · ${branding.footerText} · Powered by Maptiva`
    : `Maptiva · ${branding.footerText}`

  // Truncate competency header to fit columns
  function compHeader(name: string): string {
    return name.length > 14 ? name.slice(0, 12) + '…' : name
  }

  return (
    <Document title={`Heatmap — ${cycleName}`}>
      {/* Landscape A4 */}
      <Page size="A4" orientation="landscape" style={S.page}>

        {/* ── Header ── */}
        <View style={S.header}>
          <View style={S.headerTop}>
            <View style={S.titleBlock}>
              {branding.logoUrl ? (
                <Image
                  src={branding.logoUrl}
                  style={{ height: 22, marginBottom: 6, objectFit: 'contain', objectPositionX: 0 }}
                />
              ) : (
                <Text style={S.companyName}>{branding.companyName}</Text>
              )}
              <Text style={S.title}>{cycleName}</Text>
              <Text style={S.subtitle}>Heatmap Executivo — Departamentos × Competências</Text>
            </View>
            <Text style={S.dateText}>Gerado em {today}</Text>
          </View>
        </View>

        {/* ── Table ── */}
        <View style={S.table}>

          {/* Header row */}
          <View style={S.headerRow}>
            <View style={S.deptCell}>
              <Text style={S.headerDept}>Departamento</Text>
            </View>
            {competencies.map((c) => (
              <View key={c.id} style={S.compCell}>
                <Text style={S.headerComp}>{compHeader(c.name)}</Text>
              </View>
            ))}
          </View>

          {/* Data rows */}
          {departments.map((dept, rowIdx) => {
            const compAvgMap = cellValues.get(dept)
            return (
              <View
                key={dept}
                style={[
                  S.dataRow,
                  rowIdx === departments.length - 1 ? { borderBottomWidth: 0 } : {},
                ]}
              >
                <View style={S.deptCell}>
                  <Text style={S.deptLabel}>{dept}</Text>
                </View>
                {competencies.map((c) => {
                  const val = compAvgMap?.get(c.id) ?? null
                  return (
                    <View
                      key={c.id}
                      style={[S.compCell, { backgroundColor: heatBg(val) }]}
                    >
                      <Text style={[S.cellValue, { color: heatText(val) }]}>
                        {val != null ? val.toFixed(2) : '—'}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )
          })}

          {/* Overall average row */}
          <View style={S.totalRow}>
            <View style={S.deptCell}>
              <Text style={S.totalLabel}>Média geral</Text>
            </View>
            {competencies.map((c) => {
              const val = compOverall.get(c.id) ?? null
              return (
                <View key={c.id} style={S.compCell}>
                  <Text style={[S.totalValue, { color: overallText(val) }]}>
                    {val != null ? val.toFixed(2) : '—'}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* ── Color legend ── */}
        <View style={S.legendRow}>
          <Text style={S.legendText}>Escala de cores:</Text>
          {/* Gradient bar — 20 slices */}
          <View style={S.gradBar}>
            {Array.from({ length: 20 }).map((_, i) => (
              <View
                key={i}
                style={{ flex: 1, backgroundColor: heatBg((i / 19) * 5) }}
              />
            ))}
          </View>
          <Text style={S.legendText}>0.0 → 5.0</Text>
          <Text style={S.legendNote}>{relLabel}</Text>
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

export async function exportHeatmapPdf(
  cycleName:    string,
  departments:  string[],
  competencies: HeatmapCompetency[],
  cellValues:   Map<string, Map<string, number | null>>,
  compOverall:  Map<string, number | null>,
  filterRel:    'external' | 'all',
  branding:     PdfBranding,
): Promise<void> {
  const blob = await pdf(
    <HeatmapDocument
      cycleName={cycleName}
      departments={departments}
      competencies={competencies}
      cellValues={cellValues}
      compOverall={compOverall}
      filterRel={filterRel}
      branding={branding}
    />
  ).toBlob()

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const safeName = cycleName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href         = url
  a.download     = `Heatmap_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

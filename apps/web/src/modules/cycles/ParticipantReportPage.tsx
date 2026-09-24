/**
 * ParticipantReportPage — Relatório individual visto pelo administrador
 * Rota: /cycles/:id/participants/:cpId/report
 *
 * Usa o RPC `get_participant_report(cycle_id, cp_id)` — admin/owner only.
 * Exibe o mesmo layout completo do MyReportPage (Phase 1).
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { pdf } from '@react-pdf/renderer'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/modules/auth/TenantContext'
import {
  type SnapshotRow,
  type CompetencyRow,
  type CommentRow,
  type ProfileData,
  type BenchmarkEntry,
  type BenchmarkMap,
  type QuestionScoreRow,
  ReportDisplay,
  FavorabilityByDemographicSection,
  MethodologyAppendixSection,
  ExternalComparisonSection,
  type ExternalComparisonRow,
  type RelationshipDetailFavorabilityRow,
  type CompetencyRelationshipFavorabilityRow,
  type ReportNotesRow,
  type DivergenceRow,
  tenantRelOverrides,
} from './reportShared'
import { ReportPDFDocument } from './ReportPDF'
import { ReportExecutivePDFDocument, type ReliabilityInfo, type BenchmarkOverall } from './ReportExecutivePDF'

// ─── Corte demográfico (Opção A — lê metadata_json do avaliador quando existir) ─

export interface DemographicGroup {
  dimension:        'sexo' | 'geracao' | 'cargo' | 'tempo_casa' | 'nivel_detalhe'
  value:             string
  avg_score:         number
  respondent_count:  number
  distribution:      Record<string, number> | null | undefined
  response_count:    number
}

const DEMOGRAPHIC_DIMENSION_LABEL: Record<DemographicGroup['dimension'], string> = {
  sexo:           'Sexo',
  geracao:        'Geração',
  cargo:          'Tipo de Cargo',
  tempo_casa:     'Tempo de Casa',
  nivel_detalhe:  'Nível Detalhado',
}

/** "Direto"/"Indireto" cru fica ambíguo fora de contexto — mostra o rótulo
 * completo (mesma terminologia usada no resto do relatório) quando disponível. */
const NIVEL_DETALHE_VALUE_LABEL: Record<string, string> = {
  Direto:   'Equipe',
  Indireto: 'Equipe Indireta',
}

/** Cargo/área às vezes vêm em CAIXA ALTA do cadastro importado pelo cliente
 * (ex.: "COORDENADOR MANUTENÇAO") — normaliza pra Title Case pro cabeçalho
 * do relatório executivo, mantendo preposições comuns em minúsculo. */
const TITLE_CASE_LOWERCASE_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
export function toTitleCasePtBr(text: string): string {
  return text
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((word, i) => (i > 0 && TITLE_CASE_LOWERCASE_WORDS.has(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)))
    .join(' ')
}

function DemographicBreakdownSection({ groups }: { groups: DemographicGroup[] }) {
  if (groups.length === 0) return null

  const byDimension = groups.reduce<Record<string, DemographicGroup[]>>((acc, g) => {
    ;(acc[g.dimension] ??= []).push(g)
    return acc
  }, {})

  const maxScore = Math.max(...groups.map((g) => g.avg_score), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-5 print-page-break">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Análise demográfica</h2>
      <p className="text-xs text-gray-400 mb-5">
        Média geral (excluindo autoavaliação) por perfil do avaliador. Grupos com poucos
        respondentes são omitidos para preservar o anonimato.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {(Object.keys(byDimension) as DemographicGroup['dimension'][]).map((dim) => (
          <div key={dim}>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
              {DEMOGRAPHIC_DIMENSION_LABEL[dim]}
            </h3>
            <div className="space-y-2.5">
              {byDimension[dim].map((g) => (
                <div key={g.value}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 truncate">
                      {dim === 'nivel_detalhe' ? (NIVEL_DETALHE_VALUE_LABEL[g.value] ?? g.value) : g.value}
                    </span>
                    <span className="text-gray-400 shrink-0 ml-2">
                      {g.avg_score.toFixed(2)} · {g.respondent_count} resp.
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${(g.avg_score / maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ParticipantReportPage() {
  const { id, cpId }  = useParams<{ id: string; cpId: string }>()
  const { branding }  = useTenant()
  const relOverrides  = tenantRelOverrides(branding.slug)

  const [cycleName,      setCycleName]      = useState<string>('')
  const [personName,     setPersonName]     = useState<string>('')
  const [personId,       setPersonId]       = useState<string>('')
  const [snapshots,      setSnapshots]      = useState<SnapshotRow[]>([])
  const [competencies,   setCompetencies]   = useState<CompetencyRow[]>([])
  const [comments,       setComments]       = useState<CommentRow[]>([])
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [scaleId,        setScaleId]        = useState<string>('likert_5')
  const [generatedAt,    setGeneratedAt]    = useState<string | null>(null)
  const [benchmark,        setBenchmark]        = useState<BenchmarkMap | undefined>(undefined)
  const [questionScores,   setQuestionScores]   = useState<QuestionScoreRow[]>([])
  const [evaluatorWeights, setEvaluatorWeights] = useState<Record<string, number> | undefined>(undefined)
  const [competencyWeights, setCompetencyWeights] = useState<{ name: string; weight: number }[] | undefined>(undefined)
  const [nMinimum,          setNMinimum]          = useState<number | undefined>(undefined)
  const [demographics,     setDemographics]     = useState<DemographicGroup[]>([])
  const [externalComparison, setExternalComparison] = useState<ExternalComparisonRow[]>([])
  const [relDetailFav, setRelDetailFav] = useState<RelationshipDetailFavorabilityRow[] | undefined>(undefined)
  const [compRelFav, setCompRelFav] = useState<CompetencyRelationshipFavorabilityRow[] | undefined>(undefined)
  const [reportNotes, setReportNotes] = useState<ReportNotesRow | null>(null)
  const [divergence, setDivergence] = useState<DivergenceRow[] | undefined>(undefined)
  const [personRole,     setPersonRole]     = useState<string | null>(null)
  const [questionValueNames, setQuestionValueNames] = useState<Record<number, string>>({})
  const [reliability,    setReliability]    = useState<ReliabilityInfo | null>(null)
  const [benchmarkOverall, setBenchmarkOverall] = useState<BenchmarkOverall | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [pdfLoading,     setPdfLoading]     = useState(false)
  const [execPdfLoading, setExecPdfLoading] = useState(false)
  const [participantPdfLoading, setParticipantPdfLoading] = useState(false)

  useEffect(() => {
    if (!id || !cpId) return
    async function load() {
      const { data, error: rpcErr } = await supabase.rpc('get_participant_report', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })

      if (rpcErr) {
        setError(
          rpcErr.message.includes('not_authorized')      ? 'Você não tem permissão para ver este relatório.'
          : rpcErr.message.includes('participant_not_found') ? 'Participante não encontrado neste ciclo.'
          : rpcErr.message.includes('cycle_not_found')      ? 'Ciclo não encontrado.'
          : rpcErr.message
        )
        setLoading(false)
        return
      }

      const d = data as {
        cycle:     { id: string; name: string; status: string }
        profile:   ProfileData | null
        snapshots: SnapshotRow[]
        person:    { id: string; name: string } | null
      }

      setCycleName(d.cycle.name)
      if (d.person?.id) setPersonId(d.person.id)
      setPersonName(d.person?.name ?? 'Participante')
      setSnapshots(d.snapshots ?? [])
      if (d.profile) {
        setProfile(d.profile)
        setGeneratedAt(d.profile.generated_at ?? null)
      }

      // Load competency names
      const compIds = [...new Set(
        (d.snapshots ?? []).map((s) => s.competency_id).filter(Boolean) as string[]
      )]
      let compData: { id: string; name: string; dimension_code: string | null }[] = []
      if (compIds.length > 0) {
        const { data } = await supabase
          .from('competencies')
          .select('id, name, dimension_code')
          .in('id', compIds)
        compData = data ?? []
        setCompetencies(compData as CompetencyRow[])
      }

      // Load comments (admin can see all comments for this participant)
      const { data: commData } = await supabase
        .from('comments_published')
        .select('id, cycle_id, evaluated_cycle_participant_id, relationship_group, body')
        .eq('cycle_id', id)
        .eq('evaluated_cycle_participant_id', cpId)
      setComments((commData ?? []) as CommentRow[])

      // Load scale_id from template
      const { data: cycleRow } = await supabase
        .from('cycles')
        .select('template_id')
        .eq('id', id)
        .single()
      if (cycleRow?.template_id) {
        const { data: tmplRow } = await supabase
          .from('templates')
          .select('scale_id, n_minimum_default')
          .eq('id', cycleRow.template_id)
          .single()
        if (tmplRow?.scale_id) setScaleId(tmplRow.scale_id)
        if (tmplRow?.n_minimum_default != null) setNMinimum(tmplRow.n_minimum_default)

        // Valores organizacionais (best-effort — só existe quando a migration
        // 0102 populou questions.value_name pro template deste ciclo)
        const { data: valueRows } = await supabase
          .from('questions')
          .select('order_index, value_name')
          .eq('template_id', cycleRow.template_id)
          .not('value_name', 'is', null)
        if (Array.isArray(valueRows)) {
          const map: Record<number, string> = {}
          for (const r of valueRows as { order_index: number; value_name: string }[]) map[r.order_index] = r.value_name
          setQuestionValueNames(map)
        }
      }

      // Cargo/área (best-effort — pro cabeçalho do relatório executivo)
      if (d.person?.id) {
        const { data: personRow } = await supabase
          .from('people')
          .select('job_title, department')
          .eq('id', d.person.id)
          .maybeSingle()
        if (personRow) {
          const parts = [personRow.job_title, personRow.department].filter(Boolean).map(toTitleCasePtBr)
          setPersonRole(parts.length > 0 ? parts.join(' · ') : null)
        }
      }

      // Confiabilidade do resultado ao vivo (best-effort — migration 0103/0104)
      const { data: relData } = await supabase.rpc('get_participant_reliability', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (relData) setReliability(relData as ReliabilityInfo)

      // Média geral do grupo comparativo + posição no ranking (best-effort —
      // migration 0105, calcula "média das médias gerais por pessoa" exatamente
      // como a metodologia do relatório executivo define)
      const { data: bmOverallData } = await supabase.rpc('get_cycle_benchmark_overall', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (bmOverallData) setBenchmarkOverall(bmOverallData as BenchmarkOverall)

      // Load cycle benchmark (best-effort)
      const { data: bmData } = await supabase.rpc('get_cycle_benchmark', { p_cycle_id: id })
      if (Array.isArray(bmData) && bmData.length > 0) {
        const map: BenchmarkMap = {}
        for (const row of bmData as BenchmarkEntry[]) {
          const key = row.competency_id ?? '__overall__'
          map[key] = row
        }
        setBenchmark(map)
      }

      // Load question-level scores for this participant (best-effort)
      const { data: qData } = await supabase.rpc('get_question_scores', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (Array.isArray(qData)) setQuestionScores(qData as QuestionScoreRow[])

      // Evaluator/competency weights (best-effort — shown na banner e no apêndice de metodologia)
      const { data: wData } = await supabase.rpc('get_cycle_weights', { p_cycle_id: id })
      if (wData) {
        const w = wData as {
          evaluator_weights?:  { relationship_code: string; weight: number }[]
          competency_weights?: { competency_id: string; weight: number }[]
        }
        const ew = w.evaluator_weights ?? []
        if (ew.length > 0) {
          const map: Record<string, number> = {}
          for (const row of ew) map[row.relationship_code] = row.weight
          setEvaluatorWeights(map)
        }
        const cw = w.competency_weights ?? []
        if (cw.length > 0) {
          const compNameMap = new Map((compData ?? []).map((c) => [c.id, c.name]))
          setCompetencyWeights(
            cw.map((row) => ({ name: compNameMap.get(row.competency_id) ?? row.competency_id, weight: row.weight }))
          )
        }
      }

      // Corte demográfico (best-effort — só aparece se houver metadata_json nos avaliadores)
      const { data: demoData } = await supabase.rpc('get_participant_demographic_breakdown', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (Array.isArray(demoData)) setDemographics(demoData as DemographicGroup[])

      // Favorabilidade detalhada por nível (Pares/Equipe Direto/Indireto — best-effort)
      const { data: relFavData } = await supabase.rpc('get_participant_relationship_favorability', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (Array.isArray(relFavData)) setRelDetailFav(relFavData as RelationshipDetailFavorabilityRow[])

      // Favorabilidade detalhada por competência × nível (heatmap — best-effort)
      const { data: compRelFavData } = await supabase.rpc('get_participant_competency_relationship_favorability', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (Array.isArray(compRelFavData)) setCompRelFav(compRelFavData as CompetencyRelationshipFavorabilityRow[])

      // Leitura pré-calculada do número único (best-effort — só existe em ciclos
      // com overall_score externo, ex.: Flexmetal v2)
      const { data: notesData } = await supabase
        .from('participant_report_notes')
        .select('*')
        .eq('cycle_id', id)
        .eq('cycle_participant_id', cpId)
        .maybeSingle()
      setReportNotes((notesData as ReportNotesRow | null) ?? null)

      // Divergência entre perspectivas — calculada ao vivo a partir das
      // respostas (mesma fonte que o resto do relatório), não mais lida da
      // tabela importada verbatim da planilha do cliente.
      const { data: divData } = await supabase.rpc('get_participant_question_divergence', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })
      if (Array.isArray(divData)) setDivergence(divData as DivergenceRow[])

      // Comparativo com ciclo anterior (best-effort — só existe para quem tem histórico)
      if (d.person?.id) {
        const { data: compData } = await supabase.rpc('get_person_external_comparison', {
          p_person_id: d.person.id,
        })
        if (Array.isArray(compData)) setExternalComparison(compData as ExternalComparisonRow[])
      }

      setLoading(false)
    }
    load()
  }, [id, cpId])

  async function handleSaveConsultantNotes(text: string) {
    if (!id || !cpId) return
    const { error: rpcErr } = await supabase.rpc('update_consultant_notes', {
      p_cycle_id: id,
      p_cp_id:    cpId,
      p_notes:    text,
    })
    if (rpcErr) throw rpcErr
    setProfile((prev) => (prev ? { ...prev, consultant_notes: text.trim() || null } : prev))
  }

  async function handleDownloadPDF() {
    if (!profile) return
    setPdfLoading(true)
    try {
      const blob = await pdf(
        <ReportPDFDocument
          personName={personName}
          cycleName={cycleName}
          generatedAt={generatedAt}
          profile={profile}
          snapshots={snapshots}
          competencies={competencies}
          comments={comments}
          scaleId={scaleId}
          benchmark={benchmark}
          evaluatorWeights={evaluatorWeights}
          demographics={demographics}
          questionScores={questionScores}
          competencyWeights={competencyWeights}
          nMinimum={nMinimum}
          relationshipDetailFavorability={relDetailFav}
          competencyRelationshipFavorability={compRelFav}
          reportNotes={reportNotes}
          divergence={divergence}
          relOverrides={relOverrides}
          brandingName={branding.name}
          brandingLogoUrl={branding.logoUrl ?? null}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `relatorio-${personName.replace(/\s+/g, '-')}-${cycleName.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleDownloadExecutivePDF() {
    setExecPdfLoading(true)
    try {
      const blob = await pdf(
        <ReportExecutivePDFDocument
          personName={personName}
          personRole={personRole}
          tenantName={branding.name}
          cycleLabel={cycleName}
          issuedAt={new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          scaleId={scaleId}
          competencies={competencies}
          questionScores={questionScores}
          questionValueNames={questionValueNames}
          relDetailFav={relDetailFav ?? []}
          divergence={divergence ?? []}
          demographics={demographics}
          benchmark={benchmark}
          reliability={reliability}
          benchmarkOverall={benchmarkOverall}
          nMinimum={nMinimum ?? 3}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `relatorio-executivo-${personName.replace(/\s+/g, '-')}-${cycleName.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExecPdfLoading(false)
    }
  }

  async function handleDownloadParticipantPDF() {
    setParticipantPdfLoading(true)
    try {
      const blob = await pdf(
        <ReportExecutivePDFDocument
          variant="participant"
          personName={personName}
          personRole={personRole}
          tenantName={branding.name}
          cycleLabel={cycleName}
          issuedAt={new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          scaleId={scaleId}
          competencies={competencies}
          questionScores={questionScores}
          questionValueNames={questionValueNames}
          relDetailFav={relDetailFav ?? []}
          divergence={divergence ?? []}
          demographics={demographics}
          benchmark={benchmark}
          reliability={reliability}
          benchmarkOverall={benchmarkOverall}
          nMinimum={nMinimum ?? 3}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `relatorio-individual-${personName.replace(/\s+/g, '-')}-${cycleName.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setParticipantPdfLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando relatório...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link
          to={`/cycles/${id}/report`}
          className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block"
        >
          ← Voltar ao relatório do ciclo
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 no-print">
        <Link
          to={`/cycles/${id}/report`}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Voltar ao relatório do ciclo
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{personName}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Relatório individual — {cycleName}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {generatedAt && (
              <p className="text-xs text-gray-400">
                Calculado em {new Date(generatedAt).toLocaleString('pt-BR')}
              </p>
            )}
            <span className="text-xs bg-violet-50 text-violet-600 px-3 py-1 rounded-full font-medium">
              Visão Admin
            </span>
            {profile && personId && (
              <Link
                to={`/people/${personId}/pdi?cycleId=${id}&cpId=${cpId}`}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                🎯 Criar PDI
              </Link>
            )}
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading || !profile}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {pdfLoading ? '⏳ Gerando...' : '⬇️ Exportar PDF'}
            </button>
            <button
              onClick={handleDownloadExecutivePDF}
              disabled={execPdfLoading || !profile}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors disabled:opacity-50"
            >
              {execPdfLoading ? '⏳ Gerando...' : '📘 Relatório Executivo (PDF)'}
            </button>
            <button
              onClick={handleDownloadParticipantPDF}
              disabled={participantPdfLoading || !profile}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              {participantPdfLoading ? '⏳ Gerando...' : '📧 Relatório Individual p/ Envio (PDF)'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{personName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Relatório 360° — {cycleName}
          {generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString('pt-BR')}` : ''}
        </p>
      </div>

      {!profile ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Relatório ainda não gerado para {personName}
          </h2>
          <p className="text-sm text-gray-500">
            Os scores serão calculados quando o ciclo for encerrado e as pontuações consolidadas.
          </p>
        </div>
      ) : (
        <>
          <ReportDisplay
            snapshots={snapshots}
            competencies={competencies}
            comments={comments}
            profile={profile}
            scaleId={scaleId}
            benchmark={benchmark}
            questionScores={questionScores}
            evaluatorWeights={evaluatorWeights}
            onSaveConsultantNotes={handleSaveConsultantNotes}
            relationshipDetailFavorability={relDetailFav}
            competencyRelationshipFavorability={compRelFav}
            reportNotes={reportNotes}
            divergence={divergence}
            relOverrides={relOverrides}
          />
          <FavorabilityByDemographicSection groups={demographics} scaleId={scaleId} />
          <DemographicBreakdownSection groups={demographics} />
          <ExternalComparisonSection
            rows={externalComparison}
            only={cycleName.toLowerCase().includes('valor') ? 'valor' : 'dimensao'}
          />
          {nMinimum != null && (
            <div className="mt-5">
              <MethodologyAppendixSection
                scaleId={scaleId}
                info={{ nMinimum, evaluatorWeights, competencyWeights, generatedAt: profile.generated_at, externalScores: reportNotes != null, readingThreshold: reportNotes?.reading_threshold }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

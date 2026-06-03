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
} from './reportShared'
import { ReportPDFDocument } from './ReportPDF'

export function ParticipantReportPage() {
  const { id, cpId }  = useParams<{ id: string; cpId: string }>()
  const { branding }  = useTenant()

  const [cycleName,      setCycleName]      = useState<string>('')
  const [personName,     setPersonName]     = useState<string>('')
  const [snapshots,      setSnapshots]      = useState<SnapshotRow[]>([])
  const [competencies,   setCompetencies]   = useState<CompetencyRow[]>([])
  const [comments,       setComments]       = useState<CommentRow[]>([])
  const [profile,        setProfile]        = useState<ProfileData | null>(null)
  const [scaleId,        setScaleId]        = useState<string>('likert_5')
  const [generatedAt,    setGeneratedAt]    = useState<string | null>(null)
  const [benchmark,        setBenchmark]        = useState<BenchmarkMap | undefined>(undefined)
  const [questionScores,   setQuestionScores]   = useState<QuestionScoreRow[]>([])
  const [evaluatorWeights, setEvaluatorWeights] = useState<Record<string, number> | undefined>(undefined)
  const [loading,          setLoading]          = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [pdfLoading,     setPdfLoading]     = useState(false)

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
        person:    { name: string } | null
      }

      setCycleName(d.cycle.name)
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
      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from('competencies')
          .select('id, name, dimension_code')
          .in('id', compIds)
        setCompetencies((compData ?? []) as CompetencyRow[])
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
          .select('scale_id')
          .eq('id', cycleRow.template_id)
          .single()
        if (tmplRow?.scale_id) setScaleId(tmplRow.scale_id)
      }

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

      // Evaluator weights (best-effort — shown as methodology banner)
      const { data: wData } = await supabase.rpc('get_cycle_weights', { p_cycle_id: id })
      if (wData) {
        const ew = (wData as { evaluator_weights?: { relationship_code: string; weight: number }[] })
          .evaluator_weights ?? []
        if (ew.length > 0) {
          const map: Record<string, number> = {}
          for (const row of ew) map[row.relationship_code] = row.weight
          setEvaluatorWeights(map)
        }
      }

      setLoading(false)
    }
    load()
  }, [id, cpId])

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
            <button
              onClick={handleDownloadPDF}
              disabled={pdfLoading || !profile}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {pdfLoading ? '⏳ Gerando...' : '⬇️ Exportar PDF'}
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
        <ReportDisplay
          snapshots={snapshots}
          competencies={competencies}
          comments={comments}
          profile={profile}
          scaleId={scaleId}
          benchmark={benchmark}
          questionScores={questionScores}
          evaluatorWeights={evaluatorWeights}
        />
      )}
    </div>
  )
}

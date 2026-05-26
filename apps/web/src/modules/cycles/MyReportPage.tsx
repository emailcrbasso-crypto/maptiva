/**
 * MyReportPage — Relatório individual do participante logado
 * Rota: /cycles/:id/my-report
 *
 * Usa o RPC `get_my_report(cycle_id)` que:
 *   - É automaticamente escopado ao usuário logado (via auth.uid → people)
 *   - Requer relatório liberado (report_release_at set) para não-admin
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  type SnapshotRow,
  type CompetencyRow,
  type CommentRow,
  type ProfileData,
  ReportDisplay,
} from './reportShared'

// ─── Main page ────────────────────────────────────────────────────────────────

export function MyReportPage() {
  const { id } = useParams<{ id: string }>()

  const [cycleName,    setCycleName]    = useState<string>('')
  const [snapshots,    setSnapshots]    = useState<SnapshotRow[]>([])
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [comments,     setComments]     = useState<CommentRow[]>([])
  const [profile,      setProfile]      = useState<ProfileData | null>(null)
  const [scaleId,      setScaleId]      = useState<string>('likert_5')
  const [generatedAt,  setGeneratedAt]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [errorCode,    setErrorCode]    = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data, error } = await supabase.rpc('get_my_report', { p_cycle_id: id })

      if (error) {
        setErrorCode(
          error.message.includes('report_not_released') ? 'not_released'
          : error.message.includes('participant_not_found') ? 'not_participant'
          : error.message.includes('cycle_not_found') ? 'not_found'
          : 'generic'
        )
        setLoading(false)
        return
      }

      const d = data as {
        cycle:     { id: string; name: string; status: string }
        profile:   ProfileData | null
        snapshots: SnapshotRow[]
      }

      setCycleName(d.cycle.name)
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

      // Load comments
      const { data: commData } = await supabase
        .from('comments_published')
        .select('id, cycle_id, evaluated_cycle_participant_id, relationship_group, body')
        .eq('cycle_id', id)
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

      setLoading(false)
    }
    load()
  }, [id])

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando seu relatório...</p>
      </div>
    )
  }

  if (errorCode) {
    const messages: Record<string, { title: string; body: string; icon: string }> = {
      not_released: {
        icon: '🔒',
        title: 'Relatório ainda não liberado',
        body: 'O administrador do ciclo ainda não liberou os resultados para os participantes.',
      },
      not_participant: {
        icon: '👤',
        title: 'Você não é participante deste ciclo',
        body: 'Sua conta não está vinculada como participante neste ciclo de avaliação.',
      },
      not_found: {
        icon: '🔍',
        title: 'Ciclo não encontrado',
        body: 'O ciclo de avaliação solicitado não existe ou você não tem acesso.',
      },
      generic: {
        icon: '⚠️',
        title: 'Erro ao carregar relatório',
        body: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      },
    }
    const msg = messages[errorCode] ?? messages.generic
    return (
      <div className="max-w-4xl mx-auto">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← Voltar
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-4">{msg.icon}</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{msg.title}</h2>
          <p className="text-sm text-gray-500">{msg.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 no-print">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">
          ← Meus ciclos
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{cycleName}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Meu relatório individual</p>
          </div>
          <div className="flex items-center gap-3">
            {generatedAt && (
              <p className="text-xs text-gray-400">
                Calculado em {new Date(generatedAt).toLocaleString('pt-BR')}
              </p>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Print-only header (shown only when printing) */}
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{cycleName}</h1>
        <p className="text-sm text-gray-500 mt-1">Relatório individual — {generatedAt ? new Date(generatedAt).toLocaleDateString('pt-BR') : ''}</p>
      </div>

      {!profile ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Relatório ainda não gerado
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
        />
      )}
    </div>
  )
}

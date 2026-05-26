/**
 * ParticipantReportPage — Relatório individual visto pelo administrador
 * Rota: /cycles/:id/participants/:cpId/report
 *
 * Usa o RPC `get_participant_report(cycle_id, cp_id)` — admin/owner only.
 * Exibe o mesmo layout completo do MyReportPage (Phase 1).
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

export function ParticipantReportPage() {
  const { id, cpId } = useParams<{ id: string; cpId: string }>()

  const [cycleName,    setCycleName]    = useState<string>('')
  const [personName,   setPersonName]   = useState<string>('')
  const [snapshots,    setSnapshots]    = useState<SnapshotRow[]>([])
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [comments,     setComments]     = useState<CommentRow[]>([])
  const [profile,      setProfile]      = useState<ProfileData | null>(null)
  const [scaleId,      setScaleId]      = useState<string>('likert_5')
  const [generatedAt,  setGeneratedAt]  = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (!id || !cpId) return
    async function load() {
      const { data, error: rpcErr } = await supabase.rpc('get_participant_report', {
        p_cycle_id: id,
        p_cp_id:    cpId,
      })

      if (rpcErr) {
        setError(
          rpcErr.message.includes('not_authorized') ? 'Você não tem permissão para ver este relatório.'
          : rpcErr.message.includes('participant_not_found') ? 'Participante não encontrado neste ciclo.'
          : rpcErr.message.includes('cycle_not_found') ? 'Ciclo não encontrado.'
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

      // Load comments (admin can see all)
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

      setLoading(false)
    }
    load()
  }, [id, cpId])

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
      <div className="mb-6">
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
          <div className="flex items-center gap-3">
            {generatedAt && (
              <p className="text-xs text-gray-400">
                Calculado em {new Date(generatedAt).toLocaleString('pt-BR')}
              </p>
            )}
            {/* Admin badge */}
            <span className="text-xs bg-violet-50 text-violet-600 px-3 py-1 rounded-full font-medium">
              Visão Admin
            </span>
          </div>
        </div>
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
        />
      )}
    </div>
  )
}

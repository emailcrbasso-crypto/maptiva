/**
 * PdiListPage — Lista de PDIs de uma pessoa (histórico entre ciclos)
 * Rota: /people/:personId/pdi
 *
 * Fase 1 enxuta do módulo PDI. O PDI pertence à pessoa, não ao ciclo —
 * cycle_id é só metadado de origem, preservando histórico entre ciclos.
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface PdiRow {
  id:           string
  title:        string
  status:       'rascunho' | 'em_andamento' | 'concluido' | 'cancelado'
  period_start: string | null
  period_end:   string | null
  cycle_id:     string | null
  source_type:  'assessment' | 'nine_box' | 'manual'
  created_at:   string
}

const STATUS_LABEL: Record<PdiRow['status'], string> = {
  rascunho:     'Rascunho',
  em_andamento: 'Em andamento',
  concluido:    'Concluído',
  cancelado:    'Cancelado',
}
const STATUS_COLOR: Record<PdiRow['status'], string> = {
  rascunho:     'bg-gray-100 text-gray-600',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluido:    'bg-green-100 text-green-700',
  cancelado:    'bg-red-100 text-red-500',
}
const SOURCE_LABEL: Record<PdiRow['source_type'], string> = {
  assessment: '📋 A partir da avaliação',
  nine_box:   '🎯 A partir do Nine Box',
  manual:     '✎ Criado manualmente',
}

export function PdiListPage() {
  const { personId } = useParams<{ personId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Contexto de origem, quando chegamos aqui a partir de um relatório
  const fromCycleId = searchParams.get('cycleId')
  const fromCpId     = searchParams.get('cpId')

  const [personName, setPersonName] = useState('')
  const [pdis,        setPdis]       = useState<PdiRow[]>([])
  const [loading,     setLoading]    = useState(true)
  const [creating,    setCreating]   = useState(false)

  useEffect(() => {
    if (!personId) return
    async function load() {
      const { data: person } = await supabase
        .from('people').select('name').eq('id', personId).single()
      setPersonName(person?.name ?? 'Colaborador')

      const { data } = await supabase
        .from('pdi_plans')
        .select('id, title, status, period_start, period_end, cycle_id, source_type, created_at')
        .eq('person_id', personId)
        .order('created_at', { ascending: false })
      setPdis((data ?? []) as PdiRow[])
      setLoading(false)
    }
    load()
  }, [personId])

  async function handleCreate() {
    if (!personId) return
    setCreating(true)
    const payload: Record<string, unknown> = {
      person_id: personId,
      title: 'Plano de Desenvolvimento Individual',
    }
    if (fromCycleId) {
      payload.cycle_id    = fromCycleId
      payload.source_type = fromCpId ? 'assessment' : 'manual'
      if (fromCpId) payload.source_id = fromCpId
    }
    const { data, error } = await supabase
      .from('pdi_plans')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data) {
      alert(`Erro ao criar PDI: ${error?.message}`)
      setCreating(false)
      return
    }
    navigate(`/pdi/${data.id}`)
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        {fromCycleId && (
          <Link
            to={fromCpId ? `/cycles/${fromCycleId}/participants/${fromCpId}/report` : `/cycles/${fromCycleId}`}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Voltar ao relatório
          </Link>
        )}
        <div className="mt-2 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">PDI — {personName}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Planos de Desenvolvimento Individual (histórico entre ciclos)
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Criando...' : '+ Novo PDI'}
          </button>
        </div>
      </div>

      {pdis.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">🎯</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Nenhum PDI ainda</h2>
          <p className="text-sm text-gray-500">
            Crie o primeiro plano de desenvolvimento para {personName}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pdis.map((p) => (
            <Link
              key={p.id}
              to={`/pdi/${p.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{p.title}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{SOURCE_LABEL[p.source_type]}</p>
                </div>
                {(p.period_start || p.period_end) && (
                  <p className="text-xs text-gray-400 shrink-0">
                    {p.period_start ? new Date(p.period_start).toLocaleDateString('pt-BR') : '—'}
                    {' → '}
                    {p.period_end ? new Date(p.period_end).toLocaleDateString('pt-BR') : '—'}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

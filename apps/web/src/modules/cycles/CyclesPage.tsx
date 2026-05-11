import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Cycle } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  closed: 'Fechado',
  archived: 'Arquivado',
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-400',
}

export function CyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('cycles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setCycles(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Ciclos</h1>
        <Link
          to="/cycles/new"
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Novo ciclo
        </Link>
      </div>

      {loading && <p className="text-gray-400 text-sm">Carregando...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && cycles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Nenhum ciclo criado ainda.</p>
          <p className="text-sm mt-1">Crie o primeiro ciclo para começar.</p>
        </div>
      )}

      <div className="space-y-3">
        {cycles.map((cycle) => (
          <Link
            key={cycle.id}
            to={`/cycles/${cycle.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{cycle.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {cycle.deadline_at
                    ? `Prazo: ${new Date(cycle.deadline_at).toLocaleDateString('pt-BR')}`
                    : 'Sem prazo definido'}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLOR[cycle.status] ?? 'bg-gray-100 text-gray-500'}`}
              >
                {STATUS_LABEL[cycle.status] ?? cycle.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

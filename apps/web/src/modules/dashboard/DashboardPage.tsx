import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface CycleRow {
  id: string
  name: string
  status: string
  created_at: string
  start_at: string | null
  deadline_at: string | null
}

interface CycleSummary {
  cycle_id: string
  total_assignments: number
  completed_assignments: number
  participants: { cycle_participant_id: string; has_profile: boolean }[]
}

const STATUS_LABEL: Record<string, string> = {
  draft:    'Rascunho',
  active:   'Ativo',
  closed:   'Fechado',
  archived: 'Arquivado',
}

const STATUS_DOT: Record<string, string> = {
  draft:    'bg-gray-300',
  active:   'bg-blue-500',
  closed:   'bg-green-500',
  archived: 'bg-gray-200',
}

export function DashboardPage() {
  const [cycles, setCycles] = useState<CycleRow[]>([])
  const [summaries, setSummaries] = useState<Record<string, CycleSummary>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Load all non-archived cycles
      const { data: cycleData } = await supabase
        .from('cycles')
        .select('id, name, status, created_at, start_at, deadline_at')
        .not('status', 'eq', 'archived')
        .order('created_at', { ascending: false })
        .limit(10)

      const rows = (cycleData ?? []) as CycleRow[]
      setCycles(rows)

      // Load summaries for active + closed cycles in parallel
      const operable = rows.filter((c) => c.status === 'active' || c.status === 'closed')
      if (operable.length > 0) {
        const results = await Promise.all(
          operable.map((c) =>
            supabase.rpc('get_cycle_summary', { p_cycle_id: c.id }).then(({ data }) => ({
              id: c.id,
              data: data as CycleSummary | null,
            }))
          )
        )
        const map: Record<string, CycleSummary> = {}
        for (const r of results) {
          if (r.data) map[r.id] = r.data
        }
        setSummaries(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  const active   = cycles.filter((c) => c.status === 'active').length
  const draft    = cycles.filter((c) => c.status === 'draft').length
  const closed   = cycles.filter((c) => c.status === 'closed').length

  // Aggregate pending assignments across all active cycles
  const totalPending = Object.values(summaries).reduce((acc, s) => {
    return acc + (s.total_assignments - s.completed_assignments)
  }, 0)

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Ciclos ativos',    value: loading ? '—' : active,        color: 'text-blue-600' },
          { label: 'Em rascunho',      value: loading ? '—' : draft,         color: 'text-gray-500' },
          { label: 'Fechados',         value: loading ? '—' : closed,        color: 'text-green-600' },
          { label: 'Respostas pend.',  value: loading ? '—' : totalPending,  color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-3xl font-semibold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Cycles table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">Ciclos recentes</h2>
          <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">
            Ver todos →
          </Link>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-gray-400 text-sm text-center">Carregando...</p>
        ) : cycles.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-gray-400 text-sm mb-2">Nenhum ciclo ainda.</p>
            <Link to="/cycles/new" className="text-sm text-gray-900 underline">
              Criar primeiro ciclo
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cycles.map((c) => {
              const s = summaries[c.id]
              const pct = s && s.total_assignments > 0
                ? Math.round((s.completed_assignments / s.total_assignments) * 100)
                : null
              const pending = s ? s.total_assignments - s.completed_assignments : null

              return (
                <Link
                  key={c.id}
                  to={`/cycles/${c.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  {/* Status dot */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.status] ?? 'bg-gray-300'}`} />

                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{STATUS_LABEL[c.status] ?? c.status}</p>
                  </div>

                  {/* Progress bar (active/closed only) */}
                  {pct !== null ? (
                    <div className="w-36 shrink-0">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{s!.completed_assignments}/{s!.total_assignments} respostas</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct === 100 ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-300 w-36 shrink-0 text-right">
                      {c.status === 'draft' ? 'Não iniciado' : '—'}
                    </span>
                  )}

                  {/* Pending badge */}
                  {pending !== null && pending > 0 && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium shrink-0">
                      {pending} pend.
                    </span>
                  )}

                  <span className="text-gray-300 text-xs shrink-0">→</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

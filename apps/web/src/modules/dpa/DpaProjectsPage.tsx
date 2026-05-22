/**
 * DpaProjectsPage — Lista de projetos DPA
 *
 * Rota: /dpa
 * Mostra os projetos do tenant, com status e taxa de resposta.
 * Permite criar novo projeto e navegar para o dashboard de cada um.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DpaProject {
  id:         string
  nome:       string
  descricao:  string | null
  status:     'rascunho' | 'ativo' | 'encerrado'
  created_at: string
  total:      number
  respondidos: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  rascunho:  'Rascunho',
  ativo:     'Ativo',
  encerrado: 'Encerrado',
}

const STATUS_COLORS: Record<string, string> = {
  rascunho:  'bg-gray-100 text-gray-600',
  ativo:     'bg-green-100 text-green-700',
  encerrado: 'bg-gray-100 text-gray-500',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DpaProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<DpaProject[]>([])
  const [loading,  setLoading]  = useState(true)

  async function load() {
    // Load projects with participant counts via joined query
    const { data } = await supabase
      .from('dpa_projetos')
      .select('id, nome, descricao, status, created_at, dpa_participantes(id, status)')
      .order('created_at', { ascending: false })

    if (data) {
      setProjects(
        (data as unknown as Array<{
          id: string
          nome: string
          descricao: string | null
          status: 'rascunho' | 'ativo' | 'encerrado'
          created_at: string
          dpa_participantes: Array<{ id: string; status: string }>
        }>).map((p) => ({
          id:          p.id,
          nome:        p.nome,
          descricao:   p.descricao,
          status:      p.status,
          created_at:  p.created_at,
          total:       p.dpa_participantes.length,
          respondidos: p.dpa_participantes.filter((x) => x.status === 'respondido').length,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Diagnóstico Prévio Anônimo</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Questionários anônimos enviados antes de um ciclo formal.
          </p>
        </div>
        <button
          onClick={() => navigate('/dpa/new')}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Novo projeto
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Nenhum projeto ainda</h2>
          <p className="text-sm text-gray-500 mb-6">
            Crie um diagnóstico para coletar percepções anônimas da sua equipe antes de iniciar um ciclo de avaliação.
          </p>
          <button
            onClick={() => navigate('/dpa/new')}
            className="text-sm bg-gray-900 text-white px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Criar primeiro projeto
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const taxa = p.total > 0 ? Math.round((p.respondidos / p.total) * 100) : 0
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/dpa/${p.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="font-semibold text-gray-900 text-sm truncate">{p.nome}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </div>
                    {p.descricao && (
                      <p className="text-xs text-gray-500 truncate">{p.descricao}</p>
                    )}
                  </div>

                  {p.total > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-900">{taxa}%</p>
                      <p className="text-xs text-gray-400">{p.respondidos}/{p.total} respostas</p>
                      <div className="mt-1 w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${taxa}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {p.total === 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-400">Sem participantes</p>
                    </div>
                  )}
                </div>

                <p className="mt-2 text-xs text-gray-400">
                  Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

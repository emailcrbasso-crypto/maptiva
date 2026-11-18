/**
 * ClienteDashboard — página inicial do acesso de cliente: um cartão por
 * pesquisa de clima com o resumo (favorabilidade geral e participação) e o
 * botão para abrir os resultados. Substitui o painel de ciclos, que o cliente
 * não usa. As edições anteriores (usadas só no comparativo) não ganham cartão.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { htmlToText } from '@/lib/richText'
import { deltaDirection } from '@/lib/favorability'
import { fmtPct } from '@/lib/insights'
import { useAuth } from '@/modules/auth/AuthContext'
import { useTenant } from '@/modules/auth/TenantContext'

interface Projeto {
  id:        string
  nome:      string
  descricao: string | null
  status:    'rascunho' | 'ativo' | 'encerrado'
  config:    Record<string, unknown>
}

interface Resumo {
  total_participantes: number
  total_respondidos:   number
  n_respostas:         number
  favoravel:           number
  neutro:              number
  desfavoravel:        number
}

interface Cartao {
  projeto:  Projeto
  resumo:   Resumo | null
  anterior: { rotulo: string; favoravel: number } | null
}

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  ativo:     { rotulo: 'Ativa',     cor: 'bg-green-100 text-green-700' },
  encerrado: { rotulo: 'Encerrada', cor: 'bg-gray-100 text-gray-600' },
}

async function buscarResumo(id: string): Promise<Resumo | null> {
  const { data, error } = await supabase.rpc('get_dpa_resumo', { p_projeto_id: id })
  return error || !data ? null : (data as Resumo)
}

function primeiroNome(nome: string | undefined): string | null {
  if (!nome || nome.includes('@')) return null
  return nome.trim().split(/\s+/)[0] || null
}

export function ClienteDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { branding } = useTenant()
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null)

  useEffect(() => {
    let ativo = true
    async function carregar() {
      const { data } = await supabase
        .from('dpa_projetos')
        .select('id, nome, descricao, status, config')
        .neq('status', 'rascunho')
        .order('created_at', { ascending: false })
      const projetos = (data ?? []) as Projeto[]

      // Edições citadas como "anterior" por outra pesquisa só servem de comparação.
      const comoAnterior = new Set(
        projetos.map((p) => p.config.comparativo_projeto_id).filter((x): x is string => typeof x === 'string'),
      )
      const principais = projetos.filter((p) => !comoAnterior.has(p.id))
      const lista = principais.length > 0 ? principais : projetos

      const montados = await Promise.all(lista.map(async (p): Promise<Cartao> => {
        const antId = typeof p.config.comparativo_projeto_id === 'string' ? p.config.comparativo_projeto_id : null
        const antProj = antId ? projetos.find((x) => x.id === antId) : undefined
        const [resumo, resumoAnt] = await Promise.all([
          buscarResumo(p.id),
          antId ? buscarResumo(antId) : Promise.resolve(null),
        ])
        const rotulo = typeof antProj?.config.rotulo_comparativo === 'string'
          ? antProj.config.rotulo_comparativo : (antProj?.nome ?? 'edição anterior')
        return {
          projeto: p,
          resumo,
          anterior: resumoAnt && resumoAnt.n_respostas > 0 ? { rotulo, favoravel: resumoAnt.favoravel } : null,
        }
      }))
      if (ativo) setCartoes(montados)
    }
    void carregar()
    return () => { ativo = false }
  }, [])

  const nome = primeiroNome(profile?.name)

  return (
    <div className="max-w-3xl mx-auto" style={{ '--brand': branding.primaryColor } as React.CSSProperties}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">{nome ? `Olá, ${nome}` : 'Bem-vindo'}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Acompanhe os resultados da sua pesquisa de clima.</p>
      </div>

      {cartoes === null ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Carregando…</span>
          <div className="h-56 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      ) : cartoes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h2 className="text-base font-medium text-gray-900">Nenhuma pesquisa disponível ainda</h2>
          <p className="text-sm text-gray-500 mt-1">Quando uma pesquisa for publicada, ela aparece aqui.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cartoes.map(({ projeto, resumo, anterior }) => {
            const st = STATUS[projeto.status]
            const part = resumo && resumo.total_participantes > 0
              ? Math.round((resumo.total_respondidos / resumo.total_participantes) * 100) : null
            const delta = resumo && anterior ? Math.round((resumo.favoravel - anterior.favoravel) * 10) / 10 : null
            const dir = delta === null ? null : deltaDirection(delta)
            return (
              <div key={projeto.id} className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-semibold text-gray-900">{projeto.nome}</h2>
                  {st && <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${st.cor}`}>{st.rotulo}</span>}
                </div>
                {projeto.descricao && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{htmlToText(projeto.descricao)}</p>
                )}

                {resumo && resumo.n_respostas > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] mt-5">
                    <div className="rounded-lg bg-gray-50 px-4 py-3.5">
                      <p className="text-xs text-gray-500">Favorabilidade geral</p>
                      <div className="flex flex-wrap items-baseline gap-2.5 mt-0.5 mb-2.5">
                        <span className="text-3xl font-medium text-gray-900 tabular-nums">{fmtPct(resumo.favoravel)}%</span>
                        {delta !== null && anterior && dir && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                            dir === 'up' ? 'bg-green-50 text-green-700' : dir === 'down' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '►'} {delta > 0 ? '+' : delta < 0 ? '−' : ''}{fmtPct(Math.abs(delta))} p.p. vs {anterior.rotulo}
                          </span>
                        )}
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200" role="img"
                        aria-label={`Favorável ${resumo.favoravel}%, neutro ${resumo.neutro}%, desfavorável ${resumo.desfavoravel}%`}>
                        <div className="bg-green-500" style={{ width: `${resumo.favoravel}%` }} />
                        <div className="bg-gray-300" style={{ width: `${resumo.neutro}%` }} />
                        <div className="bg-red-400" style={{ width: `${resumo.desfavoravel}%` }} />
                      </div>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-4 py-3.5">
                      <p className="text-xs text-gray-500">Participação</p>
                      <p className="text-3xl font-medium text-gray-900 mt-0.5 mb-1.5 tabular-nums">{part !== null ? `${part}%` : '—'}</p>
                      <p className="text-xs text-gray-500">
                        {resumo.total_respondidos.toLocaleString('pt-BR')} de {resumo.total_participantes.toLocaleString('pt-BR')} pessoas
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-4">O resumo ainda não está disponível.</p>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/dpa/${projeto.id}`)}
                    className="text-sm px-4 py-2 rounded-lg text-white hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: 'var(--brand, #111827)' }}
                  >
                    Abrir resultados
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/dpa')}
                    className="text-sm text-gray-500 hover:text-gray-800 underline"
                  >
                    Ver todas as pesquisas
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

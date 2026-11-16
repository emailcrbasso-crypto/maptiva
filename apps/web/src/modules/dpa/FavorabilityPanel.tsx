/**
 * FavorabilityPanel — resultados de uma pesquisa de clima por favorabilidade:
 * visão por bloco, perguntas mais e menos favoráveis e cruzamento
 * bloco × unidade (com N-mínimo). Só renderiza quando o projeto liga
 * `config.favorabilidade`; o cálculo vive em lib/favorability.
 */

import { useMemo } from 'react'
import {
  favorabilityByBlock,
  favorabilityByQuestion,
  favorabilityByUnitAndBlock,
  topQuestions,
  bottomQuestions,
  type QuestionRef,
  type RespondentRow,
} from '@/lib/favorability'

interface Props {
  perguntas:    QuestionRef[]
  respondentes: RespondentRow[]
  labelUnidade: string
  nMin:         number
}

function StackedBar({ fav, neu, des }: { fav: number; neu: number; des: number }) {
  return (
    <div
      className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100"
      role="img"
      aria-label={`Favorável ${fav}%, neutro ${neu}%, desfavorável ${des}%`}
    >
      <div className="bg-green-500" style={{ width: `${fav}%` }} />
      <div className="bg-gray-300" style={{ width: `${neu}%` }} />
      <div className="bg-red-400" style={{ width: `${des}%` }} />
    </div>
  )
}

function cellColor(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-300'
  if (pct >= 70) return 'bg-green-100 text-green-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

function QuestionList({ title, items, tone }: {
  title: string
  items: ReturnType<typeof topQuestions>
  tone: 'good' | 'bad'
}) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((q) => (
          <li key={q.id} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 w-11 text-right font-semibold ${tone === 'good' ? 'text-green-700' : 'text-red-600'}`}>
              {q.favoravel}%
            </span>
            <span className="text-gray-700 leading-snug">{q.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FavorabilityPanel({ perguntas, respondentes, labelUnidade, nMin }: Props) {
  const { blocos, perguntasFav, matriz, geral } = useMemo(() => {
    const blocos = favorabilityByBlock(perguntas, respondentes)
    const perguntasFav = favorabilityByQuestion(perguntas, respondentes)
    const matriz = favorabilityByUnitAndBlock(perguntas, respondentes, nMin)
    const totalN = blocos.reduce((s, b) => s + b.n, 0)
    const weigh = (key: 'favoravel' | 'neutro' | 'desfavoravel') =>
      totalN === 0 ? 0 : Math.round((blocos.reduce((s, b) => s + b[key] * b.n, 0) / totalN) * 10) / 10
    return {
      blocos,
      perguntasFav,
      matriz,
      geral: { favoravel: weigh('favoravel'), neutro: weigh('neutro'), desfavoravel: weigh('desfavoravel') },
    }
  }, [perguntas, respondentes, nMin])

  if (blocos.length === 0 || respondentes.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-8">
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-sm font-semibold text-gray-900">Favorabilidade geral</h3>
          <span className="text-2xl font-semibold text-gray-900">{geral.favoravel}%</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Percentual de respostas 4 e 5 (concordo e concordo totalmente) em {respondentes.length.toLocaleString('pt-BR')} respondentes.
        </p>
        <StackedBar fav={geral.favoravel} neu={geral.neutro} des={geral.desfavoravel} />
        <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Favorável {geral.favoravel}%</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Neutro {geral.neutro}%</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Desfavorável {geral.desfavoravel}%</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Favorabilidade por bloco</h3>
        <div className="space-y-3">
          {[...blocos].sort((a, b) => b.favoravel - a.favoravel).map((b) => (
            <div key={b.bloco} className="flex items-center gap-3">
              <span className="text-xs text-gray-700 w-48 shrink-0 truncate" title={b.bloco}>{b.bloco}</span>
              <div className="flex-1"><StackedBar fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></div>
              <span className="text-xs font-semibold text-gray-900 w-12 text-right shrink-0">{b.favoravel}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <QuestionList title="Mais favoráveis" items={topQuestions(perguntasFav, 5)} tone="good" />
        <QuestionList title="Menos favoráveis" items={bottomQuestions(perguntasFav, 5)} tone="bad" />
      </div>

      {matriz.unidades.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Favorabilidade por bloco e {labelUnidade.toLowerCase()}</h3>
          <p className="text-xs text-gray-500 mb-3">
            Grupos com menos de {nMin} respondentes não aparecem, para proteger o anonimato.
          </p>
          <div className="overflow-x-auto -mx-2">
            <table className="text-xs border-separate border-spacing-1 min-w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-gray-500 px-2 py-1 sticky left-0 bg-white">{labelUnidade}</th>
                  {matriz.blocos.map((b) => (
                    <th key={b} className="font-medium text-gray-500 px-1 py-1 align-bottom min-w-[72px]">
                      <span className="block leading-tight">{b}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.unidades.map((u) => (
                  <tr key={u}>
                    <td className="text-gray-700 px-2 py-1 whitespace-nowrap sticky left-0 bg-white">{u}</td>
                    {matriz.blocos.map((b) => {
                      const c = matriz.celulas[u]?.[b]
                      return (
                        <td key={b} className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(c?.favoravel ?? null)}`}>
                          {c?.favoravel !== null && c?.favoravel !== undefined ? `${c.favoravel}%` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

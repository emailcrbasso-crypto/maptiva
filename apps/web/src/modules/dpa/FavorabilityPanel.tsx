/**
 * FavorabilidadePanel — resultados de uma pesquisa de clima por favorabilidade:
 * visão geral e por bloco, prioridades (importância × favorabilidade), riscos
 * psicossociais, ranking completo de perguntas e cruzamento bloco × unidade
 * (com N-mínimo). Só renderiza quando o projeto liga `config.favorabilidade`;
 * o cálculo vive em lib/favorability.
 */

import { fmtPct } from '@/lib/insights'
import { useEffect, useMemo, useState } from 'react'
import {
  favorabilityByBlock,
  favorabilityByQuestion,
  favorabilityByUnitAndBlock,
  favorabilityPooled,
  favorabilityPooledByUnit,
  compareBlocks,
  compareQuestions,
  compareUnits,
  deltaDirection,
  escalaDoQuestionario,
  textosEscala,
  type TextosEscala,
  importanceByBlock,
  priorityMatrix,
  riskQuestions,
  type FavorabilityDelta,
  type PriorityQuadrant,
  type QuestionRef,
  type RespondentRow,
} from '@/lib/favorability'

interface Props {
  perguntas:    QuestionRef[]
  respondentes: RespondentRow[]
  labelUnidade: string
  nMin:         number
  /** Pergunta de múltipla escolha cujas opções são os blocos ("escolha os 4 mais importantes"). */
  importanciaPerguntaId?: string
  /** Edição anterior da mesma pesquisa, para o comparativo (mesmas perguntas e blocos). */
  anterior?: { rotulo: string; respondentes: RespondentRow[] }
  /** Pesquisas segmentadas: mostra em destaque a favorabilidade por dimensão escolhida (empresa, base, área). */
  mostrarPorDimensao?: boolean
  /** Esconde o bloco "Favorabilidade geral" (a visão geral já o mostra). */
  ocultarGeral?: boolean
  /** Clicar em um grupo (base, empresa, área) das listas leva ao recorte dele. */
  onEntrarGrupo?: (grupo: string) => void
  /** Pedido de fora (ex.: clique no resumo) para mostrar as perguntas de um bloco no ranking. */
  pedidoRanking?: { bloco: string; ordem: 'desc' | 'asc'; n: number }
}

const QUADRANT_STYLE: Record<PriorityQuadrant, { label: string; color: string }> = {
  prioridade:     { label: 'Prioridade de ação', color: '#dc2626' },
  manter:         { label: 'Manter',             color: '#16a34a' },
  monitorar:      { label: 'Monitorar',          color: '#6b7280' },
  menor_urgencia: { label: 'Menor urgência',     color: '#2563eb' },
}

function StackedBar({ fav, neu, des }: { fav: number; neu: number; des: number }) {
  return (
    <div
      className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100"
      role="img"
      aria-label={`Favorável ${fmtPct(fav)}%, neutro ${fmtPct(neu)}%, desfavorável ${fmtPct(des)}%`}
    >
      <div className="bg-green-500" style={{ width: `${fav}%` }} />
      <div className="bg-gray-300" style={{ width: `${neu}%` }} />
      <div className="bg-red-400" style={{ width: `${des}%` }} />
    </div>
  )
}

function Legend({ textos }: { textos: TextosEscala }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
      <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{textos.rotuloFavoravel}: {textos.favoravel}</span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />{textos.rotuloNeutro}: {textos.neutro}</span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />{textos.rotuloDesfavoravel}: {textos.desfavoravel}</span>
    </div>
  )
}

function Trio({ fav, neu, des }: { fav: number; neu: number; des: number }) {
  return (
    <span className="tabular-nums whitespace-nowrap text-xs">
      <span className="font-semibold text-green-700">{fmtPct(fav)}%</span>
      <span className="text-gray-300"> · </span>
      <span className="text-gray-500">{fmtPct(neu)}%</span>
      <span className="text-gray-300"> · </span>
      <span className="text-red-600">{fmtPct(des)}%</span>
    </span>
  )
}

function cellColor(pct: number | null): string {
  if (pct === null) return 'bg-gray-50 text-gray-300'
  if (pct >= 70) return 'bg-green-100 text-green-800'
  if (pct >= 50) return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{children}</h3>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  const dir = deltaDirection(delta)
  const style = dir === 'up' ? 'text-green-700 bg-green-50'
    : dir === 'down' ? 'text-red-700 bg-red-50' : 'text-gray-600 bg-gray-100'
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '►'
  const sign = delta > 0 ? '+' : ''
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap ${style}`}
      title={dir === 'stable' ? 'Variação dentro da margem de estabilidade (±2 p.p.)' : undefined}
    >
      <span aria-hidden="true">{arrow}</span>{sign}{fmtPct(delta)} p.p.
    </span>
  )
}

function DeltaList({ title, items }: { title: string; items: FavorabilityDelta[] }) {
  return (
    <div className="flex-1 min-w-0">
      <h4 className="text-xs font-semibold text-gray-700 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((q, idx) => (
          <li key={q.chave} className={`items-start gap-2 text-xs ${idx >= 3 ? 'hidden md:flex' : 'flex'}`}>
            <span className="shrink-0 w-28"><DeltaBadge delta={q.delta} /></span>
            <span className="text-gray-700 leading-snug">
              {q.rotulo} <span className="text-gray-400">· {fmtPct(q.anterior)}% → {fmtPct(q.atual)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PriorityChart({ pontos, corteFavoravel, corteImportancia, onSelect }: ReturnType<typeof priorityMatrix> & { onSelect?: (bloco: string) => void }) {
  const W = 640, H = 340, L = 52, R = 16, T = 16, B = 40
  const xs = pontos.map((p) => p.favoravel)
  const ys = pontos.map((p) => p.importancia)
  const xMin = Math.max(0, Math.floor(Math.min(...xs, corteFavoravel) / 10) * 10 - 5)
  const xMax = Math.min(100, Math.ceil(Math.max(...xs, corteFavoravel) / 10) * 10 + 5)
  const yMin = Math.max(0, Math.floor(Math.min(...ys, corteImportancia) / 10) * 10 - 5)
  const yMax = Math.min(100, Math.ceil(Math.max(...ys, corteImportancia) / 10) * 10 + 5)
  const sx = (v: number) => L + ((v - xMin) / Math.max(1, xMax - xMin)) * (W - L - R)
  const sy = (v: number) => H - B - ((v - yMin) / Math.max(1, yMax - yMin)) * (H - T - B)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label="Gráfico de favorabilidade por importância dos blocos">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="#e5e7eb" />
      <line x1={sx(corteFavoravel)} x2={sx(corteFavoravel)} y1={T} y2={H - B} stroke="#9ca3af" strokeDasharray="4 3" />
      <line x1={L} x2={W - R} y1={sy(corteImportancia)} y2={sy(corteImportancia)} stroke="#9ca3af" strokeDasharray="4 3" />
      <text x={L + 6} y={T + 14} fontSize="11" fill="#dc2626">Prioridade de ação</text>
      <text x={W - R - 6} y={T + 14} fontSize="11" fill="#16a34a" textAnchor="end">Manter</text>
      <text x={L + 6} y={H - B - 8} fontSize="11" fill="#6b7280">Monitorar</text>
      <text x={W - R - 6} y={H - B - 8} fontSize="11" fill="#2563eb" textAnchor="end">Menor urgência</text>
      <text x={(L + W - R) / 2} y={H - 8} fontSize="11" fill="#6b7280" textAnchor="middle">Favorabilidade (%)</text>
      <text x={14} y={(T + H - B) / 2} fontSize="11" fill="#6b7280" textAnchor="middle"
        transform={`rotate(-90 14 ${(T + H - B) / 2})`}>Importância (%)</text>
      {pontos.map((p, i) => {
        const x = sx(p.favoravel)
        const y = sy(p.importancia)
        // O rótulo vai para o lado com espaço: perto da borda direita fica à esquerda do ponto, e vice-versa.
        const esquerda = x > W - R - 150 ? true : x < L + 150 ? false : i % 2 !== 0
        return (
          <g
            key={p.bloco}
            role="button"
            tabIndex={0}
            aria-label={`Ver as perguntas do bloco ${p.bloco}`}
            onClick={() => onSelect?.(p.bloco)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(p.bloco) } }}
            className="cursor-pointer outline-none group"
          >
            <title>{p.bloco}: ver as perguntas deste bloco</title>
            <circle cx={x} cy={y} r="16" fill="transparent" />
            <circle cx={x} cy={y} r="6" fill={QUADRANT_STYLE[p.quadrante].color} fillOpacity="0.85" className="transition-all group-hover:[r:8] group-focus-visible:[r:8]" />
            <text
              x={x + (esquerda ? -10 : 10)}
              y={y + 4}
              fontSize="10.5"
              fill="#374151"
              textAnchor={esquerda ? 'end' : 'start'}
              className="group-hover:underline"
            >{p.bloco.length > 22 ? `${p.bloco.slice(0, 21)}…` : p.bloco}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function FavorabilityPanel({ perguntas, respondentes, labelUnidade, nMin, importanciaPerguntaId, anterior, mostrarPorDimensao, ocultarGeral, onEntrarGrupo, pedidoRanking }: Props) {
  const textos = textosEscala(escalaDoQuestionario(perguntas) ?? 5)
  const [blocoFiltro, setBlocoFiltro] = useState<string>('')
  const [ordem, setOrdem] = useState<'desc' | 'asc'>('desc')
  const [verTodas, setVerTodas] = useState(false)
  const [atalho, setAtalho] = useState<'todas' | 'mais' | 'menos'>('todas')
  const [limiteAtalho, setLimiteAtalho] = useState(5)

  // Pedido vindo do resumo: filtra o ranking pelo bloco, ordena e leva até ele.
  useEffect(() => {
    if (!pedidoRanking) return
    setBlocoFiltro(pedidoRanking.bloco)
    setOrdem(pedidoRanking.ordem)
    setAtalho('todas')
    const t = setTimeout(() => document.getElementById('sec-perguntas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [pedidoRanking?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const dados = useMemo(() => {
    const blocos = favorabilityByBlock(perguntas, respondentes)
    const perguntasFav = favorabilityByQuestion(perguntas, respondentes)
    const matriz = favorabilityByUnitAndBlock(perguntas, respondentes, nMin)
    const geralPorBase = favorabilityPooledByUnit(perguntas, respondentes, nMin)

    const riscoPerguntas = riskQuestions(perguntas)
    const riscoGeral = riscoPerguntas.length > 0 ? favorabilityPooled(riscoPerguntas, respondentes) : null
    const riscoPorBase = riscoPerguntas.length > 0
      ? favorabilityPooledByUnit(riscoPerguntas, respondentes, nMin) : null
    const riscoIds = new Set(riscoPerguntas.map((p) => p.id))
    const riscoItens = perguntasFav.filter((q) => riscoIds.has(q.id))

    // Variação em relação à edição anterior: do risco geral e de cada pergunta.
    let riscoDelta: number | null = null
    const deltaPergunta = new Map<string, number>()
    if (anterior && anterior.respondentes.length > 0) {
      for (const d of compareQuestions(perguntasFav, favorabilityByQuestion(perguntas, anterior.respondentes))) {
        deltaPergunta.set(d.chave, d.delta)
      }
      if (riscoGeral && riscoPerguntas.length > 0) {
        const ant = favorabilityPooled(riscoPerguntas, anterior.respondentes)
        if (ant.n > 0) riscoDelta = Math.round((riscoGeral.favoravel - ant.favoravel) * 10) / 10
      }
    }

    const prioridades = importanciaPerguntaId
      ? priorityMatrix(blocos, importanceByBlock(importanciaPerguntaId, blocos.map((b) => b.bloco), respondentes))
      : null

    // Mesma conta do resumo: todas as respostas da escala juntas (e não a média dos blocos).
    const geral = favorabilityPooled(perguntas, respondentes)

    let comparativo: {
      geralDelta: number
      geralAnterior: number
      blocos: FavorabilityDelta[]
      melhoras: FavorabilityDelta[]
      pioras: FavorabilityDelta[]
      unidades: FavorabilityDelta[]
      respondentesAnterior: number
    } | null = null
    if (anterior && anterior.respondentes.length > 0) {
      const blocosAnt = favorabilityByBlock(perguntas, anterior.respondentes)
      const geralAnt = favorabilityPooled(perguntas, anterior.respondentes).favoravel
      const perguntasAnt = favorabilityByQuestion(perguntas, anterior.respondentes)
      const deltasPerg = compareQuestions(perguntasFav, perguntasAnt)
      comparativo = {
        geralDelta: Math.round((geral.favoravel - geralAnt) * 10) / 10,
        geralAnterior: geralAnt,
        blocos: compareBlocks(blocos, blocosAnt),
        melhoras: [...deltasPerg].filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5),
        pioras: [...deltasPerg].filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5),
        unidades: compareUnits(
          geralPorBase.unidades,
          favorabilityPooledByUnit(perguntas, anterior.respondentes, nMin).unidades,
        ),
        respondentesAnterior: anterior.respondentes.length,
      }
    }

    return {
      blocos, perguntasFav, matriz, geralPorBase, riscoGeral, riscoPorBase, riscoItens, prioridades, geral, comparativo,
      riscoDelta, deltaPergunta,
    }
  }, [perguntas, respondentes, nMin, importanciaPerguntaId, anterior])

  const { blocos, perguntasFav, matriz, geralPorBase, riscoGeral, riscoPorBase, riscoItens, prioridades, geral, comparativo, riscoDelta, deltaPergunta } = dados

  const ranking = useMemo(() => {
    const itens = perguntasFav.filter((q) => q.n > 0 && (!blocoFiltro || q.bloco === blocoFiltro))
    const desc = atalho === 'mais' ? true : atalho === 'menos' ? false : ordem === 'desc'
    return itens.sort((a, b) => desc ? b.favoravel - a.favoravel : a.favoravel - b.favoravel)
  }, [perguntasFav, blocoFiltro, ordem, atalho])

  const RANKING_INICIAL = 10

  // Clicar em um bloco filtra o ranking de perguntas e leva até ele; clicar de novo limpa o filtro.
  function escolherBloco(bloco: string, sempre = false) {
    const limpar = !sempre && blocoFiltro === bloco
    setBlocoFiltro(limpar ? '' : bloco)
    if (!limpar) {
      setOrdem('desc')
      setTimeout(() => document.getElementById('sec-perguntas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    }
  }
  const rankingVisivel = atalho !== 'todas'
    ? ranking.slice(0, limiteAtalho)
    : blocoFiltro || verTodas ? ranking : ranking.slice(0, RANKING_INICIAL)

  if (blocos.length === 0 || respondentes.length === 0) return null

  const geralPorBaseMap = new Map(geralPorBase.unidades.map((u) => [u.unidade, u.favoravel]))
  const card = 'bg-white rounded-xl border border-gray-200 p-6 scroll-mt-16'

  return (
    <div className="space-y-5">
      {/* Geral + blocos */}
      <div id="sec-blocos" className={`${card} space-y-8`}>
        {!ocultarGeral && (
        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">Favorabilidade geral</h3>
            <span className="flex items-baseline gap-2">
              {comparativo && <DeltaBadge delta={comparativo.geralDelta} />}
              <span className="text-2xl font-semibold text-gray-900">{fmtPct(geral.favoravel)}%</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Percentual de respostas favoráveis ({textos.favoravel}) em {respondentes.length.toLocaleString('pt-BR')} respondentes.
          </p>
          <StackedBar fav={geral.favoravel} neu={geral.neutro} des={geral.desfavoravel} />
          <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{textos.rotuloFavoravel} {fmtPct(geral.favoravel)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />{textos.rotuloNeutro} {fmtPct(geral.neutro)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />{textos.rotuloDesfavoravel} {fmtPct(geral.desfavoravel)}%</span>
          </div>
        </div>
        )}

        <div>
          <SectionTitle hint="Toque em um bloco para ver as perguntas dele, da mais para a menos favorável.">
            Favorabilidade por bloco
          </SectionTitle>
          <div className="space-y-1">
            {[...blocos].sort((a, b) => b.favoravel - a.favoravel).map((b) => (
              <button
                key={b.bloco}
                type="button"
                onClick={() => escolherBloco(b.bloco)}
                className={`w-full flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 rounded-lg px-2 py-2 sm:py-1.5 text-left transition-colors ${
                  blocoFiltro === b.bloco ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xs text-gray-700 sm:w-48 sm:shrink-0 sm:truncate" title={b.bloco}>{b.bloco}</span>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex-1 min-w-0"><StackedBar fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></div>
                  <span className="sm:w-36 text-right shrink-0"><Trio fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3"><Legend textos={textos} /></div>
        </div>
      </div>

      {/* Favorabilidade pela dimensão escolhida em "Ver resultados por" */}
      {mostrarPorDimensao && (
        <div className={card}>
          <SectionTitle hint={`Favorabilidade geral (% de ${textos.favoravel}) de cada ${labelUnidade.toLowerCase()}. Grupos com menos de ${nMin} respondentes não aparecem, para proteger o anonimato.`}>
            Favorabilidade por {labelUnidade.toLowerCase()}
          </SectionTitle>
          {geralPorBase.unidades.length === 0 ? (
            <p className="text-sm text-gray-500">
              Não há grupos de {labelUnidade.toLowerCase()} com pelo menos {nMin} respondentes neste recorte.
              Se esta dimensão deveria ter dados, confira se os participantes foram carregados com ela.
            </p>
          ) : (
            <div className="space-y-1.5">
              {geralPorBase.unidades.map((u) => (
                <div key={u.unidade} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-52 shrink-0 truncate" title={u.unidade}>{u.unidade}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${u.favoravel}%` }} />
                  </div>
                  <span className="w-28 text-right text-xs tabular-nums shrink-0">
                    <span className="font-semibold text-green-700">{fmtPct(u.favoravel)}%</span>
                    <span className="text-gray-400"> · {u.respondentes.toLocaleString('pt-BR')} resp.</span>
                  </span>
                </div>
              ))}
              {geralPorBase.omitidas > 0 && (
                <p className="text-[11px] text-gray-400 pt-1">
                  {geralPorBase.omitidas} {geralPorBase.omitidas > 1 ? 'grupos omitidos' : 'grupo omitido'} por ter menos de {nMin} respondentes.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Evolução em relação à edição anterior */}
      {comparativo && anterior && (
        <div id="sec-evolucao" className={`${card} space-y-6`}>
          <SectionTitle hint={`Favorabilidade (% de ${textos.favoravel}) de ${anterior.rotulo} para esta edição. Variações de até 2 p.p. contam como estabilidade.`}>
            Evolução em relação a {anterior.rotulo}
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span>Geral: <strong>{fmtPct(comparativo.geralAnterior)}%</strong> → <strong>{fmtPct(geral.favoravel)}%</strong></span>
            <DeltaBadge delta={comparativo.geralDelta} />
            <span className="text-xs text-gray-400">
              {comparativo.respondentesAnterior.toLocaleString('pt-BR')} respondentes na edição anterior
            </span>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Por bloco</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-1.5 pr-3 font-medium">Bloco</th>
                  <th className="py-1.5 px-2 font-medium text-right w-20">{anterior.rotulo}</th>
                  <th className="py-1.5 px-2 font-medium text-right w-20">Atual</th>
                  <th className="py-1.5 pl-2 font-medium text-right w-32">Variação</th>
                </tr>
              </thead>
              <tbody>
                {[...comparativo.blocos].sort((a, b) => b.delta - a.delta).map((b) => (
                  <tr key={b.chave} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-800">{b.rotulo}</td>
                    <td className="py-2 px-2 text-right text-gray-500 tabular-nums">{fmtPct(b.anterior)}%</td>
                    <td className="py-2 px-2 text-right font-semibold text-gray-900 tabular-nums">{fmtPct(b.atual)}%</td>
                    <td className="py-2 pl-2 text-right"><DeltaBadge delta={b.delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <DeltaList title="Maiores melhoras (perguntas)" items={comparativo.melhoras} />
            <DeltaList title="Maiores quedas (perguntas)" items={comparativo.pioras} />
          </div>

          {comparativo.unidades.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Por {labelUnidade.toLowerCase()}</h4>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {[...comparativo.unidades].sort((a, b) => b.delta - a.delta).map((u) => (
                  <li key={u.chave} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-gray-700" title={u.rotulo}>{u.rotulo}</span>
                    <span className="text-gray-400 tabular-nums">{fmtPct(u.anterior)}% → {fmtPct(u.atual)}%</span>
                    <span className="ml-auto"><DeltaBadge delta={u.delta} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Prioridades */}
      {prioridades && prioridades.pontos.length > 0 && (
        <div id="sec-prioridades" className={card}>
          <SectionTitle hint="Cruza o que as pessoas dizem que mais importa com como a empresa está avaliada. Os cortes são as médias dos blocos. Clique em um bloco para ver as perguntas dele.">
            Prioridades de ação
          </SectionTitle>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0 hidden md:block"><PriorityChart {...prioridades} onSelect={(b) => escolherBloco(b, true)} /></div>
            <div className="lg:w-60 shrink-0 space-y-3">
              {(['prioridade', 'manter', 'monitorar', 'menor_urgencia'] as PriorityQuadrant[]).map((q) => {
                const itens = prioridades.pontos.filter((p) => p.quadrante === q)
                  .sort((a, b) => b.importancia - a.importancia)
                if (itens.length === 0) return null
                return (
                  <div key={q}>
                    <p className="text-xs font-semibold" style={{ color: QUADRANT_STYLE[q].color }}>{QUADRANT_STYLE[q].label}</p>
                    <ul className="text-xs text-gray-700 space-y-0.5 mt-0.5">
                      {itens.map((p) => (
                        <li key={p.bloco}>
                          <button
                            type="button"
                            onClick={() => escolherBloco(p.bloco, true)}
                            className="text-left hover:text-gray-900 hover:underline"
                            title="Ver as perguntas deste bloco"
                          >
                            {p.bloco} <span className="text-gray-400">· prioridade para {fmtPct(p.importancia)}% dos respondentes · {fmtPct(p.favoravel)}% de avaliações favoráveis</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Riscos psicossociais */}
      {riscoGeral && riscoGeral.n > 0 && (() => {
        const abaixo = [...riscoItens].filter((q) => q.n > 0 && q.favoravel < 50).sort((a, b) => a.favoravel - b.favoravel)
        const maiores = abaixo.slice(0, 10)
        const gruposRisco = riscoPorBase ? [...riscoPorBase.unidades].sort((a, b) => a.favoravel - b.favoravel) : []
        const corTexto = (p: number) => (p >= 70 ? 'text-green-700' : p >= 50 ? 'text-amber-700' : 'text-red-600')
        return (
        <div id="sec-riscos" className={`${card} space-y-6`}>
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
              <h3 className="text-sm font-semibold text-gray-900">Riscos psicossociais</h3>
              <span className="flex items-baseline gap-2">
                {riscoDelta !== null && anterior && <DeltaBadge delta={riscoDelta} />}
                <span className="text-2xl font-semibold text-gray-900">{fmtPct(riscoGeral.favoravel)}%</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3" title="Perguntas sobre carga, pressão, apoio, assédio e segurança psicológica, que atravessam vários blocos.">
              Favorabilidade das {riscoItens.length} perguntas de carga, pressão, apoio e assédio. Quanto menor, maior o risco.
            </p>
            <StackedBar fav={riscoGeral.favoravel} neu={riscoGeral.neutro} des={riscoGeral.desfavoravel} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
              <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{textos.rotuloFavoravel} {fmtPct(riscoGeral.favoravel)}%</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />{textos.rotuloNeutro} {fmtPct(riscoGeral.neutro)}%</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />{textos.rotuloDesfavoravel} {fmtPct(riscoGeral.desfavoravel)}%</span>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-gray-700">Maiores riscos</h4>
              <p className="text-[11px] text-gray-500 mb-2">
                {abaixo.length === 0
                  ? 'Nenhuma pergunta está abaixo de 50% de favorabilidade.'
                  : `${abaixo.length} de ${riscoItens.length} perguntas com menos de 50% de respostas favoráveis${abaixo.length > maiores.length ? ` (as ${maiores.length} piores)` : ''}.`}
              </p>
              <ul className="space-y-2.5">
                {maiores.map((q) => {
                  const d = deltaPergunta.get(q.id)
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => escolherBloco(q.bloco, true)}
                        title="Ver as perguntas deste bloco"
                        className="w-full flex items-start gap-3 text-left rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-gray-50"
                      >
                        <span className={`w-12 shrink-0 text-sm font-semibold tabular-nums ${corTexto(q.favoravel)}`}>{fmtPct(q.favoravel)}%</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs text-gray-800 leading-snug">{q.texto}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[11px] text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{q.bloco}</span>
                            {d !== undefined && anterior && (
                              <span className={`text-[11px] font-medium ${d > 0 ? 'text-green-700' : d < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                {d > 0 ? '+' : d < 0 ? '−' : ''}{fmtPct(Math.abs(d))} p.p. vs {anterior.rotulo}
                              </span>
                            )}
                          </span>
                          <span className="block mt-1.5"><StackedBar fav={q.favoravel} neu={q.neutro} des={q.desfavoravel} /></span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {gruposRisco.length > 0 && (
              <div className="md:w-80 shrink-0">
                <h4 className="text-xs font-semibold text-gray-700">Por {labelUnidade.toLowerCase()}</h4>
                <p className="text-[11px] text-gray-500 mb-2">
                  {onEntrarGrupo ? 'Do maior para o menor risco. Clique para ver só o grupo.' : 'Do maior para o menor risco.'}
                </p>
                <ul className="space-y-1">
                  {gruposRisco.map((u) => {
                    const conteudo = (
                      <>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs text-gray-800 leading-snug break-words">{u.unidade}</span>
                          <span className="block text-[11px] text-gray-400">{u.respondentes.toLocaleString('pt-BR')} respondentes</span>
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold shrink-0 ${cellColor(u.favoravel)}`}>{fmtPct(u.favoravel)}%</span>
                      </>
                    )
                    return (
                      <li key={u.unidade}>
                        {onEntrarGrupo ? (
                          <button
                            type="button"
                            onClick={() => onEntrarGrupo(u.unidade)}
                            className="w-full flex items-center gap-2 text-left rounded-lg -mx-1.5 px-1.5 py-1.5 hover:bg-gray-50"
                          >
                            {conteudo}
                            <span className="text-gray-300" aria-hidden="true">›</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 py-1.5">{conteudo}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* Ranking completo */}
      <div id="sec-perguntas" className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <SectionTitle hint={`${rankingVisivel.length} de ${ranking.length} perguntas${blocoFiltro ? ` em "${blocoFiltro}"` : ''}.`}>
            Ranking de perguntas
          </SectionTitle>
          <div className="flex items-center gap-2">
            <select
              value={blocoFiltro}
              onChange={(e) => setBlocoFiltro(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
              aria-label="Filtrar por bloco"
            >
              <option value="">Todos os blocos</option>
              {blocos.map((b) => <option key={b.bloco} value={b.bloco}>{b.bloco}</option>)}
            </select>
            {atalho === 'todas' && (
            <button
              type="button"
              onClick={() => setOrdem((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
            >
              {ordem === 'desc' ? 'Maior favorabilidade primeiro' : 'Menor favorabilidade primeiro'}
            </button>
            )}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Quais perguntas mostrar">
          {([['todas', 'Todas'], ['mais', 'Mais favoráveis'], ['menos', 'Menos favoráveis']] as const).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setAtalho(id); setLimiteAtalho(5) }}
              aria-pressed={atalho === id}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                atalho === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {blocoFiltro && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
            <span className="text-gray-500">Mostrando só o bloco</span>
            <span className="font-medium text-gray-900">{blocoFiltro}</span>
            <button
              type="button"
              onClick={() => setBlocoFiltro('')}
              className="ml-auto text-xs text-gray-600 underline hover:text-gray-900"
            >
              Ver todas as perguntas
            </button>
          </div>
        )}
        <div className="mb-2"><Legend textos={textos} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-1.5 pr-2 w-8 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">Pergunta</th>
                <th className="py-1.5 pr-3 font-medium hidden md:table-cell">Bloco</th>
                <th className="py-1.5 px-2 font-medium w-36 hidden sm:table-cell">Distribuição</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right text-green-700">{textos.curtoFavoravel}</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right hidden sm:table-cell">{textos.curtoNeutro}</th>
                <th className="py-1.5 pl-2 font-medium w-14 text-right text-red-600 hidden sm:table-cell">{textos.curtoDesfavoravel}</th>
                {anterior && <th className="py-1.5 pl-2 font-medium w-24 text-right hidden md:table-cell">vs {anterior.rotulo}</th>}
              </tr>
            </thead>
            <tbody>
              {rankingVisivel.map((q, i) => (
                <tr key={q.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2 pr-3 text-gray-800 leading-snug">
                    {q.texto}
                    <span className="sm:hidden block mt-1"><Trio fav={q.favoravel} neu={q.neutro} des={q.desfavoravel} /></span>
                  </td>
                  <td className="py-2 pr-3 hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => setBlocoFiltro(q.bloco)}
                      title="Ver só as perguntas deste bloco"
                      className="text-gray-500 hover:text-gray-900 hover:underline text-left"
                    >
                      {q.bloco}
                    </button>
                  </td>
                  <td className="py-2 px-2 hidden sm:table-cell"><StackedBar fav={q.favoravel} neu={q.neutro} des={q.desfavoravel} /></td>
                  <td className="py-2 pl-2 text-right font-semibold text-green-700 tabular-nums">{fmtPct(q.favoravel)}%</td>
                  <td className="py-2 pl-2 text-right text-gray-500 tabular-nums hidden sm:table-cell">{fmtPct(q.neutro)}%</td>
                  <td className="py-2 pl-2 text-right text-red-600 tabular-nums hidden sm:table-cell">{fmtPct(q.desfavoravel)}%</td>
                  {anterior && (() => {
                    const d = deltaPergunta.get(q.id)
                    return (
                      <td className={`py-2 pl-2 text-right tabular-nums hidden md:table-cell ${d === undefined ? 'text-gray-300' : d > 0 ? 'text-green-700' : d < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {d === undefined ? '–' : `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtPct(Math.abs(d))} p.p.`}
                      </td>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {atalho !== 'todas' && ranking.length > 5 && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setLimiteAtalho((n) => (n === 5 ? 10 : 5))}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {limiteAtalho === 5 ? 'Ver 10' : 'Ver só 5'}
            </button>
          </div>
        )}
        {atalho === 'todas' && !blocoFiltro && ranking.length > RANKING_INICIAL && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setVerTodas((v) => !v)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {verTodas ? 'Mostrar só as primeiras' : `Mostrar as ${ranking.length} perguntas`}
            </button>
          </div>
        )}
      </div>

      {/* Bloco × unidade */}
      {matriz.unidades.length > 0 && (
        <div id="sec-mapa" className={card}>
          <SectionTitle hint={`Grupos com menos de ${nMin} respondentes não aparecem, para proteger o anonimato.`}>
            Favorabilidade por bloco e {labelUnidade.toLowerCase()}
          </SectionTitle>
          <div className="overflow-x-auto -mx-2">
            <table className="text-xs border-separate border-spacing-1 min-w-full">
              <thead>
                <tr>
                  <th className="text-left font-medium text-gray-500 px-2 py-1 sticky left-0 bg-white">{labelUnidade}</th>
                  <th className="font-semibold text-gray-700 px-1 py-1 align-bottom min-w-[64px]">Geral</th>
                  {matriz.blocos.map((b) => (
                    <th key={b} className="font-medium text-gray-500 px-1 py-1 align-bottom min-w-[72px]">
                      <span className="block leading-tight">{b}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matriz.unidades.map((u) => {
                  const g = geralPorBaseMap.get(u) ?? null
                  return (
                    <tr key={u}>
                      <td className="text-gray-700 px-2 py-1 whitespace-nowrap sticky left-0 bg-white">{u}</td>
                      <td className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(g)}`}>{g !== null ? `${fmtPct(g)}%` : '–'}</td>
                      {matriz.blocos.map((b) => {
                        const c = matriz.celulas[u]?.[b]
                        return (
                          <td key={b} className={`text-center font-semibold rounded px-1 py-1.5 ${cellColor(c?.favoravel ?? null)}`}>
                            {c?.favoravel !== null && c?.favoravel !== undefined ? `${fmtPct(c.favoravel)}%` : '–'}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

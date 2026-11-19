/**
 * Insights da visão geral — cálculo puro (sem UI, sem acesso a dados) dos
 * destaques e da frase de abertura de uma pesquisa de clima. Tudo sai das
 * mesmas funções de favorabilidade do painel, então tela, PDF e exportações
 * contam a mesma história.
 */

import {
  STABLE_DELTA_PP,
  compareBlocks,
  deltaDirection,
  escalaDoQuestionario,
  favorabilityByBlock,
  favorabilityByQuestion,
  favorabilityPooled,
  importanceByBlock,
  priorityMatrix,
  type BlockFavorability,
  type FavorabilityDelta,
  type QuestionRef,
  type RespondentRow,
} from './favorability'

export interface PriorityItem {
  bloco:       string
  favoravel:   number
  importancia: number
}

export interface CriticalQuestion {
  texto:     string
  bloco:     string
  favoravel: number
}

export interface ExecutiveInsights {
  /** Respondentes no recorte. */
  n:        number
  /** Escala das perguntas (5 ou 6 pontos): muda os textos das legendas. */
  escala:   5 | 6
  geral:    { favoravel: number; neutro: number; desfavoravel: number }
  /** Variação da favorabilidade geral em p.p. em relação à edição anterior; null sem comparativo. */
  deltaGeral:     number | null
  rotuloAnterior: string | null
  maisForte: BlockFavorability | null
  maisFraco: BlockFavorability | null
  /** Maior melhora entre blocos (só quando passa da margem de estabilidade). */
  melhora:   FavorabilityDelta | null
  /** Maior queda entre blocos (só quando passa da margem de estabilidade). */
  queda:     FavorabilityDelta | null
  /** Blocos de alta importância e baixa favorabilidade, do mais importante para o menos. */
  prioridades: PriorityItem[]
  /** As perguntas com menor favorabilidade (até 3). */
  criticas:    CriticalQuestion[]
  /** Frase de abertura em português. */
  frase: string
}

/** 55.6 → "55,6". */
export function fmtPct(n: number): string {
  return String(n).replace('.', ',')
}

/** Variação em p.p. sem sinal: 4.2 → "4,2". */
function fmtPp(n: number): string {
  return fmtPct(Math.abs(Math.round(n * 10) / 10))
}

export function buildHeadline(params: {
  /** "Em todo o grupo" ou "No recorte Diastur · Manutenção". */
  escopo:         string
  geral:          number
  deltaGeral:     number | null
  rotuloAnterior: string | null
  maisForte:      Pick<BlockFavorability, 'bloco' | 'favoravel'> | null
  maisFraco:      Pick<BlockFavorability, 'bloco' | 'favoravel'> | null
}): string {
  const { escopo, geral, deltaGeral, rotuloAnterior, maisForte, maisFraco } = params
  let frase: string

  if (deltaGeral === null || !rotuloAnterior) {
    frase = `${escopo}, a favorabilidade geral é de ${fmtPct(geral)}%.`
  } else {
    const dir = deltaDirection(deltaGeral)
    if (dir === 'up') {
      frase = `${escopo}, o clima melhorou: ${fmtPct(geral)}% de respostas favoráveis, ${fmtPp(deltaGeral)} pontos acima de ${rotuloAnterior}.`
    } else if (dir === 'down') {
      frase = `${escopo}, o clima piorou: ${fmtPct(geral)}% de respostas favoráveis, ${fmtPp(deltaGeral)} pontos abaixo de ${rotuloAnterior}.`
    } else {
      frase = `${escopo}, o clima ficou estável em relação a ${rotuloAnterior}: ${fmtPct(geral)}% de respostas favoráveis.`
    }
  }

  if (maisForte && maisFraco && maisForte.bloco !== maisFraco.bloco) {
    frase += ` ${maisForte.bloco} é o ponto mais forte (${fmtPct(maisForte.favoravel)}%) e ${maisFraco.bloco} o mais fraco (${fmtPct(maisFraco.favoravel)}%).`
  }
  return frase
}

export function buildInsights(params: {
  perguntas:      QuestionRef[]
  respondentes:   RespondentRow[]
  /** Edição anterior já filtrada pelo mesmo recorte. */
  anterior?:      { rotulo: string; respondentes: RespondentRow[] } | null
  importanciaPerguntaId?: string
  escopo:         string
}): ExecutiveInsights {
  const { perguntas, respondentes, anterior, importanciaPerguntaId, escopo } = params

  const blocos = favorabilityByBlock(perguntas, respondentes).filter((b) => b.n > 0)
  const pooled = favorabilityPooled(perguntas, respondentes)
  const geral = { favoravel: pooled.favoravel, neutro: pooled.neutro, desfavoravel: pooled.desfavoravel }

  const porFav = [...blocos].sort((a, b) => b.favoravel - a.favoravel)
  const maisForte = porFav[0] ?? null
  const maisFraco = porFav.length > 1 ? porFav[porFav.length - 1] : null

  let deltaGeral: number | null = null
  let melhora: FavorabilityDelta | null = null
  let queda: FavorabilityDelta | null = null
  let rotuloAnterior: string | null = null
  if (anterior && anterior.respondentes.length > 0) {
    const antPooled = favorabilityPooled(perguntas, anterior.respondentes)
    if (antPooled.n > 0) {
      rotuloAnterior = anterior.rotulo
      deltaGeral = Math.round((geral.favoravel - antPooled.favoravel) * 10) / 10
      const deltas = compareBlocks(blocos, favorabilityByBlock(perguntas, anterior.respondentes))
      const up = [...deltas].sort((a, b) => b.delta - a.delta)[0]
      const down = [...deltas].sort((a, b) => a.delta - b.delta)[0]
      if (up && up.delta >= STABLE_DELTA_PP) melhora = up
      if (down && down.delta <= -STABLE_DELTA_PP) queda = down
    }
  }

  let prioridades: PriorityItem[] = []
  if (importanciaPerguntaId) {
    const m = priorityMatrix(blocos, importanceByBlock(importanciaPerguntaId, blocos.map((b) => b.bloco), respondentes))
    prioridades = m.pontos
      .filter((p) => p.quadrante === 'prioridade')
      .sort((a, b) => b.importancia - a.importancia)
      .slice(0, 3)
      .map((p) => ({ bloco: p.bloco, favoravel: p.favoravel, importancia: p.importancia }))
  }

  const criticas = favorabilityByQuestion(perguntas, respondentes)
    .filter((q) => q.n > 0)
    .sort((a, b) => a.favoravel - b.favoravel)
    .slice(0, 3)
    .map((q) => ({ texto: q.texto, bloco: q.bloco, favoravel: q.favoravel }))

  return {
    n: respondentes.length,
    escala: escalaDoQuestionario(perguntas) ?? 5,
    geral,
    deltaGeral,
    rotuloAnterior,
    maisForte,
    maisFraco,
    melhora,
    queda,
    prioridades,
    criticas,
    frase: buildHeadline({ escopo, geral: geral.favoravel, deltaGeral, rotuloAnterior, maisForte, maisFraco }),
  }
}

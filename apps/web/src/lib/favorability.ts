/**
 * Favorabilidade — cálculo puro (sem UI, sem acesso a dados) para pesquisas de
 * clima na escala de concordância de 5 pontos.
 *
 *   favorável    = notas 4 e 5  (concordo, concordo totalmente)
 *   neutro       = nota 3
 *   desfavorável = notas 1 e 2  (discordo, discordo totalmente)
 *
 * Mantido fora dos componentes para servir ao painel, ao PDF e, depois, às
 * exportações e ao Maptiva Grid sem duplicar a regra.
 */

export interface FavorabilityBreakdown {
  /** Respostas válidas (notas 1–5) consideradas no cálculo. */
  n:            number
  favoravel:    number
  neutro:       number
  desfavoravel: number
}

export interface FavorabilityPct {
  n:            number
  favoravel:    number
  neutro:       number
  desfavoravel: number
}

export interface QuestionRef {
  id:    string
  texto: string
  tipo:  string
  bloco?: string | null
}

export interface RespondentRow {
  unidade:   string | null
  respostas: Record<string, unknown>
}

export interface BlockFavorability {
  bloco:       string
  perguntas:   number
  favoravel:   number
  neutro:      number
  desfavoravel: number
  n:           number
}

export interface QuestionFavorability {
  id:          string
  texto:       string
  bloco:       string
  n:           number
  favoravel:   number
  neutro:      number
  desfavoravel: number
}

const SEM_BLOCO = 'Sem bloco'

/** Nota 1–5 válida, ou null (resposta ausente, "não se aplica" ou fora da escala). */
export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5) return null
  return n
}

export function classifyScore(score: number): 'favoravel' | 'neutro' | 'desfavoravel' {
  if (score >= 4) return 'favoravel'
  if (score === 3) return 'neutro'
  return 'desfavoravel'
}

export function breakdownScores(scores: Array<number | null>): FavorabilityBreakdown {
  const out: FavorabilityBreakdown = { n: 0, favoravel: 0, neutro: 0, desfavoravel: 0 }
  for (const s of scores) {
    if (s === null) continue
    out.n++
    out[classifyScore(s)]++
  }
  return out
}

/** Percentuais (0–100, uma casa) a partir das contagens; zeros se não há resposta. */
export function toPct(b: FavorabilityBreakdown): FavorabilityPct {
  if (b.n === 0) return { n: 0, favoravel: 0, neutro: 0, desfavoravel: 0 }
  const pct = (x: number) => Math.round((x / b.n) * 1000) / 10
  return {
    n:            b.n,
    favoravel:    pct(b.favoravel),
    neutro:       pct(b.neutro),
    desfavoravel: pct(b.desfavoravel),
  }
}

function scaleQuestions(perguntas: QuestionRef[]): QuestionRef[] {
  return perguntas.filter((p) => p.tipo === 'escala_5')
}

/**
 * Favorabilidade por pergunta de escala. As respostas de todas as perguntas
 * entram no cálculo (n = nº de notas válidas daquela pergunta).
 */
export function favorabilityByQuestion(
  perguntas: QuestionRef[],
  respondentes: RespondentRow[],
): QuestionFavorability[] {
  return scaleQuestions(perguntas).map((p) => {
    const b = breakdownScores(respondentes.map((r) => parseScore(r.respostas[p.id])))
    const pct = toPct(b)
    return {
      id: p.id,
      texto: p.texto,
      bloco: p.bloco?.trim() || SEM_BLOCO,
      n: pct.n,
      favoravel: pct.favoravel,
      neutro: pct.neutro,
      desfavoravel: pct.desfavoravel,
    }
  })
}

/**
 * Favorabilidade por bloco: todas as respostas de todas as perguntas do bloco
 * entram no mesmo cálculo (cada nota conta uma vez), na ordem em que os blocos
 * aparecem no questionário.
 */
export function favorabilityByBlock(
  perguntas: QuestionRef[],
  respondentes: RespondentRow[],
): BlockFavorability[] {
  const order: string[] = []
  const byBlock = new Map<string, { perguntas: number; scores: Array<number | null> }>()

  for (const p of scaleQuestions(perguntas)) {
    const bloco = p.bloco?.trim() || SEM_BLOCO
    if (!byBlock.has(bloco)) { byBlock.set(bloco, { perguntas: 0, scores: [] }); order.push(bloco) }
    const entry = byBlock.get(bloco)!
    entry.perguntas++
    for (const r of respondentes) entry.scores.push(parseScore(r.respostas[p.id]))
  }

  return order.map((bloco) => {
    const e = byBlock.get(bloco)!
    const pct = toPct(breakdownScores(e.scores))
    return {
      bloco,
      perguntas: e.perguntas,
      n: pct.n,
      favoravel: pct.favoravel,
      neutro: pct.neutro,
      desfavoravel: pct.desfavoravel,
    }
  })
}

export interface UnitBlockCell {
  /** null quando o grupo tem menos que nMin respondentes (omitido por confidencialidade). */
  favoravel: number | null
  respondentes: number
}

export interface UnitBlockMatrix {
  unidades: string[]
  blocos:   string[]
  /** celulas[unidade][bloco] */
  celulas:  Record<string, Record<string, UnitBlockCell>>
  /** Unidades omitidas por terem menos que nMin respondentes. */
  omitidas: number
}

/**
 * Favorabilidade por bloco × unidade, ocultando unidades com menos de `nMin`
 * respondentes (regra de anonimato). Respondentes sem unidade não entram.
 */
export function favorabilityByUnitAndBlock(
  perguntas: QuestionRef[],
  respondentes: RespondentRow[],
  nMin: number,
): UnitBlockMatrix {
  const grupos = new Map<string, RespondentRow[]>()
  for (const r of respondentes) {
    const u = r.unidade?.trim()
    if (!u) continue
    if (!grupos.has(u)) grupos.set(u, [])
    grupos.get(u)!.push(r)
  }

  const blocosOrdem = Array.from(new Set(scaleQuestions(perguntas).map((p) => p.bloco?.trim() || SEM_BLOCO)))

  const unidades: string[] = []
  const celulas: Record<string, Record<string, UnitBlockCell>> = {}
  let omitidas = 0

  for (const [unidade, rows] of grupos) {
    if (rows.length < nMin) { omitidas++; continue }
    unidades.push(unidade)
    celulas[unidade] = {}
    for (const b of favorabilityByBlock(perguntas, rows)) {
      celulas[unidade][b.bloco] = { favoravel: b.n > 0 ? b.favoravel : null, respondentes: rows.length }
    }
  }

  unidades.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return { unidades, blocos: blocosOrdem, celulas, omitidas }
}

/** Ordena por favorabilidade (maior primeiro) e devolve as `limit` primeiras. */
export function topQuestions(items: QuestionFavorability[], limit: number): QuestionFavorability[] {
  return [...items].filter((q) => q.n > 0).sort((a, b) => b.favoravel - a.favoravel).slice(0, limit)
}

/** Ordena por favorabilidade (menor primeiro) e devolve as `limit` primeiras. */
export function bottomQuestions(items: QuestionFavorability[], limit: number): QuestionFavorability[] {
  return [...items].filter((q) => q.n > 0).sort((a, b) => a.favoravel - b.favoravel).slice(0, limit)
}

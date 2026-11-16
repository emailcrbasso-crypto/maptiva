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
  /** Pergunta que compõe o recorte de riscos psicossociais (transversal aos blocos). */
  risco_psicossocial?: boolean
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

/** Favorabilidade agregada de um conjunto de perguntas (todas as notas juntas). */
export function favorabilityPooled(
  perguntas: QuestionRef[],
  respondentes: RespondentRow[],
): FavorabilityPct {
  const scores: Array<number | null> = []
  for (const p of scaleQuestions(perguntas)) {
    for (const r of respondentes) scores.push(parseScore(r.respostas[p.id]))
  }
  return toPct(breakdownScores(scores))
}

export interface UnitFavorability {
  unidade:   string
  favoravel: number
  respondentes: number
}

/**
 * Favorabilidade agregada por unidade para um conjunto de perguntas, ocultando
 * unidades com menos de `nMin` respondentes. Ordenado do maior para o menor.
 */
export function favorabilityPooledByUnit(
  perguntas: QuestionRef[],
  respondentes: RespondentRow[],
  nMin: number,
): { unidades: UnitFavorability[]; omitidas: number } {
  const grupos = new Map<string, RespondentRow[]>()
  for (const r of respondentes) {
    const u = r.unidade?.trim()
    if (!u) continue
    if (!grupos.has(u)) grupos.set(u, [])
    grupos.get(u)!.push(r)
  }
  const unidades: UnitFavorability[] = []
  let omitidas = 0
  for (const [unidade, rows] of grupos) {
    if (rows.length < nMin) { omitidas++; continue }
    unidades.push({ unidade, favoravel: favorabilityPooled(perguntas, rows).favoravel, respondentes: rows.length })
  }
  unidades.sort((a, b) => b.favoravel - a.favoravel)
  return { unidades, omitidas }
}

/** Perguntas marcadas como risco psicossocial. */
export function riskQuestions(perguntas: QuestionRef[]): QuestionRef[] {
  return scaleQuestions(perguntas).filter((p) => p.risco_psicossocial === true)
}

export interface BlockImportance {
  bloco:      string
  /** % dos respondentes que escolheram o bloco entre os mais importantes. */
  importancia: number
}

/**
 * Importância por bloco a partir de uma pergunta de múltipla escolha cujas
 * opções são os nomes dos blocos. Base = respondentes que responderam a pergunta.
 */
export function importanceByBlock(
  perguntaId: string,
  blocos: string[],
  respondentes: RespondentRow[],
): BlockImportance[] {
  let base = 0
  const count = new Map<string, number>(blocos.map((b) => [b, 0]))
  for (const r of respondentes) {
    const v = r.respostas[perguntaId]
    if (!Array.isArray(v) || v.length === 0) continue
    base++
    for (const item of new Set(v.map(String))) {
      if (count.has(item)) count.set(item, count.get(item)! + 1)
    }
  }
  return blocos.map((bloco) => ({
    bloco,
    importancia: base === 0 ? 0 : Math.round((count.get(bloco)! / base) * 1000) / 10,
  }))
}

export type PriorityQuadrant = 'prioridade' | 'manter' | 'monitorar' | 'menor_urgencia'

export interface PriorityPoint {
  bloco:       string
  favoravel:   number
  importancia: number
  quadrante:   PriorityQuadrant
}

/**
 * Cruza favorabilidade e importância por bloco. Os cortes são as médias dos
 * próprios blocos: importância acima da média com favorabilidade abaixo dela
 * é "prioridade de ação".
 */
export function priorityMatrix(
  blocos: BlockFavorability[],
  importancia: BlockImportance[],
): { pontos: PriorityPoint[]; corteFavoravel: number; corteImportancia: number } {
  const imp = new Map(importancia.map((i) => [i.bloco, i.importancia]))
  const base = blocos.filter((b) => b.n > 0 && imp.has(b.bloco))
  if (base.length === 0) return { pontos: [], corteFavoravel: 0, corteImportancia: 0 }
  const corteFavoravel = base.reduce((s, b) => s + b.favoravel, 0) / base.length
  const corteImportancia = base.reduce((s, b) => s + (imp.get(b.bloco) ?? 0), 0) / base.length
  const pontos = base.map((b) => {
    const importancia = imp.get(b.bloco) ?? 0
    const altaImp = importancia >= corteImportancia
    const altaFav = b.favoravel >= corteFavoravel
    const quadrante: PriorityQuadrant = altaImp
      ? (altaFav ? 'manter' : 'prioridade')
      : (altaFav ? 'menor_urgencia' : 'monitorar')
    return { bloco: b.bloco, favoravel: b.favoravel, importancia, quadrante }
  })
  return {
    pontos,
    corteFavoravel: Math.round(corteFavoravel * 10) / 10,
    corteImportancia: Math.round(corteImportancia * 10) / 10,
  }
}

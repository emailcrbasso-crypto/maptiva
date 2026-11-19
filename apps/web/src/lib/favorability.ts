/**
 * Favorabilidade — cálculo puro (sem UI, sem acesso a dados) para pesquisas de
 * clima em escala de concordância. Duas escalas, escolhidas pelo tipo da pergunta:
 *
 *   escala_5 (5 pontos)
 *     favorável    = notas 4 e 5  (concordo, concordo totalmente)
 *     neutro       = nota 3
 *     desfavorável = notas 1 e 2  (discordo, discordo totalmente)
 *
 *   escala_6 (6 pontos, sem ponto neutro)
 *     pontos fortes (favorável)           = notas 5 e 6
 *     oportunidades de melhoria (meio)    = notas 3 e 4
 *     pontos críticos (desfavorável)      = notas 1 e 2
 *
 * Em ambas, "neutro" nas estruturas de dados é a faixa intermediária.
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

export type Categoria = 'favoravel' | 'neutro' | 'desfavoravel'

/** Tipos de pergunta que entram no cálculo de favorabilidade. */
export function ehEscala(tipo: string): boolean {
  return tipo === 'escala_5' || tipo === 'escala_6'
}

/** Maior nota da escala do tipo (5 ou 6). */
export function escalaMax(tipo: string): 5 | 6 {
  return tipo === 'escala_6' ? 6 : 5
}

/** Categoria de uma nota na escala do tipo; null se ausente ou fora da escala. */
export function categoriaDaNota(tipo: string, value: unknown): Categoria | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  const max = escalaMax(tipo)
  if (!Number.isInteger(n) || n < 1 || n > max) return null
  if (max === 6) return n >= 5 ? 'favoravel' : n >= 3 ? 'neutro' : 'desfavoravel'
  return n >= 4 ? 'favoravel' : n === 3 ? 'neutro' : 'desfavoravel'
}

/** 6 se alguma pergunta usa a escala de 6 pontos; senão 5 (ou null sem perguntas de escala). */
export function escalaDoQuestionario(perguntas: Array<{ tipo: string }>): 5 | 6 | null {
  if (perguntas.some((p) => p.tipo === 'escala_6')) return 6
  return perguntas.some((p) => p.tipo === 'escala_5') ? 5 : null
}

/** Textos para legendas e notas, conforme a escala. */
export interface TextosEscala {
  /** Notas de cada faixa, ex.: "notas 5 e 6". */
  favoravel:    string
  neutro:       string
  desfavoravel: string
  /** Nome de cada faixa nas legendas. */
  rotuloFavoravel:    string
  rotuloNeutro:       string
  rotuloDesfavoravel: string
  /** Nome curto, para cabeçalhos de coluna. */
  curtoFavoravel:    string
  curtoNeutro:       string
  curtoDesfavoravel: string
  /** Explicação completa da regra, para notas de rodapé. */
  regra: string
}

export function textosEscala(max: 5 | 6): TextosEscala {
  return max === 6
    ? {
        favoravel: 'notas 5 e 6', neutro: 'notas 3 e 4', desfavoravel: 'notas 1 e 2',
        rotuloFavoravel: 'Pontos fortes', rotuloNeutro: 'Oportunidades de melhoria', rotuloDesfavoravel: 'Pontos críticos',
        curtoFavoravel: 'Fortes', curtoNeutro: 'Melhoria', curtoDesfavoravel: 'Críticos',
        regra: 'Escala de 6 pontos, sem ponto neutro. Pontos fortes = notas 5 e 6 (contam como favoráveis); oportunidades de melhoria = notas 3 e 4; pontos críticos = notas 1 e 2.',
      }
    : {
        favoravel: 'notas 4 e 5', neutro: 'nota 3', desfavoravel: 'notas 1 e 2',
        rotuloFavoravel: 'Favorável', rotuloNeutro: 'Neutro', rotuloDesfavoravel: 'Desfavorável',
        curtoFavoravel: 'Fav.', curtoNeutro: 'Neutro', curtoDesfavoravel: 'Desfav.',
        regra: 'Favorável = notas 4 e 5; neutro = nota 3; desfavorável = notas 1 e 2.',
      }
}

/** Rótulos da escala de 6 pontos de concordância, da nota 1 à 6. */
export const ROTULOS_ESCALA_6 = [
  'Discordo totalmente',
  'Discordo em grande parte',
  'Mais discordo que concordo',
  'Mais concordo que discordo',
  'Concordo em grande parte',
  'Concordo totalmente',
] as const

export function breakdownCategorias(cats: Array<Categoria | null>): FavorabilityBreakdown {
  const out: FavorabilityBreakdown = { n: 0, favoravel: 0, neutro: 0, desfavoravel: 0 }
  for (const c of cats) {
    if (c === null) continue
    out.n++
    out[c]++
  }
  return out
}

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
  return perguntas.filter((p) => ehEscala(p.tipo))
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
    const b = breakdownCategorias(respondentes.map((r) => categoriaDaNota(p.tipo, r.respostas[p.id])))
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
  const byBlock = new Map<string, { perguntas: number; cats: Array<Categoria | null> }>()

  for (const p of scaleQuestions(perguntas)) {
    const bloco = p.bloco?.trim() || SEM_BLOCO
    if (!byBlock.has(bloco)) { byBlock.set(bloco, { perguntas: 0, cats: [] }); order.push(bloco) }
    const entry = byBlock.get(bloco)!
    entry.perguntas++
    for (const r of respondentes) entry.cats.push(categoriaDaNota(p.tipo, r.respostas[p.id]))
  }

  return order.map((bloco) => {
    const e = byBlock.get(bloco)!
    const pct = toPct(breakdownCategorias(e.cats))
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
  const cats: Array<Categoria | null> = []
  for (const p of scaleQuestions(perguntas)) {
    for (const r of respondentes) cats.push(categoriaDaNota(p.tipo, r.respostas[p.id]))
  }
  return toPct(breakdownCategorias(cats))
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

// ── Comparativo entre edições ────────────────────────────────────────────────

export interface FavorabilityDelta {
  /** Identificador do item comparado (bloco, pergunta ou unidade). */
  chave:    string
  rotulo:   string
  atual:    number
  anterior: number
  /** Diferença em pontos percentuais (atual − anterior, uma casa). */
  delta:    number
}

/** Variação abaixo deste valor (em p.p.) é tratada como estabilidade. */
export const STABLE_DELTA_PP = 2

export type DeltaDirection = 'up' | 'down' | 'stable'

export function deltaDirection(delta: number): DeltaDirection {
  if (delta >= STABLE_DELTA_PP) return 'up'
  if (delta <= -STABLE_DELTA_PP) return 'down'
  return 'stable'
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function pair(
  chave: string, rotulo: string, atual: number, anterior: number,
): FavorabilityDelta {
  return { chave, rotulo, atual, anterior, delta: round1(atual - anterior) }
}

/** Compara blocos presentes nas duas edições (mesmo nome de bloco). */
export function compareBlocks(
  atual: BlockFavorability[],
  anterior: BlockFavorability[],
): FavorabilityDelta[] {
  const prev = new Map(anterior.filter((b) => b.n > 0).map((b) => [b.bloco, b]))
  return atual
    .filter((b) => b.n > 0 && prev.has(b.bloco))
    .map((b) => pair(b.bloco, b.bloco, b.favoravel, prev.get(b.bloco)!.favoravel))
}

/** Compara perguntas pelo mesmo id nas duas edições. */
export function compareQuestions(
  atual: QuestionFavorability[],
  anterior: QuestionFavorability[],
): FavorabilityDelta[] {
  const prev = new Map(anterior.filter((q) => q.n > 0).map((q) => [q.id, q]))
  return atual
    .filter((q) => q.n > 0 && prev.has(q.id))
    .map((q) => pair(q.id, q.texto, q.favoravel, prev.get(q.id)!.favoravel))
}

/** Compara unidades presentes nas duas edições (ambas acima do N-mínimo). */
export function compareUnits(
  atual: UnitFavorability[],
  anterior: UnitFavorability[],
): FavorabilityDelta[] {
  const prev = new Map(anterior.map((u) => [u.unidade, u]))
  return atual
    .filter((u) => prev.has(u.unidade))
    .map((u) => pair(u.unidade, u.unidade, u.favoravel, prev.get(u.unidade)!.favoravel))
}

/**
 * Segmentação de resultados — lógica pura (sem UI, sem acesso a dados).
 *
 * Um "segmento" é uma dimensão pela qual se filtra ou se agrupa o resultado:
 * empresa, base (unidade), área de atuação (atributos do participante) ou
 * escolaridade, sexo, faixa etária (respostas a perguntas do formulário).
 *
 * Regras de anonimato:
 *  - um recorte só é exibido se tiver ao menos `nMin` respondentes;
 *  - um valor de filtro só é oferecido se, naquele contexto, tiver ao menos
 *    `nMin` respondentes (evita abrir um recorte que já nasce oculto);
 *  - no máximo um filtro de perfil pessoal por vez (sexo, idade, escolaridade),
 *    porque combiná-los gera grupos pequenos e identificáveis.
 */

import { favorabilityByBlock, favorabilityPooled, type QuestionRef } from './favorability'

export interface SegmentDef {
  id:    string
  label: string
  /** 'campo' = atributo do participante; 'pergunta' = resposta do formulário. */
  origem: 'campo' | 'pergunta'
  campo?:       'unidade' | 'empresa' | 'area'
  pergunta_id?: string
  /** Perfil pessoal: no máximo um filtro de perfil ativo por vez. */
  perfil?: boolean
}

export interface SegmentRow {
  unidade:  string | null
  empresa?: string | null
  area?:    string | null
  respostas: Record<string, unknown>
}

export type SegmentFilters = Record<string, string>

export interface SegmentOption {
  valor: string
  n:     number
}

/** Respostas do tipo "prefiro não informar" não viram valor de segmento. */
const NAO_INFORMADO = /^prefiro n[aã]o/i

export function segmentValue(row: SegmentRow, def: SegmentDef): string | null {
  let raw: unknown
  if (def.origem === 'campo') {
    raw = def.campo ? row[def.campo] : null
  } else {
    raw = def.pergunta_id ? row.respostas[def.pergunta_id] : null
  }
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v || NAO_INFORMADO.test(v)) return null
  return v
}

/** Mantém só as linhas que satisfazem todos os filtros ativos. */
export function applyFilters<T extends SegmentRow>(
  rows: T[],
  defs: SegmentDef[],
  filters: SegmentFilters,
): T[] {
  const ativos = defs.filter((d) => filters[d.id])
  if (ativos.length === 0) return rows
  return rows.filter((r) => ativos.every((d) => segmentValue(r, d) === filters[d.id]))
}

/**
 * Valores oferecidos para um segmento, considerando os OUTROS filtros ativos
 * (as opções de área mudam ao escolher a empresa). Só valores com n >= nMin.
 */
export function segmentOptions<T extends SegmentRow>(
  rows: T[],
  defs: SegmentDef[],
  filters: SegmentFilters,
  def: SegmentDef,
  nMin: number,
): SegmentOption[] {
  const outros = { ...filters }
  delete outros[def.id]
  const base = applyFilters(rows, defs, outros)

  const counts = new Map<string, number>()
  for (const r of base) {
    const v = segmentValue(r, def)
    if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= nMin)
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'))
}

/** Perfil pessoal já em uso em outro segmento? Então este não pode ser filtrado. */
export function perfilBloqueado(
  defs: SegmentDef[],
  filters: SegmentFilters,
  def: SegmentDef,
): boolean {
  if (!def.perfil || filters[def.id]) return false
  return defs.some((d) => d.perfil && d.id !== def.id && Boolean(filters[d.id]))
}

/**
 * Reagrupa as linhas por um segmento: o valor do segmento passa a ocupar o
 * campo `unidade`, que é o que as tabelas "por unidade" do painel já usam.
 * Linhas sem valor para o segmento ficam com unidade nula (e não entram).
 */
export function regroupBy<T extends SegmentRow>(rows: T[], def: SegmentDef): T[] {
  return rows.map((r) => ({ ...r, unidade: segmentValue(r, def) }))
}

export function recorteVisivel(n: number, nMin: number): boolean {
  return n >= nMin
}

/** "Empresa: Diastur · Área: Manutenção" para legendas e PDF. */
export function describeFilters(defs: SegmentDef[], filters: SegmentFilters): string {
  return defs
    .filter((d) => filters[d.id])
    .map((d) => `${d.label}: ${filters[d.id]}`)
    .join(' · ')
}

// ── Perfil dos respondentes (distribuição agregada, sem cruzar com resultados) ──

export interface ProfileItem {
  rotulo: string
  n:      number
  /** % sobre quem respondeu a pergunta (inclui "prefiro não informar"). */
  pct:    number
}

export interface ProfileDistribution {
  id:       string
  texto:    string
  /** Respostas válidas da pergunta. */
  base:     number
  itens:    ProfileItem[]
  /** true quando categorias menores que o mínimo foram agrupadas ou omitidas. */
  agrupado: boolean
}

export const OUTRAS_RESPOSTAS = 'Outras respostas'

/**
 * Distribuição de uma pergunta de perfil. Categorias com menos de `nMin`
 * respondentes são reunidas em "Outras respostas"; se esse grupo também ficar
 * abaixo do mínimo, é omitido. Mantém a ordem das opções da pergunta.
 */
export function profileDistribution(
  pergunta: { id: string; texto: string; opcoes?: string[] },
  rows: Array<{ respostas: Record<string, unknown> }>,
  nMin: number,
): ProfileDistribution {
  const counts = new Map<string, number>()
  let base = 0
  for (const r of rows) {
    const v = r.respostas[pergunta.id]
    if (typeof v !== 'string' || !v.trim()) continue
    base++
    counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1)
  }

  const ordem = [
    ...(pergunta.opcoes ?? []),
    ...[...counts.keys()].filter((k) => !(pergunta.opcoes ?? []).includes(k)),
  ]
  const pct = (n: number) => (base === 0 ? 0 : Math.round((n / base) * 1000) / 10)

  const itens: ProfileItem[] = []
  let pequenos = 0
  let agrupado = false
  for (const rotulo of ordem) {
    const n = counts.get(rotulo) ?? 0
    if (n === 0) continue
    if (n >= nMin) itens.push({ rotulo, n, pct: pct(n) })
    else { pequenos += n; agrupado = true }
  }
  if (pequenos >= nMin) itens.push({ rotulo: OUTRAS_RESPOSTAS, n: pequenos, pct: pct(pequenos) })

  return { id: pergunta.id, texto: pergunta.texto, base, itens, agrupado }
}

// ── Participação por dimensão (a partir de contagens agregadas) ──────────────

export interface ParticipationAgg {
  empresa?:    string | null
  area?:       string | null
  unidade?:    string | null
  total:       number
  respondidos: number
}

export interface ParticipationGroup {
  grupo:       string
  total:       number
  respondidos: number
}

/**
 * Participação por uma dimensão de atributo do participante (empresa, unidade,
 * área), respeitando os filtros de atributo ativos. Grupos com menos de `nMin`
 * respondentes não aparecem. Dimensões vindas de perguntas (perfil) não têm
 * contagem de participantes: devolve null.
 */
export function participationBy(
  aggs: ParticipationAgg[],
  defs: SegmentDef[],
  filters: SegmentFilters,
  def: SegmentDef,
  nMin: number,
): { grupos: ParticipationGroup[]; omitidos: number } | null {
  if (def.origem !== 'campo' || !def.campo) return null
  const campo = def.campo

  const ativos = defs.filter((d) => d.origem === 'campo' && d.campo && filters[d.id])
  const base = aggs.filter((a) => ativos.every((d) => (a[d.campo!] ?? null) === filters[d.id]))

  const map = new Map<string, ParticipationGroup>()
  for (const a of base) {
    const g = a[campo]?.trim()
    if (!g) continue
    const cur = map.get(g) ?? { grupo: g, total: 0, respondidos: 0 }
    cur.total += a.total
    cur.respondidos += a.respondidos
    map.set(g, cur)
  }
  const todos = [...map.values()]
  const grupos = todos.filter((g) => g.respondidos >= nMin).sort((a, b) => b.total - a.total)
  return { grupos, omitidos: todos.length - grupos.length }
}

// ── Comparativo entre grupos de uma dimensão (empresa, base, área) ───────────

export interface GroupComparison {
  grupo:  string
  /** Respondentes do grupo. */
  n:      number
  /** Favorabilidade geral (% de notas 4 e 5 em todas as perguntas de escala). */
  geral:  number
  /** Favorabilidade por bloco; null quando o bloco não tem respostas no grupo. */
  blocos: Record<string, number | null>
}

export interface GroupComparisonResult {
  /** Blocos na ordem do questionário. */
  blocos:   string[]
  /** O recorte inteiro, como linha de referência. */
  total:    GroupComparison
  /** Grupos com pelo menos nMin respondentes, do mais favorável ao menos. */
  grupos:   GroupComparison[]
  /** Grupos escondidos por terem menos de nMin respondentes. */
  omitidos: number
}

function summarize(grupo: string, perguntas: QuestionRef[], rows: SegmentRow[]): GroupComparison {
  const blocos: Record<string, number | null> = {}
  for (const b of favorabilityByBlock(perguntas, rows)) blocos[b.bloco] = b.n > 0 ? b.favoravel : null
  return { grupo, n: rows.length, geral: favorabilityPooled(perguntas, rows).favoravel, blocos }
}

/** Compara os grupos de uma dimensão dentro do recorte atual, aplicando o mínimo de respondentes. */
export function compareGroups(
  perguntas: QuestionRef[],
  rows: SegmentRow[],
  def: SegmentDef,
  nMin: number,
): GroupComparisonResult {
  const porGrupo = new Map<string, SegmentRow[]>()
  for (const r of rows) {
    const g = segmentValue(r, def)
    if (g === null) continue
    if (!porGrupo.has(g)) porGrupo.set(g, [])
    porGrupo.get(g)!.push(r)
  }
  const todos = [...porGrupo.entries()].map(([g, rs]) => ({ g, rs }))
  const visiveis = todos.filter((x) => x.rs.length >= nMin)
  const grupos = visiveis
    .map((x) => summarize(x.g, perguntas, x.rs))
    .sort((a, b) => b.geral - a.geral)
  const total = summarize('Total do recorte', perguntas, rows)
  return { blocos: Object.keys(total.blocos), total, grupos, omitidos: todos.length - visiveis.length }
}

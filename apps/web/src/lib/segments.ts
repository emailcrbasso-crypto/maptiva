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

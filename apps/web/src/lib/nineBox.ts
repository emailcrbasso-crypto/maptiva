/**
 * nineBox.ts — tipos e helpers do módulo Nine Box.
 *
 * Grid 3×3: eixo X = Desempenho (col 1..3), eixo Y = Potencial (row 1..3).
 * Faixa 1 = baixo, 2 = médio, 3 = alto. O grid é renderizado com Potencial
 * alto no topo (row 3 em cima) e Desempenho alto à direita (col 3).
 */

export type AxisSource = 'overall' | 'derived' | 'manual'
export type Band = 1 | 2 | 3

export interface NineBoxConfig {
  cycle_id:            string
  enabled:             boolean
  perf_label:          string
  perf_source:         AxisSource
  perf_competency_ids: string[]
  perf_low_max:        number
  perf_high_min:       number
  pot_label:           string
  pot_source:          AxisSource
  pot_competency_ids:  string[]
  pot_low_max:         number
  pot_high_min:        number
}

export interface NineBoxParticipant {
  cycle_participant_id: string
  person_name:    string
  job_title:      string | null
  department:     string | null
  perf_value:     number | null
  pot_value:      number | null
  perf_manual:    number | null
  pot_manual:     number | null
  auto_perf_band: Band | null
  auto_pot_band:  Band | null
  cal_perf_band:  Band | null
  cal_pot_band:   Band | null
  perf_band:      Band | null
  pot_band:       Band | null
  calibrated:     boolean
  notes:          string | null
}

/** Default: fonte do JSON da RPC vem como array em jsonb; normaliza. */
export function normalizeConfig(raw: Record<string, unknown>): NineBoxConfig {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? (v as string[]) : []
  const num = (v: unknown, d: number): number =>
    v == null ? d : Number(v)
  return {
    cycle_id:            String(raw.cycle_id ?? ''),
    enabled:             Boolean(raw.enabled),
    perf_label:          String(raw.perf_label ?? 'Desempenho'),
    perf_source:         (raw.perf_source as AxisSource) ?? 'manual',
    perf_competency_ids: arr(raw.perf_competency_ids),
    perf_low_max:        num(raw.perf_low_max, 2.3333),
    perf_high_min:       num(raw.perf_high_min, 3.6667),
    pot_label:           String(raw.pot_label ?? 'Potencial'),
    pot_source:          (raw.pot_source as AxisSource) ?? 'overall',
    pot_competency_ids:  arr(raw.pot_competency_ids),
    pot_low_max:         num(raw.pot_low_max, 2.3333),
    pot_high_min:        num(raw.pot_high_min, 3.6667),
  }
}

/** Calcula a faixa (1/2/3) de um valor dado os thresholds. */
export function valueToBand(
  value: number | null,
  lowMax: number,
  highMin: number,
): Band | null {
  if (value == null) return null
  if (value < lowMax) return 1
  if (value >= highMin) return 3
  return 2
}

/** Chave de célula a partir das faixas (pot, perf). */
export function cellKey(potBand: Band, perfBand: Band): string {
  return `${potBand}-${perfBand}`
}

export interface CellMeta {
  key:    string
  title:  string
  desc:   string
  /** classe Tailwind de cor de fundo da célula */
  bg:     string
  border: string
}

/**
 * Rótulos das 9 células (taxonomia comum de talent review em PT-BR).
 * Indexado por `${pot}-${perf}`.
 */
export const NINE_BOX_CELLS: Record<string, CellMeta> = {
  // Potencial ALTO (topo)
  '3-1': { key: '3-1', title: 'Enigma',            desc: 'Alto potencial, desempenho a desenvolver', bg: 'bg-amber-50',   border: 'border-amber-200' },
  '3-2': { key: '3-2', title: 'Forte potencial',   desc: 'Alto potencial, bom desempenho',           bg: 'bg-lime-50',    border: 'border-lime-200' },
  '3-3': { key: '3-3', title: 'Estrela',           desc: 'Alto potencial e alto desempenho',         bg: 'bg-emerald-50', border: 'border-emerald-300' },
  // Potencial MÉDIO
  '2-1': { key: '2-1', title: 'Em observação',     desc: 'Potencial médio, desempenho a desenvolver', bg: 'bg-orange-50',  border: 'border-orange-200' },
  '2-2': { key: '2-2', title: 'Mantenedor',        desc: 'Potencial e desempenho medianos',           bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  '2-3': { key: '2-3', title: 'Alto desempenho',   desc: 'Potencial médio, alto desempenho',          bg: 'bg-lime-50',    border: 'border-lime-200' },
  // Potencial BAIXO (base)
  '1-1': { key: '1-1', title: 'Risco',             desc: 'Baixo potencial e baixo desempenho',        bg: 'bg-red-50',     border: 'border-red-200' },
  '1-2': { key: '1-2', title: 'Eficaz',            desc: 'Baixo potencial, desempenho mediano',       bg: 'bg-orange-50',  border: 'border-orange-200' },
  '1-3': { key: '1-3', title: 'Especialista',      desc: 'Baixo potencial, alto desempenho',          bg: 'bg-lime-50',    border: 'border-lime-200' },
}

/** Ordem de renderização das linhas: potencial alto (3) no topo. */
export const POT_BANDS_TOP_DOWN: Band[] = [3, 2, 1]
export const PERF_BANDS_LEFT_RIGHT: Band[] = [1, 2, 3]

export const BAND_LABEL: Record<Band, string> = { 1: 'Baixo', 2: 'Médio', 3: 'Alto' }

export const AXIS_SOURCE_LABEL: Record<AxisSource, string> = {
  overall: 'Score do 360 (overall)',
  derived: 'Competências selecionadas',
  manual:  'Entrada manual',
}

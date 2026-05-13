/**
 * scales.ts
 *
 * Catálogo client-side de escalas de resposta do Maptiva.
 * Espelha app.response_scales no banco (migration 0037).
 *
 * Helpers:
 *   getScale(id)                                      → ScaleDefinition
 *   resolveEffectiveScale(qScaleId, coScaleId, tmplId) → ScaleDefinition
 *   scoreToPercent(score, scale)                       → 0–100
 *   scoreColorClass(score, scale)                      → Tailwind class string
 *   scaleRangeKey(scale)                               → 'min-max' string (para detectar mistura)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScaleLabel {
  value: number
  label: string  // ex: 'Concordo totalmente'
  short: string  // ex: 'CT'
}

export interface ScaleDefinition {
  id:          string
  name:        string        // ex: 'Likert (1–5)'
  description: string        // texto explicativo para o admin
  min:         number
  max:         number
  allowNa:     boolean       // suporta "Não observei"?
  naLabel:     string        // texto do botão N/A
  labels:      ScaleLabel[]  // length == max - min + 1
  color:       string        // cor de destaque Tailwind (nome base, ex: 'violet')
}

// ─── Catálogo ─────────────────────────────────────────────────────────────────

export const SCALES: Record<string, ScaleDefinition> = {
  likert_5: {
    id:          'likert_5',
    name:        'Likert (1–5)',
    description: 'Concordância geral — ideal para afirmações sobre comportamentos e atitudes',
    min:         1,
    max:         5,
    allowNa:     false,
    naLabel:     '',
    color:       'indigo',
    labels: [
      { value: 1, label: 'Discordo totalmente', short: 'DT' },
      { value: 2, label: 'Discordo',            short: 'D'  },
      { value: 3, label: 'Neutro',              short: 'N'  },
      { value: 4, label: 'Concordo',            short: 'C'  },
      { value: 5, label: 'Concordo totalmente', short: 'CT' },
    ],
  },

  frequency_5: {
    id:          'frequency_5',
    name:        'Frequência (1–5)',
    description: 'Com que frequência o comportamento é observado — inclui opção "Não observei"',
    min:         1,
    max:         5,
    allowNa:     true,
    naLabel:     'Não tive oportunidade de observar este comportamento',
    color:       'sky',
    labels: [
      { value: 1, label: 'Nunca',          short: 'N'  },
      { value: 2, label: 'Raramente',      short: 'R'  },
      { value: 3, label: 'Às vezes',       short: 'AV' },
      { value: 4, label: 'Frequentemente', short: 'F'  },
      { value: 5, label: 'Sempre',         short: 'S'  },
    ],
  },

  bars_5: {
    id:          'bars_5',
    name:        'Desempenho (1–5)',
    description: 'Performance relativa à expectativa do papel — ideal para avaliações de desempenho',
    min:         1,
    max:         5,
    allowNa:     false,
    naLabel:     '',
    color:       'emerald',
    labels: [
      { value: 1, label: 'Muito abaixo do esperado', short: 'MB' },
      { value: 2, label: 'Abaixo do esperado',       short: 'B'  },
      { value: 3, label: 'Dentro do esperado',       short: 'DE' },
      { value: 4, label: 'Acima do esperado',        short: 'A'  },
      { value: 5, label: 'Muito acima do esperado',  short: 'MA' },
    ],
  },

  proficiency_5: {
    id:          'proficiency_5',
    name:        'Proficiência (1–5)',
    description: 'Nível de domínio de competência — inclui opção "Não observei"',
    min:         1,
    max:         5,
    allowNa:     true,
    naLabel:     'Não tive oportunidade de observar esta competência',
    color:       'amber',
    labels: [
      { value: 1, label: 'Iniciante',          short: 'I'  },
      { value: 2, label: 'Em desenvolvimento', short: 'ED' },
      { value: 3, label: 'Proficiente',        short: 'P'  },
      { value: 4, label: 'Avançado',           short: 'AV' },
      { value: 5, label: 'Expert',             short: 'E'  },
    ],
  },

  impact_4: {
    id:          'impact_4',
    name:        'Impacto (1–4)',
    description: 'Nível de impacto de iniciativas ou decisões (range 1–4, usar em questionários isolados)',
    min:         1,
    max:         4,
    allowNa:     false,
    naLabel:     '',
    color:       'rose',
    labels: [
      { value: 1, label: 'Nenhum impacto',  short: 'N'  },
      { value: 2, label: 'Baixo impacto',   short: 'B'  },
      { value: 3, label: 'Alto impacto',    short: 'A'  },
      { value: 4, label: 'Impacto crítico', short: 'IC' },
    ],
  },
}

/** ID da escala padrão do sistema */
export const DEFAULT_SCALE_ID = 'likert_5'

/** Lista ordenada para dropdowns */
export const SCALE_OPTIONS: ScaleDefinition[] = [
  SCALES.likert_5,
  SCALES.frequency_5,
  SCALES.bars_5,
  SCALES.proficiency_5,
  SCALES.impact_4,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna a definição da escala pelo id.
 * Fallback para likert_5 se id desconhecido (dados antigos sem scale_id).
 */
export function getScale(id: string | null | undefined): ScaleDefinition {
  return SCALES[id ?? DEFAULT_SCALE_ID] ?? SCALES[DEFAULT_SCALE_ID]
}

/**
 * Resolve a escala efetiva seguindo a hierarquia:
 *   question.scale_id > competency.scale_id > template.scale_id
 */
export function resolveEffectiveScale(
  questionScaleId:    string | null | undefined,
  competencyScaleId:  string | null | undefined,
  templateScaleId:    string | null | undefined,
): ScaleDefinition {
  return getScale(questionScaleId ?? competencyScaleId ?? templateScaleId)
}

/**
 * Converte um score numérico em percentual do range (0–100).
 * Usado para coloração proporcional (independente do range da escala).
 */
export function scoreToPercent(score: number, scale: ScaleDefinition): number {
  if (scale.max === scale.min) return 0
  return ((score - scale.min) / (scale.max - scale.min)) * 100
}

/**
 * Retorna classes Tailwind de cor para um score, proporcional ao range da escala.
 *   ≥ 80% do range → verde
 *   ≥ 60% do range → amarelo
 *   < 60% do range → vermelho
 *   null           → cinza
 */
export function scoreColorClass(
  score: number | null,
  scale: ScaleDefinition,
): string {
  if (score == null) return 'text-gray-300'
  const pct = scoreToPercent(score, scale)
  if (pct >= 80) return 'text-green-600'
  if (pct >= 60) return 'text-yellow-600'
  return 'text-red-500'
}

/**
 * Retorna classes Tailwind de cor de fundo para score badges.
 */
export function scoreBgClass(
  score: number | null,
  scale: ScaleDefinition,
): string {
  if (score == null) return 'bg-gray-50 text-gray-300'
  const pct = scoreToPercent(score, scale)
  if (pct >= 80) return 'bg-green-50 text-green-700'
  if (pct >= 60) return 'bg-yellow-50 text-yellow-700'
  return 'bg-red-50 text-red-600'
}

/**
 * Chave de comparabilidade de range (ex: '1-5', '1-4').
 * Duas escalas com a mesma chave podem ser misturadas no mesmo questionário.
 */
export function scaleRangeKey(scale: ScaleDefinition): string {
  return `${scale.min}-${scale.max}`
}

/**
 * Verifica se um conjunto de scale_ids pode ser misturado no mesmo questionário
 * (todos devem ter o mesmo min/max).
 */
export function hasMixedRanges(scaleIds: (string | null | undefined)[]): boolean {
  const keys = new Set(
    scaleIds
      .filter(Boolean)
      .map((id) => scaleRangeKey(getScale(id)))
  )
  return keys.size > 1
}

/**
 * Retorna o label de um valor numa escala.
 * Retorna o valor como string se não encontrar (fallback para dados antigos).
 */
export function getScaleLabel(scaleId: string | null | undefined, value: number): string {
  const scale = getScale(scaleId)
  return scale.labels.find((l) => l.value === value)?.label ?? String(value)
}

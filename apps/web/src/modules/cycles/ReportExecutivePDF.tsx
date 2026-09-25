/**
 * ReportExecutivePDF.tsx
 *
 * "Relatório Executivo" — formato adicional ao relatório padrão (ReportPDF.tsx),
 * seguindo a estrutura e a identidade visual do modelo CR BASSO Educação
 * Corporativa (Modelo-Relatorio Executivo.pdf, 19 páginas). Não substitui o
 * relatório existente — é gerado a partir dos mesmos dados (get_participant_report,
 * get_question_scores, get_participant_relationship_favorability,
 * get_participant_question_divergence, get_cycle_benchmark,
 * get_participant_demographic_breakdown), mais get_participant_reliability
 * (migration 0103/0104) e questions.value_name (migration 0102).
 *
 * Cada página do modelo é uma página fixa aqui (sem fluxo automático de
 * conteúdo entre páginas), exceto "Resultado por pergunta", que pagina as 33
 * perguntas manualmente em blocos de até 11 (ver paginateQuestions).
 */

import { Document, Page, Text, View, StyleSheet, Svg, Line, Circle, Polygon, Font } from '@react-pdf/renderer'

// react-pdf hifeniza automaticamente em quebra de linha, mas não conhece as
// regras do português e corta em lugares errados ("favor-abilidade",
// "refer-ência"). Desativa a hifenização — o texto quebra só em espaços,
// o que deixa a margem direita um pouco mais irregular, mas sem palavras
// cortadas de forma incorreta.
Font.registerHyphenationCallback((word) => [word])

// O relatório usa uma única fonte, Carlito (métrica compatível com Calibri,
// licença OFL), em dois pesos: regular pro texto e negrito pra títulos e
// números em destaque. Vale pra texto, tabelas e gráficos — os <Text> dentro
// de <Svg> precisam de fontFamily explícito, senão o react-pdf cai na
// Helvetica. Arquivos em /public/fonts/carlito (subconjunto latino do
// @fontsource/carlito, que cobre o português).
Font.register({
  family: 'Carlito',
  fonts: [{ src: '/fonts/carlito/Carlito-Regular.woff' }],
})
Font.register({
  family: 'Carlito-Bold',
  fonts: [{ src: '/fonts/carlito/Carlito-Bold.woff' }],
})

import {
  type CompetencyRow,
  type QuestionScoreRow,
  type RelationshipDetailFavorabilityRow,
  type DivergenceRow,
  type BenchmarkMap,
  mergeDistributions,
  computeFavorability,
  type Favorability,
} from './reportShared'
import { getScale, type ScaleDefinition } from '@/lib/scales'
import type { DemographicGroup } from './ParticipantReportPage'

// ─── Palette (extraída do modelo CR BASSO) ─────────────────────────────────────

const C = {
  navy:        '#1f4e78',
  navyDark:    '#13212e',
  orange:      '#dd6537',
  blue:        '#2978d5',
  blueLight:   '#d9e6f6',
  text:        '#14212e',
  muted:       '#4a5561',
  /** Texto secundário (contagens, nomes de competência sob a pergunta). */
  sub:         '#5f666e',
  light:       '#8a9099',
  border:      '#e6e4de',
  borderStrong:'#dbd9d1',
  cream:       '#f5f5f1',
  orangeBg:    '#fff5ec',
  orangeBorder:'#fbb381',
  blueCallout: '#edf4fa',
  blueCalloutBorder: '#8fb3d9',
  green:       '#0b6b0b',
  greenBg:     '#e2f4e2',
  blueTag:     '#1c5cab',
  blueTagBg:   '#e3edfa',
  orangeTag:   '#a8461a',
  orangeTagBg: '#fde9de',
  red:         '#a82a2a',
  redBg:       '#fae3e3',
  /** Etiqueta neutra ("Alinhado", "não entra"). */
  neutralTag:  '#5d6167',
  neutralTagBg:'#efede8',
  /** Quadro "Como ler". */
  howToBg:     '#fafbff',
  howToBorder: '#d9e4f2',
  white:       '#ffffff',
}

export interface ReliabilityInfo {
  n_avaliadores:       number
  n_grupos:            number
  desvio_padrao:       number
  margem:              number
  limiar_leitura:      number
  n_indiferenciados:   number
  has_chefe:           boolean
  has_pares:           boolean
  max_group_share_pct: number
  tier:                'bom' | 'atencao' | 'fragil'
  indiferenciados_detail?: { relationship_code: string; value: number }[]
}

export interface BenchmarkOverall {
  score_avg:         number
  participant_count: number
  my_rank:           number
}

export interface ReportExecutivePDFProps {
  /** "executive" (padrão) é a versão do condutor da devolutiva: traz a
   * página Guia para a devolutiva e se identifica como tal na capa e no
   * rodapé. "participant" é a versão que o próprio avaliado recebe, sem o
   * Guia. As duas levam a marca do tenant, como nos modelos de referência. */
  variant?:        'executive' | 'participant'
  personName:      string
  personRole?:     string | null
  tenantName:      string
  cycleLabel:      string
  issuedAt:        string
  scaleId:         string
  competencies:    CompetencyRow[]
  questionScores:  QuestionScoreRow[]
  questionValueNames: Record<number, string>
  relDetailFav:    RelationshipDetailFavorabilityRow[]
  divergence:      DivergenceRow[]
  demographics:    DemographicGroup[]
  benchmark:       BenchmarkMap | undefined
  benchmarkOverall: BenchmarkOverall | null
  reliability:     ReliabilityInfo | null
  nMinimum:        number
}

/** Cinza da parte neutra nas barras de distribuição. */
const NEUTRAL_BAR = '#cfccc4'

// ─── Grupos do "resultado geral" ───────────────────────────────────────────────

const GERAL_CODES = ['manager', 'manager_superior', 'peer', 'subordinate']

/** Equipe indireta é um grupo próprio (regra do BD: "Nenhum grupo é
 * fundido"). No banco ela é relationship_code 'subordinate' com
 * relationship_detail 'Indireto'; no relatório vira o grupo sintético
 * 'subordinate_indirect' — o mesmo código que get_participant_question_
 * divergence e get_participant_reliability devolvem (migration 0109). */
const INDIRECT_TEAM = 'subordinate_indirect'
function groupKey(code: string, detail: string | null | undefined): string {
  return code === 'subordinate' && detail === 'Indireto' ? INDIRECT_TEAM : code
}


/** Teto de perguntas por página em "Resultado por pergunta". O modelo de
 * referência usa de 10 a 12 por página (33 perguntas em 3 páginas). */
const QUESTIONS_PER_PAGE = 12

/** Altura útil (pt) pras linhas da tabela de "Resultado por pergunta",
 * descontados margens, cabeçalho da página, título e cabeçalho da tabela.
 * A primeira página perde ainda a introdução, e a última o quadro "Como
 * ler". Uma página que estoura cria uma página física a mais e desalinha a
 * numeração do Sumário, por isso as estimativas erram pra cima. */
// Medido: 660 pt úteis numa página de continuação, 30 a menos na primeira
// (introdução) e ~96 do quadro "Como ler" na última. A estimativa da linha
// erra 3–6% pra cima, o que dá a margem de segurança.
const Q_ROWS_BUDGET = 655
const Q_FIRST_PAGE_EXTRA = 30
const Q_LAST_PAGE_EXTRA = 100
/** Colunas de "Resultado por pergunta" (larguras do modelo). A coluna
 * "Pergunta" fica com o que sobra da largura útil (493 pt): 200 pt com os
 * grupos do modelo, menos quando o painel tem colunas extras (ex.: Equipe
 * indireta), mais quando tem menos grupos. */
const Q_COLS = {
  num: 17, fav: 47, mean: 31.5,
  groups: [['manager', 28], ['manager_superior', 37.5], ['peer', 28], ['subordinate', 32], [INDIRECT_TEAM, 32]] as [string, number][],
  out: [['self', 31], ['client', 41]] as [string, number][],
}
const Q_TABLE_W = 493

function questionColumns(groups: GroupAgg[]) {
  const present = (code: string) => (groups.find((g) => g.code === code)?.n ?? 0) > 0
  const groupCols = Q_COLS.groups.filter(([code]) => present(code))
  const outCols = Q_COLS.out.filter(([code]) => present(code))
  const used = Q_COLS.num + Q_COLS.fav + Q_COLS.mean + [...groupCols, ...outCols].reduce((w, [, cw]) => w + cw, 0)
  return { groupCols, outCols, promptW: Q_TABLE_W - used }
}

/** Altura estimada (pt) de uma linha da tabela: padding + linhas do prompt
 * (texto a 9 pt, 0,47 da fonte por caractere, calibrado contra a quebra real
 * da Carlito) + nome da competência. */
function estimateQRowHeight(prompt: string, promptW: number): number {
  return 21 + estimateLines(prompt, Math.floor((promptW - 8) / (9 * 0.47))) * 12.15
}

/** Divide `items` em exatamente `numPages` blocos, distribuindo o total de
 * forma equilibrada (em vez de encher as primeiras páginas e deixar a
 * última quase vazia). Ex.: 30 itens em 3 páginas → 10/10/10. */
function chunkIntoPages<T>(items: T[], numPages: number): T[][] {
  const base = Math.floor(items.length / numPages)
  const remainder = items.length - base * numPages
  const chunks: T[][] = []
  let i = 0
  for (let p = 0; p < numPages; p++) {
    const size = base + (p < remainder ? 1 : 0)
    chunks.push(items.slice(i, i + size))
    i += size
  }
  return chunks
}

/** Paginação de "Resultado por pergunta": o menor número de páginas (a
 * partir de ⌈n/11⌉) em que a divisão equilibrada cabe na altura estimada
 * de cada página. Usada tanto pelas páginas quanto pelo Sumário, pra que a
 * numeração bata com o documento. */
function paginateQuestions(qRows: QRow[], promptW: number): QRow[][] {
  if (qRows.length === 0) return []
  for (let numPages = Math.ceil(qRows.length / QUESTIONS_PER_PAGE); numPages <= qRows.length; numPages++) {
    const chunks = chunkIntoPages(qRows, numPages)
    const fits = chunks.every((chunk, i) => {
      const budget = Q_ROWS_BUDGET
        - (i === 0 ? Q_FIRST_PAGE_EXTRA : 0)
        - (i === chunks.length - 1 ? Q_LAST_PAGE_EXTRA : 0)
      return chunk.reduce((h, r) => h + estimateQRowHeight(r.prompt, promptW), 0) <= budget
    })
    if (fits) return chunks
  }
  return qRows.map((r) => [r])
}

const GROUP_ORDER  = ['self', 'manager', 'manager_superior', 'peer', 'subordinate', INDIRECT_TEAM, 'client']
const GROUP_LABEL: Record<string, string> = {
  self:             'Autoavaliação',
  manager:          'Chefe direto',
  manager_superior: 'Liderança superior',
  peer:             'Pares',
  subordinate:      'Equipe',
  [INDIRECT_TEAM]:  'Equipe indireta',
  client:           'Clientes internos',
}
const GROUP_SHORT: Record<string, string> = {
  manager: 'Chefe', manager_superior: 'Lid. sup.', peer: 'Pares', subordinate: 'Equipe', [INDIRECT_TEAM]: 'Eq. ind.', self: 'Auto', client: 'Cli. int.',
}
const GERAL_ENTRA: Record<string, boolean> = {
  self: false, manager: true, manager_superior: true, peer: true, subordinate: true, [INDIRECT_TEAM]: true, client: false,
}

function MiniFavBar({ pct, width = 50, marginTop = 2, height = 3 }: { pct: number; width?: number; marginTop?: number; height?: number }) {
  return (
    <View style={{ width, height, backgroundColor: '#f1f0ec', borderRadius: height / 2, overflow: 'hidden', marginTop }}>
      <View style={{ width: `${pct}%`, height, backgroundColor: C.blue }} />
    </View>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function joinWithE(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

function meanFromDist(dist: Record<string, number> | null | undefined): number | null {
  if (!dist) return null
  let sum = 0, n = 0
  for (const [k, count] of Object.entries(dist)) { sum += Number(k) * count; n += count }
  return n > 0 ? sum / n : null
}

function round2(v: number): number { return Math.round(v * 100) / 100 }

const SEXO_LABEL: Record<string, string> = { F: 'Feminino', M: 'Masculino' }

/** Valores de perfil demográfico (sexo/cargo/geração/tempo de casa) vêm
 * direto do cadastro importado pelo cliente — alguns campos (cargo) vêm
 * em CAIXA ALTA, outros (tempo de casa, geração) já vêm bem formatados
 * ("De 1 a 3 anos"). Só corrige quando o valor inteiro está em maiúsculas
 * (sem nenhuma letra minúscula) — nesse caso normaliza pra frase (só a
 * primeira letra maiúscula), que é como o cadastro escreveria por
 * extenso. Valores já com case misto ficam intocados. Sexo abreviado
 * ("F"/"M") vira o nome por extenso.
 */
function normalizeDemographicValue(value: string): string {
  const mapped = SEXO_LABEL[value.toUpperCase()]
  if (mapped && value.length <= 2) return mapped
  // "de 1 à 3 anos" é erro de crase do cadastro (não há regência que peça
  // "à" antes de número) — corrige independente do resto do valor já vir
  // bem formatado ou não.
  const fixedCrase = value.replace(/\bà\b/g, 'a').replace(/\bÀ\b/g, 'A')
  const hasLowercase = /[a-zà-öø-ÿ]/.test(fixedCrase)
  if (hasLowercase) return fixedCrase
  const lower = fixedCrase.toLocaleLowerCase('pt-BR')
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
}

/** "Tempo de casa" vem em faixas ("Menos de 1 ano", "De 1 a 3 anos"...) que a
 * ordenação alfabética do banco embaralha — ordena pelo primeiro número da
 * faixa (e faixas sem número, tipo "Menos de 1 ano", ficam primeiro). */
function tempoDeCasaSortKey(value: string): number {
  if (/menos/i.test(value)) return -1
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : 999
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

interface GroupAgg { code: string; n: number; dist: Record<string, number>; fav: Favorability; mean: number | null }

/** Agrupa relDetailFav por grupo do relatório (groupKey): junta os detalhes
 * de um mesmo grupo, mas mantém Equipe e Equipe indireta separadas. */
function aggregateByCode(rows: RelationshipDetailFavorabilityRow[], scale: ScaleDefinition): Record<string, GroupAgg> {
  const byCode: Record<string, RelationshipDetailFavorabilityRow[]> = {}
  for (const r of rows) { (byCode[groupKey(r.relationship_code, r.relationship_detail)] ??= []).push(r) }
  const out: Record<string, GroupAgg> = {}
  for (const [code, list] of Object.entries(byCode)) {
    const n = list.reduce((s, r) => s + (r.rater_count ?? 0), 0)
    const dist = mergeDistributions(list.map((r) => r.distribution))
    out[code] = { code, n, dist, fav: computeFavorability(dist, scale), mean: meanFromDist(dist) }
  }
  return out
}

interface CompAgg { id: string; name: string; questionNumbers: number[]; fav: Favorability; mean: number | null; selfMean: number | null }

function aggregateCompetencies(
  competencies: CompetencyRow[], questionScores: QuestionScoreRow[], scale: ScaleDefinition,
): CompAgg[] {
  return competencies.map((c) => {
    const qRows = questionScores.filter((r) => r.competency_id === c.id)
    const geralRows = qRows.filter((r) => GERAL_CODES.includes(r.relationship_code))
    const dist = mergeDistributions(geralRows.map((r) => r.score_distribution))
    const selfRows = qRows.filter((r) => r.relationship_code === 'self')
    const selfDist = mergeDistributions(selfRows.map((r) => r.score_distribution))
    const numbers = [...new Set(qRows.map((r) => r.order_index + 1))].sort((a, b) => a - b)
    return {
      id: c.id, name: c.name, questionNumbers: numbers,
      fav: computeFavorability(dist, scale), mean: meanFromDist(dist), selfMean: meanFromDist(selfDist),
    }
  }).filter((c) => c.fav.total > 0)
}

/** Fallback só usado se get_cycle_benchmark_overall (migration 0105) ainda
 * não rodou nesta base: aproxima a "média do grupo" pela média simples das
 * médias por competência de get_cycle_benchmark — menos exato que a RPC
 * dedicada (que pesa por resposta dentro de cada pessoa, não por
 * competência), mas evita a página ficar sem nenhum número. */
function estimateBenchmarkOverall(benchmark: BenchmarkMap | undefined): BenchmarkOverall | null {
  if (!benchmark) return null
  const rows = Object.values(benchmark)
  if (rows.length === 0) return null
  const score_avg = rows.reduce((s2, b) => s2 + b.score_avg, 0) / rows.length
  const participant_count = Math.max(...rows.map((b) => b.participant_count))
  return { score_avg, participant_count, my_rank: 0 }
}

/** Faixa de favorabilidade: rótulo, cores da etiqueta e cor do ponto usado
 * nas tabelas (tons do modelo). */
function faixa(pct: number): { label: string; color: string; bg: string; dot: string } {
  if (pct >= 80) return { label: 'Ponto forte', color: C.green, bg: C.greenBg, dot: '#0ca20c' }
  if (pct >= 60) return { label: 'Adequado com atenção', color: C.blueTag, bg: C.blueTagBg, dot: C.blue }
  if (pct >= 40) return { label: 'Oportunidade de melhoria', color: C.orangeTag, bg: C.orangeTagBg, dot: '#ec8259' }
  return { label: 'Prioridade', color: C.red, bg: C.redBg, dot: '#e34948' }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Carlito', fontSize: 9, color: C.text,
    paddingTop: 24, paddingBottom: 48, paddingLeft: 51, paddingRight: 51, backgroundColor: C.white,
  },
  header: {
    display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottom: `0.75pt solid ${C.border}`, paddingBottom: 8, marginBottom: 20,
  },
  headerLabel: { fontSize: 8, fontFamily: 'Carlito-Bold', color: C.navy, letterSpacing: 1.2, textTransform: 'uppercase' },
  headerName:  { fontSize: 8, color: C.light, letterSpacing: 0.5, textTransform: 'uppercase' },
  footer: {
    position: 'absolute', bottom: 22, left: 51, right: 51,
    display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
    borderTop: `0.75pt solid ${C.border}`, paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: C.light },
  h1: { fontSize: 19, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 10 },
  intro: { fontSize: 10.5, color: C.muted, lineHeight: 1.45, marginBottom: 14 },
  sectionLabel: { fontSize: 11.5, fontFamily: 'Carlito-Bold', color: C.text, marginBottom: 8, marginTop: 4 },
  callout: {
    backgroundColor: C.blueCallout, borderLeft: `2.2pt solid ${C.blue}`, borderRadius: 3,
    padding: 10, marginTop: 10, marginBottom: 10,
  },
  calloutOrange: {
    backgroundColor: C.orangeBg, borderLeft: `2.5pt solid ${C.orange}`, borderRadius: 3,
    padding: 10, marginTop: 10, marginBottom: 10,
  },
  calloutTitle: { fontSize: 9.5, fontFamily: 'Carlito-Bold', color: C.muted, marginBottom: 3 },
  calloutText: { fontSize: 9.5, color: C.muted, lineHeight: 1.45 },
  howToRead: {
    backgroundColor: C.howToBg, border: `0.75pt solid ${C.howToBorder}`, borderRadius: 4,
    paddingTop: 9, paddingBottom: 10, paddingLeft: 11, paddingRight: 11, marginTop: 14,
  },
  howToReadTitle: { fontSize: 7.8, fontFamily: 'Carlito-Bold', color: C.navy, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  howToReadText: { fontSize: 8.8, color: C.muted, lineHeight: 1.4 },
  card: { backgroundColor: C.cream, borderRadius: 4, padding: 12 },
  cardLabel: { fontSize: 7.8, fontFamily: 'Carlito-Bold', color: C.light, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  cardBig: { fontSize: 22, fontFamily: 'Carlito-Bold', color: C.text },
  cardMid: { fontSize: 15, fontFamily: 'Carlito-Bold', color: C.navy },
  tableHeader: { display: 'flex', flexDirection: 'row', borderBottom: `0.75pt solid ${C.borderStrong}`, paddingBottom: 5, marginBottom: 2 },
  tableRow: { display: 'flex', flexDirection: 'row', paddingTop: 6, paddingBottom: 6, borderBottom: `0.75pt solid ${C.border}`, alignItems: 'center' },
  th: { fontSize: 7.8, fontFamily: 'Carlito-Bold', color: C.light, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 9, color: C.text },
  /** Etiqueta arredondada das faixas de favorabilidade. */
  pill: { borderRadius: 8, paddingLeft: 7, paddingRight: 7, paddingTop: 2.5, paddingBottom: 2.5, fontSize: 7.6, fontFamily: 'Carlito-Bold' },
  badge: { borderRadius: 3, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2, fontSize: 8, fontFamily: 'Carlito-Bold' },
})

// ─── Header / footer ────────────────────────────────────────────────────────

function PageChrome({
  label, personName, tenantName, cycleLabel, variant = 'executive', children,
}: { label: string; personName: string; tenantName: string; cycleLabel: string; variant?: 'executive' | 'participant'; children: React.ReactNode }) {
  // cycleLabel é o nome interno do ciclo (ex.: "Flexmetal 2026 v2 — Avaliação
  // 360° (por Competência)") — usado no cabeçalho/topo pra quem administra,
  // mas não deve vazar pro rodapé do documento do participante. O rodapé usa
  // só o ano, extraído do próprio nome do ciclo.
  const cycleYear = cycleLabel.match(/\d{4}/)?.[0] ?? ''
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header} fixed>
        <Text style={s.headerLabel}>{label}</Text>
        <Text style={s.headerName}>{personName}</Text>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text style={s.footerText}>{personName} · Avaliação 360° {tenantName}{cycleYear ? ` ${cycleYear}` : ''}</Text>
        {variant === 'executive' ? (
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Versão do condutor · Confidencial · ${pageNumber} / ${totalPages}`} />
        ) : (
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Confidencial · ${pageNumber} / ${totalPages}`} />
        )}
      </View>
    </Page>
  )
}

// ─── 1. Capa ────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  page:       { fontFamily: 'Carlito', backgroundColor: C.white, padding: 0, position: 'relative' },
  // Faixa azul só na parte de cima (como no modelo); dados e aviso ficam
  // embaixo, em fundo branco.
  band:       { position: 'absolute', top: 0, left: 0, right: 0, height: 538, backgroundColor: C.navy },
  bandBody:   { position: 'absolute', top: 60, left: 57, right: 57 },
  brand:      { fontSize: 13, color: C.white },
  brandBold:  { fontFamily: 'Carlito-Bold', letterSpacing: 1.5 },
  kicker:     { position: 'absolute', top: 214, left: 57, fontSize: 10.5, color: C.white, opacity: 0.8, letterSpacing: 2, textTransform: 'uppercase' },
  title:      { position: 'absolute', top: 234, left: 57, fontSize: 36, fontFamily: 'Carlito-Bold', color: C.white, lineHeight: 1.08 },
  rule:       { position: 'absolute', top: 347, left: 57, width: 51, height: 0.8, backgroundColor: C.white, opacity: 0.6 },
  name:       { position: 'absolute', top: 364, left: 57, fontSize: 22, fontFamily: 'Carlito-Bold', color: C.white },
  role:       { position: 'absolute', top: 400, left: 57, fontSize: 12, color: C.white, opacity: 0.9 },
  // Selo da versão executiva, com contorno branco (como no modelo).
  versionBadge:     { position: 'absolute', top: 436, left: 57, height: 21, border: `0.75pt solid ${C.white}`, borderRadius: 3, justifyContent: 'center', paddingLeft: 9, paddingRight: 8 },
  versionBadgeText: { fontSize: 8.5, color: C.white, letterSpacing: 1.2, textTransform: 'uppercase' },
  accentBar:  { position: 'absolute', top: 530, left: 57, height: 8, width: 113, backgroundColor: C.orange },
  metaRow:    { position: 'absolute', top: 576, left: 57, right: 57, display: 'flex', flexDirection: 'row' },
  metaCol:    { width: 125 },
  metaLabel:  { fontSize: 8, color: C.light, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  metaValue:  { fontSize: 13, color: C.text, fontFamily: 'Carlito-Bold' },
  disclaimer: { position: 'absolute', top: 748, left: 57, width: 425, fontSize: 8.5, color: C.light, lineHeight: 1.45, borderTop: `0.8pt solid ${C.border}`, paddingTop: 11 },
})

function CoverPage({
  personName, personRole, tenantName, cycleLabel, issuedAt, nAvaliadores, nFormularios, variant = 'executive',
}: {
  personName: string; personRole?: string | null; tenantName: string; cycleLabel: string
  issuedAt: string; nAvaliadores: number; nFormularios: number; variant?: 'executive' | 'participant'
}) {
  const cycleYear = cycleLabel.match(/\d{4}/)?.[0] ?? ''
  // toLocaleDateString('pt-BR') devolve "setembro de 2026"; na capa o mês
  // aparece com inicial maiúscula.
  const issued = capitalize(issuedAt)
  return (
    <Page size="A4" style={cs.page}>
      <View style={cs.band} />
      <View style={cs.bandBody}>
        <Text style={cs.brand}><Text style={cs.brandBold}>{tenantName.toUpperCase()}</Text></Text>
      </View>
      <Text style={cs.kicker}>Avaliação 360°{cycleYear ? ` · Ciclo ${cycleYear}` : ''}</Text>
      <Text style={cs.title}>Relatório individual{'\n'}de feedback</Text>
      <View style={cs.rule} />
      <Text style={cs.name}>{personName}</Text>
      {personRole && <Text style={cs.role}>{personRole}</Text>}
      {variant === 'executive' && (
        <View style={cs.versionBadge}><Text style={cs.versionBadgeText}>Versão do condutor da devolutiva</Text></View>
      )}
      <View style={cs.accentBar} />
      <View style={cs.metaRow}>
        <View style={cs.metaCol}><Text style={cs.metaLabel}>Empresa</Text><Text style={cs.metaValue}>{tenantName}</Text></View>
        <View style={cs.metaCol}><Text style={cs.metaLabel}>Avaliadores</Text><Text style={cs.metaValue}>{nAvaliadores}</Text></View>
        <View style={cs.metaCol}><Text style={cs.metaLabel}>Formulários</Text><Text style={cs.metaValue}>{nFormularios}</Text></View>
        <View style={cs.metaCol}><Text style={cs.metaLabel}>Emissão</Text><Text style={cs.metaValue}>{issued}</Text></View>
      </View>
      {variant === 'executive' ? (
        <Text style={[cs.disclaimer, { top: 736 }]}>
          Documento confidencial. Versão completa, para uso de quem conduz a devolutiva, com o guia da
          conversa. Os {nAvaliadores} avaliadores são os que formam o resultado geral. Os {nFormularios} formulários
          incluem também clientes internos e a autoavaliação. Os resultados refletem percepções de
          comportamento e servem como ponto de partida para uma conversa de desenvolvimento.
        </Text>
      ) : (
        <Text style={cs.disclaimer}>
          Documento confidencial, de uso pessoal. Os {nAvaliadores} avaliadores são os que formam o
          resultado geral. Os {nFormularios} formulários incluem também clientes internos e a
          autoavaliação. Os resultados refletem percepções de comportamento e servem como ponto de
          partida para uma conversa de desenvolvimento.
        </Text>
      )}
    </Page>
  )
}

// ─── 2. Sumário ─────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  ['Como ler este relatório',          'Escala, números, quem avaliou e como ler diferenças'],
  ['Visão geral',                      'O resultado geral e o resultado de cada grupo de avaliadores'],
  ['Síntese dos dados',                'Os fatos principais do relatório, em uma página'],
  ['Resultado por competência',        'As {nComp} competências em ordem de favorabilidade'],
  ['Competências por perspectiva',     'Como cada grupo de avaliadores enxerga cada competência'],
  ['Autopercepção',                    'A sua visão comparada com a dos avaliadores'],
  ['Destaques',                        'Comportamentos mais reconhecidos e com mais espaço para evoluir'],
  ['Onde as perspectivas divergem',    'Perguntas em que os grupos veem você de forma diferente'],
  ['Resultado por pergunta',           'As {nQuestions} perguntas, uma a uma'],
  ['Valores organizacionais',          'As perguntas agrupadas pelos valores da {tenant}'],
  ['Comparação com o grupo de gestores', 'A sua média ao lado da média {cohort}'],
  ['Perfil dos avaliadores',           'Resultado por características de quem respondeu'],
  ['Guia para a devolutiva',           'Roteiro, perguntas sugeridas e cuidados, para quem conduz'],
  ['Plano de desenvolvimento',         'Espaço para registrar os compromissos'],
  ['Metodologia e glossário',          'Todas as regras de cálculo, com exemplos'],
]

/** Preenche os números do relatório nas descrições do Sumário. */
function fillTocDesc(template: string, p: { tenantName: string; nComp: number; nQuestions: number; cohortN: number }): string {
  return template
    .replace('{nComp}', String(p.nComp))
    .replace('{nQuestions}', String(p.nQuestions))
    .replace('{tenant}', p.tenantName)
    .replace('{cohort}', p.cohortN > 0 ? `dos ${p.cohortN} gestores` : 'do grupo avaliado no ciclo')
}

function TOCPage(props: { personName: string; tenantName: string; cycleLabel: string; variant?: 'executive' | 'participant'; hasValues: boolean; questionsPages: number; nComp: number; nQuestions: number; cohortN: number }) {
  const isParticipant = props.variant === 'participant'
  const items = TOC_ITEMS
    .filter((i) => props.hasValues || i[0] !== 'Valores organizacionais')
    .filter((i) => !isParticipant || i[0] !== 'Guia para a devolutiva')
  // Numeração fixa: capa(1) + sumário(2) = 2 páginas antes do primeiro
  // item de TOC_ITEMS ("Como ler este relatório", que é a própria página 3).
  // Cada item mapeia pra um número de páginas físicas no documento — só
  // "Resultado por pergunta" varia (um bloco por página, ver QUESTIONS_PER_PAGE).
  const PAGE_COUNTS: Record<string, number> = {
    'Como ler este relatório': 1, 'Visão geral': 1, 'Síntese dos dados': 1,
    'Resultado por competência': 1, 'Competências por perspectiva': 1, 'Autopercepção': 1,
    'Destaques': 1, 'Onde as perspectivas divergem': 1, 'Resultado por pergunta': props.questionsPages,
    'Valores organizacionais': 1, 'Comparação com o grupo de gestores': 1, 'Perfil dos avaliadores': 1,
    'Guia para a devolutiva': 1, 'Plano de desenvolvimento': 1, 'Metodologia e glossário': 1,
  }
  let page = 2
  const pageNumbers = items.map(([title]) => { const start = page + 1; page += PAGE_COUNTS[title] ?? 1; return start })
  return (
    <PageChrome label="Sumário" {...props}>
      <Text style={s.h1}>Sumário</Text>
      {items.map(([title, template], i) => (
        <View key={title} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', paddingTop: 7.5, paddingBottom: 7.5, paddingLeft: 5, paddingRight: 5, borderBottom: `0.75pt solid ${C.border}` }}>
          <Text style={{ width: 160, fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.text, paddingRight: 8 }}>{title}</Text>
          <Text style={{ flex: 1, fontSize: 10.5, color: C.sub, lineHeight: 1.35 }}>{fillTocDesc(template, props)}</Text>
          <Text style={{ width: 24, fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.text, textAlign: 'right' }}>{pageNumbers[i]}</Text>
        </View>
      ))}
      {isParticipant ? (
        <View style={[s.callout, { marginTop: 16 }]}>
          <Text style={s.calloutText}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Como usar este relatório.</Text>{' '}
            Cada página tem um quadro Como ler, que explica o gráfico ou a tabela. As regras de cálculo
            estão em Metodologia e glossário, ao final. O Plano de desenvolvimento é para você registrar,
            junto com quem conduz a conversa, os compromissos que escolher.
          </Text>
        </View>
      ) : (
        <View style={[s.callout, { marginTop: 16 }]}>
          <Text style={s.calloutText}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Para quem conduz a devolutiva.</Text>{' '}
            Cada página tem um quadro Como ler, que explica o gráfico ou a tabela. As regras de cálculo
            estão em Metodologia e glossário, ao final. Recomenda-se ler o relatório inteiro antes da
            conversa e usar o Guia para a devolutiva como roteiro.
          </Text>
        </View>
      )}
    </PageChrome>
  )
}

// ─── 3. Como ler ────────────────────────────────────────────────────────────

function HowToReadPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  scale: ScaleDefinition; groups: GroupAgg[]; nFormularios: number; limiar: number; margem: number
  nQuestions: number; nComp: number
}) {
  const { scale, groups, nFormularios, limiar, margem, nQuestions, nComp } = props
  const groupByCode = Object.fromEntries(groups.map((g) => [g.code, g]))
  const geralRows = groups.filter((g) => GERAL_ENTRA[g.code])
  const geral = geralRows.reduce((s2, g) => s2 + g.n, 0)
  const cliInt = groupByCode['client']?.n ?? 0
  const geralDist = mergeDistributions(geralRows.map((g) => g.dist))
  const geralFav = computeFavorability(geralDist, scale)
  const geralMean = meanFromDist(geralDist)

  return (
    <PageChrome label="Como ler" {...props}>
      <Text style={s.h1}>Como ler este relatório</Text>
      <Text style={s.intro}>
        Este relatório reúne o que as pessoas que trabalham com você observam no dia a dia, em {nQuestions}{' '}
        comportamentos organizados em {nComp} competências. Não é uma nota de desempenho. É um retrato de
        percepções, feito para orientar uma conversa de desenvolvimento.
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', gap: 14 }}>
        <View style={{ flex: 0.74, backgroundColor: C.cream, borderRadius: 4, padding: 14 }}>
          <Text style={{ fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 8 }}>A escala usada nas respostas</Text>
          <Text style={{ fontSize: 9.5, color: C.muted, marginBottom: 10, lineHeight: 1.45 }}>
            Cada pessoa indicou com que frequência observa cada comportamento.{scale.allowNa ? '' : ' Não havia opção de não observado.'}
          </Text>
          {/* Notas agrupadas pela faixa de favorabilidade, com a etiqueta uma
              vez por faixa (como no modelo). */}
          {([
            { label: 'Favorável', color: C.blue, test: (v: number) => v >= scale.max - 1 },
            { label: 'Neutro', color: '#b4b1a9', test: (v: number) => v > scale.min + 1 && v < scale.max - 1 },
            { label: 'Desfavorável', color: C.red, test: (v: number) => v <= scale.min + 1 },
          ]).map((band, bi) => (
            <View key={band.label} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', paddingTop: 3, paddingBottom: 3, borderTop: bi > 0 ? `0.75pt solid ${C.border}` : undefined }}>
              <View style={{ flex: 1 }}>
                {[...scale.labels].reverse().filter((l) => band.test(l.value)).map((l) => (
                  <View key={l.value} style={{ display: 'flex', flexDirection: 'row', paddingTop: 3, paddingBottom: 3 }}>
                    <Text style={{ width: 16, fontSize: 9.5, fontFamily: 'Carlito-Bold', color: C.navy }}>{l.value}</Text>
                    <Text style={{ fontSize: 9.5, color: C.text }}>{l.label}</Text>
                  </View>
                ))}
              </View>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, width: 76 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: band.color }} />
                <Text style={{ fontSize: 9.5, fontFamily: 'Carlito-Bold', color: C.muted }}>{band.label}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, backgroundColor: C.cream, borderRadius: 4, padding: 14 }}>
          <Text style={{ fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 8 }}>Os números do relatório</Text>
          <Text style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Favorabilidade</Text> é a porcentagem de respostas {scale.max - 1} ou {scale.max}. É o número principal. Com 80%, 8 em cada 10 respostas
            disseram que o comportamento aparece com frequência.
          </Text>
          <Text style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Média</Text> vai de {scale.min} a {scale.max} e ajuda a diferenciar resultados com favorabilidade parecida.
          </Text>
          <Text style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Resultado geral</Text> é a leitura principal deste relatório. Ele junta as respostas das pessoas
            da sua linha de comando e do seu nível, que são chefe direto, a liderança superior, os pares e a
            equipe, e cada uma tem o mesmo peso. Dele saem a favorabilidade geral de {fmtPct(geralFav.favoravel, 1)} e a
            média geral de {fmt(geralMean)}, e ele é a base das páginas de competências, destaques e perguntas. A
            autoavaliação e os clientes internos aparecem à parte, para comparação.
          </Text>
          <Text style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.45 }}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Faixas de cor</Text> classificam a favorabilidade, de ponto forte a prioridade. São uma referência
            para a leitura, e não uma meta.
          </Text>
        </View>
      </View>

      <Text style={[s.sectionLabel, { marginTop: 16 }]}>Quem avaliou você</Text>
      <View style={s.tableHeader}>
        <Text style={[s.th, { width: 96 }]}>Grupo de{'\n'}avaliadores</Text>
        <Text style={[s.th, { width: 38, textAlign: 'right', marginRight: 14 }]}>Pessoas</Text>
        <Text style={[s.th, { width: 58, marginRight: 14 }]}>No resultado{'\n'}geral</Text>
        <Text style={[s.th, { flex: 1 }]}>Quem são</Text>
      </View>
      {GROUP_ORDER.map((code) => {
        const g = groupByCode[code]
        if (!g || g.n === 0) return null
        const entra = GERAL_ENTRA[code]
        return (
          <View key={code} style={s.tableRow}>
            <Text style={[s.td, { width: 96, fontSize: 9.5, fontFamily: 'Carlito-Bold' }]}>{GROUP_LABEL[code]}</Text>
            <Text style={[s.td, { width: 38, fontSize: 9.5, color: C.sub, textAlign: 'right', marginRight: 14 }]}>{g.n}</Text>
            <View style={{ width: 58, marginRight: 14 }}>
              <Text style={[s.badge, entra ? { backgroundColor: C.blueTagBg, color: C.blueTag } : { backgroundColor: C.neutralTagBg, color: C.neutralTag }, { alignSelf: 'flex-start', fontSize: 7.3 }]}>
                {entra ? 'Entra' : 'Não entra'}
              </Text>
            </View>
            <Text style={[s.td, { flex: 1, fontSize: 9.5, color: C.sub, lineHeight: 1.4 }]}>{GROUP_DESC[code]}</Text>
          </View>
        )
      })}
      <Text style={{ fontSize: 8.8, color: C.sub, marginTop: 8, lineHeight: 1.45 }}>
        Foram {nFormularios} formulários. {geral} avaliadores formam o resultado geral{cliInt > 0 ? `, ${cliInt} clientes internos aparecem para comparação` : ''} e 1 é a sua autoavaliação.
        {cliInt > 0 && ' Os clientes internos não entram no resultado geral porque não fazem parte da sua linha de comando nem do seu nível, e essa regra vale igualmente para todos os gestores avaliados.'}
      </Text>
      <View style={s.callout}>
        <Text style={s.calloutText}>
          <Text style={{ fontFamily: 'Carlito-Bold' }}>Como ler as diferenças.</Text>{' '}
          Diferenças de média menores que {fmt(limiar, 1)} ponto na escala de {scale.min} a {scale.max} não devem ser lidas
          como diferença real. Esse valor se chama limiar de leitura e é explicado na metodologia. Só na
          posição geral em relação ao grupo de gestores a referência é a margem exata, de {fmt(margem, 2)}.
          Grupos de uma pessoa refletem uma única visão, e nesses grupos cada resposta muda o percentual
          em saltos grandes.
        </Text>
      </View>
    </PageChrome>
  )
}

const GROUP_DESC: Record<string, string> = {
  self: 'A sua própria visão. Serve de comparação e não entra no resultado geral.',
  manager: 'O seu superior imediato. Aparece sozinho, em grupo próprio.',
  manager_superior: 'Quem está acima do seu chefe direto, na mesma linha de comando.',
  peer: 'Pessoas do mesmo nível hierárquico que o seu, de qualquer área.',
  subordinate: 'Pessoas que respondem diretamente a você.',
  [INDIRECT_TEAM]: 'Pessoas da sua linha de comando abaixo da sua equipe direta, de segundo nível ou mais.',
  client: 'Pessoas fora da sua linha de comando e de outro nível, de qualquer área, inclusive gestores de outras áreas com cargo acima do seu.',
}

// ─── 4. Visão geral ─────────────────────────────────────────────────────────

function OverviewPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  groups: GroupAgg[]; benchmark: BenchmarkMap | undefined; benchmarkOverall: BenchmarkOverall | null; reliability: ReliabilityInfo | null
}) {
  const { groups, benchmark, reliability } = props
  const geralRows = groups.filter((g) => GERAL_ENTRA[g.code])
  const geralDist = mergeDistributions(geralRows.map((g) => g.dist))
  const geralN = geralRows.reduce((s2, g) => s2 + g.n, 0)
  const geralResp = Object.values(geralDist).reduce((s2, v) => s2 + v, 0)
  const scale = getScale('frequency_5_strict')
  const geralFav = computeFavorability(geralDist, scale)
  const geralMean = meanFromDist(geralDist)
  const selfFav = groups.find((g) => g.code === 'self')?.fav.favoravel ?? null

  const bm = props.benchmarkOverall ?? estimateBenchmarkOverall(benchmark)
  const groupMean = bm?.score_avg ?? null
  const margem = reliability?.margem ?? 0.26
  const diff = groupMean != null && geralMean != null ? round2(geralMean) - round2(groupMean) : null
  const diffRelevant = diff != null && Math.abs(diff) >= margem

  const inclLabels = GROUP_ORDER
    .filter((code) => GERAL_ENTRA[code])
    .map((code) => groups.find((g) => g.code === code))
    .filter((g): g is GroupAgg => !!g && g.n > 0)
    .map((g) => `${GROUP_LABEL[g.code].toLowerCase()} (${g.n})`)
  const exclLabels: string[] = []
  const selfG = groups.find((g) => g.code === 'self')
  if (selfG && selfG.n > 0) exclLabels.push('a autoavaliação')
  const clientG = groups.find((g) => g.code === 'client')
  if (clientG && clientG.n > 0) exclLabels.push(`${clientG.n} cliente${clientG.n === 1 ? '' : 's'} interno${clientG.n === 1 ? '' : 's'}`)

  const geralRowsPresent = geralRows.filter((g) => g.n > 0)
  const largestGeral = geralRowsPresent.reduce<GroupAgg | null>((max, g) => (max == null || g.n > max.n ? g : max), null)
  const othersGeral = geralRowsPresent.filter((g) => g.code !== largestGeral?.code)
  const othersGeralFav = othersGeral.length > 0 ? computeFavorability(mergeDistributions(othersGeral.map((g) => g.dist)), scale) : null

  return (
    <PageChrome label="Visão geral" {...props}>
      <Text style={s.h1}>Visão geral</Text>
      {/* Cartão grande à esquerda (favorabilidade geral) e grade 2×2 de
          cartões com contorno à direita, como no modelo. */}
      <View style={{ display: 'flex', flexDirection: 'row', gap: 16 }}>
        <View style={{ width: 250, backgroundColor: C.cream, borderRadius: 6, padding: 16 }}>
          <Text style={[s.cardLabel, { fontSize: 8.5 }]}>Favorabilidade geral</Text>
          <Text style={{ fontSize: 46, fontFamily: 'Carlito-Bold', color: C.navy, marginTop: 2 }}>{fmtPct(geralFav.favoravel, 1)}</Text>
          <Text style={{ fontSize: 9.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
            {Math.round(geralFav.favoravel / 100 * geralResp)} das {geralResp} respostas dos {geralN} avaliadores foram {scale.max - 1} ou {scale.max}.
          </Text>
          <View style={{ marginTop: 12, height: 10, backgroundColor: C.cream, borderRadius: 2, flexDirection: 'row', overflow: 'hidden' }}>
            <View style={{ width: `${geralFav.favoravel}%`, backgroundColor: C.blue }} />
            <View style={{ width: `${geralFav.neutro}%`, backgroundColor: NEUTRAL_BAR }} />
            <View style={{ width: `${geralFav.desfavoravel}%`, backgroundColor: C.red }} />
          </View>
          <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {([['Favorável', geralFav.favoravel, C.blue], ['Neutro', geralFav.neutro, NEUTRAL_BAR], ['Desfavorável', geralFav.desfavoravel, C.red]] as const).map(([label, v, color]) => (
              <View key={label} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, backgroundColor: color }} />
                <Text style={{ fontSize: 8.5, color: C.muted }}>{label} {fmtPct(v, 1)}</Text>
              </View>
            ))}
          </View>
          {inclLabels.length > 0 && (
            <Text style={{ fontSize: 9, color: C.muted, marginTop: 14, paddingTop: 12, borderTop: `0.75pt solid ${C.border}`, lineHeight: 1.45 }}>
              {`Entram neste número ${joinWithE(inclLabels)}.${exclLabels.length > 0 ? ` Ficam de fora ${joinWithE(exclLabels)}.` : ''}`}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
         <View style={ov.tileRow}>
          <View style={ov.tile}>
            <Text style={s.cardLabel}>Média geral</Text>
            <Text style={ov.value}>{fmt(geralMean)}</Text>
            <Text style={ov.desc}>{`na escala de ${scale.min} a ${scale.max}, calculada com as mesmas ${geralResp} respostas`}</Text>
          </View>
          <View style={ov.tile}>
            <Text style={s.cardLabel}>{bm != null && bm.participant_count > 0 ? `Em relação aos ${bm.participant_count} gestores` : 'Em relação ao grupo comparativo'}</Text>
            {groupMean == null ? (
              <Text style={[ov.category, { color: C.muted }]}>Sem dado de comparação</Text>
            ) : (
              <>
                <Text style={[ov.category, { color: diffRelevant ? (diff! > 0 ? C.green : C.red) : C.navy }]}>
                  {diffRelevant ? (diff! > 0 ? 'Acima do grupo' : 'Abaixo do grupo') : 'Sem diferença relevante'}
                </Text>
                <Text style={ov.desc}>
                  {diff! >= 0 ? '+' : ''}{fmt(diff, 2)} sobre a média do grupo, de {fmt(groupMean, 2)}. Para ficar acima ou abaixo, a diferença
                  precisaria passar de {fmt(margem, 2)}.
                </Text>
              </>
            )}
          </View>
         </View>
         <View style={ov.tileRow}>
          <View style={ov.tile}>
            <Text style={s.cardLabel}>Sua autoavaliação</Text>
            <Text style={ov.value}>{selfFav != null ? fmtPct(selfFav, 1) : '—'}</Text>
            {selfFav != null && (() => {
              // Subtrai os valores já arredondados a 1 casa (os mesmos impressos
              // na página), não os precisos — pro leitor conseguir refazer a
              // conta com os números que vê e chegar no mesmo resultado.
              const diffPp = Math.round(selfFav * 10) / 10 - Math.round(geralFav.favoravel * 10) / 10
              return (
                <Text style={ov.desc}>
                  {diffPp >= 0 ? '+' : ''}{fmt(diffPp, 1)} pontos percentuais em relação aos {fmtPct(geralFav.favoravel, 1)} dos avaliadores
                </Text>
              )
            })()}
          </View>
          <View style={ov.tile}>
            <Text style={s.cardLabel}>Confiabilidade do resultado</Text>
            {reliability ? (
              <>
                <Text style={[ov.category, { color: C.navy }]}>{tierLabel(reliability.tier)}</Text>
                <Text style={ov.desc}>{reliabilityReason(reliability)}</Text>
              </>
            ) : <Text style={[ov.category, { color: C.muted }]}>—</Text>}
          </View>
         </View>
        </View>
      </View>

      {reliability && (
        <View style={s.calloutOrange}>
          <Text style={s.calloutText}>
            <Text style={{ fontFamily: 'Carlito-Bold' }}>Cuidado na leitura.</Text>{' '}
            Com {reliability.n_avaliadores} avaliadores no resultado geral, diferenças pequenas podem ser efeito
            do acaso. Por isso o relatório só trata como diferença real o que passa do limiar de leitura de{' '}
            {fmt(reliability.limiar_leitura, 1)} ponto.
          </Text>
        </View>
      )}

      <Text style={[s.sectionLabel, { marginTop: 6 }]}>Resultado por grupo de avaliadores</Text>
      <View style={s.tableHeader}>
        <Text style={[s.th, { width: 104 }]}>Grupo</Text>
        <Text style={[s.th, { width: 40, textAlign: 'right', marginRight: 10 }]}>Pessoas</Text>
        <Text style={[s.th, { flex: 1 }]}>Favorabilidade</Text>
        <Text style={[s.th, { width: 52, textAlign: 'right' }]}>Favorável</Text>
        <Text style={[s.th, { width: 40, textAlign: 'right' }]}>Neutro</Text>
        <Text style={[s.th, { width: 64, textAlign: 'right' }]}>Desfavorável</Text>
        <Text style={[s.th, { width: 36, textAlign: 'right' }]}>Média</Text>
      </View>
      {GROUP_ORDER.map((code) => {
        const g = groups.find((x) => x.code === code)
        if (!g || g.n === 0) return null
        return (
          <View key={code} style={s.tableRow}>
            <View style={{ width: 104 }}>
              <Text style={[s.td, { fontSize: 9.5, fontFamily: 'Carlito-Bold' }]}>{GROUP_LABEL[code]}</Text>
              {!GERAL_ENTRA[code] && <Text style={[s.badge, { fontSize: 7.3, backgroundColor: C.neutralTagBg, color: C.neutralTag, alignSelf: 'flex-start', marginTop: 3 }]}>não entra</Text>}
            </View>
            <Text style={[s.td, { width: 40, fontSize: 9.5, color: C.sub, textAlign: 'right', marginRight: 10 }]}>{g.n}</Text>
            <View style={{ flex: 1, height: 9, backgroundColor: '#f1f0ec', borderRadius: 2, flexDirection: 'row', overflow: 'hidden', marginRight: 6 }}>
              <View style={{ width: `${g.fav.favoravel}%`, backgroundColor: GERAL_ENTRA[code] ? C.blue : '#99a2ac' }} />
            </View>
            <Text style={[s.td, { width: 52, fontSize: 9.5, textAlign: 'right', fontFamily: 'Carlito-Bold' }]}>{fmtPct(g.fav.favoravel, 1)}</Text>
            <Text style={[s.td, { width: 40, fontSize: 9.5, textAlign: 'right' }]}>{fmtPct(g.fav.neutro, 1)}</Text>
            <Text style={[s.td, { width: 64, fontSize: 9.5, textAlign: 'right' }]}>{fmtPct(g.fav.desfavoravel, 1)}</Text>
            <Text style={[s.td, { width: 36, fontSize: 9.5, textAlign: 'right' }]}>{fmt(g.mean)}</Text>
          </View>
        )
      })}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          A barra mostra a favorabilidade de cada grupo. Barras cinza são de grupos fora do resultado
          geral. Neutro e desfavorável completam as respostas do grupo e separam comportamento visto só
          às vezes, nota {scale.max - 2}, de comportamento raro, notas {scale.min} e {scale.min + 1}.
          {largestGeral != null && (
            ` O maior grupo do resultado geral é ${GROUP_LABEL[largestGeral.code].toLowerCase()}, com ${largestGeral.n} dos ${geralN} avaliadores (${fmtPct((largestGeral.n / geralN) * 100, 1)}) e ${fmtPct(largestGeral.fav.favoravel, 1)} de favorabilidade.` +
            (othersGeral.length > 1 && othersGeralFav != null
              ? ` ${capitalize(joinWithE(othersGeral.map((g) => GROUP_LABEL[g.code].toLowerCase())))}, juntos, têm ${fmtPct(othersGeralFav.favoravel, 1)} de favorabilidade.`
              : othersGeral.length === 1 && othersGeralFav != null
              ? ` ${GROUP_LABEL[othersGeral[0].code]} tem ${fmtPct(othersGeralFav.favoravel, 1)} de favorabilidade.`
              : '')
          )}
          {' '}Por isso vale ler o resultado geral junto com o resultado de cada grupo.
          {bm != null && bm.my_rank > 0 && (
            ` No ranking dos ${bm.participant_count} gestores pela média geral, a sua ficou em ${bm.my_rank}º lugar, informação secundária, porque médias de gestores vizinhos na lista não são estatisticamente diferentes.`
          )}
        </Text>
      </View>
    </PageChrome>
  )
}

const ov = StyleSheet.create({
  tileRow:  { flexGrow: 1, flexShrink: 0, display: 'flex', flexDirection: 'row', gap: 12 },
  tile:     { flex: 1, border: `0.75pt solid ${C.border}`, borderRadius: 6, paddingTop: 9, paddingBottom: 9, paddingLeft: 10, paddingRight: 10 },
  value:    { fontSize: 22, fontFamily: 'Carlito-Bold', color: C.text, marginTop: 1 },
  category: { fontSize: 15, fontFamily: 'Carlito-Bold', lineHeight: 1.1, marginTop: 1 },
  desc:     { fontSize: 8, color: C.muted, lineHeight: 1.4, marginTop: 4 },
})

function tierLabel(t: string): string { return t === 'bom' ? 'Bom' : t === 'atencao' ? 'Atenção' : 'Frágil' }

function reliabilityReason(r: ReliabilityInfo): string {
  const reasons: string[] = []
  if (r.tier === 'fragil') {
    if (r.n_grupos < 3) reasons.push(`há só ${r.n_grupos} ${r.n_grupos === 1 ? 'grupo' : 'grupos'} no resultado geral`)
    if (r.n_avaliadores < 15) reasons.push(`há ${r.n_avaliadores} avaliadores, menos que os 15 mínimos`)
  } else if (r.tier === 'atencao') {
    if (!r.has_chefe) reasons.push('falta chefe direto')
    if (!r.has_pares) reasons.push('faltam pares')
    if (r.max_group_share_pct >= 75) reasons.push(`um grupo concentra ${fmtPct(r.max_group_share_pct, 0)} dos avaliadores`)
    if (r.n_indiferenciados >= 3) reasons.push(`há ${r.n_indiferenciados} formulários com a mesma marcação em todas as perguntas`)
    if (r.n_avaliadores < 20) reasons.push(`há ${r.n_avaliadores} avaliadores, menos que os 20 adotados como referência`)
  } else {
    return `porque há ${r.n_avaliadores} avaliadores no resultado geral, com chefe direto e pares presentes, e nenhum grupo concentrando mais de ${fmtPct(r.max_group_share_pct, 0)} das respostas. Os níveis são bom, atenção e frágil.`
  }
  return `porque ${reasons.join(', ')}. Os níveis são bom, atenção e frágil.`
}

// ─── 5. Síntese dos dados ───────────────────────────────────────────────────

function buildSynthesisBullets(
  groups: GroupAgg[], comps: CompAgg[], divergence: DivergenceRow[], reliability: ReliabilityInfo | null,
  benchmark: BenchmarkMap | undefined, benchmarkOverallData: BenchmarkOverall | null, scale: ScaleDefinition, readingThreshold: number,
): string[] {
  const bullets: string[] = []
  const geralRows = groups.filter((g) => GERAL_ENTRA[g.code])
  const geralDist = mergeDistributions(geralRows.map((g) => g.dist))
  const geralFav = computeFavorability(geralDist, scale)
  const geralMean = meanFromDist(geralDist)
  const faixaInfo = faixa(geralFav.favoravel)
  const bm = benchmarkOverallData ?? estimateBenchmarkOverall(benchmark)
  const margem = reliability?.margem ?? 0.26
  const diff = bm?.score_avg != null && geralMean != null ? round2(geralMean) - round2(bm.score_avg) : null

  bullets.push(
    `A favorabilidade geral é de ${fmtPct(geralFav.favoravel, 1)}, na faixa ${faixaInfo.label.toLowerCase()}, com média ${fmt(geralMean)}.` +
    (diff != null
      ? ` Em relação à média do grupo comparativo, ${Math.abs(diff) >= margem ? `você está ${diff > 0 ? 'acima' : 'abaixo'}, com diferença de ${fmt(Math.abs(diff), 2)}.` : 'não há diferença relevante.'}`
      : '')
  )

  const geralGroups = [...geralRows].sort((a, b) => b.fav.favoravel - a.fav.favoravel)
  if (geralGroups.length >= 2) {
    const top = geralGroups[0], bot = geralGroups[geralGroups.length - 1]
    bullets.push(
      `Entre os grupos do resultado geral, o mais favorável é ${GROUP_LABEL[top.code].toLowerCase()} com ${fmtPct(top.fav.favoravel, 1)} (n=${top.n}) e o menos favorável é ${GROUP_LABEL[bot.code].toLowerCase()} com ${fmtPct(bot.fav.favoravel, 1)} (n=${bot.n}).`
    )
  }

  const ranked = [...comps].sort((a, b) => b.fav.favoravel - a.fav.favoravel || (b.mean ?? 0) - (a.mean ?? 0))
  if (ranked.length >= 3) {
    const top3 = ranked.slice(0, 3), bottom3 = [...ranked].reverse().slice(0, 3)
    bullets.push(
      `As competências mais reconhecidas são ${joinNames(top3.map((c) => c.name))}. As competências com mais espaço para evoluir são ${joinNames(bottom3.map((c) => c.name))}.`
    )
  }

  const acima = comps.filter((c) => c.selfMean != null && c.mean != null && round2(c.selfMean) - round2(c.mean) >= readingThreshold).map((c) => c.name)
  const abaixo = comps.filter((c) => c.selfMean != null && c.mean != null && round2(c.mean) - round2(c.selfMean) >= readingThreshold).map((c) => c.name)
  if (acima.length > 0 || abaixo.length > 0) {
    bullets.push(
      `A sua autoavaliação ficou acima da visão dos avaliadores em ${acima.length > 0 ? joinNames(acima) : 'nenhuma competência'}` +
      `, e abaixo em ${abaixo.length > 0 ? joinNames(abaixo) : 'nenhuma competência'}.`
    )
  }

  const sortedDiv = [...divergence].sort((a, b) => b.amplitude_points - a.amplitude_points)
  if (sortedDiv.length >= 3) {
    const top3 = sortedDiv.slice(0, 3)
    bullets.push(
      `As maiores divergências entre grupos estão nas perguntas ${joinNumbers(top3.map((q) => q.question_number))}, todas com distância de ${fmt(top3[2].amplitude_points, 1)} pontos percentuais ou mais.`
    )
  }
  if (sortedDiv.length >= 3) {
    const top10 = sortedDiv.slice(0, Math.min(10, sortedDiv.length))
    const counts: Record<string, number> = {}
    for (const q of top10) for (const g of q.lowest_groups) counts[g] = (counts[g] ?? 0) + 1
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) {
      const [code, count] = entries[0]
      bullets.push(`Nas ${top10.length} perguntas de maior divergência, o grupo menos favorável é ${(GROUP_LABEL[code] ?? code).toLowerCase()} em ${count} delas.`)
    }
  }

  const desfavTotal = Object.entries(geralDist).filter(([k]) => Number(k) <= scale.min + 1).reduce((s2, [, v]) => s2 + v, 0)
  const respTotal = Object.values(geralDist).reduce((s2, v) => s2 + v, 0)
  if (desfavTotal > 0) {
    const byGroup = geralRows
      .map((g) => ({ code: g.code, n: Object.entries(g.dist).filter(([k]) => Number(k) <= scale.min + 1).reduce((s2, [, v]) => s2 + v, 0) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
    const desc = byGroup.map((x) => `${x.n} de ${GROUP_LABEL[x.code].toLowerCase()}`).join(' e ')
    bullets.push(`O resultado geral tem ${desfavTotal} ${desfavTotal === 1 ? 'resposta' : 'respostas'} ${scale.min} ou ${scale.min + 1}, de ${respTotal}. Dessas, ${desc}.`)
  }

  for (const code of ['manager', 'manager_superior']) {
    const g = groups.find((x) => x.code === code)
    if (!g || g.n !== 1) continue
    const total = Object.values(g.dist).reduce((s2, v) => s2 + v, 0)
    if (total === 0) continue
    const favN = Object.entries(g.dist).filter(([k]) => Number(k) >= scale.max - 1).reduce((s2, [, v]) => s2 + v, 0)
    const neuN = total - favN - Object.entries(g.dist).filter(([k]) => Number(k) <= scale.min + 1).reduce((s2, [, v]) => s2 + v, 0)
    const desN = total - favN - neuN
    bullets.push(`${GROUP_LABEL[code]}, uma única pessoa, marcou ${favN} ${favN === 1 ? 'resposta' : 'respostas'} ${scale.max - 1} ou ${scale.max}, ${neuN} ${neuN === 1 ? 'resposta intermediária' : 'respostas intermediárias'} e ${desN} ${desN === 1 ? 'resposta' : 'respostas'} ${scale.min} ou ${scale.min + 1}, nas ${total} perguntas.`)
  }

  return bullets
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '—'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}
function joinNumbers(nums: number[]): string {
  if (nums.length === 0) return '—'
  if (nums.length === 1) return String(nums[0])
  return `${nums.slice(0, -1).join(', ')} e ${nums[nums.length - 1]}`
}

function SynthesisPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  groups: GroupAgg[]; comps: CompAgg[]; divergence: DivergenceRow[]; reliability: ReliabilityInfo | null
  benchmark: BenchmarkMap | undefined; benchmarkOverall: BenchmarkOverall | null; scale: ScaleDefinition; readingThreshold: number
}) {
  const bullets = buildSynthesisBullets(props.groups, props.comps, props.divergence, props.reliability, props.benchmark, props.benchmarkOverall, props.scale, props.readingThreshold)
  return (
    <PageChrome label="Síntese" {...props}>
      <Text style={s.h1}>Síntese dos dados</Text>
      <Text style={s.intro}>
        Os fatos principais deste relatório, extraídos dos números das páginas seguintes, sem
        interpretação. Servem como mapa para a conversa.
      </Text>
      {bullets.map((b, i) => (
        <View key={i} style={{ display: 'flex', flexDirection: 'row', marginBottom: 10, paddingLeft: 4 }}>
          <Text style={{ width: 14, fontSize: 10.5, color: C.text }}>•</Text>
          <Text style={{ flex: 1, fontSize: 10.5, color: C.text, lineHeight: 1.45 }}>{b}</Text>
        </View>
      ))}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Sobre esta página</Text>
        <Text style={s.howToReadText}>
          Cada frase resume um número que aparece em detalhe mais adiante. A síntese não faz julgamento
          nem recomenda ações. O significado desses fatos deve ser construído na conversa, com o
          participante.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 6. Resultado por competência ───────────────────────────────────────────

function CompetencyResultsPage(props: { personName: string; tenantName: string; cycleLabel: string; comps: CompAgg[]; scale: ScaleDefinition; n: number; benchmark: BenchmarkMap | undefined }) {
  const ranked = [...props.comps].sort((a, b) => b.fav.favoravel - a.fav.favoravel || (b.mean ?? 0) - (a.mean ?? 0))
  const hasBenchmark = ranked.some((c) => props.benchmark?.[c.id]?.fav_avg != null)
  return (
    <PageChrome label="Competências" {...props}>
      <Text style={s.h1}>Resultado por competência</Text>
      <Text style={s.intro}>
        Favorabilidade dos {props.n} avaliadores do resultado geral, da competência mais reconhecida
        para a menos reconhecida.
        {hasBenchmark && ' O traço na barra marca a favorabilidade média do grupo comparativo na mesma competência.'}
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -2, marginBottom: 10 }}>
        {([['Favorável', `(${props.scale.max - 1} ou ${props.scale.max})`, C.blue], ['Neutro', `(${props.scale.max - 2})`, NEUTRAL_BAR], ['Desfavorável', `(${props.scale.min} ou ${props.scale.min + 1})`, C.red]] as const).map(([label, range, color]) => (
          <View key={label} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, backgroundColor: color }} />
            <Text style={{ fontSize: 8.5, color: C.muted }}>{label} {range}</Text>
          </View>
        ))}
        {hasBenchmark && (
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 1.5, height: 10, backgroundColor: C.navyDark }} />
            <Text style={{ fontSize: 8.5, color: C.muted }}>Média do grupo comparativo</Text>
          </View>
        )}
      </View>
      <View style={s.tableHeader}>
        <Text style={[s.th, { width: 96 }]}>Competência</Text>
        <Text style={[s.th, { flex: 1 }]}>Distribuição</Text>
        <Text style={[s.th, { width: 50, textAlign: 'right' }]}>Favorável</Text>
        <Text style={[s.th, { width: 40, textAlign: 'right' }]}>Neutro</Text>
        <Text style={[s.th, { width: 42, textAlign: 'right' }]}>Desfav.</Text>
        <Text style={[s.th, { width: 36, textAlign: 'right', marginRight: 6 }]}>Média</Text>
        <Text style={[s.th, { width: 92, textAlign: 'center' }]}>Faixa</Text>
      </View>
      {ranked.map((c) => {
        const f = faixa(c.fav.favoravel)
        const benchFav = props.benchmark?.[c.id]?.fav_avg
        return (
          <View key={c.id} style={s.tableRow}>
            <View style={{ width: 96 }}>
              <Text style={[s.td, { fontSize: 9.5, fontFamily: 'Carlito-Bold' }]}>{c.name}</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Carlito-Bold', color: C.sub, marginTop: 1 }}>perguntas {c.questionNumbers.join(', ')}</Text>
            </View>
            <View style={{ flex: 1, position: 'relative', marginRight: 6 }}>
              <View style={{ height: 9, backgroundColor: '#f1f0ec', borderRadius: 2, flexDirection: 'row', overflow: 'hidden' }}>
                <View style={{ width: `${c.fav.favoravel}%`, backgroundColor: C.blue }} />
                <View style={{ width: `${c.fav.neutro}%`, backgroundColor: NEUTRAL_BAR }} />
                <View style={{ width: `${c.fav.desfavoravel}%`, backgroundColor: C.red }} />
              </View>
              {benchFav != null && (
                <View style={{ position: 'absolute', left: `${benchFav}%`, top: -2, width: 1.5, height: 13, backgroundColor: C.navyDark }} />
              )}
            </View>
            <Text style={[s.td, { width: 50, fontSize: 9.5, textAlign: 'right', fontFamily: 'Carlito-Bold' }]}>{fmtPct(c.fav.favoravel, 1)}</Text>
            <Text style={[s.td, { width: 40, fontSize: 9.5, textAlign: 'right' }]}>{fmtPct(c.fav.neutro, 1)}</Text>
            <Text style={[s.td, { width: 42, fontSize: 9.5, textAlign: 'right' }]}>{fmtPct(c.fav.desfavoravel, 1)}</Text>
            <Text style={[s.td, { width: 36, fontSize: 9.5, textAlign: 'right', marginRight: 6 }]}>{fmt(c.mean)}</Text>
            <View style={{ width: 92, alignItems: 'center' }}>
              <Text style={[s.pill, { backgroundColor: f.bg, color: f.color }]}>{f.label}</Text>
            </View>
          </View>
        )
      })}
      {/* Legenda das faixas, com o intervalo de cada uma (como no modelo). */}
      <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        {([['Ponto forte', 90, '80% ou mais'], ['Adequado com atenção', 70, 'de 60% a menos de 80%'], ['Oportunidade de melhoria', 50, 'de 40% a menos de 60%'], ['Prioridade', 10, 'menos de 40%']] as const).map(([label, sample, range]) => {
          const f = faixa(sample)
          return (
            <View key={label} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 12, marginBottom: 5 }}>
              <Text style={[s.pill, { backgroundColor: f.bg, color: f.color }]}>{label}</Text>
              <Text style={{ fontSize: 8.3, color: C.muted }}>{range}</Text>
            </View>
          )
        })}
      </View>
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          Cada barra soma 100% das respostas da competência, em azul a parte favorável, em cinza a
          neutra e em vermelho a desfavorável, com os valores ao lado.
          {hasBenchmark && ' O traço vertical marca a favorabilidade média do grupo comparativo na mesma competência.'}
          {' '}A ordem segue a favorabilidade e,
          no empate, a maior média. Ponto forte a partir de 80%, adequado com atenção de 60% a menos de
          80%, oportunidade de melhoria de 40% a menos de 60%, prioridade abaixo de 40%.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 7. Competências por perspectiva ────────────────────────────────────────

/** Escala do mapa de calor: 11 tons de azul, um a cada 10 pontos
 * percentuais (valor arredondado à dezena mais próxima), iguais aos do
 * modelo de referência. A partir do 8º tom o número fica branco. */
const HEAT_STEPS = ['#f2f6fd', '#e7f1fb', '#dae8fa', '#cce2fa', '#b6d3f5', '#9dc4f4', '#86b5ef', '#6da6ec', '#5498e7', '#3886e4', '#2978d5']
const HEAT_DARK_FROM = 8
/** Fundo das colunas fora do resultado geral (Auto e Cli. int.). */
const OUT_OF_GERAL_BG = '#f5f4f0'

function heatStep(pct: number): number {
  return Math.max(0, Math.min(HEAT_STEPS.length - 1, Math.round(pct / 10)))
}

function HeatLegend() {
  return (
    <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 6, marginRight: 22 }}>
      <Text style={{ fontSize: 8, color: C.light }}>0%</Text>
      <View style={{ display: 'flex', flexDirection: 'row' }}>
        {HEAT_STEPS.map((color) => <View key={color} style={{ width: 20, height: 8, backgroundColor: color }} />)}
      </View>
      <Text style={{ fontSize: 8, color: C.light }}>100%</Text>
    </View>
  )
}

const PERSPECTIVE_COL_ORDER = ['geral', 'manager', 'manager_superior', 'peer', 'subordinate', INDIRECT_TEAM, 'self', 'client']
const PERSPECTIVE_COL_LABEL: Record<string, string> = { geral: 'Geral', ...GROUP_SHORT }
const PERSPECTIVE_NAME_W = 121
/** Espaço branco que separa a coluna Geral das colunas por grupo. */
const PERSPECTIVE_GERAL_GAP = 4.5

function PerspectiveHeader({ cols, nOf }: { cols: string[]; nOf: (code: string) => number | undefined }) {
  return (
    <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', borderBottom: `0.75pt solid ${C.borderStrong}`, paddingBottom: 4 }}>
      <Text style={[s.th, { width: PERSPECTIVE_NAME_W, paddingLeft: 6 }]}>Competência</Text>
      {cols.map((c) => {
        const out = c === 'self' || c === 'client'
        const color = out ? '#7c8187' : C.light
        return (
          <View key={c} style={{ flex: 1, alignItems: 'center', marginRight: c === 'geral' ? PERSPECTIVE_GERAL_GAP : 0 }}>
            <Text style={[s.th, { color }]}>{PERSPECTIVE_COL_LABEL[c] ?? c}</Text>
            <Text style={{ fontSize: 7.8, color, marginTop: 1 }}>n={nOf(c)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function PerspectivePage(props: {
  personName: string; tenantName: string; cycleLabel: string
  comps: CompAgg[]; questionScores: QuestionScoreRow[]; groups: GroupAgg[]
}) {
  const { comps, questionScores, groups } = props
  const ranked = [...comps].sort((a, b) => b.fav.favoravel - a.fav.favoravel || (b.mean ?? 0) - (a.mean ?? 0))
  const geralN = groups.filter((g) => GERAL_ENTRA[g.code]).reduce((s2, g) => s2 + g.n, 0)
  const cols = PERSPECTIVE_COL_ORDER.filter((c) => c === 'geral' ? geralN > 0 : (groups.find((g) => g.code === c)?.n ?? 0) > 0)
  const nOf = (c: string) => c === 'geral' ? geralN : groups.find((g) => g.code === c)?.n

  function cell(comp: CompAgg, code: string): { pct: number | null; mean: number | null } {
    if (code === 'geral') return { pct: comp.fav.total > 0 ? comp.fav.favoravel : null, mean: comp.mean }
    const rows = questionScores.filter((r) => r.competency_id === comp.id && groupKey(r.relationship_code, r.relationship_detail) === code)
    const dist = mergeDistributions(rows.map((r) => r.score_distribution))
    const scale = getScale('frequency_5_strict')
    const fav = computeFavorability(dist, scale)
    return { pct: fav.total > 0 ? fav.favoravel : null, mean: meanFromDist(dist) }
  }

  return (
    <PageChrome label="Perspectivas" {...props}>
      <Text style={s.h1}>Competências por perspectiva</Text>
      <Text style={s.intro}>Favorabilidade de cada competência em cada grupo de avaliadores, em porcentagem e em média.</Text>

      {/* Mapa de calor: célula inteira pintada, separada por fios brancos. */}
      <PerspectiveHeader cols={cols} nOf={nOf} />
      {ranked.map((c) => (
        <View key={c.id} style={{ display: 'flex', flexDirection: 'row', height: 19.8 }} wrap={false}>
          <View style={{ width: PERSPECTIVE_NAME_W, justifyContent: 'center', paddingLeft: 6, borderBottom: `0.75pt solid ${C.border}` }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Carlito-Bold', color: C.text }}>{c.name}</Text>
          </View>
          {cols.map((code) => {
            const v = cell(c, code)
            const out = code === 'self' || code === 'client'
            const step = v.pct != null ? heatStep(v.pct) : null
            return (
              <View key={code} style={{
                flex: 1, justifyContent: 'center', alignItems: 'center',
                backgroundColor: out || step == null ? OUT_OF_GERAL_BG : HEAT_STEPS[step],
                borderRight: `1.5pt solid ${C.white}`, borderBottom: `1.5pt solid ${C.white}`,
                marginRight: code === 'geral' ? PERSPECTIVE_GERAL_GAP - 1.5 : 0,
              }}>
                <Text style={{
                  fontSize: 9, fontFamily: out ? 'Carlito' : 'Carlito-Bold',
                  color: out ? C.sub : (step != null && step >= HEAT_DARK_FROM ? C.white : C.text),
                }}>
                  {v.pct != null ? fmt(v.pct, 1) : '—'}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
      <HeatLegend />

      <Text style={[s.sectionLabel, { marginTop: 8 }]}>
        As mesmas competências em média, de {getScale('frequency_5_strict').min} a {getScale('frequency_5_strict').max}
      </Text>
      <PerspectiveHeader cols={cols} nOf={nOf} />
      {ranked.map((c) => (
        <View key={c.id} style={{ display: 'flex', flexDirection: 'row', height: 16, borderBottom: `0.75pt solid ${C.border}` }} wrap={false}>
          <View style={{ width: PERSPECTIVE_NAME_W, justifyContent: 'center', paddingLeft: 6 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{c.name}</Text>
          </View>
          {cols.map((code) => {
            const v = cell(c, code)
            const out = code === 'self' || code === 'client'
            return (
              <View key={code} style={{
                flex: 1, justifyContent: 'center', alignItems: 'center',
                backgroundColor: out ? OUT_OF_GERAL_BG : undefined,
                marginRight: code === 'geral' ? PERSPECTIVE_GERAL_GAP : 0,
              }}>
                <Text style={{ fontSize: 9, fontFamily: code === 'geral' ? 'Carlito-Bold' : 'Carlito', color: out ? C.sub : C.text }}>
                  {v.mean != null ? fmt(v.mean, 2) : '—'}
                </Text>
              </View>
            )
          })}
        </View>
      ))}

      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          Cada linha é uma competência e cada coluna é um grupo de avaliadores. Quanto mais escuro o azul,
          maior a favorabilidade. A coluna Geral reúne os {geralN} avaliadores do resultado geral. As colunas
          em cinza, Auto e Cli. int., aparecem só para comparação. Chefe é o chefe direto. Lid. sup. é a
          liderança superior. Auto é a autoavaliação. Cli. int. são os clientes internos. O n é o número de
          pessoas do grupo. Em grupos de uma pessoa, o percentual de uma competência só pode assumir poucos
          valores, como 0%, 33,3%, 50%, 66,7% ou 100%, e 0% significa que nenhuma resposta foi{' '}
          {getScale('frequency_5_strict').max - 1} ou {getScale('frequency_5_strict').max}, o que não quer
          dizer nota zero. Por isso vale ler esses grupos junto com a tabela de médias.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── Dumbbell mini-chart ────────────────────────────────────────────────────

function Dumbbell({ width, aFrac, bFrac, aColor = C.orange, ticks = [] }: { width: number; aFrac: number; bFrac: number; aColor?: string; ticks?: number[] }) {
  // Losango (a) e círculo azul (b) com contorno branco, ligados por uma
  // linha cinza, sobre linhas-guia verticais — medidas do modelo.
  const h = 13.5
  const pad = 4.5
  const ax = pad + Math.max(0, Math.min(1, aFrac)) * (width - pad * 2)
  const bx = pad + Math.max(0, Math.min(1, bFrac)) * (width - pad * 2)
  const y = h / 2
  return (
    <Svg width={width} height={h}>
      {ticks.map((f) => (
        <Line key={f} x1={pad + f * (width - pad * 2)} y1={0} x2={pad + f * (width - pad * 2)} y2={h} stroke="#ebe9e3" strokeWidth={0.75} />
      ))}
      <Line x1={Math.min(ax, bx)} y1={y} x2={Math.max(ax, bx)} y2={y} stroke="#b9b6ae" strokeWidth={1.5} />
      <Circle cx={bx} cy={y} r={3.75} fill={C.blue} stroke={C.white} strokeWidth={1.2} />
      <Polygon points={`${ax},${y - 4.5} ${ax + 4.5},${y} ${ax},${y + 4.5} ${ax - 4.5},${y}`} fill={aColor} stroke={C.white} strokeWidth={1} />
    </Svg>
  )
}

// ─── 8. Autopercepção ───────────────────────────────────────────────────────

/** Eixo dos dumbbells da tabela de Autopercepção (3,0 a 5,0), com a escala
 * no cabeçalho e linhas-guia a cada 0,5 ponto, como no modelo. */
const SELF_TRACK = 140
const SELF_TICKS = [0, 0.25, 0.5, 0.75, 1]

function SelfPerceptionRadar({ ranked, domainMin, domainMax, r = 68 }: {
  ranked: { id: string; name: string; selfMean: number; mean: number }[]
  domainMin: number; domainMax: number; r?: number
}) {
  const N = ranked.length
  if (N < 3) return null

  // Rótulos colados na borda do radar (como no modelo), com folga lateral
  // pros nomes das competências e só um respiro em cima/embaixo.
  const labelR = r + 9
  const width = (labelR + 58) * 2
  const height = (labelR + 8) * 2
  const cx = width / 2, cy = height / 2
  const RINGS = 4

  const axisAngle = (i: number) => (2 * Math.PI * i / N) - Math.PI / 2
  const frac = (v: number) => Math.min(Math.max((v - domainMin) / (domainMax - domainMin), 0), 1)
  const ptX = (f: number, i: number) => cx + r * f * Math.cos(axisAngle(i))
  const ptY = (f: number, i: number) => cy + r * f * Math.sin(axisAngle(i))

  const gridPolys = Array.from({ length: RINGS }, (_, gi) => {
    const f = (gi + 1) / RINGS
    return Array.from({ length: N }, (_, i) => `${ptX(f, i).toFixed(1)},${ptY(f, i).toFixed(1)}`).join(' ')
  })

  const selfPts = ranked.map((c, i) => ({ x: ptX(frac(c.selfMean), i), y: ptY(frac(c.selfMean), i) }))
  const evalPts = ranked.map((c, i) => ({ x: ptX(frac(c.mean), i), y: ptY(frac(c.mean), i) }))
  const selfPoly = selfPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const evalPoly = evalPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  const tipPositions = Array.from({ length: N }, (_, i) => {
    const angle = axisAngle(i)
    return {
      x: cx + labelR * Math.cos(angle), y: cy + labelR * Math.sin(angle),
      anchor: (Math.cos(angle) < -0.15 ? 'end' : Math.cos(angle) > 0.15 ? 'start' : 'middle') as 'start' | 'middle' | 'end',
    }
  })

  return (
    <Svg width={width} height={height}>
      {gridPolys.map((pts, gi) => (
        <Polygon key={`g${gi}`} points={pts} fill="none" stroke="#e5e7eb" strokeWidth={0.5} />
      ))}
      {Array.from({ length: N }, (_, i) => (
        <Line key={`a${i}`} x1={cx} y1={cy} x2={ptX(1, i)} y2={ptY(1, i)} stroke="#d1d5db" strokeWidth={0.5} />
      ))}
      {Array.from({ length: RINGS }, (_, gi) => {
        const f = (gi + 1) / RINGS
        const val = domainMin + f * (domainMax - domainMin)
        return (
          <Text key={`rl${gi}`} x={cx + 3} y={cy - r * f + 2} style={{ fontSize: 4.5, fill: C.light, fontFamily: 'Carlito' } as object}>
            {fmt(val, 1)}
          </Text>
        )
      })}
      <Polygon points={evalPoly} fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={1.3} />
      <Polygon points={selfPoly} fill={C.orange} fillOpacity={0.12} stroke={C.orange} strokeWidth={1.3} />
      {evalPts.map((p, i) => <Circle key={`e${i}`} cx={p.x} cy={p.y} r={2.3} fill={C.blue} />)}
      {selfPts.map((p, i) => (
        <Polygon key={`s${i}`} points={`${p.x},${p.y - 2.6} ${p.x + 2.6},${p.y} ${p.x},${p.y + 2.6} ${p.x - 2.6},${p.y}`} fill={C.orange} />
      ))}
      {tipPositions.map((tp, i) => {
        const label = ranked[i].name
        const truncated = label.length > 18 ? label.slice(0, 17) + '…' : label
        return (
          <Text key={`l${i}`} x={tp.x} y={tp.y + 2} textAnchor={tp.anchor} style={{ fontSize: 6, fill: C.muted, fontFamily: 'Carlito' } as object}>
            {truncated}
          </Text>
        )
      })}
    </Svg>
  )
}

function SelfPerceptionPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  comps: CompAgg[]; scale: ScaleDefinition; readingThreshold: number; geralFavPct: number; selfFavPct: number | null
}) {
  const { comps, scale, readingThreshold } = props
  const ranked = [...comps].filter((c) => c.selfMean != null && c.mean != null)
    .sort((a, b) => (b.selfMean! - b.mean!) - (a.selfMean! - a.mean!))
  const domainMin = 3.0, domainMax = scale.max
  const frac = (v: number) => (v - domainMin) / (domainMax - domainMin)

  return (
    <PageChrome label="Autopercepção" {...props}>
      <Text style={s.h1}>Autopercepção</Text>
      <Text style={s.intro}>
        A sua autoavaliação comparada com a média dos avaliadores do resultado geral, em cada
        competência. Na favorabilidade geral, você se avaliou em {props.selfFavPct != null ? fmtPct(props.selfFavPct, 1) : '—'} e os avaliadores em {fmtPct(props.geralFavPct, 1)}.
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }} wrap={false}>
        <SelfPerceptionRadar
          ranked={ranked.map((c) => ({ id: c.id, name: c.name, selfMean: c.selfMean!, mean: c.mean! }))}
          domainMin={domainMin}
          domainMax={domainMax}
        />
        {(() => {
          const acima = ranked.filter((c) => round2(c.selfMean!) - round2(c.mean!) >= readingThreshold).length
          const abaixo = ranked.filter((c) => round2(c.mean!) - round2(c.selfMean!) >= readingThreshold).length
          const alinhado = ranked.length - acima - abaixo
          return (
            <View style={{ flex: 1 }}>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Svg width={8} height={8}><Polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill={C.orange} /></Svg>
                  <Text style={{ fontSize: 8.5, color: C.muted }}>Autoavaliação</Text>
                </View>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Svg width={8} height={8}><Circle cx={4} cy={4} r={3.4} fill={C.blue} /></Svg>
                  <Text style={{ fontSize: 8.5, color: C.muted }}>Avaliadores</Text>
                </View>
              </View>
              <View style={[s.callout, { marginTop: 0, marginBottom: 0, padding: 12 }]}>
                <Text style={s.calloutText}>
                  Em {acima} competência{acima !== 1 ? 's' : ''} a sua autoavaliação ficou acima da visão dos avaliadores por{' '}
                  {fmt(readingThreshold, 1)} ponto ou mais. Em {alinhado} as duas visões estão alinhadas, e em {abaixo} você se
                  avaliou abaixo do que os avaliadores observam.
                </Text>
              </View>
            </View>
          )
        })()}
      </View>
      <View style={s.tableHeader}>
        <Text style={[s.th, { width: 90 }]}>Competência</Text>
        <Text style={[s.th, { width: 32, textAlign: 'right' }]}>Auto</Text>
        <Text style={[s.th, { width: 60, textAlign: 'right', marginRight: 10 }]}>Avaliadores</Text>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: SELF_TRACK, height: 8, position: 'relative' }}>
            {SELF_TICKS.map((f) => (
              <Text key={f} style={[s.th, { position: 'absolute', left: 4.5 + f * (SELF_TRACK - 9) - 12, width: 24, textAlign: 'center', fontFamily: 'Carlito', textTransform: 'none' }]}>
                {fmt(domainMin + f * (domainMax - domainMin), 1)}
              </Text>
            ))}
          </View>
        </View>
        <Text style={[s.th, { width: 46, textAlign: 'right', marginRight: 8 }]}>Diferença</Text>
        <Text style={[s.th, { width: 90, textAlign: 'center' }]}>Leitura</Text>
      </View>
      {ranked.map((c) => {
        const diff = round2(c.selfMean!) - round2(c.mean!)
        const rel = Math.abs(diff) >= readingThreshold
        const leitura = !rel ? 'Alinhado' : diff > 0 ? 'Autoavaliação acima' : 'Autoavaliação abaixo'
        const color = !rel ? C.neutralTag : diff > 0 ? C.orangeTag : C.blueTag
        const bg = !rel ? C.neutralTagBg : diff > 0 ? C.orangeTagBg : C.blueTagBg
        return (
          <View key={c.id} style={[s.tableRow, { paddingTop: 5, paddingBottom: 5 }]}>
            <Text style={[s.td, { width: 90, fontFamily: 'Carlito-Bold' }]}>{c.name}</Text>
            <Text style={[s.td, { width: 32, textAlign: 'right' }]}>{fmt(c.selfMean)}</Text>
            <Text style={[s.td, { width: 60, textAlign: 'right', marginRight: 10 }]}>{fmt(c.mean)}</Text>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Dumbbell width={SELF_TRACK} aFrac={frac(c.selfMean!)} bFrac={frac(c.mean!)} ticks={SELF_TICKS} />
            </View>
            <Text style={[s.td, { width: 46, textAlign: 'right', fontFamily: 'Carlito-Bold', marginRight: 8 }]}>{diff >= 0 ? '+' : ''}{fmt(diff, 2)}</Text>
            <View style={{ width: 90, alignItems: 'center' }}>
              <Text style={[s.badge, { backgroundColor: bg, color }]}>{leitura}</Text>
            </View>
          </View>
        )
      })}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          O gráfico radial dá a visão de conjunto. Cada eixo é uma competência, com {fmt(domainMin, 1)} no centro
          e {fmt(domainMax, 1)} na borda, como no eixo da tabela, e os valores exatos estão na tabela. O losango
          laranja é a sua autoavaliação e o círculo azul é a média dos avaliadores. Na tabela, o eixo começa em{' '}
          {fmt(domainMin, 1)} para facilitar a leitura, mas a escala completa vai de {scale.min} a {scale.max}. A
          diferença é a sua média menos a dos avaliadores, e quando positiva você se vê melhor do que os outros
          veem. A leitura usa o limiar de {fmt(readingThreshold, 1)} ponto. Como cada competência tem poucas
          perguntas, diferenças perto do limiar devem ser tratadas como indício, e não como conclusão. Uma
          autoavaliação acima não é um erro. É um convite para entender o que os outros ainda não enxergam no
          seu comportamento, ou o que você ainda não percebeu.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 9. Destaques ────────────────────────────────────────────────────────────

interface QRow { number: number; prompt: string; compName: string; fav: number; mean: number | null; groupMeans: { code: string; mean: number | null }[] }

function buildQRows(questionScores: QuestionScoreRow[], competencies: CompetencyRow[], scale: ScaleDefinition): QRow[] {
  const compById = Object.fromEntries(competencies.map((c) => [c.id, c.name]))
  const byQ = new Map<number, QuestionScoreRow[]>()
  for (const r of questionScores) { const arr = byQ.get(r.order_index) ?? []; arr.push(r); byQ.set(r.order_index, arr) }
  const out: QRow[] = []
  for (const [orderIdx, rows] of byQ.entries()) {
    const geralRows = rows.filter((r) => GERAL_CODES.includes(r.relationship_code))
    const dist = mergeDistributions(geralRows.map((r) => r.score_distribution))
    const fav = computeFavorability(dist, scale)
    if (fav.total === 0) continue
    const groupMeans = ['manager', 'manager_superior', 'peer', 'subordinate', INDIRECT_TEAM, 'self', 'client'].map((code) => ({
      code, mean: meanFromDist(mergeDistributions(rows.filter((r) => groupKey(r.relationship_code, r.relationship_detail) === code).map((r) => r.score_distribution))),
    }))
    out.push({
      number: orderIdx + 1, prompt: rows[0].prompt, compName: compById[rows[0].competency_id ?? ''] ?? '',
      fav: fav.favoravel, mean: meanFromDist(dist), groupMeans,
    })
  }
  return out.sort((a, b) => a.number - b.number)
}

function HighlightsPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  comps: CompAgg[]; qRows: QRow[]
}) {
  const { comps, qRows } = props
  const rankedComps = [...comps].sort((a, b) => b.fav.favoravel - a.fav.favoravel || (b.mean ?? 0) - (a.mean ?? 0))
  const top3Comp = rankedComps.slice(0, 3), bottom3Comp = [...rankedComps].reverse().slice(0, 3)
  const ranked = [...qRows].sort((a, b) => b.fav - a.fav || (b.mean ?? 0) - (a.mean ?? 0))
  const top5 = ranked.slice(0, 5)
  const bottomRanked = [...ranked].sort((a, b) => a.fav - b.fav || (a.mean ?? 0) - (b.mean ?? 0))
  const bottom5 = bottomRanked.slice(0, 5)

  function tieFootnote(list: QRow[], top5Set: QRow[]): string | null {
    if (top5Set.length < 5) return null
    const cutoffFav = top5Set[4].fav
    const shown = new Set(top5Set.map((r) => r.number))
    const tied = list.filter((r) => r.fav === cutoffFav && !shown.has(r.number)).sort((a, b) => a.number - b.number)
    if (tied.length === 0) return null
    return `Outras ${tied.length} pergunta${tied.length !== 1 ? 's' : ''} também ${tied.length !== 1 ? 'têm' : 'tem'} ${fmtPct(cutoffFav, 1)} de favorabilidade (${tied.map((r) => r.number).join(', ')}) e ${tied.length !== 1 ? 'ficaram' : 'ficou'} fora da lista pelo critério de desempate.`
  }
  const top5Footnote = tieFootnote(ranked, top5)
  const bottom5Footnote = tieFootnote(bottomRanked, bottom5)

  function GroupMeansText({ row }: { row: QRow }) {
    const text = row.groupMeans
      .filter((g) => GERAL_ENTRA[g.code] && g.mean != null)
      .map((g) => `${GROUP_SHORT[g.code]} ${fmt(g.mean)}`).join(' · ')
    return <Text style={{ fontSize: 8, color: C.sub, marginTop: 1 }}>{row.compName} · média por grupo, {text}</Text>
  }

  return (
    <PageChrome label="Destaques" {...props}>
      <Text style={s.h1}>Destaques</Text>
      <View style={{ display: 'flex', flexDirection: 'row', gap: 14, marginBottom: 12 }}>
        <View style={{ flex: 1, borderTop: `3pt solid ${C.green}`, backgroundColor: C.cream, borderRadius: 3, paddingTop: 12, paddingBottom: 8, paddingLeft: 14, paddingRight: 14 }}>
          <Text style={{ fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 10 }}>Competências mais reconhecidas</Text>
          {top3Comp.map((c) => (
            <View key={c.id} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Carlito-Bold' }}>{c.name}</Text>
              <Text style={{ fontSize: 9, color: C.muted }}>{fmtPct(c.fav.favoravel, 1)} · média {fmt(c.mean)}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, borderTop: `3pt solid ${C.orange}`, backgroundColor: C.cream, borderRadius: 3, paddingTop: 12, paddingBottom: 8, paddingLeft: 14, paddingRight: 14 }}>
          <Text style={{ fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 10 }}>Competências com mais espaço para evoluir</Text>
          {bottom3Comp.map((c) => (
            <View key={c.id} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Carlito-Bold' }}>{c.name}</Text>
              <Text style={{ fontSize: 9, color: C.muted }}>{fmtPct(c.fav.favoravel, 1)} · média {fmt(c.mean)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={s.sectionLabel}>Os 5 comportamentos mais reconhecidos</Text>
      {top5.map((r) => (
        <View key={r.number} style={[s.tableRow, { paddingTop: 4.5, paddingBottom: 4.5 }]} wrap={false}>
          <Text style={{ width: 26, fontSize: 13, fontFamily: 'Carlito-Bold', color: C.navy, textAlign: 'center', marginRight: 8 }}>{r.number}</Text>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 9.2, color: C.text, lineHeight: 1.3 }}>{r.prompt}</Text>
            <GroupMeansText row={r} />
          </View>
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MiniFavBar pct={r.fav} width={46} marginTop={0} height={4} />
              <Text style={{ fontSize: 12, fontFamily: 'Carlito-Bold', color: C.text }}>{fmtPct(r.fav, 1)}</Text>
            </View>
            <Text style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>média {fmt(r.mean)}</Text>
          </View>
        </View>
      ))}
      {top5Footnote && (
        <Text style={{ fontSize: 8.8, color: C.sub, marginTop: 5, lineHeight: 1.4 }}>{top5Footnote}</Text>
      )}

      <Text style={[s.sectionLabel, { marginTop: 10 }]}>Os 5 comportamentos com mais espaço para evoluir</Text>
      {bottom5.map((r) => (
        <View key={r.number} style={[s.tableRow, { paddingTop: 4.5, paddingBottom: 4.5 }]} wrap={false}>
          <Text style={{ width: 26, fontSize: 13, fontFamily: 'Carlito-Bold', color: C.navy, textAlign: 'center', marginRight: 8 }}>{r.number}</Text>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 9.2, color: C.text, lineHeight: 1.3 }}>{r.prompt}</Text>
            <GroupMeansText row={r} />
          </View>
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MiniFavBar pct={r.fav} width={46} marginTop={0} height={4} />
              <Text style={{ fontSize: 12, fontFamily: 'Carlito-Bold', color: C.text }}>{fmtPct(r.fav, 1)}</Text>
            </View>
            <Text style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>média {fmt(r.mean)}</Text>
          </View>
        </View>
      ))}
      {bottom5Footnote && (
        <Text style={{ fontSize: 8.8, color: C.sub, marginTop: 5, lineHeight: 1.4 }}>{bottom5Footnote}</Text>
      )}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          À direita, a favorabilidade da pergunta entre os avaliadores do resultado geral e, abaixo, a
          média. O texto cinza traz a média de cada grupo. A ordem segue a favorabilidade. Mais espaço
          para evoluir não quer dizer resultado ruim. São os comportamentos menos observados entre os seus.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 10. Divergência ─────────────────────────────────────────────────────────

/** Vermelho do losango do grupo menos favorável. */
const DIVERGENCE_LOW = '#e34948'

/** Estima quantas linhas um texto ocupa, quebrando por palavra. */
function estimateLines(text: string, charsPerLine: number): number {
  let lines = 1, len = 0
  for (const word of text.split(/\s+/)) {
    if (len > 0 && len + 1 + word.length > charsPerLine) { lines++; len = word.length }
    else len += (len > 0 ? 1 : 0) + word.length
  }
  return lines
}

interface DivergenceLayout { promptW: number; track: number; fontSize: number; lineH: number; catSize: number }
/** Layout do modelo (texto 9 pt, eixo de 210 pt). Se as 10 perguntas não
 * couberem na página com ele, usa a versão compacta (texto 8 pt, coluna da
 * pergunta mais larga) — a página nunca pode se dividir em duas, senão a
 * numeração do Sumário desalinha. */
function divergenceLayout(rows: DivergenceRow[]): DivergenceLayout {
  const full: DivergenceLayout = { promptW: 185, track: 210, fontSize: 9, lineH: 12.15, catSize: 8 }
  const dense: DivergenceLayout = { promptW: 250, track: 150, fontSize: 8, lineH: 10.4, catSize: 7 }
  // Altura útil pras 10 linhas, com folga pra uma introdução de 3 linhas.
  // A estimativa (0,47 da fonte por caractere) foi calibrada contra a quebra
  // real da Carlito: com as perguntas do modelo erra por 1 linha a mais.
  const ROWS_BUDGET = 510
  const height = (l: DivergenceLayout) => rows.reduce((h, r) => {
    const cpl = Math.floor((l.promptW - 8) / (l.fontSize * 0.47))
    const text = estimateLines(r.question_prompt, cpl) * l.lineH + l.catSize * 1.4
    return h + Math.max(text, 30) + 9
  }, 0)
  return height(full) <= ROWS_BUDGET ? full : dense
}

function DivergencePage(props: {
  personName: string; tenantName: string; cycleLabel: string
  divergence: DivergenceRow[]; nMinimum: number; relDetailFav: RelationshipDetailFavorabilityRow[]
}) {
  const sorted = [...props.divergence].sort((a, b) => b.amplitude_points - a.amplitude_points).slice(0, 10)
  const L = divergenceLayout(sorted)
  const eligibleCodes = [...new Set(props.relDetailFav.filter((r) => (r.rater_count ?? 0) >= props.nMinimum).map((r) => groupKey(r.relationship_code, r.relationship_detail)))]

  return (
    <PageChrome label="Divergências" {...props}>
      <Text style={s.h1}>Onde as perspectivas divergem</Text>
      <Text style={s.intro}>
        As 10 perguntas com a maior distância entre o grupo que mais reconhece o comportamento e o grupo
        que menos reconhece. Entram na comparação só os grupos com {props.nMinimum} pessoas ou mais
        {eligibleCodes.length > 0 ? ` (${eligibleCodes.map((c) => GROUP_LABEL[c] ?? c).join(', ')})` : ''}.
      </Text>
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Svg width={8} height={8}><Circle cx={4} cy={4} r={3.4} fill={C.blue} /></Svg>
          <Text style={{ fontSize: 8.5, color: C.muted }}>Grupo mais favorável</Text>
        </View>
        <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Svg width={8} height={8}><Polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill={DIVERGENCE_LOW} /></Svg>
          <Text style={{ fontSize: 8.5, color: C.muted }}>Grupo menos favorável</Text>
        </View>
      </View>
      <View style={[s.tableHeader, { alignItems: 'flex-end' }]}>
        <Text style={[s.th, { width: 20 }]}>Nº</Text>
        <Text style={[s.th, { width: L.promptW }]}>Pergunta</Text>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ width: L.track, height: 8, position: 'relative' }}>
            {[0, 25, 50, 75, 100].map((pct) => (
              <Text key={pct} style={[s.th, { position: 'absolute', left: 4.5 + (pct / 100) * (L.track - 9) - 12, width: 24, textAlign: 'center', fontFamily: 'Carlito', textTransform: 'none' }]}>
                {pct}%
              </Text>
            ))}
          </View>
        </View>
        <Text style={[s.th, { width: 50, textAlign: 'right' }]}>Distância{'\n'}(p.p.)</Text>
      </View>
      {sorted.map((r) => (
        <View key={r.question_number} style={[s.tableRow, { paddingTop: 4, paddingBottom: 4 }]} wrap={false}>
          <Text style={{ width: 20, fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{r.question_number}</Text>
          <View style={{ width: L.promptW, paddingRight: 8 }}>
            <Text style={{ fontSize: L.fontSize, color: C.text, lineHeight: L.lineH / L.fontSize }}>{r.question_prompt}</Text>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <Text style={{ fontSize: L.catSize, color: C.sub }}>{r.dimension_name}</Text>
              {[...r.lowest_groups, ...r.highest_groups].includes('client') && (
                <Text style={[s.badge, { fontSize: 7.3, backgroundColor: C.neutralTagBg, color: C.neutralTag }]}>envolve clientes internos</Text>
              )}
            </View>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Dumbbell width={L.track} aFrac={(r.lowest_pct ?? 0) / 100} bFrac={(r.highest_pct ?? 0) / 100} aColor={DIVERGENCE_LOW} ticks={[0, 0.25, 0.5, 0.75, 1]} />
            <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: L.track, marginTop: 1.5 }}>
              <Text style={{ fontSize: 8, color: C.muted }}>{r.lowest_groups.map((g) => GROUP_LABEL[g] ?? g).join(' e ')} {fmtPct(r.lowest_pct, 1)}</Text>
              <Text style={{ fontSize: 8, color: C.muted }}>{r.highest_groups.map((g) => GROUP_LABEL[g] ?? g).join(' e ')} {fmtPct(r.highest_pct, 1)}</Text>
            </View>
          </View>
          <Text style={{ width: 50, textAlign: 'right', fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{fmt(r.amplitude_points, 1)}</Text>
        </View>
      ))}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          O círculo azul é a favorabilidade do grupo que mais reconhece o comportamento e o losango
          vermelho é a do grupo que menos reconhece, com o nome e o percentual de cada um abaixo do
          símbolo. Quando dois grupos empatam, os dois aparecem. A etiqueta cinza envolve clientes internos
          indica que um grupo fora do resultado geral está num dos extremos. A distância é a diferença entre os dois
          percentuais, em pontos percentuais (p.p.). Chefe direto e liderança superior ficam de fora por
          serem uma pessoa cada. Divergência não aponta erro de ninguém. Mostra onde grupos diferentes
          vivem experiências diferentes com você.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 11-13. Resultado por pergunta ──────────────────────────────────────────


function QuestionsPages(props: {
  personName: string; tenantName: string; cycleLabel: string
  qRows: QRow[]; nMinimum: number; groups: GroupAgg[]
}) {
  const { qRows, groups } = props
  const { groupCols, outCols, promptW: Q_PROMPT_W } = questionColumns(groups)
  const chunks = paginateQuestions(qRows, Q_PROMPT_W)
  const nOf = (code: string) => groups.find((g) => g.code === code)?.n ?? 0
  const geralN = groups.filter((g) => GERAL_ENTRA[g.code]).reduce((s2, g) => s2 + g.n, 0)
  const outW = outCols.reduce((w, [, cw]) => w + cw, 0)
  const groupsW = groupCols.reduce((w, [, cw]) => w + cw, 0)
  const groupTh = { fontSize: 6.8, fontFamily: 'Carlito-Bold', color: C.light, textTransform: 'uppercase' as const, letterSpacing: 0.4, textAlign: 'center' as const }
  const colTh = { fontSize: 7, fontFamily: 'Carlito-Bold', color: C.light, textTransform: 'uppercase' as const, letterSpacing: 0.4, textAlign: 'center' as const }
  const nTh = { fontSize: 7, color: C.light, textAlign: 'center' as const, marginTop: 1 }
  const OUT_TH = '#7c8187'

  return (
    <>
      {chunks.map((chunk, pageIdx) => (
        <PageChrome key={pageIdx} label="Perguntas" {...props}>
          <Text style={s.h1}>Resultado por pergunta{pageIdx > 0 ? ' (continuação)' : ''}</Text>
          {pageIdx === 0 && (
            <Text style={s.intro}>As {qRows.length} perguntas na ordem do questionário, com o texto exato apresentado aos avaliadores.</Text>
          )}
          {/* Cabeçalho em dois níveis, como no modelo. */}
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
            <View style={{ width: Q_COLS.num + Q_PROMPT_W }} />
            <View style={{ width: Q_COLS.fav + Q_COLS.mean }}>
              <Text style={groupTh}>Resultado geral</Text>
              <Text style={[groupTh, { fontFamily: 'Carlito', textTransform: 'none' }]}>(n={geralN})</Text>
            </View>
            <View style={{ width: groupsW }}>
              <Text style={groupTh}>Média por grupo, de 1 a 5</Text>
            </View>
            {outW > 0 && (
              <View style={{ width: outW }}>
                <Text style={[groupTh, { color: OUT_TH }]}>Média, fora do{'\n'}resultado</Text>
              </View>
            )}
          </View>
          <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', borderBottom: `0.75pt solid ${C.borderStrong}`, paddingBottom: 4 }}>
            <Text style={[colTh, { width: Q_COLS.num, textAlign: 'left' }]}>Nº</Text>
            <Text style={[colTh, { width: Q_PROMPT_W, textAlign: 'left', paddingLeft: 4 }]}>Pergunta</Text>
            <Text style={[colTh, { width: Q_COLS.fav }]}>Favorável</Text>
            <Text style={[colTh, { width: Q_COLS.mean }]}>Média</Text>
            {groupCols.map(([code, w]) => (
              <View key={code} style={{ width: w }}>
                <Text style={colTh}>{GROUP_SHORT[code]}</Text>
                <Text style={nTh}>n={nOf(code)}</Text>
              </View>
            ))}
            {outCols.map(([code, w]) => (
              <View key={code} style={{ width: w }}>
                <Text style={[colTh, { color: OUT_TH }]}>{GROUP_SHORT[code]}</Text>
                <Text style={[nTh, { color: OUT_TH }]}>n={nOf(code)}</Text>
              </View>
            ))}
          </View>
          {chunk.map((r) => {
            const f = faixa(r.fav)
            const byCode = Object.fromEntries(r.groupMeans.map((g) => [g.code, g.mean]))
            return (
              <View key={r.number} style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', borderBottom: `0.75pt solid ${C.border}` }} wrap={false}>
                <View style={{ width: Q_COLS.num, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{r.number}</Text>
                </View>
                <View style={{ width: Q_PROMPT_W, paddingTop: 5, paddingBottom: 5, paddingLeft: 4, paddingRight: 8 }}>
                  <Text style={{ fontSize: 9, color: C.text, lineHeight: 1.35 }}>{r.prompt}</Text>
                  <Text style={{ fontSize: 7.2, color: C.sub, marginTop: 1 }}>{r.compName}</Text>
                </View>
                <View style={{ width: Q_COLS.fav, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: f.dot }} />
                  <Text style={{ fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{fmtPct(r.fav, 1)}</Text>
                </View>
                <View style={{ width: Q_COLS.mean, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, color: C.text, textAlign: 'center' }}>{fmt(r.mean)}</Text>
                </View>
                {groupCols.map(([code, w]) => (
                  <View key={code} style={{ width: w, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9, color: C.text, textAlign: 'center' }}>{fmt(byCode[code] ?? null)}</Text>
                  </View>
                ))}
                {outCols.map(([code, w]) => (
                  <View key={code} style={{ width: w, justifyContent: 'center', backgroundColor: OUT_OF_GERAL_BG }}>
                    <Text style={{ fontSize: 9, color: C.sub, textAlign: 'center' }}>{fmt(byCode[code] ?? null)}</Text>
                  </View>
                ))}
              </View>
            )
          })}
          {pageIdx === chunks.length - 1 && (
            <View style={s.howToRead} wrap={false}>
              <Text style={s.howToReadTitle}>Como ler</Text>
              <Text style={s.howToReadText}>
                As duas primeiras colunas de números são do resultado geral, com os {geralN} avaliadores. O
                ponto colorido antes da favorabilidade indica a faixa: verde para ponto forte, azul para
                adequado com atenção, laranja para oportunidade de melhoria e vermelho para prioridade. As
                demais colunas trazem a média de cada grupo, de {getScale('frequency_5_strict').min} a {getScale('frequency_5_strict').max}.
                Chefe é o chefe direto. Lid. sup. é a liderança superior. Auto é a autoavaliação. Cli. int.
                são os clientes internos. O n é o número de pessoas do grupo.
              </Text>
            </View>
          )}
        </PageChrome>
      ))}
    </>
  )
}

// ─── 14. Valores organizacionais ────────────────────────────────────────────

function ValuesPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  qRows: QRow[]; questionValueNames: Record<number, string>; questionScores: QuestionScoreRow[]; scale: ScaleDefinition
  competencies: CompetencyRow[]
}) {
  const { qRows, questionValueNames, questionScores, scale, competencies } = props
  const byValue = new Map<string, number[]>()
  for (const r of qRows) {
    const v = questionValueNames[r.number - 1]
    if (!v) continue
    const arr = byValue.get(v) ?? []; arr.push(r.number); byValue.set(v, arr)
  }
  if (byValue.size === 0) return null

  const rows = [...byValue.entries()].map(([value, numbers]) => {
    const qRowsForValue = questionScores.filter((r) => numbers.includes(r.order_index + 1) && GERAL_CODES.includes(r.relationship_code))
    const dist = mergeDistributions(qRowsForValue.map((r) => r.score_distribution))
    const fav = computeFavorability(dist, scale)
    const selfRows = questionScores.filter((r) => numbers.includes(r.order_index + 1) && r.relationship_code === 'self')
    const selfDist = mergeDistributions(selfRows.map((r) => r.score_distribution))
    const selfFav = computeFavorability(selfDist, scale)
    return { value, numbers, fav, mean: meanFromDist(dist), selfFavPct: selfFav.total > 0 ? selfFav.favoravel : null }
  })

  // Compara ignorando plural simples ("Resultado" valor vs "Resultados" competência
  // são o mesmo conceito com conjuntos de perguntas diferentes).
  const stripPluralS = (name: string) => name.replace(/s$/i, '')
  const compNameStems = new Set(competencies.map((c) => stripPluralS(c.name)))
  const sharedNames = [...byValue.keys()].filter((v) => compNameStems.has(stripPluralS(v)))

  return (
    <PageChrome label="Valores" {...props}>
      <Text style={s.h1}>Valores organizacionais</Text>
      <Text style={s.intro}>
        As mesmas {qRows.length} perguntas agrupadas pelos {byValue.size} valores da {props.tenantName}.
        {sharedNames.length > 0 && (
          ` ${joinNames(sharedNames)} também ${sharedNames.length > 1 ? 'são nomes' : 'é nome'} de competência${sharedNames.length > 1 ? 's' : ''}, mas ${sharedNames.length > 1 ? 'reúnem' : 'reúne'} um conjunto diferente de perguntas, e por isso os números são diferentes.`
        )}
      </Text>
      <View style={s.tableHeader}>
        <Text style={[s.th, { width: 180 }]}>Valor</Text>
        <Text style={[s.th, { flex: 1 }]}>Favorabilidade</Text>
        <Text style={[s.th, { width: 52, textAlign: 'right' }]}>Favorável</Text>
        <Text style={[s.th, { width: 40, textAlign: 'right' }]}>Média</Text>
        <Text style={[s.th, { width: 82, textAlign: 'center', color: '#7c8187', marginLeft: 8 }]}>Auto (favorável)</Text>
      </View>
      {rows.map((r) => (
        <View key={r.value} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: `0.75pt solid ${C.border}` }} wrap={false}>
          <View style={{ width: 180, paddingTop: 6, paddingBottom: 6, paddingRight: 12 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Carlito-Bold', color: C.text }}>Valor {r.value}</Text>
            {r.numbers.length === 1 && <Text style={{ fontSize: 8, fontFamily: 'Carlito-Bold', color: '#b4520f', marginTop: 1 }}>Medido por uma única pergunta. Ler com cautela.</Text>}
            <Text style={{ fontSize: 8, fontFamily: 'Carlito-Bold', color: C.sub, marginTop: 1 }}>perguntas {r.numbers.join(', ')}</Text>
          </View>
          <View style={{ flex: 1, height: 9, backgroundColor: '#f1f0ec', borderRadius: 2, overflow: 'hidden', marginRight: 10 }}>
            <View style={{ width: `${r.fav.favoravel}%`, height: 9, backgroundColor: C.blue }} />
          </View>
          <Text style={{ width: 52, fontSize: 9.5, textAlign: 'right', fontFamily: 'Carlito-Bold', color: C.text }}>{fmtPct(r.fav.favoravel, 1)}</Text>
          <Text style={{ width: 40, fontSize: 9.5, textAlign: 'right', color: C.text }}>{fmt(r.mean)}</Text>
          <View style={{ width: 82, alignSelf: 'stretch', justifyContent: 'center', backgroundColor: OUT_OF_GERAL_BG, marginLeft: 8 }}>
            <Text style={{ fontSize: 9.5, textAlign: 'center', color: C.sub }}>{r.selfFavPct != null ? fmtPct(r.selfFavPct, 1) : '—'}</Text>
          </View>
        </View>
      ))}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          Favorável e média são dos avaliadores do resultado geral nas perguntas de cada valor, listadas
          abaixo do nome. A última coluna é a sua autoavaliação, em favorabilidade, nas mesmas perguntas.
          Um valor medido por uma única pergunta tem o resultado inteiramente dependente dela.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 15. Comparação com o grupo de gestores ─────────────────────────────────

function BenchmarkPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  comps: CompAgg[]; benchmark: BenchmarkMap | undefined; limiar: number
}) {
  const { comps, benchmark, limiar } = props
  const hasBenchmark = benchmark != null && Object.keys(benchmark).length > 0
  const cohortN = benchmark ? Math.max(0, ...Object.values(benchmark).map((b) => b.participant_count)) : 0
  const rows = comps
    .map((c) => {
      const bm = benchmark?.[c.id]
      if (!bm) return null
      const diff = c.mean != null ? round2(c.mean) - round2(bm.score_avg) : null
      return { name: c.name, you: c.mean, group: bm.score_avg, diff }
    })
    .filter((r): r is { name: string; you: number | null; group: number; diff: number | null } => r != null)
    .sort((a, b) => (b.diff ?? -99) - (a.diff ?? -99))

  return (
    <PageChrome label="Grupo" {...props}>
      <Text style={s.h1}>Comparação com o grupo de gestores</Text>
      <Text style={s.intro}>
        A sua média em cada competência ao lado da média do grupo avaliado no mesmo ciclo{cohortN > 0 ? ` (${cohortN} pessoas, você incluído)` : ''}.
      </Text>
      {!hasBenchmark ? (
        <Text style={{ fontSize: 9.5, color: C.muted }}>Sem dados de comparação suficientes neste ciclo.</Text>
      ) : (
        <>
          <View style={s.tableHeader}>
            <Text style={[s.th, { width: 130 }]}>Competência</Text>
            <Text style={[s.th, { width: 50, textAlign: 'right' }]}>Você</Text>
            <Text style={[s.th, { width: 50, textAlign: 'right' }]}>Grupo</Text>
            <Text style={[s.th, { width: 60, textAlign: 'right', marginRight: 8 }]}>Diferença</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'center' }]}>Leitura</Text>
          </View>
          {rows.map((r) => {
            const rel = r.diff != null && Math.abs(r.diff) >= limiar
            const leitura = !rel ? 'Sem diferença relevante' : r.diff! > 0 ? 'Acima do grupo' : 'Abaixo do grupo'
            const color = !rel ? C.neutralTag : r.diff! > 0 ? C.blueTag : C.orangeTag
            const bg = !rel ? C.neutralTagBg : r.diff! > 0 ? C.blueTagBg : C.orangeTagBg
            return (
              <View key={r.name} style={s.tableRow}>
                <Text style={[s.td, { width: 130, fontSize: 9.5, fontFamily: 'Carlito-Bold' }]}>{r.name}</Text>
                <Text style={[s.td, { width: 50, fontSize: 9.5, textAlign: 'right', fontFamily: 'Carlito-Bold' }]}>{fmt(r.you)}</Text>
                <Text style={[s.td, { width: 50, fontSize: 9.5, textAlign: 'right' }]}>{fmt(r.group)}</Text>
                <Text style={[s.td, { width: 60, fontSize: 9.5, textAlign: 'right', fontFamily: 'Carlito-Bold', marginRight: 8 }]}>{r.diff != null ? `${r.diff >= 0 ? '+' : ''}${fmt(r.diff, 2)}` : '—'}</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[s.badge, { backgroundColor: bg, color, alignSelf: 'center' }]}>{leitura}</Text>
                </View>
              </View>
            )
          })}
        </>
      )}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          A coluna Você mostra a sua média com os avaliadores do resultado geral. A coluna Grupo mostra a
          média simples das médias gerais de todo o grupo comparativo do ciclo. A diferença é Você menos
          Grupo, e a leitura usa o limiar de {fmt(limiar, 1)} ponto. Como cada competência tem poucas
          perguntas, diferenças perto do limiar devem ser tratadas como indício, e não como conclusão.
          Esta página dá contexto e não serve para ranquear pessoas.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 16. Perfil dos avaliadores ─────────────────────────────────────────────

const DEMO_DIM_LABEL: Record<string, string> = { sexo: 'Sexo', geracao: 'Geração', cargo: 'Tipo de cargo', tempo_casa: 'Tempo de casa', nivel_detalhe: 'Nível detalhado' }

function ProfilePage(props: { personName: string; tenantName: string; cycleLabel: string; demographics: DemographicGroup[] }) {
  const byDim = new Map<string, DemographicGroup[]>()
  for (const g of props.demographics) { if (g.dimension === 'nivel_detalhe') continue; const arr = byDim.get(g.dimension) ?? []; arr.push(g); byDim.set(g.dimension, arr) }
  const tempoCasaRows = byDim.get('tempo_casa')
  if (tempoCasaRows) tempoCasaRows.sort((a, b) => tempoDeCasaSortKey(a.value) - tempoDeCasaSortKey(b.value))
  const dims = [...byDim.keys()]
  const totalPessoas = dims.length > 0 ? byDim.get(dims[0])!.reduce((s2, g) => s2 + g.respondent_count, 0) : 0

  return (
    <PageChrome label="Perfil" {...props}>
      <Text style={s.h1}>Perfil dos avaliadores</Text>
      <Text style={s.intro}>Favorabilidade segundo características de quem respondeu.</Text>
      <View style={s.calloutOrange}>
        <Text style={s.calloutText}>
          <Text style={{ fontFamily: 'Carlito-Bold' }}>Base diferente do restante do relatório.</Text>{' '}
          Aqui entram todos os avaliadores com perfil cadastrado, inclusive clientes internos, e só a
          autoavaliação fica de fora. Por isso estes números não são diretamente comparáveis à
          favorabilidade geral, que usa só os avaliadores do resultado geral.
        </Text>
      </View>
      {dims.length === 0 ? (
        <Text style={{ fontSize: 9.5, color: C.muted }}>Sem dados de perfil cadastrados para os avaliadores deste ciclo.</Text>
      ) : (
        <View style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {dims.map((dim) => (
            <View key={dim} style={{ width: 240, backgroundColor: C.cream, borderRadius: 6, paddingTop: 13, paddingBottom: 10, paddingLeft: 14, paddingRight: 14 }}>
              <Text style={{ fontSize: 10.5, fontFamily: 'Carlito-Bold', color: C.navy, marginBottom: 9 }}>{DEMO_DIM_LABEL[dim] ?? dim}</Text>
              <View style={{ display: 'flex', flexDirection: 'row', borderBottom: `0.75pt solid ${C.borderStrong}`, paddingBottom: 4, marginBottom: 1 }}>
                <Text style={[s.th, { flex: 1, fontSize: 7 }]}></Text>
                <Text style={[s.th, { width: 36, textAlign: 'right', fontSize: 7 }]}>Pessoas</Text>
                <Text style={[s.th, { width: 44 }]}></Text>
                <Text style={[s.th, { width: 42, textAlign: 'right', fontSize: 7 }]}>Favorável</Text>
                <Text style={[s.th, { width: 32, textAlign: 'right', fontSize: 7 }]}>Média</Text>
              </View>
              {byDim.get(dim)!.map((g, gi) => {
                const fav = computeFavorability(g.distribution ?? {}, getScale('frequency_5_strict'))
                const rows = byDim.get(dim)!
                return (
                  <View key={g.value} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', paddingTop: 5, paddingBottom: 5, borderBottom: gi < rows.length - 1 ? `0.75pt solid ${C.border}` : undefined }}>
                    <Text style={{ flex: 1, fontSize: 9, color: C.text }}>{normalizeDemographicValue(g.value)}</Text>
                    <Text style={{ width: 36, textAlign: 'right', fontSize: 9, color: C.sub }}>{g.respondent_count}</Text>
                    <View style={{ width: 44, alignItems: 'flex-end' }}>
                      {fav.total > 0 && <MiniFavBar pct={fav.favoravel} width={34} marginTop={0} height={4} />}
                    </View>
                    <Text style={{ width: 42, textAlign: 'right', fontSize: 9, fontFamily: 'Carlito-Bold', color: C.text }}>{fmtPct(fav.total > 0 ? fav.favoravel : null, 1)}</Text>
                    <Text style={{ width: 32, textAlign: 'right', fontSize: 9, color: C.text }}>{fmt(g.avg_score)}</Text>
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      )}
      <View style={s.howToRead}>
        <Text style={s.howToReadTitle}>Como ler</Text>
        <Text style={s.howToReadText}>
          Cada quadro divide os {totalPessoas || 'os'} avaliadores por uma característica, e por isso a soma de
          pessoas de cada quadro é sempre a mesma. Favorável é a porcentagem de respostas favoráveis e
          média vai do mínimo ao máximo da escala, calculadas com todas as respostas de cada recorte. Os
          perfis vêm do cadastro enviado pela empresa. Recortes com poucas pessoas podem ser ocultados
          para proteger o anonimato.
        </Text>
      </View>
    </PageChrome>
  )
}

// ─── 17. Guia para a devolutiva ─────────────────────────────────────────────

interface RoteiroStep { title: string; desc: string; question?: string }

function buildRoteiro(limiar: number): RoteiroStep[] {
  return [
    { title: '1. Combinar o propósito', desc: 'O relatório mostra percepções e não é avaliação de desempenho. O objetivo é escolher poucos pontos para desenvolver. As respostas aparecem agrupadas. As exceções são o chefe direto e a liderança superior, que são uma pessoa cada e aparecem em grupo próprio.' },
    { title: '2. Explicar como ler', desc: `Percorrer a página Como ler este relatório, em especial favorabilidade, quem entra no resultado geral e o limiar de leitura de ${fmt(limiar, 1)} ponto.` },
    { title: '3. Visão geral', desc: 'Apresentar a favorabilidade geral, o quadro Cuidado na leitura e o resultado de cada grupo.', question: 'O que mais chama a sua atenção nestes números?' },
    { title: '4. Pontos fortes', desc: 'Resultado por competência e Destaques.', question: 'Em que situações esses comportamentos aparecem com mais força, e como usar isso a seu favor?' },
    { title: '5. Autopercepção', desc: 'Competências em que a autoavaliação ficou acima ou abaixo dos avaliadores.', question: 'O que você faz nessas competências que as outras pessoas talvez não vejam, e o que elas podem estar vendo que você não vê?' },
    { title: '6. Diferenças entre grupos', desc: 'Competências por perspectiva e Onde as perspectivas divergem, incluindo o chefe direto, que aparece nas tabelas por grupo.', question: 'Em que situações você trabalha com cada um desses grupos, e o que muda na sua forma de agir?' },
    { title: '7. Escolher de 2 a 3 focos', desc: 'De preferência perguntas específicas da página Resultado por pergunta. Registrar no Plano de desenvolvimento, com data de acompanhamento.', question: 'Qual mudança de comportamento as pessoas notariam primeiro?' },
  ]
}

function buildCuidados(scale: ScaleDefinition, limiar: number): string[] {
  const neutral = scale.max - 2
  const low = `${scale.min} e ${scale.min + 1}`
  return [
    'Não tentar descobrir quem respondeu o quê. Chefe direto e liderança superior são uma pessoa cada e aparecem em grupo próprio, e por isso merecem cuidado redobrado.',
    `Quando a favorabilidade de um grupo é baixa, olhar as colunas neutro e desfavorável da Visão geral. Respostas ${neutral} indicam comportamento visto só ocasionalmente, o que é diferente de respostas ${low}.`,
    ...(scale.allowNa ? [] : [`Como não havia opção de não observado, parte das respostas ${neutral} pode indicar pouca convivência com o comportamento, e não a sua ausência.`]),
    `Diferenças menores que ${fmt(limiar, 1)} ponto não indicam diferença real e não precisam de explicação.`,
    'Clientes internos e autoavaliação aparecem para comparação e não fazem parte do resultado geral.',
    'Não comparar com ciclos anteriores. O questionário e a forma de avaliar podem ter mudado.',
    'Falar de comportamentos observáveis, que são o que as perguntas medem, e não de traços de personalidade.',
  ]
}

function GuideBullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ display: 'flex', flexDirection: 'row', marginBottom: 3 }}>
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.muted, marginLeft: 4, marginRight: 7, marginTop: 5 }} />
      <Text style={{ flex: 1, fontSize: 8.9, color: C.muted, lineHeight: 1.4 }}>{children}</Text>
    </View>
  )
}

function GuidePage(props: { personName: string; tenantName: string; cycleLabel: string; scale: ScaleDefinition; limiar: number }) {
  const sectionTitle = { fontSize: 11.5, fontFamily: 'Carlito-Bold', color: C.text, marginBottom: 7 }
  return (
    <PageChrome label="Guia da devolutiva" {...props}>
      <Text style={s.h1}>Guia para a devolutiva</Text>
      <Text style={[s.intro, { marginBottom: 10 }]}>
        Para quem conduz a conversa. O roteiro pode ser adaptado, mas a ordem ajuda a manter a conversa
        construtiva e focada em desenvolvimento.
      </Text>
      <Text style={sectionTitle}>Antes da sessão</Text>
      <GuideBullet>
        Ler o relatório inteiro, inclusive a metodologia, e anotar as perguntas que pretende fazer. A Síntese dos dados serve como mapa da conversa.
      </GuideBullet>
      <GuideBullet>
        Decidir com a empresa se o participante recebe o relatório antes ou durante a sessão. O relatório foi escrito para ser lido pelos dois.
      </GuideBullet>
      <Text style={[sectionTitle, { marginTop: 8 }]}>Roteiro sugerido</Text>
      {/* Título do passo à esquerda e descrição à direita; a pergunta
          sugerida vem em azul numa linha própria, como no modelo. */}
      {buildRoteiro(props.limiar).map((step) => (
        <View key={step.title} style={{ display: 'flex', flexDirection: 'row', backgroundColor: C.cream, borderRadius: 4, paddingTop: 5, paddingBottom: 6, paddingLeft: 9, paddingRight: 9, marginBottom: 4 }} wrap={false}>
          <Text style={{ width: 124, fontSize: 8.9, fontFamily: 'Carlito-Bold', color: C.navy }}>{step.title}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8.9, color: C.muted, lineHeight: 1.4 }}>{step.desc}</Text>
            {step.question && (
              <Text style={{ fontSize: 8.9, color: C.blueTag, lineHeight: 1.4, marginTop: 3 }}>Pergunta possível. {step.question}</Text>
            )}
          </View>
        </View>
      ))}
      <Text style={[sectionTitle, { marginTop: 8 }]}>Cuidados na conversa</Text>
      {buildCuidados(props.scale, props.limiar).map((c) => <GuideBullet key={c}>{c}</GuideBullet>)}
    </PageChrome>
  )
}

// ─── 18. Plano de desenvolvimento ───────────────────────────────────────────

function PlanCheckbox({ label }: { label: string }) {
  return (
    <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <View style={{ width: 10, height: 10, border: `0.75pt solid ${PLAN_LINE}`, borderRadius: 1.5 }} />
      <Text style={{ fontSize: 9, color: C.muted }}>{label}</Text>
    </View>
  )
}

/** Cinza das linhas de preenchimento e assinatura do Plano. */
const PLAN_LINE = '#99a0a6'

function PlanPage(props: { personName: string; tenantName: string; cycleLabel: string }) {
  // Larguras e alturas do modelo: colunas de 26/30/22/22%, cabeçalho de
  // 54 pt e 4 linhas de 74 pt pra escrever à mão.
  const cols: { title: string; subtitle: string; width: string }[] = [
    { title: 'Comportamento a desenvolver', subtitle: 'pergunta ou competência do relatório', width: '26%' },
    { title: 'O que vou fazer',              subtitle: 'ações concretas no dia a dia',         width: '30%' },
    { title: 'Quem pode me apoiar',          subtitle: '',                                     width: '22%' },
    { title: 'Como e quando vou verificar',  subtitle: '',                                     width: '22%' },
  ]
  const grid = `0.75pt solid ${C.borderStrong}`
  return (
    <PageChrome label="Plano" {...props}>
      <Text style={s.h1}>Plano de desenvolvimento</Text>
      <Text style={s.intro}>Para preencher durante ou logo após a devolutiva. Dois ou três focos bem escolhidos valem mais que uma lista longa.</Text>
      <View style={{ display: 'flex', flexDirection: 'row', height: 54, borderTop: grid, borderLeft: grid, borderRight: grid, borderBottom: grid }}>
        {cols.map((c, i) => (
          <View key={c.title} style={{ width: c.width, backgroundColor: C.cream, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8, paddingLeft: 6, paddingRight: 6, borderLeft: i > 0 ? grid : undefined }}>
            <Text style={{ fontSize: 7.8, fontFamily: 'Carlito-Bold', color: C.light, textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 1.35, textAlign: 'center' }}>{c.title}</Text>
            {c.subtitle !== '' && <Text style={{ fontSize: 7.8, color: C.light, marginTop: 1, lineHeight: 1.3, textAlign: 'center' }}>{c.subtitle}</Text>}
          </View>
        ))}
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ display: 'flex', flexDirection: 'row', height: 74, borderLeft: grid, borderRight: grid, borderBottom: grid }}>
          {cols.map((c, j) => (
            <View key={c.title} style={{ width: c.width, borderLeft: j > 0 ? grid : undefined }} />
          ))}
        </View>
      ))}
      <Text style={[s.sectionLabel, { marginTop: 14 }]}>Pontos fortes que vou usar a meu favor</Text>
      <View style={{ height: 85, border: grid, borderRadius: 4 }} />
      <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 }}>
        <Text style={{ width: 130, fontSize: 9, color: C.muted, lineHeight: 1.4 }}>Próxima conversa de{'\n'}acompanhamento</Text>
        <View style={{ width: 107, borderBottom: `0.75pt solid ${PLAN_LINE}`, marginBottom: 4 }} />
        <View style={{ flex: 1 }} />
        <Text style={{ width: 130, fontSize: 9, color: C.muted, lineHeight: 1.4 }}>Plano compartilhado com o{'\n'}chefe direto</Text>
        <View style={{ display: 'flex', flexDirection: 'row', gap: 22 }}>
          <PlanCheckbox label="sim" />
          <PlanCheckbox label="não" />
        </View>
      </View>
      <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 }}>
        <View style={{ width: 172, borderTop: `0.75pt solid ${PLAN_LINE}`, paddingTop: 5 }}><Text style={{ fontSize: 8.5, color: C.light }}>Participante</Text></View>
        <View style={{ width: 172, borderTop: `0.75pt solid ${PLAN_LINE}`, paddingTop: 5 }}><Text style={{ fontSize: 8.5, color: C.light }}>Responsável pela devolutiva</Text></View>
        <View style={{ width: 104, borderTop: `0.75pt solid ${PLAN_LINE}`, paddingTop: 5 }}><Text style={{ fontSize: 8.5, color: C.light }}>Data</Text></View>
      </View>
    </PageChrome>
  )
}

// ─── 19. Metodologia e glossário ────────────────────────────────────────────

function MethodologyPage(props: {
  personName: string; tenantName: string; cycleLabel: string
  scale: ScaleDefinition; nMinimum: number; reliability: ReliabilityInfo | null; nComp: number; nQuestions: number
}) {
  const { scale, nMinimum, reliability } = props
  const r = reliability
  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Text style={{ fontSize: 9, color: C.muted, lineHeight: 1.45, marginBottom: 8 }}>
      <Text style={{ fontFamily: 'Carlito-Bold', color: C.text }}>{title}. </Text>{children}
    </Text>
  )
  return (
    <PageChrome label="Metodologia" {...props}>
      <Text style={s.h1}>Metodologia e glossário</Text>
      <Block title="Origem dos dados">
        Respostas exportadas da plataforma de coleta da {props.tenantName}, nos formulários de avaliação 360°
        e de autoavaliação. Nenhuma resposta foi acrescentada, alterada ou estimada. Os números foram
        calculados a partir do banco de dados consolidado para esta avaliação e conferidos por um segundo
        cálculo, feito de forma independente a partir dos arquivos originais.
      </Block>
      <Block title="Instrumento">
        Perguntas fechadas de frequência de comportamento, organizadas em {props.nComp} competências. O
        questionário não tinha perguntas abertas. A escala vai de {scale.min} ({scale.labels[0].label}) a {scale.max} ({scale.labels[scale.labels.length - 1].label}).
      </Block>
      <Block title="Favorabilidade">
        Respostas {scale.max - 1} ou {scale.max} divididas pelo total de respostas. Neutro é a resposta {scale.max - 2 >= scale.min + 2 ? `${scale.min + 2}` : 'intermediária'}, e desfavorável são respostas {scale.min} e {scale.min + 1}.
      </Block>
      <Block title="Média">Soma das notas dividida pelo número de respostas.</Block>
      <Block title="Resultado geral">
        Reúne os grupos chefe direto, liderança superior, pares e equipe, quando existem. Cada avaliador
        vale o mesmo. Autoavaliação e clientes internos não entram.
      </Block>
      <Block title="Grupos de avaliadores">
        Chefe direto, liderança superior e equipe seguem a linha de comando do organograma. Pares são
        pessoas do mesmo nível hierárquico que o participante, de qualquer área. Clientes internos são
        pessoas fora da linha de comando e de outro nível, de qualquer área, inclusive gestores de
        outras áreas com cargo acima do dele.
      </Block>
      <Block title="Margem e limiar de leitura">
        {r ? (
          <>A margem é de 95% e vale 1,96 vezes o desvio-padrão das médias individuais dos avaliadores ({fmt(r.desvio_padrao, 2)}) dividido pela raiz do número de avaliadores ({r.n_avaliadores}). Neste relatório a margem é {fmt(r.margem, 2)}. O limiar de leitura é a margem arredondada para cima na primeira casa decimal, {fmt(r.limiar_leitura, 1)}, e é usado nas comparações por competência. Diferenças menores estão dentro da variação esperada.</>
        ) : 'Calculados a partir do desvio-padrão das médias individuais dos avaliadores do resultado geral.'}
      </Block>
      <Block title="Posição em relação ao grupo e ranking">
        A média do grupo é a média simples das médias gerais de todo o grupo comparativo do ciclo. A
        posição só fica acima ou abaixo quando a diferença passa da margem. O ranking ordena o grupo
        comparativo pela média geral e é informação secundária, porque médias de posições vizinhas na
        lista costumam não ser estatisticamente diferentes.
      </Block>
      <Block title="Confiabilidade do resultado">
        Frágil quando menos de 3 grupos entram no resultado geral ou há menos de 15 avaliadores. Atenção
        quando falta chefe direto ou pares, quando um grupo tem 75% ou mais dos avaliadores, quando há 3
        ou mais formulários com a mesma marcação em todas as perguntas, ou quando há menos de 20
        avaliadores. Bom nos demais casos. Os limites de 15 e 20 avaliadores foram adotados como
        referência de estabilidade do resultado.
        {r && ` Aqui o resultado fica em ${tierLabel(r.tier).toLowerCase()} ${reliabilityReason(r).replace('Os níveis são bom, atenção e frágil.', '').trim()}`}
      </Block>
      <Block title="Respostas indiferenciadas">
        Formulário com a mesma marcação em todas as perguntas. Não afeta o resultado geral por si só, só
        entra como um dos critérios de confiabilidade. Formulários assim são mantidos no cálculo.
        {r?.indiferenciados_detail && r.indiferenciados_detail.length > 0 && (
          ` ${r.indiferenciados_detail.length === 1 ? '1 formulário' : `${r.indiferenciados_detail.length} formulários`} deste relatório ${r.indiferenciados_detail.length === 1 ? 'veio' : 'vieram'} com a mesma marcação nas ${props.nQuestions} perguntas: ${r.indiferenciados_detail.map((d) => `${GROUP_LABEL[d.relationship_code] ?? d.relationship_code}, com ${scale.labels.find((l) => l.value === d.value)?.label ?? d.value}`).join('; ')}.`
        )}
      </Block>
      <Block title="Divergência entre perspectivas">
        Em cada pergunta, a diferença entre o grupo de maior e o de menor favorabilidade, só com grupos de
        {' '}{nMinimum} pessoas ou mais.
      </Block>
      <Block title="Termos">
        Pontos percentuais (p.p.) são a diferença entre duas porcentagens. Ponto, sem outro complemento, é
        a distância na escala de {scale.min} a {scale.max}. O n é o número de pessoas de um grupo.
      </Block>
      <Block title="Faixas">Ponto forte a partir de 80%, adequado com atenção de 60% a menos de 80%, oportunidade de melhoria de 40% a menos de 60%, prioridade abaixo de 40%. São uma referência para a leitura, e não uma meta.</Block>
      <Block title="Sigilo">
        Chefe direto e liderança superior são uma pessoa cada e aparecem em grupo próprio, por serem
        posições únicas na estrutura, sem expor o nome de quem respondeu. Os demais grupos aparecem de
        forma agregada, respeitando o n-mínimo de {nMinimum} pessoas.
      </Block>
      <Block title="Ciclos anteriores">
        Este relatório não compara com ciclos anteriores. Mudanças no questionário, na escala ou no
        conjunto de avaliadores entre ciclos tornam a comparação direta não confiável.
      </Block>
    </PageChrome>
  )
}

// ─── Documento principal ────────────────────────────────────────────────────

export function ReportExecutivePDFDocument(props: ReportExecutivePDFProps) {
  const {
    variant = 'executive', personName, personRole, tenantName, cycleLabel, issuedAt, scaleId,
    competencies, questionScores, questionValueNames, relDetailFav, divergence,
    demographics, benchmark, benchmarkOverall, reliability, nMinimum,
  } = props
  const scale = getScale(scaleId)
  const groups = aggregateByCode(relDetailFav, scale)
  const groupList = Object.values(groups)
  const comps = aggregateCompetencies(competencies, questionScores, scale)
  const qRows = buildQRows(questionScores, competencies, scale)
  const readingThreshold = reliability?.limiar_leitura ?? 0.3
  const margem = reliability?.margem ?? 0.3

  const nAvaliadores = groupList.filter((g) => GERAL_ENTRA[g.code]).reduce((s2, g) => s2 + g.n, 0)
  const nFormularios = groupList.reduce((s2, g) => s2 + g.n, 0)

  const geralRows = groupList.filter((g) => GERAL_ENTRA[g.code])
  const geralDist = mergeDistributions(geralRows.map((g) => g.dist))
  const geralFav = computeFavorability(geralDist, scale)
  const selfFav = groupList.find((g) => g.code === 'self')?.fav.favoravel ?? null
  const hasValues = Object.keys(questionValueNames).length > 0
  const questionsPages = Math.max(1, paginateQuestions(qRows, questionColumns(groupList).promptW).length)

  const chrome = { personName, tenantName, cycleLabel, variant }

  return (
    <Document
      title={`${variant === 'executive' ? 'Relatório Executivo' : 'Relatório Individual'} — ${personName}`}
      author={variant === 'executive' ? 'CR BASSO Educação Corporativa' : tenantName}
      subject={cycleLabel}
      creator="Maptiva"
    >
      <CoverPage personName={personName} personRole={personRole} tenantName={tenantName} cycleLabel={cycleLabel} issuedAt={issuedAt} nAvaliadores={nAvaliadores} nFormularios={nFormularios} variant={variant} />
      <TOCPage {...chrome} hasValues={hasValues} questionsPages={questionsPages} nComp={comps.length} nQuestions={qRows.length} cohortN={(benchmarkOverall ?? estimateBenchmarkOverall(benchmark))?.participant_count ?? 0} />
      <HowToReadPage {...chrome} scale={scale} groups={groupList} nFormularios={nFormularios} limiar={readingThreshold} margem={margem} nQuestions={qRows.length} nComp={competencies.length} />
      <OverviewPage {...chrome} groups={groupList} benchmark={benchmark} benchmarkOverall={benchmarkOverall} reliability={reliability} />
      <SynthesisPage {...chrome} groups={groupList} comps={comps} divergence={divergence} reliability={reliability} benchmark={benchmark} benchmarkOverall={benchmarkOverall} scale={scale} readingThreshold={readingThreshold} />
      <CompetencyResultsPage {...chrome} comps={comps} scale={scale} n={nAvaliadores} benchmark={benchmark} />
      <PerspectivePage {...chrome} comps={comps} questionScores={questionScores} groups={groupList} />
      <SelfPerceptionPage {...chrome} comps={comps} scale={scale} readingThreshold={readingThreshold} geralFavPct={geralFav.favoravel} selfFavPct={selfFav} />
      <HighlightsPage {...chrome} comps={comps} qRows={qRows} />
      <DivergencePage {...chrome} divergence={divergence} nMinimum={nMinimum} relDetailFav={relDetailFav} />
      <QuestionsPages {...chrome} qRows={qRows} nMinimum={nMinimum} groups={groupList} />
      {hasValues && <ValuesPage {...chrome} qRows={qRows} questionValueNames={questionValueNames} questionScores={questionScores} scale={scale} competencies={competencies} />}
      <BenchmarkPage {...chrome} comps={comps} benchmark={benchmark} limiar={readingThreshold} />
      <ProfilePage {...chrome} demographics={demographics} />
      {variant === 'executive' && <GuidePage {...chrome} scale={scale} limiar={readingThreshold} />}
      <PlanPage {...chrome} />
      <MethodologyPage {...chrome} scale={scale} nMinimum={nMinimum} reliability={reliability} nComp={competencies.length} nQuestions={qRows.length} />
    </Document>
  )
}

/**
 * climaBatch — PDF em lote: um relatório por grupo de uma dimensão (por exemplo,
 * um PDF para cada empresa), reunidos em um arquivo ZIP, mais o consolidado do
 * recorte atual. Cada PDF é o mesmo relatório da tela, calculado só com as
 * respostas do grupo e com o mínimo de respondentes aplicado.
 */

import type { PdfBranding } from './exportReportPdf'
import { buildClimaPdfBlob, type ClimaPdfInput, type ClimaPdfPergunta } from './exportClimaPdf'
import { buildInsights } from './insights'
import {
  applyFilters,
  compareGroups,
  describeFilters,
  participationTotal,
  regroupBy,
  type ParticipationAgg,
  type SegmentDef,
  type SegmentFilters,
  type SegmentRow,
} from './segments'

export interface LoteParams {
  projetoNome:     string
  perguntas:       ClimaPdfPergunta[]
  perfilPerguntas: ClimaPdfPergunta[]
  importanciaPerguntaId?: string
  nMin:            number
  mostrarFrase?:   boolean
  branding:        PdfBranding
  /** Todos os segmentos configurados (para aplicar filtros). */
  defs:            SegmentDef[]
  /** Atributos do participante (empresa, base, área), na ordem de navegação. */
  dimensoes:       SegmentDef[]
  /** Todas as respostas, sem filtro. */
  linhas:          SegmentRow[]
  anterior:        { rotulo: string; respondentes: SegmentRow[] } | null
  agregados:       ParticipationAgg[] | null
  /** Recorte atual: ponto de partida do lote. */
  filtros:         SegmentFilters
  /** Dimensão que vira um PDF por grupo. */
  dimLote:         SegmentDef
}

function escopoDe(dimensoes: SegmentDef[], filtros: SegmentFilters): string {
  const valores = dimensoes.filter((d) => filtros[d.id]).map((d) => filtros[d.id])
  return valores.length > 0 ? `No recorte ${valores.join(' · ')}` : 'Em todo o grupo'
}

/** Próxima dimensão a comparar dentro de um grupo: a seguinte à do lote que ainda não foi filtrada. */
function proximaDimensao(dimensoes: SegmentDef[], atual: SegmentDef, filtros: SegmentFilters): SegmentDef | null {
  const i = dimensoes.findIndex((d) => d.id === atual.id)
  return dimensoes.slice(i + 1).find((d) => !filtros[d.id])
    ?? dimensoes.find((d) => !filtros[d.id] && d.id !== atual.id)
    ?? null
}

/** Monta a entrada do PDF de um recorte; null se o recorte tem menos que o mínimo de respondentes. */
export function entradaPdfClima(
  p: LoteParams,
  filtros: SegmentFilters,
  dimComparativo: SegmentDef | null,
): ClimaPdfInput | null {
  const rows = applyFilters(p.linhas, p.defs, filtros)
  if (rows.length < p.nMin) return null

  const anterior = p.anterior
    ? { rotulo: p.anterior.rotulo, respondentes: applyFilters(p.anterior.respondentes, p.defs, filtros) }
    : null

  const insights = buildInsights({
    perguntas: p.perguntas,
    respondentes: rows,
    anterior,
    importanciaPerguntaId: p.importanciaPerguntaId,
    escopo: escopoDe(p.dimensoes, filtros),
  })

  const ativos = Object.keys(filtros).length
  return {
    projetoNome:     p.projetoNome,
    perguntas:       p.perguntas,
    respondentes:    rows,
    anterior,
    insights,
    participacao:    p.agregados ? participationTotal(p.agregados, p.defs, filtros) : null,
    recorteTexto:    ativos === 0 ? 'Todo o grupo' : describeFilters(p.defs, filtros),
    comparativo:     dimComparativo ? compareGroups(p.perguntas, rows, dimComparativo, p.nMin) : null,
    dimensaoLabel:   dimComparativo?.label ?? null,
    perfilPerguntas: p.perfilPerguntas,
    mostrarFrase:    p.mostrarFrase,
    importanciaPerguntaId: p.importanciaPerguntaId,
    porGrupo:        dimComparativo
      ? { label: dimComparativo.label, atual: regroupBy(rows, dimComparativo), anterior: anterior ? regroupBy(anterior.respondentes, dimComparativo) : null }
      : undefined,
    nMin:            p.nMin,
    branding:        p.branding,
  }
}

/** Grupos da dimensão do lote que atingem o mínimo de respondentes no recorte atual. */
export function gruposDoLote(p: LoteParams): string[] {
  const rows = applyFilters(p.linhas, p.defs, p.filtros)
  return compareGroups(p.perguntas, rows, p.dimLote, p.nMin).grupos.map((g) => g.grupo)
}

function slug(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60)
}

/**
 * Gera o ZIP: 00 = consolidado do recorte atual; 01, 02… = um PDF por grupo.
 * `aoProgredir(feitos, total)` permite mostrar o andamento (cada PDF leva alguns segundos).
 */
export async function gerarLoteClima(
  p: LoteParams,
  aoProgredir?: (feitos: number, total: number) => void,
): Promise<{ blob: Blob; nome: string; arquivos: number }> {
  const grupos = gruposDoLote(p)
  const total = grupos.length + 1
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  const pausa = () => new Promise<void>((res) => setTimeout(res, 0))
  let feitos = 0
  aoProgredir?.(feitos, total)

  const consolidado = entradaPdfClima(p, p.filtros, p.dimLote)
  if (consolidado) {
    zip.file(`00_Consolidado_${slug(consolidado.recorteTexto)}.pdf`, await buildClimaPdfBlob(consolidado))
  }
  aoProgredir?.(++feitos, total)
  await pausa()

  let n = 0
  for (const grupo of grupos) {
    const filtros = { ...p.filtros, [p.dimLote.id]: grupo }
    const entrada = entradaPdfClima(p, filtros, proximaDimensao(p.dimensoes, p.dimLote, filtros))
    if (entrada) {
      n++
      zip.file(`${String(n).padStart(2, '0')}_${slug(grupo)}.pdf`, await buildClimaPdfBlob(entrada))
    }
    aoProgredir?.(++feitos, total)
    await pausa()
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const data = new Date().toISOString().slice(0, 10)
  return { blob, nome: `Clima_${slug(p.projetoNome)}_por_${slug(p.dimLote.label)}_${data}.zip`, arquivos: n + (consolidado ? 1 : 0) }
}

export function baixarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

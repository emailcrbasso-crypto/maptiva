/**
 * exportClimaPdf.tsx
 * Relatório em PDF de uma pesquisa de clima, no mesmo desenho da tela de
 * resultados: frase de abertura, favorabilidade geral e participação,
 * destaques, por onde começar, comparativo por grupo (página em paisagem),
 * blocos, evolução, riscos, ranking e perfil dos respondentes.
 *
 * Só dados agregados e anônimos: grupos e categorias abaixo do mínimo de
 * respondentes não aparecem. Respeita o recorte da tela (empresa, base, área).
 */

import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import type { PdfBranding } from './exportReportPdf'
import {
  compareBlocks,
  compareQuestions,
  bottomQuestions,
  deltaDirection,
  favorabilityByBlock,
  favorabilityByQuestion,
  favorabilityPooled,
  riskQuestions,
  topQuestions,
  type QuestionRef,
  type RespondentRow,
} from './favorability'
import { fmtPct, type ExecutiveInsights } from './insights'
import { profileDistribution, type GroupComparisonResult } from './segments'

export interface ClimaPdfPergunta extends QuestionRef {
  opcoes?: string[]
}

export interface ClimaPdfInput {
  projetoNome:   string
  perguntas:     ClimaPdfPergunta[]
  /** Respondentes do recorte atual. */
  respondentes:  RespondentRow[]
  anterior:      { rotulo: string; respondentes: RespondentRow[] } | null
  insights:      ExecutiveInsights
  participacao:  { respondidos: number; total: number } | null
  /** "Todo o grupo" ou "Empresa: Diastur · Área: Manutenção". */
  recorteTexto:  string
  /** Comparativo por grupo (pesquisas segmentadas); null nas demais. */
  comparativo:   GroupComparisonResult | null
  dimensaoLabel: string | null
  perfilPerguntas: ClimaPdfPergunta[]
  nMin:          number
  branding:      PdfBranding
}

const COR_FAV = '#22c55e'
const COR_NEU = '#d1d5db'
const COR_DES = '#f87171'

const S = StyleSheet.create({
  page:    { paddingTop: 36, paddingBottom: 46, paddingHorizontal: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  head:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1.5 },
  company: { fontSize: 9, color: '#6b7280', marginBottom: 3 },
  title:   { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  sub:     { fontSize: 9, color: '#6b7280', marginTop: 2 },
  date:    { fontSize: 8, color: '#9ca3af' },
  recorte: { fontSize: 8.5, color: '#374151', backgroundColor: '#f3f4f6', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 10 },
  headline:{ fontSize: 14, fontFamily: 'Helvetica-Bold', lineHeight: 1.35, marginBottom: 12 },
  card:    { backgroundColor: '#f9fafb', borderRadius: 6, padding: 10 },
  label:   { fontSize: 8, color: '#6b7280' },
  big:     { fontSize: 26, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  h2:      { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  hint:    { fontSize: 7.5, color: '#6b7280', marginBottom: 6 },
  box:     { borderWidth: 0.7, borderColor: '#e5e7eb', borderRadius: 5, padding: 7 },
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6' },
  th:      { fontSize: 7.5, color: '#6b7280', fontFamily: 'Helvetica-Bold' },
  footer:  { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#9ca3af' },
})

function heat(pct: number | null): { bg: string; fg: string } {
  if (pct === null) return { bg: '#f9fafb', fg: '#9ca3af' }
  if (pct >= 70) return { bg: '#dcfce7', fg: '#166534' }
  if (pct >= 50) return { bg: '#fef3c7', fg: '#92400e' }
  return { bg: '#fee2e2', fg: '#991b1b' }
}

function fmtDelta(d: number): string {
  const sign = d > 0 ? '+' : d < 0 ? '-' : ''
  return `${sign}${fmtPct(Math.abs(d))} p.p.`
}

function deltaCor(d: number): string {
  const dir = deltaDirection(d)
  return dir === 'up' ? '#15803d' : dir === 'down' ? '#dc2626' : '#6b7280'
}

function deltaPalavra(d: number): string {
  const dir = deltaDirection(d)
  return dir === 'up' ? 'Melhorou' : dir === 'down' ? 'Piorou' : 'Estável'
}

function Barra({ fav, neu, des, altura = 6 }: { fav: number; neu: number; des: number; altura?: number }) {
  return (
    <View style={{ flexDirection: 'row', height: altura, borderRadius: altura / 2, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
      <View style={{ width: `${fav}%`, backgroundColor: COR_FAV }} />
      <View style={{ width: `${neu}%`, backgroundColor: COR_NEU }} />
      <View style={{ width: `${des}%`, backgroundColor: COR_DES }} />
    </View>
  )
}

function Cabecalho({ input, cor }: { input: ClimaPdfInput; cor: string }) {
  const { branding } = input
  return (
    <View style={[S.head, { borderBottomColor: cor }]}>
      <View style={{ flex: 1 }}>
        {branding.logoUrl
          ? <Image src={branding.logoUrl} style={{ height: 20, marginBottom: 5, objectFit: 'contain', objectPositionX: 0 }} />
          : <Text style={S.company}>{branding.companyName}</Text>}
        <Text style={S.title}>{input.projetoNome}</Text>
        <Text style={S.sub}>Relatório de resultados · Pesquisa de clima</Text>
      </View>
      <Text style={S.date}>Gerado em {new Date().toLocaleDateString('pt-BR')}</Text>
    </View>
  )
}

function Rodape({ input }: { input: ClimaPdfInput }) {
  return (
    <View fixed style={S.footer}>
      <Text>{input.branding.footerText}</Text>
      <Text>{input.recorteTexto}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber}/${totalPages}`} />
    </View>
  )
}

function ClimaDocument({ input }: { input: ClimaPdfInput }) {
  const { insights: i, comparativo, nMin } = input
  const cor = input.branding.primaryColor || '#111827'
  const blocos = favorabilityByBlock(input.perguntas, input.respondentes).filter((b) => b.n > 0)
  const blocosOrdenados = [...blocos].sort((a, b) => b.favoravel - a.favoravel)

  const porPergunta = favorabilityByQuestion(input.perguntas, input.respondentes)
  const topo = topQuestions(porPergunta, 3)
  const baixo = bottomQuestions(porPergunta, 3)

  const riscoPerguntas = riskQuestions(input.perguntas)
  const riscoGeral = riscoPerguntas.length > 0 ? favorabilityPooled(riscoPerguntas, input.respondentes) : null
  const riscoIds = new Set(riscoPerguntas.map((p) => p.id))
  const riscoItens = riscoGeral && riscoGeral.n > 0
    ? porPergunta.filter((q) => riscoIds.has(q.id) && q.n > 0).sort((a, b) => a.favoravel - b.favoravel).slice(0, 5)
    : []

  let evolucaoBlocos: ReturnType<typeof compareBlocks> = []
  let melhoras: ReturnType<typeof compareQuestions> = []
  let quedas: ReturnType<typeof compareQuestions> = []
  if (input.anterior && input.anterior.respondentes.length > 0) {
    evolucaoBlocos = compareBlocks(blocos, favorabilityByBlock(input.perguntas, input.anterior.respondentes)).sort((a, b) => b.delta - a.delta)
    const deltasPerg = compareQuestions(porPergunta, favorabilityByQuestion(input.perguntas, input.anterior.respondentes))
    melhoras = deltasPerg.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
    quedas = deltasPerg.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3)
  }

  const perfis = input.perfilPerguntas
    .map((p) => profileDistribution(p, input.respondentes, nMin))
    .filter((d) => d.base > 0)

  const partPct = input.participacao && input.participacao.total > 0
    ? Math.round((input.participacao.respondidos / input.participacao.total) * 100) : null

  const nota = `Dados agregados e anônimos. Grupos e categorias com menos de ${nMin} respondentes não aparecem. Favorável = notas 4 e 5; neutro = nota 3; desfavorável = notas 1 e 2.`

  return (
    <Document title={`${input.projetoNome} — ${input.recorteTexto}`}>
      {/* ── Página 1: visão geral ── */}
      <Page size="A4" style={S.page}>
        <Cabecalho input={input} cor={cor} />
        <Text style={S.recorte}>Recorte: {input.recorteTexto}</Text>
        <Text style={S.headline}>{i.frase}</Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={[S.card, { flex: 1.5 }]}>
            <Text style={S.label}>Favorabilidade geral</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
              <Text style={[S.big, { color: cor }]}>{fmtPct(i.geral.favoravel)}%</Text>
              {i.deltaGeral !== null && i.rotuloAnterior && (
                <Text style={{ fontSize: 8.5, color: deltaCor(i.deltaGeral), marginBottom: 4 }}>
                  {fmtDelta(i.deltaGeral)} vs {i.rotuloAnterior}
                </Text>
              )}
            </View>
            <Barra fav={i.geral.favoravel} neu={i.geral.neutro} des={i.geral.desfavoravel} altura={7} />
            <Text style={{ fontSize: 7.5, color: '#6b7280', marginTop: 4 }}>
              Favorável {fmtPct(i.geral.favoravel)}% · Neutro {fmtPct(i.geral.neutro)}% · Desfavorável {fmtPct(i.geral.desfavoravel)}%
            </Text>
          </View>
          <View style={[S.card, { flex: 1 }]}>
            <Text style={S.label}>Participação</Text>
            {partPct !== null && input.participacao ? (
              <>
                <Text style={[S.big, { color: cor }]}>{partPct}%</Text>
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 4 }}>
                  {input.participacao.respondidos.toLocaleString('pt-BR')} de {input.participacao.total.toLocaleString('pt-BR')} pessoas responderam
                </Text>
              </>
            ) : (
              <>
                <Text style={[S.big, { color: cor }]}>{i.n.toLocaleString('pt-BR')}</Text>
                <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 4 }}>respondentes neste recorte</Text>
              </>
            )}
          </View>
        </View>

        <Text style={S.h2}>Destaques</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { t: 'Ponto mais forte', n: i.maisForte?.bloco ?? '-', d: i.maisForte ? `${fmtPct(i.maisForte.favoravel)}% favorável` : '', c: '#15803d' },
            { t: 'Ponto de atenção', n: i.maisFraco?.bloco ?? '-', d: i.maisFraco ? `${fmtPct(i.maisFraco.favoravel)}% favorável` : '', c: '#dc2626' },
            ...(i.rotuloAnterior ? [
              { t: 'Maior melhora', n: i.melhora?.rotulo ?? '-', d: i.melhora ? fmtDelta(i.melhora.delta) : 'Nenhuma variação relevante', c: i.melhora ? '#15803d' : '#6b7280' },
              { t: 'Maior queda', n: i.queda?.rotulo ?? '-', d: i.queda ? fmtDelta(i.queda.delta) : 'Nenhuma variação relevante', c: i.queda ? '#dc2626' : '#6b7280' },
            ] : []),
          ].map((d) => (
            <View key={d.t} style={[S.box, { flex: 1 }]}>
              <Text style={{ fontSize: 7, color: '#6b7280' }}>{d.t}</Text>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 2, marginBottom: 2 }}>{d.n}</Text>
              <Text style={{ fontSize: 8, color: d.c }}>{d.d}</Text>
            </View>
          ))}
        </View>

        {i.prioridades.length > 0 && (
          <>
            <Text style={S.h2}>Por onde começar</Text>
            <Text style={S.hint}>Blocos que as pessoas consideram mais importantes e que estão com favorabilidade abaixo da média.</Text>
            <View style={S.box}>
              {i.prioridades.map((p, idx) => (
                <View key={p.bloco} style={[S.row, idx === i.prioridades.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={{ flex: 1, fontSize: 9 }}>{p.bloco}</Text>
                  <Text style={{ fontSize: 8, color: '#6b7280' }}>
                    importante para {fmtPct(p.importancia)}% · favorável para {fmtPct(p.favoravel)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {i.criticas.length > 0 && (
          <View wrap={false}>
            <Text style={S.h2}>Perguntas mais críticas</Text>
            <View style={S.box}>
              {i.criticas.map((q, idx) => (
                <View key={q.texto} style={[S.row, idx === i.criticas.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={{ width: 34, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: q.favoravel >= 50 ? '#b45309' : '#dc2626' }}>{fmtPct(q.favoravel)}%</Text>
                  <Text style={{ flex: 1, fontSize: 8.5 }}>{q.texto}</Text>
                  <Text style={{ fontSize: 7, color: '#6b7280', marginLeft: 6 }}>{q.bloco}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {perfis.length > 0 && (
          <View wrap={false}>
            <Text style={S.h2}>Perfil dos respondentes</Text>
            <Text style={S.hint}>Informação voluntária, não cruzada com os resultados. Categorias com menos de {nMin} pessoas são reunidas ou omitidas.</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {perfis.map((d) => (
                <View key={d.id} style={{ flex: 1 }}>
                  <Text style={[S.th, { color: '#374151', marginBottom: 3 }]}>{d.texto.replace(/\?$/, '')}</Text>
                  {d.itens.map((it) => (
                    <View key={it.rotulo} style={{ marginBottom: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 7.5 }}>{it.rotulo}</Text>
                        <Text style={{ fontSize: 7.5, color: '#6b7280' }}>{fmtPct(it.pct)}%</Text>
                      </View>
                      <View style={{ height: 3, backgroundColor: '#f3f4f6', borderRadius: 2 }}>
                        <View style={{ width: `${it.pct}%`, height: 3, backgroundColor: '#9ca3af', borderRadius: 2 }} />
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={[S.hint, { marginTop: 14 }]}>{nota}</Text>
        <Rodape input={input} />
      </Page>

      {/* ── Comparativo por grupo (paisagem) ── */}
      {comparativo && comparativo.grupos.length > 0 && input.dimensaoLabel && (
        <Page size="A4" orientation="landscape" style={S.page}>
          <Cabecalho input={input} cor={cor} />
          <Text style={S.h2}>Comparativo por {input.dimensaoLabel.toLowerCase()}</Text>
          <Text style={S.hint}>% de respostas favoráveis, no geral e em cada bloco. Verde 70% ou mais, amarelo de 50% a 69%, vermelho abaixo de 50%.</Text>
          <View style={[S.row, { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', alignItems: 'flex-end' }]}>
            <Text style={[S.th, { width: 120 }]}>{input.dimensaoLabel}</Text>
            <Text style={[S.th, { width: 42, textAlign: 'center' }]}>Resp.</Text>
            <Text style={[S.th, { width: 40, textAlign: 'center', color: '#111827' }]}>Geral</Text>
            {comparativo.blocos.map((b) => (
              <Text key={b} style={[S.th, { flex: 1, textAlign: 'center', fontSize: 6.5 }]}>{b}</Text>
            ))}
          </View>
          {[{ ...comparativo.total, destaque: true }, ...comparativo.grupos.map((g) => ({ ...g, destaque: false }))].map((g) => (
            <View key={g.grupo} wrap={false} style={[S.row, { paddingVertical: 2.5 }]}>
              <Text style={{ width: 120, fontSize: 8, fontFamily: g.destaque ? 'Helvetica-Bold' : 'Helvetica' }}>{g.grupo}</Text>
              <Text style={{ width: 42, fontSize: 8, textAlign: 'center', color: '#4b5563' }}>{g.n.toLocaleString('pt-BR')}</Text>
              <View style={{ width: 40, paddingHorizontal: 1 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'center', backgroundColor: heat(g.geral).bg, color: heat(g.geral).fg, borderRadius: 3, paddingVertical: 2 }}>{fmtPct(g.geral)}%</Text>
              </View>
              {comparativo.blocos.map((b) => {
                const v = g.blocos[b] ?? null
                const h = heat(v)
                return (
                  <View key={b} style={{ flex: 1, paddingHorizontal: 1 }}>
                    <Text style={{ fontSize: 7.5, textAlign: 'center', backgroundColor: h.bg, color: h.fg, borderRadius: 3, paddingVertical: 2 }}>
                      {v !== null ? `${fmtPct(v)}%` : '-'}
                    </Text>
                  </View>
                )
              })}
            </View>
          ))}
          {comparativo.omitidos > 0 && (
            <Text style={[S.hint, { marginTop: 6 }]}>
              {comparativo.omitidos} {comparativo.omitidos > 1 ? 'grupos não aparecem' : 'grupo não aparece'} por ter menos de {nMin} respondentes, para proteger o anonimato.
            </Text>
          )}
          <Rodape input={input} />
        </Page>
      )}

      {/* ── Blocos, evolução, riscos e ranking ── */}
      <Page size="A4" style={S.page}>
        <Cabecalho input={input} cor={cor} />

        <Text style={[S.h2, { marginTop: 0 }]}>Favorabilidade por bloco</Text>
        <View style={S.box}>
          {blocosOrdenados.map((b, idx) => (
            <View key={b.bloco} wrap={false} style={[S.row, idx === blocosOrdenados.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={{ flex: 3, fontSize: 8.5 }}>{b.bloco}</Text>
              <View style={{ flex: 4 }}><Barra fav={b.favoravel} neu={b.neutro} des={b.desfavoravel} /></View>
              <Text style={{ width: 96, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold' }}>
                {fmtPct(b.favoravel)}% <Text style={{ color: '#6b7280', fontFamily: 'Helvetica' }}>· {fmtPct(b.neutro)}% · {fmtPct(b.desfavoravel)}%</Text>
              </Text>
            </View>
          ))}
        </View>

        {evolucaoBlocos.length > 0 && input.anterior && (
          <View wrap={false}>
            <Text style={S.h2}>Evolução em relação a {input.anterior.rotulo}</Text>
            <Text style={S.hint}>Variações de até 2 p.p. são tratadas como estabilidade.</Text>
            <View style={S.box}>
              {evolucaoBlocos.map((b, idx) => (
                <View key={b.chave} style={[S.row, idx === evolucaoBlocos.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <Text style={{ flex: 1, fontSize: 8.5 }}>{b.rotulo}</Text>
                  <Text style={{ width: 80, fontSize: 8, color: '#6b7280', textAlign: 'right' }}>{fmtPct(b.anterior)}% para {fmtPct(b.atual)}%</Text>
                  <Text style={{ width: 92, fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: deltaCor(b.delta) }}>
                    {deltaPalavra(b.delta)} {fmtDelta(b.delta)}
                  </Text>
                </View>
              ))}
            </View>
            {(melhoras.length > 0 || quedas.length > 0) && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {[{ t: 'Maiores melhoras', itens: melhoras }, { t: 'Maiores quedas', itens: quedas }].map((col) => (
                  <View key={col.t} style={{ flex: 1 }}>
                    <Text style={[S.th, { color: '#374151', marginBottom: 3 }]}>{col.t}</Text>
                    {col.itens.map((q) => (
                      <View key={q.chave} style={{ flexDirection: 'row', marginBottom: 2.5 }}>
                        <Text style={{ width: 44, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: deltaCor(q.delta) }}>{fmtDelta(q.delta)}</Text>
                        <Text style={{ flex: 1, fontSize: 7.5, color: '#374151' }}>{q.rotulo}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {riscoGeral && riscoItens.length > 0 && (
          <View wrap={false}>
            <Text style={S.h2}>Riscos psicossociais: favorabilidade {fmtPct(riscoGeral.favoravel)}%</Text>
            <Text style={S.hint}>Perguntas com menor favorabilidade entre as ligadas a carga, pressão, apoio e assédio.</Text>
            {riscoItens.map((q) => (
              <View key={q.id} style={{ flexDirection: 'row', marginBottom: 2.5 }}>
                <Text style={{ width: 34, fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#dc2626' }}>{fmtPct(q.favoravel)}%</Text>
                <Text style={{ flex: 1, fontSize: 8, color: '#374151' }}>{q.texto}</Text>
              </View>
            ))}
          </View>
        )}

        <View wrap={false}>
          <Text style={S.h2}>Perguntas mais e menos favoráveis</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[{ t: 'Mais favoráveis', itens: topo, c: '#15803d' }, { t: 'Menos favoráveis', itens: baixo, c: '#dc2626' }].map((col) => (
              <View key={col.t} style={{ flex: 1 }}>
                <Text style={[S.th, { color: '#374151', marginBottom: 3 }]}>{col.t}</Text>
                {col.itens.map((q) => (
                  <View key={q.id} style={{ flexDirection: 'row', marginBottom: 2.5 }}>
                    <Text style={{ width: 30, fontSize: 8, fontFamily: 'Helvetica-Bold', color: col.c }}>{fmtPct(q.favoravel)}%</Text>
                    <Text style={{ flex: 1, fontSize: 7.5, color: '#374151' }}>{q.texto}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <Rodape input={input} />
      </Page>
    </Document>
  )
}

export function nomeArquivoClima(projetoNome: string, recorteTexto: string): string {
  const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  const recorte = recorteTexto === 'Todo o grupo' ? '' : `_${limpa(recorteTexto).slice(0, 50)}`
  return `Clima_${limpa(projetoNome).slice(0, 60)}${recorte}_${new Date().toISOString().slice(0, 10)}.pdf`
}

/** Gera o PDF do recorte como Blob (usado no download avulso e no lote em ZIP). */
export async function buildClimaPdfBlob(input: ClimaPdfInput): Promise<Blob> {
  return pdf(<ClimaDocument input={input} />).toBlob()
}

export async function exportClimaPdf(input: ClimaPdfInput): Promise<void> {
  const blob = await buildClimaPdfBlob(input)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivoClima(input.projetoNome, input.recorteTexto)
  a.click()
  URL.revokeObjectURL(url)
}

export { ClimaDocument }

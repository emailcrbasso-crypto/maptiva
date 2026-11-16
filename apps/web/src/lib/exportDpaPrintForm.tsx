/**
 * exportDpaPrintForm.tsx
 * Formulário impresso (A4) de uma pesquisa DPA/clima, gerado a partir das
 * perguntas da própria pesquisa. Pensado para leitura óptica futura: marcas de
 * alinhamento nos quatro cantos, bolhas de tamanho fixo e código da pesquisa
 * no rodapé. Não contém nome nem qualquer identificação da pessoa.
 */

import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import type { PdfBranding } from './exportReportPdf'

/** Máximo de folhas com QR próprio (a folha de 50 perguntas usa 3). */
const MAX_PAGES = 8
const QR_SIZE = 46

/** Código curto da pesquisa impresso no rodapé e gravado no QR. */
export function surveyCode(projectId: string): string {
  return projectId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/**
 * Conteúdo do QR de uma folha: versão, pesquisa, base (ou "-" quando a pessoa
 * marca a base à mão) e número da folha. Nunca identifica a pessoa.
 */
export function qrPayload(projectId: string, unidade: string | null, page: number): string {
  return `MAPTIVA|v1|DPA|${surveyCode(projectId)}|${unidade ?? '-'}|F${page}`
}

export async function buildQrImages(projectId: string, unidade: string | null): Promise<string[]> {
  return Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      QRCode.toDataURL(qrPayload(projectId, unidade, i + 1), { margin: 1, width: 240, errorCorrectionLevel: 'M' })),
  )
}

interface PrintQuestion {
  id:            string
  texto:         string
  tipo:          'escala_5' | 'texto_livre' | 'multipla_escolha'
  opcoes?:       string[]
  multi?:        boolean
  max_escolhas?: number
  bloco?:        string
  bloco_intro?:  string
  escala?:       'concordancia' | 'frequencia'
}

interface PrintProject {
  id:     string
  nome:   string
  config: { label_unidade: string; perguntas: PrintQuestion[] }
}

const SCALE_LABELS: Record<'concordancia' | 'frequencia', string[]> = {
  concordancia: ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente'],
  frequencia:   ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'],
}

/** Largura de cada coluna de bolha — igual no cabeçalho do bloco e nas linhas. */
const COL = 40
const BUBBLE = 13
const MARK = 14   // lado das marcas de alinhamento

const S = StyleSheet.create({
  page:      { paddingTop: 44, paddingBottom: 70, paddingHorizontal: 44, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  mark:      { position: 'absolute', width: MARK, height: MARK, backgroundColor: '#000000' },
  title:     { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  subtitle:  { fontSize: 9, color: '#4b5563', marginTop: 2 },
  box:       { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 4, padding: 8, marginTop: 10 },
  boxTitle:  { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  small:     { fontSize: 8, color: '#374151', lineHeight: 1.35 },
  blockHead: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#111827' },
  blockName: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  colHead:   { width: COL, textAlign: 'center', fontSize: 6.5, color: '#4b5563' },
  row:       { flexDirection: 'row', alignItems: 'center', minHeight: 22, borderBottomWidth: 0.5, borderBottomColor: '#d1d5db' },
  num:       { width: 20, fontSize: 8, color: '#6b7280' },
  qText:     { flex: 1, fontSize: 8.5, paddingRight: 8, lineHeight: 1.25 },
  cell:      { width: COL, alignItems: 'center' },
  bubble:    { width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 0.9, borderColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  bubbleTxt: { fontSize: 6.5, color: '#6b7280' },
  square:    { width: 11, height: 11, borderWidth: 0.9, borderColor: '#111827', marginRight: 6 },
  optRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  footer:    { position: 'absolute', bottom: 24, left: 44, right: 44 + QR_SIZE + 10, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#6b7280' },
  qr:        { position: 'absolute', bottom: 16, right: 44, width: QR_SIZE, height: QR_SIZE },
})

function Bubble({ n }: { n: number }) {
  return (
    <View style={S.cell}>
      <View style={S.bubble}><Text style={S.bubbleTxt}>{n}</Text></View>
    </View>
  )
}

function ScaleHeader({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map((l, i) => <Text key={i} style={S.colHead}>{i + 1}{'\n'}{l.replace(' ', '\n')}</Text>)}
    </>
  )
}

/** Agrupa perguntas de escala consecutivas do mesmo bloco; as demais ficam avulsas. */
type Group =
  | { kind: 'scale'; bloco: string; intro: string | null; escala: 'concordancia' | 'frequencia'; items: { q: PrintQuestion; n: number }[] }
  | { kind: 'other'; q: PrintQuestion; n: number }

export function buildPrintGroups(perguntas: PrintQuestion[]): Group[] {
  const groups: Group[] = []
  perguntas.forEach((q, i) => {
    const n = i + 1
    if (q.tipo === 'escala_5') {
      const escala = q.escala ?? 'concordancia'
      const bloco = q.bloco?.trim() || ''
      const last = groups[groups.length - 1]
      if (last && last.kind === 'scale' && last.bloco === bloco && last.escala === escala) {
        last.items.push({ q, n })
      } else {
        groups.push({ kind: 'scale', bloco, intro: q.bloco_intro ?? null, escala, items: [{ q, n }] })
      }
    } else {
      groups.push({ kind: 'other', q, n })
    }
  })
  return groups
}

export function PrintDocument({
  project, branding, unidades, unidade, qrs,
}: {
  project: PrintProject; branding: PdfBranding; unidades: string[]
  /** Base pré-impressa na folha (e no QR); sem ela, a pessoa marca a base à mão. */
  unidade?: string | null
  qrs: string[]
}) {
  const code = surveyCode(project.id)
  const groups = buildPrintGroups(project.config.perguntas)
  const labelUnidade = project.config.label_unidade || 'Unidade'
  const firstScale = groups.find((g) => g.kind === 'scale') as Extract<Group, { kind: 'scale' }> | undefined
  const legend = SCALE_LABELS[firstScale?.escala ?? 'concordancia']

  return (
    <Document title={`Formulário — ${project.nome}`}>
      <Page size="A4" style={S.page}>
        {/* Marcas de alinhamento (fixas em todas as páginas) */}
        <View fixed style={[S.mark, { top: 14, left: 14 }]} />
        <View fixed style={[S.mark, { top: 14, right: 14 }]} />
        <View fixed style={[S.mark, { bottom: 14, left: 14 }]} />
        <View fixed style={[S.mark, { bottom: 14, right: 14 }]} />

        <View>
          {branding.logoUrl
            ? <Image src={branding.logoUrl} style={{ height: 22, objectFit: 'contain', objectPositionX: 0 }} />
            : <Text style={{ fontSize: 9, color: '#4b5563' }}>{branding.companyName}</Text>}
          <Text style={S.title}>{project.nome}</Text>
          <Text style={S.subtitle}>Formulário de resposta impresso</Text>
        </View>

        <View style={S.box}>
          <Text style={S.boxTitle}>Como responder</Text>
          <Text style={S.small}>
            Use caneta azul ou preta e preencha a bolha por completo, sem ultrapassar o contorno. Marque apenas uma
            opção por pergunta. Se errar, risque a resposta errada com um X e marque a correta. Não escreva seu nome:
            suas respostas são anônimas e analisadas apenas em conjunto. O QR code no rodapé identifica somente a
            pesquisa, a base e a folha, nunca a pessoa.
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 6 }}>
            {legend.map((l, i) => (
              <Text key={i} style={[S.small, { flex: 1 }]}>{i + 1} = {l}</Text>
            ))}
          </View>
        </View>

        {unidade && (
          <View style={S.box} wrap={false}>
            <Text style={S.boxTitle}>{labelUnidade}: {unidade}</Text>
            <Text style={S.small}>Esta folha já está identificada para a sua {labelUnidade.toLowerCase()}. Não é preciso marcar nada aqui.</Text>
          </View>
        )}

        {!unidade && unidades.length > 0 && (
          <View style={S.box} wrap={false}>
            <Text style={S.boxTitle}>Marque a sua {labelUnidade.toLowerCase()}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {unidades.map((u) => (
                <View key={u} style={[S.optRow, { width: '50%' }]}>
                  <View style={[S.bubble, { marginRight: 6 }]} />
                  <Text style={S.small}>{u}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {groups.map((g) => {
          if (g.kind === 'scale') {
            const labels = SCALE_LABELS[g.escala]
            return (
              <View key={`${g.bloco}-${g.items[0].n}`}>
                <View style={S.blockHead} wrap={false} minPresenceAhead={70}>
                  <Text style={S.blockName}>{g.bloco || 'Perguntas'}</Text>
                  <ScaleHeader labels={labels} />
                </View>
                {g.intro && <Text style={[S.small, { marginTop: 3 }]}>{g.intro}</Text>}
                {g.items.map(({ q, n }) => (
                  <View key={q.id} style={S.row} wrap={false}>
                    <Text style={S.num}>{n}</Text>
                    <Text style={S.qText}>{q.texto}</Text>
                    {[1, 2, 3, 4, 5].map((v) => <Bubble key={v} n={v} />)}
                  </View>
                ))}
              </View>
            )
          }

          const { q, n } = g
          return (
            <View key={q.id} style={{ marginTop: 14 }} wrap={false}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{n}. {q.texto}</Text>
              {q.tipo === 'multipla_escolha' && (
                <>
                  <Text style={[S.small, { marginTop: 2 }]}>
                    {q.multi
                      ? `Marque ${q.max_escolhas ? `até ${q.max_escolhas} opções` : 'quantas quiser'}.`
                      : 'Marque uma opção.'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {(q.opcoes ?? []).map((o) => (
                      <View key={o} style={[S.optRow, { width: '50%' }]}>
                        <View style={S.square} />
                        <Text style={S.small}>{o}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
              {q.tipo === 'texto_livre' && (
                <View style={{ borderWidth: 0.9, borderColor: '#111827', borderRadius: 3, height: 78, marginTop: 5 }} />
              )}
            </View>
          )
        })}

        <View fixed style={S.footer}>
          <Text>{branding.footerText}</Text>
          <Text>Pesquisa {code}{unidade ? ` · ${unidade}` : ''}</Text>
          <Text render={({ pageNumber, totalPages }) => `Folha ${pageNumber}/${totalPages}`} />
        </View>
        <View
          fixed
          style={S.qr}
          render={({ pageNumber }) => (
            <Image src={qrs[Math.min(pageNumber, qrs.length) - 1]} style={{ width: QR_SIZE, height: QR_SIZE }} />
          )}
        />
      </Page>
    </Document>
  )
}

export async function exportDpaPrintForm(
  project:  PrintProject,
  branding: PdfBranding,
  unidades: string[],
  unidade: string | null = null,
): Promise<void> {
  const qrs  = await buildQrImages(project.id, unidade)
  const blob = await pdf(
    <PrintDocument project={project} branding={branding} unidades={unidades} unidade={unidade} qrs={qrs} />
  ).toBlob()

  const url      = URL.createObjectURL(blob)
  const a        = document.createElement('a')
  const safeName = project.nome.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
  a.href         = url
  const suffixBase = unidade ? `_${unidade.replace(/[^\w-]+/g, '_')}` : ''
  a.download     = `Formulario_${safeName}${suffixBase}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

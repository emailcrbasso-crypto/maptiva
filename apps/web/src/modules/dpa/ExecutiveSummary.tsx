/**
 * ExecutiveSummary — visão geral da pesquisa de clima: uma frase de abertura,
 * a favorabilidade geral com a variação, a participação, os destaques e por
 * onde começar. Todo o conteúdo vem de lib/insights, calculado a partir dos
 * dados do recorte atual.
 */

import { deltaDirection } from '@/lib/favorability'
import { fmtPct, type ExecutiveInsights } from '@/lib/insights'

interface Props {
  insights:        ExecutiveInsights
  /** Participação no recorte (respondentes e total de pessoas); null quando não há contagem. */
  participacao:    { respondidos: number; total: number } | null
  /** A pesquisa tem pergunta de importância (sem ela, não há "por onde começar"). */
  temImportancia:  boolean
}

function DeltaPill({ delta, rotulo }: { delta: number; rotulo: string }) {
  const dir = deltaDirection(delta)
  const style = dir === 'up' ? 'bg-green-50 text-green-700'
    : dir === 'down' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '►'
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      <span aria-hidden="true">{arrow}</span>
      {sign}{fmtPct(Math.abs(delta))} p.p. vs {rotulo}
    </span>
  )
}

function Destaque({ titulo, nome, detalhe, tom }: {
  titulo: string; nome: string | null; detalhe: string; tom: 'bom' | 'ruim' | 'neutro'
}) {
  const cor = tom === 'bom' ? 'text-green-700' : tom === 'ruim' ? 'text-red-700' : 'text-gray-500'
  return (
    <div className="rounded-lg border border-gray-200 px-3.5 py-3">
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5 leading-snug">{nome ?? '—'}</p>
      <p className={`text-xs mt-0.5 ${cor}`}>{detalhe}</p>
    </div>
  )
}

export function ExecutiveSummary({ insights: i, participacao, temImportancia }: Props) {
  const partPct = participacao && participacao.total > 0
    ? Math.round((participacao.respondidos / participacao.total) * 100) : null
  const comparativo = i.rotuloAnterior !== null

  return (
    <section id="sec-visao" className="scroll-mt-16 space-y-5" aria-label="Visão geral">
      <p className="text-xl sm:text-2xl font-medium text-gray-900 leading-snug">{i.frase}</p>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-gray-50 px-5 py-4">
          <p className="text-xs text-gray-500">Favorabilidade geral</p>
          <div className="flex flex-wrap items-baseline gap-3 mt-0.5 mb-3">
            <span className="text-4xl font-medium text-gray-900 tabular-nums">{fmtPct(i.geral.favoravel)}%</span>
            {i.deltaGeral !== null && i.rotuloAnterior && <DeltaPill delta={i.deltaGeral} rotulo={i.rotuloAnterior} />}
          </div>
          <div
            className="flex h-2 rounded-full overflow-hidden bg-gray-200"
            role="img"
            aria-label={`Favorável ${i.geral.favoravel}%, neutro ${i.geral.neutro}%, desfavorável ${i.geral.desfavoravel}%`}
          >
            <div className="bg-green-500" style={{ width: `${i.geral.favoravel}%` }} />
            <div className="bg-gray-300" style={{ width: `${i.geral.neutro}%` }} />
            <div className="bg-red-400" style={{ width: `${i.geral.desfavoravel}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Favorável {fmtPct(i.geral.favoravel)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Neutro {fmtPct(i.geral.neutro)}%</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Desfavorável {fmtPct(i.geral.desfavoravel)}%</span>
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 px-5 py-4">
          <p className="text-xs text-gray-500">Participação</p>
          {partPct !== null && participacao ? (
            <>
              <p className="text-4xl font-medium text-gray-900 mt-0.5 mb-3 tabular-nums">{partPct}%</p>
              <p className="text-xs text-gray-500">
                {participacao.respondidos.toLocaleString('pt-BR')} de {participacao.total.toLocaleString('pt-BR')} pessoas responderam
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl font-medium text-gray-900 mt-0.5 mb-3 tabular-nums">{i.n.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-gray-500">respondentes neste recorte</p>
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-2">Destaques</h3>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <Destaque
            titulo="Ponto mais forte"
            nome={i.maisForte?.bloco ?? null}
            detalhe={i.maisForte ? `${fmtPct(i.maisForte.favoravel)}% favorável` : 'Sem dados'}
            tom="bom"
          />
          <Destaque
            titulo="Ponto de atenção"
            nome={i.maisFraco?.bloco ?? null}
            detalhe={i.maisFraco ? `${fmtPct(i.maisFraco.favoravel)}% favorável` : 'Sem dados'}
            tom="ruim"
          />
          {comparativo && (
            <>
              <Destaque
                titulo="Maior melhora"
                nome={i.melhora?.rotulo ?? null}
                detalhe={i.melhora ? `+${fmtPct(i.melhora.delta)} p.p.` : 'Nenhuma variação relevante'}
                tom={i.melhora ? 'bom' : 'neutro'}
              />
              <Destaque
                titulo="Maior queda"
                nome={i.queda?.rotulo ?? null}
                detalhe={i.queda ? `−${fmtPct(Math.abs(i.queda.delta))} p.p.` : 'Nenhuma variação relevante'}
                tom={i.queda ? 'ruim' : 'neutro'}
              />
            </>
          )}
        </div>
      </div>

      {temImportancia && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Por onde começar</h3>
          {i.prioridades.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nenhum bloco combina alta importância com baixa favorabilidade neste recorte.
            </p>
          ) : (
            <ul className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {i.prioridades.map((p, idx) => (
                <li key={p.bloco} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-red-400' : 'bg-amber-400'}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-gray-900 flex-1 min-w-[180px]">{p.bloco}</span>
                  <span className="text-xs text-gray-500">
                    importante para {fmtPct(p.importancia)}% e favorável para {fmtPct(p.favoravel)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

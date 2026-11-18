/**
 * ProfilePanel — "Perfil dos respondentes": distribuição agregada de perguntas
 * de perfil (escolaridade, sexo, faixa etária). Serve para checar se a amostra
 * representa a população; não cruza o perfil com os resultados. Categorias
 * abaixo do mínimo de respondentes são agrupadas ou omitidas (lib/segments).
 */

import { useMemo } from 'react'
import { profileDistribution } from '@/lib/segments'

interface PerguntaPerfil {
  id:      string
  texto:   string
  opcoes?: string[]
}

interface Props {
  perguntas:    PerguntaPerfil[]
  respondentes: Array<{ respostas: Record<string, unknown> }>
  nMin:         number
}

export function ProfilePanel({ perguntas, respondentes, nMin }: Props) {
  const dists = useMemo(
    () => perguntas.map((p) => profileDistribution(p, respondentes, nMin)).filter((d) => d.base > 0),
    [perguntas, respondentes, nMin],
  )
  if (dists.length === 0) return null

  return (
    <div id="sec-perfil" className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 scroll-mt-16">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Perfil dos respondentes</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Como se distribuem as pessoas que responderam (informação voluntária, com a opção "prefiro não informar").
          Não é cruzada com os resultados. Grupos com menos de {nMin} pessoas são reunidos em "Outras respostas" ou não aparecem.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {dists.map((d) => (
          <div key={d.id}>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">{d.texto.replace(/\?$/, '')}</h4>
            <ul className="space-y-2">
              {d.itens.map((i) => (
                <li key={i.rotulo}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-gray-700">{i.rotulo}</span>
                    <span className="tabular-nums text-gray-500">{i.pct.toString().replace('.', ',')}%</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-gray-400" style={{ width: `${i.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-2">{d.base.toLocaleString('pt-BR')} respostas</p>
          </div>
        ))}
      </div>
    </div>
  )
}

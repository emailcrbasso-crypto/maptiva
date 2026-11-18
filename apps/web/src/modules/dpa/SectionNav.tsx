/**
 * SectionNav — barra fixa com as seções da página de resultados. Mostra só as
 * seções que existem na tela agora e destaca a que está à vista. A cor de
 * destaque é a da marca do cliente (variável --brand).
 */

import { useEffect, useState } from 'react'

export interface NavSection {
  id:    string
  label: string
}

export function SectionNav({ secoes }: { secoes: NavSection[] }) {
  const [presentes, setPresentes] = useState<string[]>([])
  const [ativa, setAtiva] = useState<string>(secoes[0]?.id ?? '')

  // Quais seções existem no momento (alguns quadros dependem dos dados).
  useEffect(() => {
    const ids = secoes.filter((s) => (document.getElementById(s.id)?.offsetHeight ?? 0) > 0).map((s) => s.id)
    setPresentes((prev) => (prev.length === ids.length && prev.every((x, i) => x === ids[i]) ? prev : ids))
  })

  // Seção à vista: a última cujo topo já passou da barra.
  useEffect(() => {
    function onScroll() {
      let atual = presentes[0] ?? ''
      for (const id of presentes) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= 96) atual = id
      }
      setAtiva((prev) => (prev === atual ? prev : atual))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [presentes])

  const visiveis = secoes.filter((s) => presentes.includes(s.id))
  if (visiveis.length < 2) return null

  return (
    <nav
      aria-label="Seções dos resultados"
      className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {visiveis.map((s) => {
        const on = ativa === s.id
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-current={on ? 'true' : undefined}
            className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              on ? 'font-medium text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
            style={on ? { borderBottomColor: 'var(--brand, #111827)' } : undefined}
          >
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

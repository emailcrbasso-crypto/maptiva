/**
 * ResultsSkeleton — esqueleto da página de resultados enquanto os dados
 * carregam. Reproduz a forma da tela (cabeçalho, frase, dois cartões e
 * destaques) para a página não "pular" quando o conteúdo chega.
 */

function Bloco({ className }: { className: string }) {
  return <div className={`rounded-lg bg-gray-200/70 animate-pulse ${className}`} />
}

export function ResultsSkeleton() {
  return (
    <div className="max-w-5xl mx-auto" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando os resultados…</span>

      <div className="space-y-3 mb-6">
        <Bloco className="h-3 w-24" />
        <Bloco className="h-6 w-2/3 max-w-md" />
        <div className="flex gap-2 pt-1">
          <Bloco className="h-9 w-28" />
          <Bloco className="h-9 w-20" />
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <Bloco className="h-4 w-20 mb-3" />
        <Bloco className="h-4 w-28 mb-3" />
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Bloco className="h-6 w-full" />
          <Bloco className="h-6 w-5/6" />
          <Bloco className="h-6 w-2/3" />
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-xl bg-gray-50 p-5 space-y-3">
            <Bloco className="h-3 w-28" />
            <Bloco className="h-9 w-32" />
            <Bloco className="h-2 w-full" />
            <Bloco className="h-3 w-48" />
          </div>
          <div className="rounded-xl bg-gray-50 p-5 space-y-3">
            <Bloco className="h-3 w-20" />
            <Bloco className="h-9 w-20" />
            <Bloco className="h-3 w-40" />
          </div>
        </div>

        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3.5 space-y-2">
              <Bloco className="h-3 w-20" />
              <Bloco className="h-4 w-full" />
              <Bloco className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

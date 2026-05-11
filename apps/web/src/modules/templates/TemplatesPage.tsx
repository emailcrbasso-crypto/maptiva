import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface Template {
  id: string
  name: string
  method_code: string
  scale_min: number
  scale_max: number
  status: string
  created_at: string
}

const METHOD_LABEL: Record<string, string> = {
  '180': '180°',
  '360': '360°',
  'custom': 'Personalizado',
}

const STATUS_BADGE: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-500',
  active:   'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', active: 'Ativo', archived: 'Arquivado',
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('templates')
      .select('id, name, method_code, scale_min, scale_max, status, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setTemplates((data as Template[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Templates</h1>
        <Link
          to="/templates/new"
          className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          + Novo template
        </Link>
      </div>

      {loading && <p className="text-gray-400 text-sm">Carregando...</p>}
      {error   && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && templates.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400 text-sm">Nenhum template criado ainda.</p>
          <Link to="/templates/new" className="text-sm text-gray-900 underline mt-2 inline-block">
            Criar primeiro template
          </Link>
        </div>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Nome</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Método</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Escala</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-5 py-3 text-gray-500">{METHOD_LABEL[t.method_code] ?? t.method_code}</td>
                  <td className="px-5 py-3 text-gray-500">{t.scale_min}–{t.scale_max}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status] ?? ''}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/templates/${t.id}`}
                      className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Gerenciar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

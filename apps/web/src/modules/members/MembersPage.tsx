import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Member {
  id:    string
  role:  string
  name:  string
  email: string
}

const ROLE_LABEL: Record<string, string> = {
  owner:       'Owner',
  admin:       'Admin',
  manager:     'Gestor',
  participant: 'Participante',
}

const ROLE_COLOR: Record<string, string> = {
  owner:       'bg-purple-50 text-purple-700',
  admin:       'bg-blue-50 text-blue-700',
  manager:     'bg-amber-50 text-amber-700',
  participant: 'bg-gray-100 text-gray-600',
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    supabase
      .rpc('get_tenant_members')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMembers((data as Member[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Membros</h1>

      {loading && <p className="text-gray-400 text-sm">Carregando...</p>}
      {error   && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && members.length === 0 && (
        <p className="text-gray-400 text-sm">Nenhum membro ativo encontrado.</p>
      )}

      {!loading && !error && members.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Membro</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">E-mail</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Papel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                        {initials(m.name)}
                      </div>
                      <span className="font-medium text-gray-900">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{m.email}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${ROLE_COLOR[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
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

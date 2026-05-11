import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MemberRow {
  id:      string
  role:    string
  status:  string
  user_id: string
}

interface UserRow {
  id:    string
  email: string
  name:  string | null
}

interface Member {
  id:    string
  role:  string
  email: string
  name:  string
}

const ROLE_LABEL: Record<string, string> = {
  owner:       'Owner',
  admin:       'Admin',
  manager:     'Gestor',
  participant: 'Participante',
}

export function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // Step 1: fetch memberships (avoid PostgREST embedded join — returns null unreliably)
      const { data: memberships, error: memErr } = await supabase
        .from('tenant_memberships')
        .select('id, role, status, user_id')
        .eq('status', 'active')
        .order('role')

      if (memErr) { setError(memErr.message); setLoading(false); return }
      if (!memberships?.length) { setLoading(false); return }

      // Step 2: fetch users by id
      const userIds = memberships.map((m: MemberRow) => m.user_id)
      const { data: users, error: usrErr } = await supabase
        .from('users')
        .select('id, email, name')
        .in('id', userIds)

      if (usrErr) { setError(usrErr.message); setLoading(false); return }

      const userMap = new Map<string, UserRow>(
        (users ?? []).map((u: UserRow) => [u.id, u]),
      )

      const merged: Member[] = (memberships as MemberRow[]).map((m) => {
        const u = userMap.get(m.user_id)
        return {
          id:    m.id,
          role:  m.role,
          email: u?.email ?? '—',
          name:  u?.name  ?? u?.email ?? '—',
        }
      })

      setMembers(merged)
      setLoading(false)
    }

    load()
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
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Nome</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">E-mail</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Papel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{m.name}</td>
                  <td className="px-5 py-3 text-gray-500">{m.email}</td>
                  <td className="px-5 py-3">
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
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

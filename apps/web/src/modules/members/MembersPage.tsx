import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { PanelRole } from '@/lib/types'

// Membros do painel: apenas usuários com login.
// Participantes da avaliação (avaliados) → public.people + cycle_participants, sem conta.
// Respondentes externos (avaliadores) → magic link /respond/:token, sem conta.
interface Member {
  id:    string
  role:  PanelRole
  name:  string
  email: string
}

// Roles do painel — NÃO incluem 'participant' (que é entidade de domínio separada).
const ROLE_LABEL: Record<PanelRole, string> = {
  owner:   'Owner',
  admin:   'Admin',
  manager: 'Gestor',
}

const ROLE_COLOR: Record<PanelRole, string> = {
  owner:   'bg-purple-50 text-purple-700',
  admin:   'bg-blue-50 text-blue-700',
  manager: 'bg-amber-50 text-amber-700',
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose:   () => void
  onSuccess: () => void
}

function InviteModal({ onClose, onSuccess }: InviteModalProps) {
  const [email,    setEmail]    = useState('')
  const [role,     setRole]     = useState<'admin' | 'manager'>('manager')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Sessão expirada — faça login novamente.')
      setLoading(false)
      return
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const fnUrl = `${supabaseUrl}/functions/v1/invite-member`

    const res = await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ email: email.trim(), role, name: name.trim() || undefined }),
    })

    const result = await res.json() as { ok: boolean; error?: string }

    if (!result.ok) {
      setError(result.error ?? 'Erro desconhecido ao convidar membro.')
      setLoading(false)
      return
    }

    setLoading(false)
    onSuccess()
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Convidar membro</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-5">
          Um e-mail de convite será enviado. O usuário define a própria senha ao aceitar.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colega@empresa.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome (opcional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Papel no painel *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'manager')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="admin">Admin — gestão completa: templates, ciclos, pessoas e membros</option>
              <option value="manager">Gestor — visibilidade do próprio time e seus relatórios</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Para adicionar participantes de avaliação (avaliados), use a aba <strong>Pessoas</strong>.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MembersPage() {
  const [members,     setMembers]     = useState<Member[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [showInvite,  setShowInvite]  = useState(false)
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null)

  function loadMembers() {
    setLoading(true)
    setError(null)
    supabase
      .rpc('get_tenant_members')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMembers((data as Member[]) ?? [])
        setLoading(false)
      })
  }

  useEffect(() => { loadMembers() }, [])

  function handleInviteSuccess() {
    setSuccessMsg('Convite enviado com sucesso! O membro receberá um e-mail para definir a senha.')
    loadMembers()
    setTimeout(() => setSuccessMsg(null), 6000)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Membros</h1>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Convidar membro
        </button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

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
                    <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${ROLE_COLOR[m.role as PanelRole] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[m.role as PanelRole] ?? m.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  )
}

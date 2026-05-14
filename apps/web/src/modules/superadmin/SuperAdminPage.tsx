/**
 * SuperAdminPage — Painel de administração da plataforma Maptiva
 *
 * Rota: /superadmin
 * Acesso: apenas usuários com is_super_admin = true em public.users
 *
 * Funcionalidades:
 *  - Listar todos os tenants (clientes) com métricas básicas
 *  - Criar novo cliente (tenant + owner via convite)
 *  - Alterar status do tenant (active / suspended / archived)
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/modules/auth/AuthContext'
import { useSuperAdminMode } from '@/modules/auth/SuperAdminContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantRow {
  id:           string
  name:         string
  slug:         string
  plan_code:    string | null
  status:       string
  created_at:   string
  member_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  active:    'Ativo',
  suspended: 'Suspenso',
  archived:  'Arquivado',
}

const STATUS_COLOR: Record<string, string> = {
  active:    'bg-green-50 text-green-700 ring-green-200',
  suspended: 'bg-amber-50 text-amber-700 ring-amber-200',
  archived:  'bg-gray-50 text-gray-500 ring-gray-200',
}

const PLAN_LABEL: Record<string, string> = {
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function ptDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

// ─── New Tenant Modal ─────────────────────────────────────────────────────────

interface NewTenantModalProps {
  onClose:   () => void
  onSuccess: (name: string, email: string) => void
}

function NewTenantModal({ onClose, onSuccess }: NewTenantModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const [tenantName,  setTenantName]  = useState('')
  const [slug,        setSlug]        = useState('')
  const [slugEdited,  setSlugEdited]  = useState(false)
  const [planCode,    setPlanCode]    = useState('starter')
  const [ownerName,   setOwnerName]   = useState('')
  const [ownerEmail,  setOwnerEmail]  = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Auto-generate slug from tenant name unless manually edited
  function handleTenantNameChange(val: string) {
    setTenantName(val)
    if (!slugEdited) setSlug(toSlug(val))
  }

  function handleSlugChange(val: string) {
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    setSlugEdited(true)
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantName.trim() || !slug.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }

    setSaving(true)
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('Sessão expirada — faça login novamente.')
      setSaving(false)
      return
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const fnUrl = `${supabaseUrl}/functions/v1/provision-tenant`

    const res = await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        tenantName: tenantName.trim(),
        slug:       slug.trim(),
        planCode,
        ownerName:  ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
      }),
    })

    const result = await res.json() as { ok: boolean; error?: string }

    if (!result.ok) {
      setError(result.error ?? 'Erro desconhecido.')
      setSaving(false)
      return
    }

    onSuccess(tenantName.trim(), ownerEmail.trim())
    onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Novo cliente</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Um e-mail de convite será enviado ao responsável.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tenant info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={tenantName}
                onChange={(e) => handleTenantNameChange(e.target.value)}
                placeholder="Ex: Acme Consultoria"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal ml-1">(identificador único na URL)</span>
              </label>
              <div className="flex items-center gap-0">
                <span className="text-sm text-gray-400 border border-r-0 border-gray-300 rounded-l-lg px-3 py-2 bg-gray-50">
                  maptiva.app/
                </span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="acme-consultoria"
                  className="flex-1 rounded-r-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Apenas letras minúsculas, números e hífens.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          {/* Owner info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Responsável (owner)</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ex: Ana Silva"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="ana@acme.com.br"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
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
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Criando...' : 'Criar cliente e enviar convite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Status change dropdown ───────────────────────────────────────────────────

function StatusDropdown({
  tenant,
  onChanged,
}: {
  tenant:    TenantRow
  onChanged: () => void
}) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function changeStatus(newStatus: string) {
    if (newStatus === tenant.status) { setOpen(false); return }
    setLoading(true)
    setOpen(false)
    await supabase.rpc('set_tenant_status', {
      p_tenant_id: tenant.id,
      p_status:    newStatus,
    })
    setLoading(false)
    onChanged()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ring-1 ${STATUS_COLOR[tenant.status] ?? 'bg-gray-50 text-gray-500 ring-gray-200'} hover:opacity-80 transition-opacity disabled:opacity-50`}
      >
        {loading ? '…' : STATUS_LABEL[tenant.status] ?? tenant.status}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-36 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-20">
          {(['active', 'suspended', 'archived'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeStatus(s)}
              className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${
                s === tenant.status ? 'text-gray-400 cursor-default' : 'text-gray-700'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SuperAdminPage() {
  const { profile }              = useAuth()
  const { enterTenant }          = useSuperAdminMode()
  const navigate                 = useNavigate()

  const [tenants,      setTenants]      = useState<TenantRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [successMsg,   setSuccessMsg]   = useState<string | null>(null)
  const [enteringId,   setEnteringId]   = useState<string | null>(null)
  const [enterError,   setEnterError]   = useState<string | null>(null)

  // Redirect if not super admin (once profile loads)
  useEffect(() => {
    if (profile && !profile.isSuperAdmin) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile, navigate])

  async function loadTenants() {
    setLoading(true)
    const { data } = await supabase.rpc('list_all_tenants')
    setTenants((data ?? []) as TenantRow[])
    setLoading(false)
  }

  useEffect(() => { loadTenants() }, [])

  function handleSuccess(name: string, email: string) {
    setSuccessMsg(`Cliente "${name}" criado. Convite enviado para ${email}.`)
    loadTenants()
    setTimeout(() => setSuccessMsg(null), 8000)
  }

  async function handleEnterTenant(tenant: TenantRow) {
    setEnteringId(tenant.id)
    setEnterError(null)
    const { error } = await supabase.rpc('enter_tenant_as_admin', { p_tenant_id: tenant.id })
    if (error) {
      setEnterError(`Erro ao entrar no tenant: ${error.message}`)
      setEnteringId(null)
      return
    }
    enterTenant(tenant.id, tenant.name)
    navigate('/dashboard')
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const totalTenants    = tenants.length
  const activeTenants   = tenants.filter((t) => t.status === 'active').length
  const suspendedTenants = tenants.filter((t) => t.status === 'suspended').length

  // ── Guard: wait for profile ─────────────────────────────────────────────────
  if (!profile?.isSuperAdmin && !loading) return null

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-0.5 rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Super Admin
            </span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie todos os tenants da plataforma</p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo cliente
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total de clientes', value: totalTenants,     color: 'text-gray-900' },
          { label: 'Ativos',            value: activeTenants,    color: 'text-green-600' },
          { label: 'Suspensos',         value: suspendedTenants, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* ── Enter error ── */}
      {enterError && (
        <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
          {enterError}
        </div>
      )}

      {/* ── Success banner ── */}
      {successMsg && (
        <div className="mb-4 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── Tenant table ── */}
      {loading ? (
        <p className="text-sm text-gray-400 animate-pulse">Carregando clientes...</p>
      ) : tenants.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-3xl mb-3">🏢</p>
          <p className="text-sm font-medium text-gray-700 mb-1">Nenhum cliente ainda</p>
          <p className="text-sm text-gray-400">Crie o primeiro cliente clicando em "Novo cliente".</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Slug</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Plano</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Membros</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Criado em</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{t.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {t.slug}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">
                    {PLAN_LABEL[t.plan_code ?? ''] ?? (t.plan_code || '—')}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusDropdown tenant={t} onChanged={loadTenants} />
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className="text-sm font-semibold text-gray-700">{t.member_count}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    {ptDate(t.created_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleEnterTenant(t)}
                      disabled={enteringId === t.id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {enteringId === t.id ? (
                        'Entrando...'
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                          </svg>
                          Entrar
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <NewTenantModal
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

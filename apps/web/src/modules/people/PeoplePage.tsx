import { useEffect, useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useSuperAdminMode } from '@/modules/auth/SuperAdminContext'

interface Person {
  id: string
  name: string
  email: string
  job_title: string | null
  department: string | null
}

export function PeoplePage() {
  const { viewingTenant } = useSuperAdminMode()
  const [people, setPeople] = useState<Person[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // form state
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    const memberPromise = viewingTenant
      ? Promise.resolve({ data: { tenant_id: viewingTenant.id }, error: null })
      : supabase
          .from('tenant_memberships')
          .select('tenant_id')
          .eq('status', 'active')
          .eq('is_support_access', false)
          .limit(1)
          .single()

    const [memberRes, peopleRes] = await Promise.all([
      memberPromise,
      supabase.from('people').select('id, name, email, job_title, department').order('name'),
    ])
    if (memberRes.data) setTenantId(memberRes.data.tenant_id)
    if (peopleRes.error) setError(peopleRes.error.message)
    else setPeople((peopleRes.data as Person[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetForm() {
    setName(''); setEmail(''); setJobTitle(''); setDepartment('')
    setFormError(null); setShowForm(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!name.trim()) { setFormError('Nome é obrigatório.'); return }
    if (!email.trim()) { setFormError('E-mail é obrigatório.'); return }
    if (!tenantId) { setFormError('Tenant não encontrado.'); return }

    setSaving(true)
    const { error: insertError } = await supabase.from('people').insert({
      tenant_id: tenantId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      job_title: jobTitle.trim() || null,
      department: department.trim() || null,
    })

    if (insertError) {
      setFormError(
        insertError.code === '23505'
          ? 'Já existe uma pessoa com este e-mail neste tenant.'
          : insertError.message
      )
      setSaving(false)
      return
    }

    resetForm()
    setLoading(true)
    await load()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Pessoas</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Nova pessoa
          </button>
        )}
      </div>

      {/* Add person form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4"
        >
          <h2 className="text-sm font-medium text-gray-900">Nova pessoa</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Maria Silva"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                E-mail <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@empresa.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Gerente de Projetos"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Área</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Tecnologia"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                disabled={saving}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-gray-400 text-sm">Carregando...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && people.length === 0 && !showForm && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Nenhuma pessoa cadastrada.</p>
          <p className="text-sm mt-1">Adicione pessoas antes de criar ciclos.</p>
        </div>
      )}

      {people.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Nome</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">E-mail</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Cargo</th>
                <th className="text-left px-5 py-3 text-gray-500 font-medium">Área</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {people.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-5 py-3 text-gray-500">{p.email}</td>
                  <td className="px-5 py-3 text-gray-400">{p.job_title ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400">{p.department ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

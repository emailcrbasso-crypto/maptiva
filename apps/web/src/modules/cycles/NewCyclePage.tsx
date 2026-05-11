import { useEffect, useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { CycleStatus } from '@/lib/types'

interface Template {
  id: string
  name: string
  method_code: string
}

export function NewCyclePage() {
  const navigate = useNavigate()

  // form fields
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [status, setStatus] = useState<CycleStatus>('draft')
  const [startAt, setStartAt] = useState('')
  const [deadlineAt, setDeadlineAt] = useState('')

  // ui state
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Busca tenant_id e templates em paralelo
    Promise.all([
      supabase
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('status', 'active')
        .limit(1)
        .single(),
      supabase
        .from('templates')
        .select('id, name, method_code')
        .eq('status', 'active')
        .order('name'),
    ]).then(([membershipRes, templatesRes]) => {
      if (membershipRes.data) setTenantId(membershipRes.data.tenant_id)
      if (!templatesRes.error && templatesRes.data) {
        setTemplates(templatesRes.data as Template[])
        if (templatesRes.data.length > 0) setTemplateId(templatesRes.data[0].id)
      }
      setLoadingTemplates(false)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name.trim()) { setError('Nome do ciclo é obrigatório.'); return }
    if (!templateId) { setError('Selecione um template.'); return }
    if (!tenantId)   { setError('Tenant não identificado. Recarregue a página.'); return }

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      tenant_id:   tenantId,
      name:        name.trim(),
      template_id: templateId,
      status,
    }
    if (startAt)    payload.start_at    = new Date(startAt).toISOString()
    if (deadlineAt) payload.deadline_at = new Date(deadlineAt).toISOString()

    const { data, error: insertError } = await supabase
      .from('cycles')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    navigate(`/cycles/${data.id}`)
  }

  return (
    <div className="max-w-lg">
      {/* Header */}
      <div className="mb-6">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">
          ← Ciclos
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-2">Novo ciclo</h1>
      </div>

      {/* No templates warning */}
      {!loadingTemplates && templates.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          Nenhum template ativo encontrado. Crie um template antes de criar um ciclo.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do ciclo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Avaliação 360° — Q2 2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            disabled={submitting}
          />
        </div>

        {/* Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template <span className="text-red-500">*</span>
          </label>
          {loadingTemplates ? (
            <p className="text-sm text-gray-400">Carregando templates...</p>
          ) : (
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
              disabled={submitting || templates.length === 0}
            >
              {templates.length === 0 && (
                <option value="">Nenhum template disponível</option>
              )}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.method_code})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Status inicial */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status inicial
          </label>
          <div className="flex gap-3">
            {(['draft', 'active'] as CycleStatus[]).map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  disabled={submitting}
                  className="accent-gray-900"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {s === 'draft' ? 'Rascunho' : 'Ativo'}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Rascunho: permite editar antes de abrir para avaliações. Ativo: já aceita respostas.
          </p>
        </div>

        {/* Datas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de início
            </label>
            <input
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prazo final
            </label>
            <input
              type="date"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <Link
            to="/cycles"
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || templates.length === 0}
            className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Criando...' : 'Criar ciclo'}
          </button>
        </div>
      </form>
    </div>
  )
}

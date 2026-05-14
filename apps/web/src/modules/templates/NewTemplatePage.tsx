import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { SCALE_OPTIONS, DEFAULT_SCALE_ID, type ScaleDefinition } from '@/lib/scales'
import { useSuperAdminMode } from '@/modules/auth/SuperAdminContext'

export function NewTemplatePage() {
  const navigate = useNavigate()
  const { viewingTenant } = useSuperAdminMode()

  const [name,       setName]       = useState('')
  const [methodCode, setMethodCode] = useState('360')
  const [scaleId,    setScaleId]    = useState<string>(DEFAULT_SCALE_ID)
  const [allowNa,    setAllowNa]    = useState(true)
  const [nMinimum,   setNMinimum]   = useState(3)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const selectedScale: ScaleDefinition = SCALE_OPTIONS.find((s) => s.id === scaleId) ?? SCALE_OPTIONS[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório.'); return }

    setSaving(true)
    setError(null)

    // Resolve tenant_id: usa o tenant do modo suporte ou busca o próprio
    let resolvedTenantId: string | null = viewingTenant?.id ?? null
    if (!resolvedTenantId) {
      const { data: memberData, error: memberErr } = await supabase
        .from('tenant_memberships')
        .select('tenant_id')
        .eq('status', 'active')
        .eq('is_support_access', false)
        .limit(1)
        .single()

      if (memberErr || !memberData) {
        setError('Não foi possível determinar o tenant.')
        setSaving(false)
        return
      }
      resolvedTenantId = memberData.tenant_id
    }

    const { data, error: insertErr } = await supabase
      .from('templates')
      .insert({
        tenant_id:               resolvedTenantId,
        name:                    name.trim(),
        method_code:             methodCode,
        scale_id:                selectedScale.id,
        scale_min:               selectedScale.min,
        scale_max:               selectedScale.max,
        allow_na:                allowNa,
        n_minimum_default:       nMinimum,
        show_self_separately:    true,
        show_manager_separately: true,
        status:                  'draft',
      })
      .select('id')
      .single()

    if (insertErr) {
      setError(insertErr.message)
      setSaving(false)
      return
    }

    navigate(`/templates/${data.id}`)
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link to="/templates" className="text-sm text-gray-400 hover:text-gray-600">← Templates</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-2">Novo template</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Nome */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Nome do template <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Avaliação 360° — Liderança"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Método */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Método de avaliação</label>
          <div className="flex gap-3">
            {[
              { value: '180', label: '180°', desc: 'Gestor + Autoavaliação' },
              { value: '360', label: '360°', desc: 'Multi-fonte completo' },
              { value: 'custom', label: 'Personalizado', desc: 'Configuração livre' },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethodCode(m.value)}
                className={`flex-1 border rounded-lg p-3 text-left transition-colors ${
                  methodCode === m.value
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Escala */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Escala de respostas</label>
          <select
            value={scaleId}
            onChange={(e) => setScaleId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {SCALE_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.description}</option>
            ))}
          </select>
          {/* Labels preview */}
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {selectedScale.labels.map((lbl) => (
              <span key={lbl.value} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                <strong>{lbl.value}</strong> {lbl.label}
              </span>
            ))}
            {selectedScale.allowNa && (
              <span className="text-xs bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full text-blue-600">
                + N/A
              </span>
            )}
          </div>
        </div>

        {/* N mínimo + Allow N/A */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              N mínimo por grupo
              <span className="text-gray-400 font-normal ml-1">(anonimato)</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={nMinimum}
              onChange={(e) => setNMinimum(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowNa}
                onChange={(e) => setAllowNa(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Permitir "Não se aplica"</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <Link to="/templates" className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="bg-gray-900 text-white text-sm px-6 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Criando...' : 'Criar template'}
          </button>
        </div>
      </form>
    </div>
  )
}

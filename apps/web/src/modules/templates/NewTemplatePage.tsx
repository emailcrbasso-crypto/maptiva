import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export function NewTemplatePage() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [methodCode, setMethodCode] = useState('360')
  const [scaleMin, setScaleMin] = useState(1)
  const [scaleMax, setScaleMax] = useState(5)
  const [allowNa, setAllowNa] = useState(true)
  const [nMinimum, setNMinimum] = useState(3)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório.'); return }
    if (scaleMax <= scaleMin) { setError('Escala máxima deve ser maior que a mínima.'); return }

    setSaving(true)
    setError(null)

    // Fetch tenant_id
    const { data: memberData, error: memberErr } = await supabase
      .from('tenant_memberships')
      .select('tenant_id')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (memberErr || !memberData) {
      setError('Não foi possível determinar o tenant.')
      setSaving(false)
      return
    }

    const { data, error: insertErr } = await supabase
      .from('templates')
      .insert({
        tenant_id:              memberData.tenant_id,
        name:                   name.trim(),
        method_code:            methodCode,
        scale_min:              scaleMin,
        scale_max:              scaleMax,
        allow_na:               allowNa,
        n_minimum_default:      nMinimum,
        show_self_separately:   true,
        show_manager_separately: true,
        status:                 'draft',
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
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Mínimo</label>
              <input
                type="number"
                min={1}
                max={scaleMax - 1}
                value={scaleMin}
                onChange={(e) => setScaleMin(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <span className="text-gray-400 mt-5">→</span>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Máximo</label>
              <input
                type="number"
                min={scaleMin + 1}
                max={10}
                value={scaleMax}
                onChange={(e) => setScaleMax(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
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

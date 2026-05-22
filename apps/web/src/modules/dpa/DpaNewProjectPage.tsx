/**
 * DpaNewProjectPage — Criação de projeto DPA
 *
 * Rota: /dpa/new
 *
 * Permite definir:
 *  - Nome e descrição
 *  - Label da unidade (departamento / área / turma / etc.)
 *  - Perguntas (escala_5 / texto_livre / multipla_escolha)
 *  - Importação de participantes (CSV ou manual)
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pergunta {
  id:          string
  texto:       string
  tipo:        'escala_5' | 'texto_livre' | 'multipla_escolha'
  obrigatoria: boolean
  opcoes:      string   // comma-separated string for UI
}

interface Participante {
  nome:    string
  email:   string
  unidade: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newPergunta(): Pergunta {
  return {
    id:          crypto.randomUUID(),
    texto:       '',
    tipo:        'escala_5',
    obrigatoria: true,
    opcoes:      '',
  }
}

function parseCsv(text: string, labelUnidade: string): Participante[] {
  const lines = text.trim().split('\n').filter(Boolean)
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''))
  const iCol     = header.indexOf('nome')
  const eCol     = header.indexOf('email')
  const uCol     = header.indexOf(labelUnidade.toLowerCase()) !== -1
    ? header.indexOf(labelUnidade.toLowerCase())
    : header.findIndex((h) => ['unidade', 'departamento', 'area', 'área', 'turma'].includes(h))

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''))
    return {
      nome:    iCol >= 0 ? cols[iCol] || '' : '',
      email:   eCol >= 0 ? cols[eCol] || '' : cols[0] || '',
      unidade: uCol >= 0 ? cols[uCol] || '' : '',
    }
  }).filter((p) => p.email.includes('@'))
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DpaNewProjectPage() {
  const navigate = useNavigate()

  // Basic info
  const [nome,         setNome]         = useState('')
  const [descricao,    setDescricao]    = useState('')
  const [labelUnidade, setLabelUnidade] = useState('Departamento')

  // Questions
  const [perguntas, setPerguntas] = useState<Pergunta[]>([newPergunta()])

  // Participants
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [csvText,       setCsvText]       = useState('')
  const [csvError,      setCsvError]      = useState('')
  const [addMode,       setAddMode]       = useState<'csv' | 'manual'>('csv')
  const [manualNome,    setManualNome]    = useState('')
  const [manualEmail,   setManualEmail]   = useState('')
  const [manualUnidade, setManualUnidade] = useState('')

  // Submit
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // ── Questions management ──────────────────────────────────────────────────

  function addPergunta() {
    setPerguntas((prev) => [...prev, newPergunta()])
  }

  function removePergunta(id: string) {
    setPerguntas((prev) => prev.filter((p) => p.id !== id))
  }

  function updatePergunta(id: string, field: keyof Pergunta, value: string | boolean) {
    setPerguntas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  function movePergunta(id: string, dir: -1 | 1) {
    setPerguntas((prev) => {
      const idx  = prev.findIndex((p) => p.id === id)
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // ── Participants management ────────────────────────────────────────────────

  function handleCsvImport() {
    setCsvError('')
    try {
      const parsed = parseCsv(csvText, labelUnidade)
      if (parsed.length === 0) {
        setCsvError('Nenhum e-mail válido encontrado. Verifique o formato.')
        return
      }
      setParticipantes((prev) => {
        const existing = new Set(prev.map((p) => p.email))
        return [...prev, ...parsed.filter((p) => !existing.has(p.email))]
      })
      setCsvText('')
    } catch {
      setCsvError('Erro ao processar CSV. Verifique o formato.')
    }
  }

  function addManual() {
    if (!manualEmail.includes('@')) return
    if (participantes.find((p) => p.email === manualEmail)) return
    setParticipantes((prev) => [...prev, {
      nome:    manualNome,
      email:   manualEmail,
      unidade: manualUnidade,
    }])
    setManualNome('')
    setManualEmail('')
    setManualUnidade('')
  }

  function removeParticipante(email: string) {
    setParticipantes((prev) => prev.filter((p) => p.email !== email))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setError('Informe o nome do projeto.'); return }
    if (perguntas.some((p) => !p.texto.trim())) {
      setError('Todas as perguntas precisam ter um texto.')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Build config
      const config = {
        label_unidade: labelUnidade,
        perguntas: perguntas.map((p) => ({
          id:          p.id,
          texto:       p.texto,
          tipo:        p.tipo,
          obrigatoria: p.obrigatoria,
          ...(p.tipo === 'multipla_escolha' && {
            opcoes: p.opcoes.split(',').map((o) => o.trim()).filter(Boolean),
          }),
        })),
      }

      // Create project
      const { data: projeto, error: projError } = await supabase
        .from('dpa_projetos')
        .insert({ nome: nome.trim(), descricao: descricao.trim() || null, config })
        .select('id, tenant_id')
        .single()

      if (projError || !projeto) throw projError || new Error('Falha ao criar projeto')

      // Insert participants if any
      if (participantes.length > 0) {
        const rows = participantes.map((p) => ({
          projeto_id: projeto.id,
          tenant_id:  projeto.tenant_id,
          nome:       p.nome || null,
          email:      p.email,
          unidade:    p.unidade || null,
        }))
        const { error: partError } = await supabase.from('dpa_participantes').insert(rows)
        if (partError) throw partError
      }

      navigate(`/dpa/${projeto.id}`)
    } catch (err) {
      setError((err as Error).message || 'Erro desconhecido')
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/dpa" className="text-sm text-gray-400 hover:text-gray-600">
          ← Diagnósticos
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-2">Novo diagnóstico</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">

        {/* ── Basic info ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Informações gerais</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Nome do diagnóstico <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Diagnóstico Cultura Organizacional Q1"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Descrição / instruções para o participante
              </label>
              <textarea
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Opcional — aparece no cabeçalho do formulário"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Como chamar a unidade organizacional?
              </label>
              <input
                type="text"
                value={labelUnidade}
                onChange={(e) => setLabelUnidade(e.target.value)}
                placeholder="Departamento"
                className="w-full max-w-xs text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">
                Ex: Departamento, Área, Turma, Unidade — será exibido no formulário e nos relatórios.
              </p>
            </div>
          </div>
        </section>

        {/* ── Questions ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Perguntas</h2>
            <button
              type="button"
              onClick={addPergunta}
              className="text-xs text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              + Adicionar pergunta
            </button>
          </div>

          <div className="space-y-4">
            {perguntas.map((p, idx) => (
              <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Order controls */}
                  <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => movePergunta(p.id, -1)}
                      disabled={idx === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-0 text-xs"
                    >
                      ▲
                    </button>
                    <span className="text-xs text-gray-400 text-center w-4">{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => movePergunta(p.id, 1)}
                      disabled={idx === perguntas.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-0 text-xs"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <textarea
                      rows={2}
                      value={p.texto}
                      onChange={(e) => updatePergunta(p.id, 'texto', e.target.value)}
                      placeholder="Texto da pergunta..."
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                    />

                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={p.tipo}
                        onChange={(e) => updatePergunta(p.id, 'tipo', e.target.value)}
                        className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                      >
                        <option value="escala_5">Escala 1–5</option>
                        <option value="texto_livre">Texto livre</option>
                        <option value="multipla_escolha">Múltipla escolha</option>
                      </select>

                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={p.obrigatoria}
                          onChange={(e) => updatePergunta(p.id, 'obrigatoria', e.target.checked)}
                          className="rounded"
                        />
                        Obrigatória
                      </label>
                    </div>

                    {p.tipo === 'multipla_escolha' && (
                      <div>
                        <input
                          type="text"
                          value={p.opcoes}
                          onChange={(e) => updatePergunta(p.id, 'opcoes', e.target.value)}
                          placeholder="Opção A, Opção B, Opção C"
                          className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <p className="text-xs text-gray-400 mt-1">Separe as opções com vírgula.</p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removePergunta(p.id)}
                    disabled={perguntas.length === 1}
                    className="text-gray-300 hover:text-red-400 disabled:opacity-0 transition-colors text-sm mt-0.5"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Participants ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Participantes</h2>
          <p className="text-xs text-gray-400 mb-5">
            Opcional — você pode adicionar participantes depois. Cada um receberá um link único.
          </p>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs w-fit mb-4">
            <button
              type="button"
              onClick={() => setAddMode('csv')}
              className={`px-3 py-1.5 transition-colors ${addMode === 'csv' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Importar CSV
            </button>
            <button
              type="button"
              onClick={() => setAddMode('manual')}
              className={`px-3 py-1.5 transition-colors ${addMode === 'manual' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Adicionar manual
            </button>
          </div>

          {addMode === 'csv' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Cole o conteúdo do CSV com colunas: <code className="bg-gray-100 px-1 rounded">nome, email, {labelUnidade.toLowerCase()}</code>
              </p>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`nome,email,${labelUnidade.toLowerCase()}\nJoão Silva,joao@empresa.com,TI\nMaria Santos,maria@empresa.com,RH`}
                className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
              {csvError && <p className="text-xs text-red-500">{csvError}</p>}
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={!csvText.trim()}
                className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Importar
              </button>
            </div>
          )}

          {addMode === 'manual' && (
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <input
                  type="text"
                  value={manualNome}
                  onChange={(e) => setManualNome(e.target.value)}
                  placeholder="Nome"
                  className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{labelUnidade}</label>
                <input
                  type="text"
                  value={manualUnidade}
                  onChange={(e) => setManualUnidade(e.target.value)}
                  placeholder={labelUnidade}
                  className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <button
                type="button"
                onClick={addManual}
                disabled={!manualEmail.includes('@')}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Adicionar
              </button>
            </div>
          )}

          {/* Participant list */}
          {participantes.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-gray-500 mb-2">
                {participantes.length} participante{participantes.length > 1 ? 's' : ''} adicionado{participantes.length > 1 ? 's' : ''}
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Nome</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">E-mail</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">{labelUnidade}</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantes.map((p) => (
                      <tr key={p.email} className="border-t border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{p.nome || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{p.email}</td>
                        <td className="px-3 py-2 text-gray-700">{p.unidade || '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeParticipante(p.email)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── Error & Submit ── */}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <Link
            to="/dpa"
            className="text-sm text-gray-500 px-4 py-2 hover:text-gray-700 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="text-sm bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Criar diagnóstico'}
          </button>
        </div>
      </form>
    </div>
  )
}

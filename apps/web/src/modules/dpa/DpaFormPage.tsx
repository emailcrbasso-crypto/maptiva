/**
 * DpaFormPage — Formulário público do Diagnóstico Prévio Anônimo
 *
 * Rota pública: /dpa/:token
 *
 * Acessado via magic link enviado ao participante.
 * Valida o token, exibe as perguntas e submete as respostas anonimamente.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pergunta {
  id:         string
  texto:      string
  tipo:       'escala_5' | 'texto_livre' | 'multipla_escolha'
  opcoes?:    string[]
  obrigatoria: boolean
  multi?:        boolean
  max_escolhas?: number
  permite_outro?: boolean
  /** Quando presente, agrupa perguntas consecutivas com o mesmo valor num
   * único bloco visual (cabeçalho + instrução aparecem uma vez só). */
  bloco?:        string
  /** Instrução/legenda do bloco (ex.: "Avalie o quanto..."), mostrada uma
   * única vez no topo do bloco — não repetir em cada pergunta. */
  bloco_intro?:  string
}

// Sentinela interna para a seleção "Outro"; convertida em "Outro: <texto>" no envio.
const OUTRO = '__outro__'

interface DpaConfig {
  label_unidade: string
  perguntas:     Pergunta[]
}

interface TokenData {
  valido:            boolean
  motivo?:           string
  participante_id?:  string
  nome?:             string
  unidade?:          string
  projeto_id?:       string
  projeto_nome?:     string
  projeto_descricao?: string
  config?:           DpaConfig
}

// ─── Scale labels ─────────────────────────────────────────────────────────────

const SCALE_LABELS: Record<number, string> = {
  1: 'Discordo totalmente',
  2: 'Discordo',
  3: 'Neutro',
  4: 'Concordo',
  5: 'Concordo totalmente',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DpaFormPage() {
  const { token }  = useParams<{ token: string }>()
  const navigate   = useNavigate()

  const [loading,    setLoading]    = useState(true)
  const [tokenData,  setTokenData]  = useState<TokenData | null>(null)
  const [answers,    setAnswers]    = useState<Record<string, string | number | string[]>>({})
  const [outroTexts, setOutroTexts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [errors,     setErrors]     = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) return
    async function validate() {
      const { data, error } = await supabase.rpc('validate_dpa_token', {
        p_token: token,
      })

      if (error || !data) {
        navigate('/diagnostico/acesso-negado', { replace: true })
        return
      }

      const result = data as TokenData

      if (!result.valido) {
        if (result.motivo === 'ja_respondido') {
          navigate('/diagnostico/ja-respondido', { replace: true })
        } else {
          navigate('/diagnostico/acesso-negado', { replace: true })
        }
        return
      }

      setTokenData(result)
      setLoading(false)
    }
    validate()
  }, [token, navigate])

  function handleScale(perguntaId: string, value: number) {
    setAnswers((prev) => ({ ...prev, [perguntaId]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[perguntaId]
      return next
    })
  }

  function handleText(perguntaId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [perguntaId]: value }))
    clearError(perguntaId)
  }

  function clearError(perguntaId: string) {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[perguntaId]
      return next
    })
  }

  // Múltipla escolha com seleção única (radio)
  function handleSingleChoice(perguntaId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [perguntaId]: value }))
    clearError(perguntaId)
  }

  // Múltipla escolha com várias seleções (checkbox), respeitando o limite
  function toggleMultiChoice(pergunta: Pergunta, value: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[pergunta.id]) ? (prev[pergunta.id] as string[]) : []
      const has     = current.includes(value)
      if (!has && pergunta.max_escolhas && current.length >= pergunta.max_escolhas) {
        return prev // atingiu o limite — ignora nova seleção
      }
      const next = has ? current.filter((v) => v !== value) : [...current, value]
      return { ...prev, [pergunta.id]: next }
    })
    clearError(pergunta.id)
  }

  function handleOutroText(perguntaId: string, value: string) {
    setOutroTexts((prev) => ({ ...prev, [perguntaId]: value }))
    clearError(perguntaId)
  }

  // true se a opção "Outro" está marcada na pergunta
  function isOutroSelected(pergunta: Pergunta): boolean {
    const a = answers[pergunta.id]
    return Array.isArray(a) ? a.includes(OUTRO) : a === OUTRO
  }

  function validate(): boolean {
    if (!tokenData?.config) return false
    const errs: Record<string, string> = {}
    for (const p of tokenData.config.perguntas) {
      const ans   = answers[p.id]
      const empty = ans === undefined || ans === null || ans === ''
        || (Array.isArray(ans) && ans.length === 0)

      if (p.obrigatoria && empty) {
        errs[p.id] = 'Esta pergunta é obrigatória'
        continue
      }
      // Se "Outro" foi selecionado, o detalhe é obrigatório
      if (p.tipo === 'multipla_escolha' && isOutroSelected(p)
          && !(outroTexts[p.id] || '').trim()) {
        errs[p.id] = 'Descreva a opção "Outro".'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Converte a sentinela __outro__ em "Outro: <texto>" para persistência
  function buildPayload(): Record<string, string | number | string[]> {
    const out: Record<string, string | number | string[]> = {}
    const cfg = tokenData?.config
    if (!cfg) return out
    for (const p of cfg.perguntas) {
      const a = answers[p.id]
      if (a === undefined) continue
      const outroLabel = `Outro: ${(outroTexts[p.id] || '').trim()}`
      if (Array.isArray(a)) {
        if (a.length === 0) continue
        out[p.id] = a.map((v) => (v === OUTRO ? outroLabel : v))
      } else if (a === OUTRO) {
        out[p.id] = outroLabel
      } else if (a !== '') {
        out[p.id] = a
      }
    }
    return out
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('submit_dpa_response', {
        p_token:     token,
        p_respostas: buildPayload(),
      })

      if (error) throw error
      if (!(data as { sucesso: boolean }).sucesso) throw new Error('Falha ao enviar')

      navigate('/diagnostico/obrigado', { replace: true })
    } catch (err) {
      console.error(err)
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Verificando acesso...</span>
        </div>
      </div>
    )
  }

  if (!tokenData?.config) return null

  const { config, projeto_nome, projeto_descricao, nome, unidade } = tokenData

  // Agrupa perguntas consecutivas com o mesmo `bloco` num único bloco visual —
  // cabeçalho e instrução (`bloco_intro`) aparecem uma vez só, no topo do
  // bloco, em vez de repetidos em cada pergunta.
  type Grupo = { bloco: string | null; intro: string | null; items: { pergunta: Pergunta; idx: number }[] }
  const grupos: Grupo[] = []
  config.perguntas.forEach((pergunta, idx) => {
    const chave = pergunta.bloco ?? null
    const last  = grupos[grupos.length - 1]
    if (last && last.bloco !== null && last.bloco === chave) {
      last.items.push({ pergunta, idx })
    } else {
      grupos.push({ bloco: chave, intro: pergunta.bloco_intro ?? null, items: [{ pergunta, idx }] })
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            Diagnóstico Prévio Anônimo
          </p>
          <h1 className="text-xl font-semibold text-gray-900 mt-0.5">{projeto_nome}</h1>
          {projeto_descricao && (
            <p className="text-sm text-gray-500 mt-1">{projeto_descricao}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Participant info */}
        {(nome || unidade) && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <div className="text-sm text-blue-800 space-y-0.5">
              {nome    && <p><span className="font-medium">Participante:</span> {nome}</p>}
              {unidade && <p><span className="font-medium">{config.label_unidade}:</span> {unidade}</p>}
            </div>
          </div>
        )}

        {/* Privacy notice */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 mb-8 flex items-start gap-3">
          <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-sm text-amber-800">
            Suas respostas são <strong>anônimas</strong>. Elas serão analisadas em conjunto com as demais respostas do diagnóstico.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-8">
            {grupos.map((grupo, gi) => (
              <div key={gi} className="bg-white rounded-xl border border-gray-200 p-6">
                {grupo.bloco && (
                  <div className="mb-5 pb-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">{grupo.bloco}</h2>
                    {grupo.intro && (
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{grupo.intro}</p>
                    )}
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {grupo.items.map(({ pergunta, idx }) => (
                    <div key={pergunta.id} className={grupo.bloco ? 'py-5 first:pt-0 last:pb-0' : ''}>
                <div className="flex items-start gap-3 mb-5">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 leading-relaxed whitespace-pre-line">
                      {pergunta.texto}
                      {pergunta.obrigatoria && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Scale 1-5 */}
                {pergunta.tipo === 'escala_5' && (
                  <div className="space-y-2 ml-10">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <label
                        key={val}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          answers[pergunta.id] === val
                            ? 'border-gray-900 bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={pergunta.id}
                          value={val}
                          checked={answers[pergunta.id] === val}
                          onChange={() => handleScale(pergunta.id, val)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          answers[pergunta.id] === val
                            ? 'border-gray-900 bg-gray-900'
                            : 'border-gray-300'
                        }`}>
                          {answers[pergunta.id] === val && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <span className={`text-sm ${
                          answers[pergunta.id] === val ? 'font-medium text-gray-900' : 'text-gray-700'
                        }`}>
                          <span className="font-semibold mr-2">{val}</span>
                          {SCALE_LABELS[val]}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Free text */}
                {pergunta.tipo === 'texto_livre' && (
                  <div className="ml-10">
                    <textarea
                      rows={4}
                      value={(answers[pergunta.id] as string) || ''}
                      onChange={(e) => handleText(pergunta.id, e.target.value)}
                      placeholder="Escreva sua resposta..."
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                    />
                  </div>
                )}

                {/* Multiple choice (single ou multi) + opção "Outro" */}
                {pergunta.tipo === 'multipla_escolha' && pergunta.opcoes && (() => {
                  const isMulti  = !!pergunta.multi
                  const selected = answers[pergunta.id]
                  const isChecked = (opcao: string) =>
                    isMulti
                      ? Array.isArray(selected) && selected.includes(opcao)
                      : selected === opcao
                  const count = Array.isArray(selected) ? selected.length : 0
                  const atLimit = isMulti && !!pergunta.max_escolhas && count >= pergunta.max_escolhas

                  const choose = (opcao: string) =>
                    isMulti ? toggleMultiChoice(pergunta, opcao) : handleSingleChoice(pergunta.id, opcao)

                  const renderOption = (value: string, label: string) => {
                    const on       = isChecked(value)
                    const disabled = isMulti && !on && atLimit
                    return (
                      <label
                        key={value}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          on ? 'border-gray-900 bg-gray-50'
                             : disabled ? 'border-gray-100 opacity-50 cursor-not-allowed'
                             : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={pergunta.id}
                          checked={on}
                          disabled={disabled}
                          onChange={() => choose(value)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 ${isMulti ? 'rounded' : 'rounded-full'} border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          on ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                        }`}>
                          {on && (isMulti
                            ? <span className="text-white text-[10px] leading-none">✓</span>
                            : <div className="w-2 h-2 rounded-full bg-white" />)}
                        </div>
                        <span className={`text-sm ${on ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                          {label}
                        </span>
                      </label>
                    )
                  }

                  return (
                    <div className="space-y-2 ml-10">
                      {isMulti && pergunta.max_escolhas && (
                        <p className="text-xs text-gray-400">
                          Escolha até {pergunta.max_escolhas} {pergunta.max_escolhas > 1 ? 'opções' : 'opção'}
                          {count > 0 ? ` · ${count} selecionada${count > 1 ? 's' : ''}` : ''}.
                        </p>
                      )}

                      {pergunta.opcoes.map((opcao) => renderOption(opcao, opcao))}

                      {/* Opção "Outro" */}
                      {pergunta.permite_outro && (
                        <>
                          {renderOption(OUTRO, 'Outro')}
                          {isOutroSelected(pergunta) && (
                            <input
                              type="text"
                              value={outroTexts[pergunta.id] || ''}
                              onChange={(e) => handleOutroText(pergunta.id, e.target.value)}
                              placeholder="Descreva sua resposta..."
                              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 ml-0 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                            />
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Error */}
                {errors[pergunta.id] && (
                  <p className="mt-3 ml-10 text-xs text-red-500">{errors[pergunta.id]}</p>
                )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="mt-8">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Enviando...' : 'Enviar respostas'}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              Após o envio você não poderá alterar suas respostas.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

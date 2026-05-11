import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  prompt: string
  response_type: 'scale' | 'text' | 'boolean'
  order_index: number
  scale_min?: number
  scale_max?: number
}

interface AssignmentContext {
  assignment_id:        string
  cycle_name:           string
  questionnaire_name:   string
  evaluated_name:       string
  relationship_code:    string
  scale_min:            number
  scale_max:            number
  questions:            Question[]
  // Tenant branding (available after migration 0031)
  tenant_name:          string
  tenant_logo_url:      string | null
  tenant_primary_color: string
  tenant_hide_maptiva:  boolean
}

interface ShellBranding {
  name:         string
  logoUrl:      string | null
  primaryColor: string
  hideMaptiva:  boolean
}

const DEFAULT_BRANDING: ShellBranding = {
  name:         'Maptiva',
  logoUrl:      null,
  primaryColor: '#111827',
  hideMaptiva:  false,
}

type PageState = 'loading' | 'ready' | 'submitting' | 'done' | 'error'

// ─── Scale input ──────────────────────────────────────────────────────────────

function ScaleInput({
  min,
  max,
  value,
  primaryColor,
  onChange,
}: {
  min: number
  max: number
  value: number | null
  primaryColor: string
  onChange: (v: number) => void
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min)

  return (
    <div className="flex gap-2 mt-3">
      {steps.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={value === n ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
          className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
            value === n
              ? 'text-white'
              : 'border-gray-300 text-gray-700 hover:border-gray-500 hover:bg-gray-50'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({
  branding = DEFAULT_BRANDING,
  children,
}: {
  branding?: ShellBranding
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6 text-center">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="h-8 w-auto object-contain mx-auto"
            />
          ) : (
            <span className="text-lg font-semibold text-gray-900">{branding.name}</span>
          )}
        </div>
        {children}
        {!branding.hideMaptiva && branding.name !== 'Maptiva' && (
          <p className="text-center text-xs text-gray-300 mt-8">
            Powered by <a href="https://maptiva.com.br" className="hover:text-gray-400 transition-colors">Maptiva</a>
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RespondPage() {
  const { token } = useParams<{ token: string }>()

  const [state,     setState]     = useState<PageState>('loading')
  const [ctx,       setCtx]       = useState<AssignmentContext | null>(null)
  const [branding,  setBranding]  = useState<ShellBranding>(DEFAULT_BRANDING)
  const [errorMsg,  setErrorMsg]  = useState('')

  // scores: question_id → number (scale questions only)
  const [scores,       setScores]       = useState<Record<string, number | null>>({})
  // textAnswers: question_id → string (text questions)
  const [textAnswers,  setTextAnswers]  = useState<Record<string, string>>({})
  // comments: question_id → text (optional per question)
  const [comments,     setComments]     = useState<Record<string, string>>({})
  // global comment (sem vínculo a pergunta específica)
  const [globalComment, setGlobalComment] = useState('')

  useEffect(() => {
    if (!token) { setErrorMsg('Token não encontrado na URL.'); setState('error'); return }

    supabase
      .rpc('get_assignment_context', { p_token: token })
      .then(({ data, error }) => {
        if (error) {
          setErrorMsg(friendlyError(error.message))
          setState('error')
        } else {
          const context = data as AssignmentContext

          setCtx(context)

          // Apply tenant branding if available
          if (context.tenant_name) {
            const b: ShellBranding = {
              name:         context.tenant_name,
              logoUrl:      context.tenant_logo_url ?? null,
              primaryColor: context.tenant_primary_color ?? '#111827',
              hideMaptiva:  context.tenant_hide_maptiva ?? false,
            }
            setBranding(b)
            // Apply brand color to submit button via CSS var
            document.documentElement.style.setProperty('--color-respond-primary', b.primaryColor)
          }

          // Inicializa scores como null para cada pergunta de escala
          const init: Record<string, number | null> = {}
          context.questions.forEach((q) => {
            if (q.response_type === 'scale') init[q.id] = null
          })
          setScores(init)
          setState('ready')
        }
      })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !ctx) return

    // Valida que todas as perguntas de escala foram respondidas
    const unanswered = ctx.questions.filter(
      (q) => q.response_type === 'scale' && scores[q.id] == null,
    )
    if (unanswered.length > 0) {
      alert(`Responda todas as perguntas antes de enviar (${unanswered.length} pendentes).`)
      return
    }

    setState('submitting')

    // Monta payload de answers (scale + text)
    const answers = ctx.questions.map((q) => {
      if (q.response_type === 'scale') {
        return { question_id: q.id, score: scores[q.id], text_answer: null }
      }
      return { question_id: q.id, score: null, text_answer: textAnswers[q.id] ?? '' }
    })

    // Monta payload de comments
    const commentsList: { question_id: string | null; body: string }[] = []
    ctx.questions.forEach((q) => {
      if (comments[q.id]?.trim()) {
        commentsList.push({ question_id: q.id, body: comments[q.id].trim() })
      }
    })
    if (globalComment.trim()) {
      commentsList.push({ question_id: null, body: globalComment.trim() })
    }

    const { error } = await supabase.rpc('submit_response', {
      p_token:    token,
      p_answers:  answers,
      p_comments: commentsList,
    })

    if (error) {
      setErrorMsg(friendlyError(error.message))
      setState('error')
    } else {
      setState('done')
    }
  }

  // ─── Estados de UI ───────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <Shell branding={branding}>
        <p className="text-gray-400 text-sm text-center py-12">Carregando questionário...</p>
      </Shell>
    )
  }

  if (state === 'error') {
    const isExpired = errorMsg.includes('expirou')
    const isUsed    = errorMsg.includes('já foi utilizado')

    return (
      <Shell branding={branding}>
        <div className="text-center py-12">
          <p className="text-4xl mb-4">{isExpired ? '⏱' : isUsed ? '✓' : '⚠️'}</p>
          <p className="text-gray-800 font-semibold text-lg mb-2">
            {isExpired
              ? 'Link expirado'
              : isUsed
              ? 'Avaliação já concluída'
              : 'Não foi possível carregar o questionário'}
          </p>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            {isExpired
              ? 'O prazo para responder esta avaliação encerrou. Entre em contato com o administrador do ciclo se precisar de um novo link.'
              : isUsed
              ? 'Você já enviou suas respostas para esta avaliação. Não é possível responder novamente.'
              : errorMsg}
          </p>
        </div>
      </Shell>
    )
  }

  if (state === 'done') {
    return (
      <Shell branding={branding}>
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-3">Respostas enviadas com sucesso</h1>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Obrigado por participar. Suas respostas foram registradas e contribuirão para o processo de desenvolvimento.
          </p>
          <p className="text-xs text-gray-400 mt-6">Você já pode fechar esta página.</p>
        </div>
      </Shell>
    )
  }

  if (!ctx) return null

  const scaleMin   = ctx.scale_min ?? 1
  const scaleMax   = ctx.scale_max ?? 5
  const scaleCount = ctx.questions.filter((q) => q.response_type === 'scale').length
  const estimatedMin = Math.max(1, Math.round(scaleCount * 0.5))

  return (
    <Shell branding={branding}>
      {/* Cabeçalho */}
      <div className="mb-6">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
          {ctx.cycle_name}
        </p>
        <h1 className="text-xl font-semibold text-gray-900">
          Avaliação de {ctx.evaluated_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {ctx.questionnaire_name} · {labelRelationship(ctx.relationship_code)}
        </p>
        {estimatedMin > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            ~{estimatedMin}–{estimatedMin * 2} min para completar
          </p>
        )}
      </div>

      {/* Aviso de confidencialidade */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 text-sm text-blue-700">
        <p className="font-medium mb-1">Suas respostas são confidenciais</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          As respostas são consolidadas e apresentadas de forma agregada. Sua identidade não é revelada individualmente.
          Responda com honestidade — o objetivo é contribuir para o desenvolvimento profissional.
        </p>
      </div>

      {/* Formulário */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {ctx.questions.map((q, idx) => (
          <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-900">
              <span className="text-gray-400 mr-2">{idx + 1}.</span>
              {q.prompt}
            </p>

            {q.response_type === 'scale' && (
              <>
                <ScaleInput
                  min={scaleMin}
                  max={scaleMax}
                  value={scores[q.id] ?? null}
                  primaryColor={branding.primaryColor}
                  onChange={(v) => setScores((prev) => ({ ...prev, [q.id]: v }))}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
                  <span>{scaleMin} — Discordo totalmente</span>
                  <span>Concordo totalmente — {scaleMax}</span>
                </div>
              </>
            )}

            {q.response_type === 'text' && (
              <textarea
                className="mt-3 w-full rounded-lg border border-gray-300 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                rows={3}
                placeholder="Sua resposta..."
                value={textAnswers[q.id] ?? ''}
                onChange={(e) =>
                  setTextAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
              />
            )}

            {/* Comentário opcional por pergunta */}
            <div className="mt-3">
              <label className="text-xs text-gray-400 block mb-1">
                Comentário opcional
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-200 text-sm px-3 py-2 resize-none text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
                rows={2}
                placeholder="Adicione contexto se desejar..."
                value={comments[q.id] ?? ''}
                onChange={(e) =>
                  setComments((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
              />
            </div>
          </div>
        ))}

        {/* Comentário geral */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-900 mb-3">
            Comentário geral <span className="text-gray-400 font-normal">(opcional)</span>
          </p>
          <textarea
            className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            rows={4}
            placeholder="Observações finais sobre a avaliação..."
            value={globalComment}
            onChange={(e) => setGlobalComment(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={state === 'submitting'}
          style={{ backgroundColor: branding.primaryColor }}
          className="w-full text-white py-3 rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {state === 'submitting' ? 'Enviando...' : 'Enviar respostas'}
        </button>
      </form>
    </Shell>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelRelationship(code: string): string {
  const map: Record<string, string> = {
    self:        'Autoavaliação',
    manager:     'Avaliação do gestor',
    peer:        'Avaliação de par',
    subordinate: 'Avaliação de subordinado',
    client:      'Avaliação de cliente',
  }
  return map[code] ?? code
}

function friendlyError(msg: string): string {
  if (msg.includes('P0001') || msg.includes('invalid_token'))   return 'Link inválido ou não encontrado.'
  if (msg.includes('P0002') || msg.includes('already_used'))    return 'Este link já foi utilizado.'
  if (msg.includes('P0003') || msg.includes('status_invalid'))  return 'Este assignment não está disponível.'
  if (msg.includes('P0004') || msg.includes('expired'))         return 'Este link expirou.'
  return msg
}

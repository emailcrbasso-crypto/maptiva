import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id:              string
  prompt:          string
  response_type:   'scale' | 'text' | 'boolean'
  order_index:     number
  scale_min?:      number
  scale_max?:      number
  competency_id:   string | null
  competency_name: string | null
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

// ─── Competency palette ───────────────────────────────────────────────────────

const COMP_COLORS = [
  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  dot: 'bg-violet-400'  },
  { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     dot: 'bg-sky-400'     },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    dot: 'bg-rose-400'    },
  { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    dot: 'bg-cyan-400'    },
  { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  dot: 'bg-indigo-400'  },
  { bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    dot: 'bg-teal-400'    },
]

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  answered,
  total,
  primaryColor,
}: {
  answered: number
  total:    number
  primaryColor: string
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500 font-medium">
            {answered} de {total} respondida{total !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-semibold" style={{ color: pct === 100 ? '#16a34a' : '#6b7280' }}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width:           `${pct}%`,
              backgroundColor: pct === 100 ? '#16a34a' : primaryColor,
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Scale input ──────────────────────────────────────────────────────────────

function ScaleInput({
  min,
  max,
  value,
  primaryColor,
  onChange,
}: {
  min:          number
  max:          number
  value:        number | null
  primaryColor: string
  onChange:     (v: number) => void
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => i + min)
  const labels: Record<number, string> = {
    [min]: 'Discordo\ntotalmente',
    [max]: 'Concordo\ntotalmente',
  }
  // For 5-point scales add midpoint label
  const mid = Math.round((min + max) / 2)
  if (max - min >= 4) labels[mid] = 'Neutro'

  return (
    <div className="mt-4">
      {/* Buttons row */}
      <div className="flex gap-2 justify-between">
        {steps.map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              style={
                selected
                  ? { backgroundColor: primaryColor, borderColor: primaryColor, color: '#fff' }
                  : undefined
              }
              className={`flex-1 h-12 rounded-xl border-2 text-base font-semibold transition-all duration-150 ${
                selected
                  ? 'shadow-md scale-105'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:scale-105'
              }`}
            >
              {n}
            </button>
          )
        })}
      </div>
      {/* Anchor labels */}
      <div className="flex justify-between mt-2 px-0.5">
        <span className="text-xs text-gray-400 max-w-[80px] leading-tight">{min} — Discordo totalmente</span>
        <span className="text-xs text-gray-400 max-w-[80px] text-right leading-tight">Concordo totalmente — {max}</span>
      </div>
    </div>
  )
}

// ─── Collapsible comment ──────────────────────────────────────────────────────

function CollapsibleComment({
  value,
  onChange,
}: {
  value:    string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hasText = value.trim().length > 0

  return (
    <div className="mt-4">
      {!open && !hasText ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Adicionar contexto
        </button>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400 font-medium">Comentário opcional</label>
            {open && !hasText && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
              >
                ✕ Fechar
              </button>
            )}
          </div>
          <textarea
            autoFocus={open && !hasText}
            className="w-full rounded-xl border border-gray-200 text-sm px-3 py-2 resize-none text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-shadow"
            rows={2}
            placeholder="Adicione contexto se desejar..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  number,
  scaleMin,
  scaleMax,
  score,
  textAnswer,
  comment,
  primaryColor,
  onScore,
  onText,
  onComment,
}: {
  question:     Question
  number:       number
  scaleMin:     number
  scaleMax:     number
  score:        number | null
  textAnswer:   string
  comment:      string
  primaryColor: string
  onScore:      (v: number) => void
  onText:       (v: string) => void
  onComment:    (v: string) => void
}) {
  const answered =
    question.response_type === 'scale'
      ? score != null
      : question.response_type === 'text'
      ? textAnswer.trim().length > 0
      : false

  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
        answered ? 'border-green-200' : 'border-amber-200'
      }`}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${answered ? 'bg-green-400' : 'bg-amber-300'}`} />

      <div className="p-5">
        {/* Question prompt */}
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
              answered ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
            }`}
          >
            {answered ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              number
            )}
          </span>
          <p className="text-sm font-medium text-gray-800 leading-relaxed flex-1">{question.prompt}</p>
        </div>

        {/* Scale input */}
        {question.response_type === 'scale' && (
          <ScaleInput
            min={scaleMin}
            max={scaleMax}
            value={score}
            primaryColor={primaryColor}
            onChange={onScore}
          />
        )}

        {/* Text input */}
        {question.response_type === 'text' && (
          <textarea
            className="mt-4 w-full rounded-xl border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-200 transition-shadow"
            rows={3}
            placeholder="Sua resposta..."
            value={textAnswer}
            onChange={(e) => onText(e.target.value)}
          />
        )}

        {/* Collapsible comment */}
        <CollapsibleComment value={comment} onChange={onComment} />
      </div>
    </div>
  )
}

// ─── Competency section ───────────────────────────────────────────────────────

function CompetencySection({
  name,
  colorIdx,
  children,
}: {
  name:     string | null
  colorIdx: number
  children: React.ReactNode
}) {
  const c = COMP_COLORS[colorIdx % COMP_COLORS.length]

  if (!name) {
    return <>{children}</>
  }

  return (
    <div>
      <div className={`flex items-center gap-2 px-1 mb-3`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{name}</span>
        <div className={`flex-1 h-px ${c.bg} border-t ${c.border}`} />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function Shell({
  branding = DEFAULT_BRANDING,
  showProgress = false,
  progressAnswered = 0,
  progressTotal = 0,
  children,
}: {
  branding?:         ShellBranding
  showProgress?:     boolean
  progressAnswered?: number
  progressTotal?:    number
  children:          React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="h-7 w-auto object-contain"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-900">{branding.name}</span>
          )}
          {!branding.hideMaptiva && branding.name !== 'Maptiva' && (
            <a
              href="https://maptiva.com.br"
              className="text-xs text-gray-300 hover:text-gray-400 transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              Powered by Maptiva
            </a>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {showProgress && (
        <ProgressBar
          answered={progressAnswered}
          total={progressTotal}
          primaryColor={branding.primaryColor}
        />
      )}

      <div className="max-w-xl mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RespondPage() {
  const { token } = useParams<{ token: string }>()

  const [state,    setState]    = useState<PageState>('loading')
  const [ctx,      setCtx]      = useState<AssignmentContext | null>(null)
  const [branding, setBranding] = useState<ShellBranding>(DEFAULT_BRANDING)
  const [errorMsg, setErrorMsg] = useState('')

  const [scores,        setScores]        = useState<Record<string, number | null>>({})
  const [textAnswers,   setTextAnswers]   = useState<Record<string, string>>({})
  const [comments,      setComments]      = useState<Record<string, string>>({})
  const [globalComment, setGlobalComment] = useState('')

  // validation: show which questions were left unanswered on submit attempt
  const [showValidation, setShowValidation] = useState(false)
  const firstUnansweredRef = useRef<HTMLDivElement | null>(null)

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

          if (context.tenant_name) {
            const b: ShellBranding = {
              name:         context.tenant_name,
              logoUrl:      context.tenant_logo_url ?? null,
              primaryColor: context.tenant_primary_color ?? '#111827',
              hideMaptiva:  context.tenant_hide_maptiva ?? false,
            }
            setBranding(b)
            document.documentElement.style.setProperty('--color-respond-primary', b.primaryColor)
          }

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

    const unanswered = ctx.questions.filter(
      (q) => q.response_type === 'scale' && scores[q.id] == null,
    )
    if (unanswered.length > 0) {
      setShowValidation(true)
      // scroll to first unanswered card
      setTimeout(() => {
        firstUnansweredRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      return
    }

    setState('submitting')

    const answers = ctx.questions.map((q) => {
      if (q.response_type === 'scale') {
        return { question_id: q.id, score: scores[q.id], text_answer: null }
      }
      return { question_id: q.id, score: null, text_answer: textAnswers[q.id] ?? '' }
    })

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

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <Shell branding={branding}>
        <div className="text-center py-20">
          <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-400">Carregando questionário...</p>
        </div>
      </Shell>
    )
  }

  // ─── Error ───────────────────────────────────────────────────────────────────

  if (state === 'error') {
    const isExpired = errorMsg.includes('expirou')
    const isUsed    = errorMsg.includes('já foi utilizado')

    return (
      <Shell branding={branding}>
        <div className="text-center py-16">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isUsed ? 'bg-green-100' : 'bg-red-50'
          }`}>
            <span className="text-3xl">{isExpired ? '⏱' : isUsed ? '✓' : '⚠️'}</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            {isExpired
              ? 'Link expirado'
              : isUsed
              ? 'Avaliação já concluída'
              : 'Não foi possível carregar o questionário'}
          </h1>
          <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
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

  // ─── Done ────────────────────────────────────────────────────────────────────

  if (state === 'done') {
    return (
      <Shell branding={branding}>
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-3">Respostas enviadas!</h1>
          <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
            Obrigado por participar. Suas respostas foram registradas e contribuirão para o processo de desenvolvimento.
          </p>
          <p className="text-xs text-gray-400 mt-6">Você já pode fechar esta página.</p>
        </div>
      </Shell>
    )
  }

  if (!ctx) return null

  // ─── Ready ───────────────────────────────────────────────────────────────────

  const scaleMin    = ctx.scale_min ?? 1
  const scaleMax    = ctx.scale_max ?? 5
  const scaleQs     = ctx.questions.filter((q) => q.response_type === 'scale')
  const answeredCnt = scaleQs.filter((q) => scores[q.id] != null).length
  const totalCnt    = scaleQs.length

  // Group questions by competency
  // null competency_id → one unnamed group at the end
  const compOrder: string[] = []
  const compGroups: Map<string, Question[]> = new Map()
  for (const q of ctx.questions) {
    const key = q.competency_id ?? '__none__'
    if (!compGroups.has(key)) {
      compGroups.set(key, [])
      compOrder.push(key)
    }
    compGroups.get(key)!.push(q)
  }

  // Build a color index map per competency key
  const compColorMap = new Map<string, number>()
  compOrder.forEach((key, i) => { if (key !== '__none__') compColorMap.set(key, i) })

  // question number counter (flat, across all groups)
  let globalIdx = 0

  const estimatedMin = Math.max(1, Math.round(totalCnt * 0.5))

  return (
    <Shell
      branding={branding}
      showProgress={totalCnt > 0}
      progressAnswered={answeredCnt}
      progressTotal={totalCnt}
    >
      {/* ── Hero header ── */}
      <div className="mb-8">
        <div
          className="rounded-2xl p-6 mb-4"
          style={{ background: `linear-gradient(135deg, ${branding.primaryColor}18, ${branding.primaryColor}08)` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: branding.primaryColor }}>
            {ctx.cycle_name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Avaliação de <span style={{ color: branding.primaryColor }}>{ctx.evaluated_name}</span>
          </h1>
          <p className="text-sm text-gray-500">
            {ctx.questionnaire_name} · {labelRelationship(ctx.relationship_code)}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {totalCnt} pergunta{totalCnt !== 1 ? 's' : ''}
            </span>
            <span className="text-gray-200">·</span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ~{estimatedMin}–{estimatedMin * 2} min
            </span>
          </div>
        </div>

        {/* Confidentiality notice */}
        <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-blue-700">Suas respostas são confidenciais</p>
            <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
              As respostas são consolidadas de forma agregada. Sua identidade não é revelada individualmente.
            </p>
          </div>
        </div>
      </div>

      {/* ── Validation banner ── */}
      {showValidation && answeredCnt < totalCnt && (
        <div className="mb-6 flex gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-700 font-medium">
            {totalCnt - answeredCnt} pergunta{totalCnt - answeredCnt !== 1 ? 's' : ''} ainda não respondida{totalCnt - answeredCnt !== 1 ? 's' : ''}. Role a página para encontrá-las.
          </p>
        </div>
      )}

      {/* ── Questions form ── */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {compOrder.map((key) => {
          const questions = compGroups.get(key)!
          const firstQ    = questions[0]
          const compName  = key === '__none__' ? null : (firstQ.competency_name ?? null)
          const colorIdx  = key === '__none__' ? COMP_COLORS.length - 1 : (compColorMap.get(key) ?? 0)

          return (
            <CompetencySection key={key} name={compName} colorIdx={colorIdx}>
              {questions.map((q) => {
                globalIdx++
                const num     = globalIdx
                const isUnanswered = showValidation && q.response_type === 'scale' && scores[q.id] == null

                return (
                  <div
                    key={q.id}
                    ref={isUnanswered && firstUnansweredRef.current === null ? (el) => { firstUnansweredRef.current = el } : undefined}
                  >
                    <QuestionCard
                      question={q}
                      number={num}
                      scaleMin={scaleMin}
                      scaleMax={scaleMax}
                      score={scores[q.id] ?? null}
                      textAnswer={textAnswers[q.id] ?? ''}
                      comment={comments[q.id] ?? ''}
                      primaryColor={branding.primaryColor}
                      onScore={(v) => {
                        setScores((prev) => ({ ...prev, [q.id]: v }))
                        setShowValidation(false)
                      }}
                      onText={(v) => setTextAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      onComment={(v) => setComments((prev) => ({ ...prev, [q.id]: v }))}
                    />
                  </div>
                )
              })}
            </CompetencySection>
          )
        })}

        {/* ── Global comment ── */}
        <div className="bg-white rounded-2xl border-2 border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-medium text-gray-800">
              Comentário geral <span className="text-gray-400 font-normal text-xs">(opcional)</span>
            </p>
          </div>
          <textarea
            className="w-full rounded-xl border border-gray-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-200 transition-shadow"
            rows={4}
            placeholder="Observações finais sobre a avaliação..."
            value={globalComment}
            onChange={(e) => setGlobalComment(e.target.value)}
          />
        </div>

        {/* ── Sticky submit ── */}
        <div className="sticky bottom-4 z-20 mt-8">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-lg p-3 flex items-center gap-3">
            <div className="flex-1 text-xs text-gray-400">
              {answeredCnt === totalCnt ? (
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Todas respondidas — pronto para enviar
                </span>
              ) : (
                <span>{totalCnt - answeredCnt} pendente{totalCnt - answeredCnt !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button
              type="submit"
              disabled={state === 'submitting'}
              style={{ backgroundColor: branding.primaryColor }}
              className="px-6 py-2.5 text-white rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
            >
              {state === 'submitting' ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </span>
              ) : (
                'Enviar respostas'
              )}
            </button>
          </div>
        </div>
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

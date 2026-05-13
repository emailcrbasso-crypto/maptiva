import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { SCALE_OPTIONS, getScale, hasMixedRanges, type ScaleDefinition } from '@/lib/scales'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateInfo {
  id: string; name: string; method_code: string
  scale_id: string; scale_min: number; scale_max: number
  allow_na: boolean; n_minimum_default: number
  status: string; tenant_id: string
}

interface Question {
  id: string; prompt: string; response_type: string
  order_index: number; competency_id: string | null
  scale_id: string | null
}

interface Questionnaire {
  id: string; name: string
  relationship_code: string | null; questions: Question[]
}

interface Competency {
  id: string; name: string; order_index: number
  scale_id: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  '180': '180°', '360': '360°', custom: 'Personalizado',
}

const REL_LABEL: Record<string, string> = {
  self: 'Autoavaliação', manager: 'Gestor', peer: 'Par',
  subordinate: 'Subordinado', client: 'Cliente',
}

// Color palette for competency group headers — cycles through if > 8 competencies
const COMP_PALETTE = [
  { dot: 'bg-blue-400',   label: 'text-blue-700',   header: 'bg-blue-50 border-blue-100'   },
  { dot: 'bg-purple-400', label: 'text-purple-700',  header: 'bg-purple-50 border-purple-100' },
  { dot: 'bg-amber-400',  label: 'text-amber-700',   header: 'bg-amber-50 border-amber-100'  },
  { dot: 'bg-green-400',  label: 'text-green-700',   header: 'bg-green-50 border-green-100'  },
  { dot: 'bg-rose-400',   label: 'text-rose-700',    header: 'bg-rose-50 border-rose-100'    },
  { dot: 'bg-teal-400',   label: 'text-teal-700',    header: 'bg-teal-50 border-teal-100'    },
  { dot: 'bg-orange-400', label: 'text-orange-700',  header: 'bg-orange-50 border-orange-100'},
  { dot: 'bg-indigo-400', label: 'text-indigo-700',  header: 'bg-indigo-50 border-indigo-100'},
]

// ─── Pencil icon ──────────────────────────────────────────────────────────────

function PencilIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
    </svg>
  )
}

// ─── Question row (view + inline edit) ───────────────────────────────────────

function ScaleChip({
  scale, isOverride,
}: {
  scale: ScaleDefinition; isOverride: boolean
}) {
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
      isOverride
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-gray-50 border-gray-200 text-gray-400'
    }`} title={scale.description}>
      {scale.name}
    </span>
  )
}

function QuestionRow({
  question, index, competencies, questionnaireId, templateScaleId,
  onEdited, onRemoved,
}: {
  question: Question
  index: number
  competencies: Competency[]
  questionnaireId: string
  templateScaleId: string
  onEdited: () => void
  onRemoved: (questionnaireId: string, questionId: string) => void
}) {
  const [editing,      setEditing]      = useState(false)
  const [prompt,       setPrompt]       = useState(question.prompt)
  const [responseType, setResponseType] = useState(question.response_type)
  const [competencyId, setCompetencyId] = useState(question.competency_id ?? '')
  const [qScaleId,     setQScaleId]     = useState(question.scale_id ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  function startEdit() {
    setPrompt(question.prompt)
    setResponseType(question.response_type)
    setCompetencyId(question.competency_id ?? '')
    setQScaleId(question.scale_id ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    if (!prompt.trim()) return
    setSaving(true)
    const { error: err } = await supabase
      .from('questions')
      .update({
        prompt:        prompt.trim(),
        response_type: responseType,
        competency_id: competencyId || null,
        scale_id:      qScaleId || null,
      })
      .eq('id', question.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    setEditing(false)
    onEdited()
  }

  // Effective scale for display
  const comp        = competencies.find((c) => c.id === question.competency_id)
  const effectiveId = question.scale_id ?? comp?.scale_id ?? templateScaleId
  const effectScale = getScale(effectiveId)
  const isOverride  = !!question.scale_id

  if (editing) {
    return (
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-400 font-mono mb-1">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span className="text-gray-300">·</span>
          <span>Editando pergunta</span>
        </div>
        <textarea
          autoFocus
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex gap-3 flex-wrap">
          <select
            value={responseType}
            onChange={(e) => setResponseType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          >
            <option value="scale">Escala</option>
            <option value="text">Texto aberto</option>
          </select>
          {responseType === 'scale' && (
            <select
              value={qScaleId}
              onChange={(e) => setQScaleId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
              title="Sobrescrever escala para esta pergunta"
            >
              <option value="">Escala padrão ({getScale(templateScaleId).name})</option>
              {SCALE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            value={competencyId}
            onChange={(e) => setCompetencyId(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          >
            <option value="">Sem competência</option>
            {competencies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !prompt.trim()}
            className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group px-5 py-3 flex items-start justify-between gap-3 hover:bg-gray-50/60 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="text-xs text-gray-300 font-mono mt-0.5 shrink-0 w-5 text-right">
          {String(index + 1).padStart(2, '0')}
        </span>
        <p className="text-sm text-gray-800 leading-snug flex-1">{question.prompt}</p>
        {question.response_type === 'scale' && (
          <ScaleChip scale={effectScale} isOverride={isOverride} />
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={startEdit}
          className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
          title="Editar pergunta"
        >
          <PencilIcon />
        </button>
        <button
          onClick={() => onRemoved(questionnaireId, question.id)}
          className="text-gray-300 hover:text-red-400 p-1 rounded hover:bg-red-50 transition-colors"
          title="Remover pergunta"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Competency sidebar row ───────────────────────────────────────────────────

function CompetencyRow({
  competency, palette, questionCount, onRenamed,
}: {
  competency: Competency
  palette: typeof COMP_PALETTE[0]
  questionCount: number
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,    setName]    = useState(competency.name)
  const [saving,  setSaving]  = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('competencies')
      .update({ name: name.trim() })
      .eq('id', competency.id)
    if (!error) { setEditing(false); onRenamed() }
    setSaving(false)
  }

  if (editing) {
    return (
      <div className="px-3 py-2.5 space-y-2 bg-gray-50 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setEditing(false); setName(competency.name) }}
            className="text-xs text-gray-500 px-2 py-1 hover:text-gray-700">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">
            {saving ? '...' : 'Salvar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group px-3 py-2.5 flex items-center gap-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <span className={`w-2 h-2 rounded-full shrink-0 ${palette.dot}`} />
      <span className="text-sm text-gray-800 flex-1 leading-snug">{competency.name}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <span className="text-xs text-gray-300">{questionCount}</span>
        <button
          onClick={() => { setName(competency.name); setEditing(true) }}
          className="text-gray-400 hover:text-gray-700 p-0.5 rounded transition-colors"
          title="Renomear competência"
        >
          <PencilIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [template,       setTemplate]       = useState<TemplateInfo | null>(null)
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [competencies,   setCompetencies]   = useState<Competency[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)

  // N-mínimo inline edit
  const [editingNMin, setEditingNMin] = useState(false)
  const [nMinValue,   setNMinValue]   = useState(0)
  const [savingNMin,  setSavingNMin]  = useState(false)

  // Template scale inline edit
  const [editingScale, setEditingScale] = useState(false)
  const [scaleValue,   setScaleValue]   = useState('')
  const [savingScale,  setSavingScale]  = useState(false)

  // Add questionnaire modal
  const [showAddQuestionnaire, setShowAddQuestionnaire] = useState(false)
  const [newQuestName,         setNewQuestName]         = useState('')
  const [newQuestRel,          setNewQuestRel]          = useState('')
  const [savingQuest,          setSavingQuest]          = useState(false)

  // Questionnaire rename/delete
  const [editingQuestId,  setEditingQuestId]  = useState<string | null>(null)
  const [editQuestName,   setEditQuestName]   = useState('')
  const [editQuestRel,    setEditQuestRel]    = useState('')
  const [savingQuestEdit, setSavingQuestEdit] = useState(false)

  // Add question inline form
  const [addingToQuest,   setAddingToQuest]   = useState<string | null>(null)
  const [newPrompt,       setNewPrompt]       = useState('')
  const [newResponseType, setNewResponseType] = useState('scale')
  const [newCompetencyId, setNewCompetencyId] = useState('')
  const [newScaleId,      setNewScaleId]      = useState('')
  const [savingQuestion,  setSavingQuestion]  = useState(false)

  // Add competency inline form
  const [showAddCompetency, setShowAddCompetency] = useState(false)
  const [newCompName,       setNewCompName]       = useState('')
  const [savingComp,        setSavingComp]        = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!id) return
    setLoading(true)

    const [tmplRes, questRes, compRes] = await Promise.all([
      supabase.from('templates').select('*').eq('id', id).single(),
      supabase.from('questionnaires').select('id, name, relationship_code').eq('template_id', id).order('name'),
      supabase.from('competencies').select('id, name, order_index, scale_id').eq('template_id', id).order('order_index'),
    ])

    if (tmplRes.error) { setError(tmplRes.error.message); setLoading(false); return }
    setTemplate(tmplRes.data as TemplateInfo)
    setCompetencies((compRes.data as Competency[]) ?? [])

    const rawQuests = (questRes.data ?? []) as Array<{ id: string; name: string; relationship_code: string | null }>

    const questsWithQuestions: Questionnaire[] = await Promise.all(
      rawQuests.map(async (q) => {
        const { data: qqData } = await supabase
          .from('questionnaire_questions')
          .select('order_index, questions(id, prompt, response_type, order_index, competency_id, scale_id)')
          .eq('questionnaire_id', q.id)
          .order('order_index')
        const questions: Question[] = ((qqData ?? []) as Array<{
          order_index: number; questions: Question | Question[]
        }>).map((row) => {
          const q = Array.isArray(row.questions) ? row.questions[0] : row.questions
          return { ...q, order_index: row.order_index }
        })
        return { ...q, questions }
      })
    )

    setQuestionnaires(questsWithQuestions)
    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveNMin() {
    if (!template) return
    const val = Number(nMinValue)
    if (!Number.isInteger(val) || val < 1) return
    setSavingNMin(true)
    const { error: err } = await supabase
      .from('templates')
      .update({ n_minimum_default: val })
      .eq('id', template.id)
    if (err) { alert(err.message); setSavingNMin(false); return }
    setSavingNMin(false)
    setEditingNMin(false)
    await loadAll()
  }

  async function handleSaveScale() {
    if (!template || !scaleValue) return
    const scale = getScale(scaleValue)
    setSavingScale(true)
    const { error: err } = await supabase
      .from('templates')
      .update({ scale_id: scale.id, scale_min: scale.min, scale_max: scale.max })
      .eq('id', template.id)
    if (err) { alert(err.message); setSavingScale(false); return }
    setSavingScale(false)
    setEditingScale(false)
    await loadAll()
  }

  async function handleRenameQuestionnaire() {
    if (!editingQuestId || !editQuestName.trim()) return
    setSavingQuestEdit(true)
    const { error: err } = await supabase
      .from('questionnaires')
      .update({ name: editQuestName.trim(), relationship_code: editQuestRel || null })
      .eq('id', editingQuestId)
    if (err) { alert(err.message); setSavingQuestEdit(false); return }
    setSavingQuestEdit(false)
    setEditingQuestId(null)
    await loadAll()
  }

  async function handleDeleteQuestionnaire(questId: string, questName: string) {
    if (!confirm(`Excluir o questionário "${questName}"? As perguntas serão removidas junto.`)) return
    const { error: err } = await supabase
      .from('questionnaires')
      .delete()
      .eq('id', questId)
    if (err) { alert(err.message); return }
    await loadAll()
  }

  async function handleAddQuestionnaire() {
    if (!template || !newQuestName.trim()) return
    setSavingQuest(true)
    const { error: err } = await supabase.from('questionnaires').insert({
      tenant_id: template.tenant_id, template_id: template.id,
      name: newQuestName.trim(), relationship_code: newQuestRel || null,
    })
    if (err) { alert(err.message); setSavingQuest(false); return }
    setNewQuestName(''); setNewQuestRel('')
    setShowAddQuestionnaire(false); setSavingQuest(false)
    await loadAll()
  }

  async function handleAddQuestion(questionnaireId: string) {
    if (!template || !newPrompt.trim()) return
    setSavingQuestion(true)

    const { data: qData, error: qErr } = await supabase
      .from('questions')
      .insert({
        tenant_id:     template.tenant_id,
        template_id:   template.id,
        prompt:        newPrompt.trim(),
        response_type: newResponseType,
        competency_id: newCompetencyId || null,
        scale_id:      (newResponseType === 'scale' && newScaleId) ? newScaleId : null,
      })
      .select('id').single()

    if (qErr) { alert(qErr.message); setSavingQuestion(false); return }

    const quest = questionnaires.find((q) => q.id === questionnaireId)
    const nextOrder = (quest?.questions.length ?? 0) + 1

    const { error: qqErr } = await supabase.from('questionnaire_questions').insert({
      questionnaire_id: questionnaireId, question_id: qData.id, order_index: nextOrder,
    })

    if (qqErr) { alert(qqErr.message); setSavingQuestion(false); return }

    setNewPrompt(''); setNewResponseType('scale'); setNewCompetencyId(''); setNewScaleId('')
    setAddingToQuest(null); setSavingQuestion(false)
    await loadAll()
  }

  async function handleRemoveQuestion(questionnaireId: string, questionId: string) {
    if (!confirm('Remover esta pergunta do questionário?')) return
    await supabase.from('questionnaire_questions')
      .delete().eq('questionnaire_id', questionnaireId).eq('question_id', questionId)
    await loadAll()
  }

  async function handleAddCompetency() {
    if (!template || !newCompName.trim()) return
    setSavingComp(true)
    const { error: err } = await supabase.from('competencies').insert({
      tenant_id: template.tenant_id, template_id: template.id,
      name: newCompName.trim(), order_index: competencies.length + 1,
    })
    if (err) { alert(err.message); setSavingComp(false); return }
    setNewCompName(''); setShowAddCompetency(false); setSavingComp(false)
    await loadAll()
  }

  // ── Question count per competency (for sidebar badges) ───────────────────

  function questionsForCompetency(compId: string): number {
    return questionnaires.flatMap((q) => q.questions).filter((q) => q.competency_id === compId).length
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-gray-400 text-sm">Carregando...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>
  if (!template) return null

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/templates" className="text-sm text-gray-400 hover:text-gray-600">← Templates</Link>
        <div className="mt-2">
          <h1 className="text-xl font-semibold text-gray-900">{template.name}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-sm text-gray-400">
              {METHOD_LABEL[template.method_code] ?? template.method_code}
              {' · '}
            </p>
            {/* Escala do template — inline edit */}
            {editingScale ? (
              <span className="flex items-center gap-1">
                <select
                  autoFocus
                  value={scaleValue}
                  onChange={(e) => setScaleValue(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-0.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {SCALE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleSaveScale}
                  disabled={savingScale || !scaleValue}
                  className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {savingScale ? '…' : 'Salvar'}
                </button>
                <button
                  onClick={() => setEditingScale(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                onClick={() => { setScaleValue(template.scale_id ?? 'likert_5'); setEditingScale(true) }}
                className="group flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
                title="Alterar escala padrão"
              >
                Escala: <strong className="text-gray-600">{getScale(template.scale_id).name}</strong>
                <PencilIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <span className="text-gray-400 text-sm">·</span>
            {editingNMin ? (
              <span className="flex items-center gap-1">
                <span className="text-sm text-gray-400">N mínimo:</span>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={20}
                  value={nMinValue}
                  onChange={(e) => setNMinValue(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveNMin()
                    if (e.key === 'Escape') setEditingNMin(false)
                  }}
                  className="w-14 border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <button
                  onClick={handleSaveNMin}
                  disabled={savingNMin}
                  className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {savingNMin ? '…' : 'Salvar'}
                </button>
                <button
                  onClick={() => setEditingNMin(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-1"
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <button
                onClick={() => { setNMinValue(template.n_minimum_default); setEditingNMin(true) }}
                className="group flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
                title="Editar N mínimo"
              >
                N mínimo: <strong className="text-gray-600">{template.n_minimum_default}</strong>
                <PencilIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Questionnaires (2/3) ── */}
        <div className="col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Questionários</h2>
            <button
              onClick={() => setShowAddQuestionnaire(true)}
              className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
            >
              + Novo questionário
            </button>
          </div>

          {questionnaires.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">Nenhum questionário criado.</p>
              <button onClick={() => setShowAddQuestionnaire(true)} className="text-sm text-gray-600 underline mt-2">
                Criar questionário
              </button>
            </div>
          )}

          {questionnaires.map((quest) => {
            // Mixed-range warning: detect if scale questions have different min/max
            const scaleQuestionIds = quest.questions
              .filter((q) => q.response_type === 'scale')
              .map((q) => {
                const comp = competencies.find((c) => c.id === q.competency_id)
                return q.scale_id ?? comp?.scale_id ?? (template.scale_id ?? 'likert_5')
              })
            const hasMixed = hasMixedRanges(scaleQuestionIds)

            // Group questions by competency
            const groups = competencies
              .map((c, i) => ({
                competency: c,
                palette: COMP_PALETTE[i % COMP_PALETTE.length],
                questions: quest.questions.filter((q) => q.competency_id === c.id),
              }))
              .filter((g) => g.questions.length > 0)

            const ungrouped = quest.questions.filter((q) => !q.competency_id)

            // Global index offset for sequential numbering across groups
            let globalIdx = 0

            return (
              <div key={quest.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Mixed-range warning */}
                {hasMixed && (
                  <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span><strong>Ranges mistos detectados:</strong> este questionário tem perguntas com escalas de ranges diferentes (ex: 1–5 e 1–4). Isso bloqueará o envio das respostas.</span>
                  </div>
                )}
                {/* Questionnaire header */}
                {editingQuestId === quest.id ? (
                  /* ── Inline rename form ── */
                  <div className="px-5 py-3.5 border-b border-gray-100 space-y-3">
                    <div className="flex gap-3">
                      <input
                        autoFocus
                        type="text"
                        value={editQuestName}
                        onChange={(e) => setEditQuestName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameQuestionnaire()
                          if (e.key === 'Escape') setEditingQuestId(null)
                        }}
                        placeholder="Nome do questionário"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <select
                        value={editQuestRel}
                        onChange={(e) => setEditQuestRel(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none"
                      >
                        <option value="">Todas as relações</option>
                        <option value="self">Autoavaliação</option>
                        <option value="manager">Gestor</option>
                        <option value="peer">Par</option>
                        <option value="subordinate">Subordinado</option>
                        <option value="client">Cliente</option>
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingQuestId(null)}
                        className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleRenameQuestionnaire}
                        disabled={savingQuestEdit || !editQuestName.trim()}
                        className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                      >
                        {savingQuestEdit ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{quest.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {quest.relationship_code
                          ? (REL_LABEL[quest.relationship_code] ?? quest.relationship_code)
                          : 'Todas as relações'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {quest.questions.length} pergunta{quest.questions.length !== 1 ? 's' : ''}
                      </span>
                      {/* Edit / delete icons — visible on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingQuestId(quest.id)
                            setEditQuestName(quest.name)
                            setEditQuestRel(quest.relationship_code ?? '')
                          }}
                          className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
                          title="Renomear questionário"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={() => handleDeleteQuestionnaire(quest.id, quest.name)}
                          className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Excluir questionário"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grouped questions */}
                {groups.map(({ competency, palette, questions }) => {
                  const startIdx = globalIdx
                  globalIdx += questions.length
                  return (
                    <div key={competency.id}>
                      {/* Competency group header */}
                      <div className={`px-5 py-2 flex items-center gap-2 border-b ${palette.header}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${palette.dot}`} />
                        <span className={`text-xs font-semibold ${palette.label}`}>{competency.name}</span>
                        <span className={`text-xs ml-auto ${palette.label} opacity-60`}>
                          {questions.length} pergunta{questions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {/* Questions in this group */}
                      <div className="divide-y divide-gray-50">
                        {questions.map((q, i) => (
                          <QuestionRow
                            key={q.id}
                            question={q}
                            index={startIdx + i}
                            competencies={competencies}
                            questionnaireId={quest.id}
                            templateScaleId={template.scale_id ?? 'likert_5'}
                            onEdited={loadAll}
                            onRemoved={handleRemoveQuestion}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}

                {/* Ungrouped questions */}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="px-5 py-2 flex items-center gap-2 border-b bg-gray-50 border-gray-100">
                      <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
                      <span className="text-xs font-semibold text-gray-400">Sem competência</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {ungrouped.map((q, i) => {
                        const idx = globalIdx + i
                        return (
                          <QuestionRow
                            key={q.id}
                            question={q}
                            index={idx}
                            competencies={competencies}
                            questionnaireId={quest.id}
                            templateScaleId={template.scale_id ?? 'likert_5'}
                            onEdited={loadAll}
                            onRemoved={handleRemoveQuestion}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {quest.questions.length === 0 && (
                  <div className="px-5 py-6 text-center">
                    <p className="text-sm text-gray-400">Nenhuma pergunta ainda.</p>
                  </div>
                )}

                {/* Add question */}
                {addingToQuest === quest.id ? (
                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                    <textarea
                      autoFocus rows={2} value={newPrompt}
                      onChange={(e) => setNewPrompt(e.target.value)}
                      placeholder="Enunciado da pergunta..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <div className="flex gap-3 flex-wrap">
                      <select value={newResponseType} onChange={(e) => { setNewResponseType(e.target.value); setNewScaleId('') }}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
                        <option value="scale">Escala</option>
                        <option value="text">Texto aberto</option>
                      </select>
                      {newResponseType === 'scale' && (
                        <select value={newScaleId} onChange={(e) => setNewScaleId(e.target.value)}
                          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
                          title="Sobrescrever escala para esta pergunta">
                          <option value="">Escala padrão ({getScale(template.scale_id ?? 'likert_5').name})</option>
                          {SCALE_OPTIONS.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      <select value={newCompetencyId} onChange={(e) => setNewCompetencyId(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
                        <option value="">Sem competência</option>
                        {competencies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingToQuest(null); setNewPrompt(''); setNewScaleId('') }}
                        className="text-sm text-gray-500 px-3 py-1.5 hover:text-gray-700">
                        Cancelar
                      </button>
                      <button onClick={() => handleAddQuestion(quest.id)}
                        disabled={savingQuestion || !newPrompt.trim()}
                        className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                        {savingQuestion ? 'Salvando...' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingToQuest(quest.id); setNewPrompt(''); setNewResponseType('scale'); setNewCompetencyId('') }}
                    className="w-full text-left px-5 py-3 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100 transition-colors"
                  >
                    + Adicionar pergunta
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Competencies (1/3) ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Competências</h2>
            <button onClick={() => setShowAddCompetency(true)} className="text-xs text-gray-400 hover:text-gray-700">
              + Nova
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {competencies.length === 0 ? (
              <p className="px-4 py-5 text-xs text-gray-400 text-center">
                Nenhuma competência.<br />
                <button onClick={() => setShowAddCompetency(true)} className="underline mt-1">Adicionar</button>
              </p>
            ) : (
              <div>
                {competencies.map((c, i) => (
                  <CompetencyRow
                    key={c.id}
                    competency={c}
                    palette={COMP_PALETTE[i % COMP_PALETTE.length]}
                    questionCount={questionsForCompetency(c.id)}
                    onRenamed={loadAll}
                  />
                ))}
              </div>
            )}

            {showAddCompetency && (
              <div className="px-3 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                <input
                  autoFocus type="text" value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="Nome da competência"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCompetency() }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowAddCompetency(false); setNewCompName('') }}
                    className="text-xs text-gray-500 px-2 py-1 hover:text-gray-700">
                    Cancelar
                  </button>
                  <button onClick={handleAddCompetency} disabled={savingComp || !newCompName.trim()}
                    className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50">
                    {savingComp ? '...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-medium mb-1">Sobre competências</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Vincule perguntas a competências para habilitar scores por dimensão
              e análise de pontos cegos no relatório.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal: novo questionário ── */}
      {showAddQuestionnaire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Novo questionário</h3>
              <button onClick={() => setShowAddQuestionnaire(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                <input autoFocus type="text" value={newQuestName}
                  onChange={(e) => setNewQuestName(e.target.value)}
                  placeholder="Ex: Questionário de Liderança"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Relação específica <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select value={newQuestRel} onChange={(e) => setNewQuestRel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Todas as relações</option>
                  <option value="self">Autoavaliação</option>
                  <option value="manager">Gestor</option>
                  <option value="peer">Par</option>
                  <option value="subordinate">Subordinado</option>
                  <option value="client">Cliente</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setShowAddQuestionnaire(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                  Cancelar
                </button>
                <button onClick={handleAddQuestionnaire} disabled={savingQuest || !newQuestName.trim()}
                  className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {savingQuest ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

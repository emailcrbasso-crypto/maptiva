import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateInfo {
  id: string
  name: string
  method_code: string
  scale_min: number
  scale_max: number
  allow_na: boolean
  n_minimum_default: number
  status: string
  tenant_id: string
}

interface Question {
  id: string
  prompt: string
  response_type: string
  order_index: number
  competency_id: string | null
}

interface Questionnaire {
  id: string
  name: string
  relationship_code: string | null
  questions: Question[]
}

interface Competency {
  id: string
  name: string
  order_index: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  '180': '180°', '360': '360°', 'custom': 'Personalizado',
}

const REL_LABEL: Record<string, string> = {
  self: 'Autoavaliação', manager: 'Gestor', peer: 'Par',
  subordinate: 'Subordinado', client: 'Cliente',
}

const RESPONSE_LABEL: Record<string, string> = {
  scale: 'Escala', text: 'Texto aberto',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [template, setTemplate] = useState<TemplateInfo | null>(null)
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [competencies, setCompetencies] = useState<Competency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add questionnaire
  const [showAddQuestionnaire, setShowAddQuestionnaire] = useState(false)
  const [newQuestName, setNewQuestName] = useState('')
  const [newQuestRel, setNewQuestRel] = useState('')
  const [savingQuest, setSavingQuest] = useState(false)

  // Add question (per questionnaire)
  const [addingToQuest, setAddingToQuest] = useState<string | null>(null)
  const [newPrompt, setNewPrompt] = useState('')
  const [newResponseType, setNewResponseType] = useState('scale')
  const [newCompetencyId, setNewCompetencyId] = useState('')
  const [savingQuestion, setSavingQuestion] = useState(false)

  // Add competency
  const [showAddCompetency, setShowAddCompetency] = useState(false)
  const [newCompName, setNewCompName] = useState('')
  const [savingComp, setSavingComp] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!id) return
    setLoading(true)

    const [tmplRes, questRes, compRes] = await Promise.all([
      supabase.from('templates').select('*').eq('id', id).single(),
      supabase.from('questionnaires').select('id, name, relationship_code').eq('template_id', id).order('name'),
      supabase.from('competencies').select('id, name, order_index').eq('template_id', id).order('order_index'),
    ])

    if (tmplRes.error) { setError(tmplRes.error.message); setLoading(false); return }
    setTemplate(tmplRes.data as TemplateInfo)
    setCompetencies((compRes.data as Competency[]) ?? [])

    // Load questions for each questionnaire
    const rawQuests = (questRes.data ?? []) as Array<{
      id: string; name: string; relationship_code: string | null
    }>

    const questsWithQuestions: Questionnaire[] = await Promise.all(
      rawQuests.map(async (q) => {
        const { data: qqData } = await supabase
          .from('questionnaire_questions')
          .select('order_index, questions(id, prompt, response_type, order_index, competency_id)')
          .eq('questionnaire_id', q.id)
          .order('order_index')
        const questions: Question[] = ((qqData ?? []) as Array<{
          order_index: number
          questions: Question | Question[]
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

  // ── Add questionnaire ─────────────────────────────────────────────────────

  async function handleAddQuestionnaire() {
    if (!template || !newQuestName.trim()) return
    setSavingQuest(true)
    const { error: err } = await supabase.from('questionnaires').insert({
      tenant_id:         template.tenant_id,
      template_id:       template.id,
      name:              newQuestName.trim(),
      relationship_code: newQuestRel || null,
    })
    if (err) { alert(err.message); setSavingQuest(false); return }
    setNewQuestName('')
    setNewQuestRel('')
    setShowAddQuestionnaire(false)
    setSavingQuest(false)
    await loadAll()
  }

  // ── Add question ──────────────────────────────────────────────────────────

  async function handleAddQuestion(questionnaireId: string) {
    if (!template || !newPrompt.trim()) return
    setSavingQuestion(true)

    // 1. Create question
    const { data: qData, error: qErr } = await supabase
      .from('questions')
      .insert({
        tenant_id:     template.tenant_id,
        template_id:   template.id,
        prompt:        newPrompt.trim(),
        response_type: newResponseType,
        competency_id: newCompetencyId || null,
      })
      .select('id')
      .single()

    if (qErr) { alert(qErr.message); setSavingQuestion(false); return }

    // 2. Get next order_index for this questionnaire
    const quest = questionnaires.find((q) => q.id === questionnaireId)
    const nextOrder = (quest?.questions.length ?? 0) + 1

    // 3. Link to questionnaire
    const { error: qqErr } = await supabase.from('questionnaire_questions').insert({
      questionnaire_id: questionnaireId,
      question_id:      qData.id,
      order_index:      nextOrder,
    })

    if (qqErr) { alert(qqErr.message); setSavingQuestion(false); return }

    setNewPrompt('')
    setNewResponseType('scale')
    setNewCompetencyId('')
    setAddingToQuest(null)
    setSavingQuestion(false)
    await loadAll()
  }

  // ── Add competency ────────────────────────────────────────────────────────

  async function handleAddCompetency() {
    if (!template || !newCompName.trim()) return
    setSavingComp(true)
    const { error: err } = await supabase.from('competencies').insert({
      tenant_id:   template.tenant_id,
      template_id: template.id,
      name:        newCompName.trim(),
      order_index: competencies.length + 1,
    })
    if (err) { alert(err.message); setSavingComp(false); return }
    setNewCompName('')
    setShowAddCompetency(false)
    setSavingComp(false)
    await loadAll()
  }

  // ── Remove question from questionnaire ────────────────────────────────────

  async function handleRemoveQuestion(questionnaireId: string, questionId: string) {
    if (!confirm('Remover esta pergunta do questionário?')) return
    await supabase
      .from('questionnaire_questions')
      .delete()
      .eq('questionnaire_id', questionnaireId)
      .eq('question_id', questionId)
    await loadAll()
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
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{template.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {METHOD_LABEL[template.method_code] ?? template.method_code}
              {' · '}Escala {template.scale_min}–{template.scale_max}
              {' · '}N mínimo: {template.n_minimum_default}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Questionnaires (col 2/3) ── */}
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
              <button
                onClick={() => setShowAddQuestionnaire(true)}
                className="text-sm text-gray-600 underline mt-2"
              >
                Criar questionário
              </button>
            </div>
          )}

          {questionnaires.map((quest) => (
            <div key={quest.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Questionnaire header */}
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{quest.name}</p>
                  {quest.relationship_code && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Relação: {REL_LABEL[quest.relationship_code] ?? quest.relationship_code}
                    </p>
                  )}
                  {!quest.relationship_code && (
                    <p className="text-xs text-gray-400 mt-0.5">Todas as relações</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {quest.questions.length} pergunta{quest.questions.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Questions list */}
              {quest.questions.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {quest.questions.map((q, idx) => (
                    <div key={q.id} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-xs text-gray-300 font-mono mt-0.5 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 leading-snug">{q.prompt}</p>
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs text-gray-400">
                              {RESPONSE_LABEL[q.response_type] ?? q.response_type}
                            </span>
                            {q.competency_id && (
                              <span className="text-xs text-blue-500">
                                · {competencies.find((c) => c.id === q.competency_id)?.name ?? 'Competência'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveQuestion(quest.id, q.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors text-xs shrink-0"
                        title="Remover pergunta"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add question form */}
              {addingToQuest === quest.id ? (
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                  <textarea
                    autoFocus
                    rows={2}
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Enunciado da pergunta..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <div className="flex gap-3">
                    <select
                      value={newResponseType}
                      onChange={(e) => setNewResponseType(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
                    >
                      <option value="scale">Escala</option>
                      <option value="text">Texto aberto</option>
                    </select>
                    <select
                      value={newCompetencyId}
                      onChange={(e) => setNewCompetencyId(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
                    >
                      <option value="">Sem competência</option>
                      {competencies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setAddingToQuest(null); setNewPrompt('') }}
                      className="text-sm text-gray-500 px-3 py-1.5"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQuestion(quest.id)}
                      disabled={savingQuestion || !newPrompt.trim()}
                      className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {savingQuestion ? 'Salvando...' : 'Adicionar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingToQuest(quest.id)
                    setNewPrompt('')
                    setNewResponseType('scale')
                    setNewCompetencyId('')
                  }}
                  className="w-full text-left px-5 py-3 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100 transition-colors"
                >
                  + Adicionar pergunta
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ── Competencies (col 1/3) ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Competências</h2>
            <button
              onClick={() => setShowAddCompetency(true)}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              + Nova
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {competencies.length === 0 ? (
              <p className="px-4 py-5 text-xs text-gray-400 text-center">
                Nenhuma competência.<br />
                <button
                  onClick={() => setShowAddCompetency(true)}
                  className="underline mt-1"
                >
                  Adicionar
                </button>
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {competencies.map((c) => (
                  <div key={c.id} className="px-4 py-2.5">
                    <p className="text-sm text-gray-800">{c.name}</p>
                  </div>
                ))}
              </div>
            )}

            {showAddCompetency && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                <input
                  autoFocus
                  type="text"
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="Nome da competência"
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCompetency() }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowAddCompetency(false); setNewCompName('') }}
                    className="text-xs text-gray-500 px-2 py-1"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddCompetency}
                    disabled={savingComp || !newCompName.trim()}
                    className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                  >
                    {savingComp ? '...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="mt-4 bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-medium mb-1">Sobre competências</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Vincule perguntas a competências para habilitar scores por dimensão
              e análise de pontos cegos no relatório.
            </p>
          </div>
        </div>
      </div>

      {/* ── Modal: Add questionnaire ── */}
      {showAddQuestionnaire && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Novo questionário</h3>
              <button onClick={() => setShowAddQuestionnaire(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
                <input
                  autoFocus
                  type="text"
                  value={newQuestName}
                  onChange={(e) => setNewQuestName(e.target.value)}
                  placeholder="Ex: Questionário de Liderança"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Relação específica <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select
                  value={newQuestRel}
                  onChange={(e) => setNewQuestRel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Todas as relações</option>
                  <option value="self">Autoavaliação</option>
                  <option value="manager">Gestor</option>
                  <option value="peer">Par</option>
                  <option value="subordinate">Subordinado</option>
                  <option value="client">Cliente</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setShowAddQuestionnaire(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddQuestionnaire}
                  disabled={savingQuest || !newQuestName.trim()}
                  className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
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

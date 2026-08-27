/**
 * PdiDetailPage — Plano de Desenvolvimento Individual (detalhe)
 * Rota: /pdi/:pdiId
 *
 * Fase 1 enxuta: cabeçalho editável + objetivos vinculados a competências
 * + painel de sugestões iniciais (nunca cria objetivo sozinho — sempre
 * exige revisão humana antes de salvar).
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────

type PdiStatus = 'rascunho' | 'em_andamento' | 'concluido' | 'cancelado'
type ObjStatus = 'nao_iniciado' | 'em_andamento' | 'concluido' | 'cancelado'
type Priority  = 'baixa' | 'media' | 'alta'

interface PdiPlan {
  id:            string
  person_id:     string
  cycle_id:      string | null
  source_type:   'assessment' | 'nine_box' | 'manual'
  source_id:     string | null
  title:         string
  period_start:  string | null
  period_end:    string | null
  status:        PdiStatus
  notes:         string | null
}

interface Objective {
  id:                string
  competency_id:     string | null
  description:       string
  expected_result:    string | null
  priority:          Priority
  due_date:           string | null
  success_indicator:   string | null
  status:            ObjStatus
  progress_pct:        number
  order_index:         number
}

interface CompetencyRow { id: string; name: string }

interface Suggestions {
  low_competencies: { competency_id: string; name: string; score_avg: number; cycle_avg: number; gap: number }[]
  blind_spots:      { competency_id: string; name: string; self_score: number; others_avg: number; gap: number }[]
  nine_box:         { perf_value: number | null; pot_value: number | null; perf_band: number | null; pot_band: number | null } | null
}

const PDI_STATUS_LABEL: Record<PdiStatus, string> = {
  rascunho: 'Rascunho', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado',
}
const OBJ_STATUS_LABEL: Record<ObjStatus, string> = {
  nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído', cancelado: 'Cancelado',
}
const PRIORITY_LABEL: Record<Priority, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }
const PRIORITY_COLOR: Record<Priority, string> = {
  baixa: 'bg-gray-100 text-gray-500', media: 'bg-amber-100 text-amber-700', alta: 'bg-red-100 text-red-600',
}

export function PdiDetailPage() {
  const { pdiId } = useParams<{ pdiId: string }>()

  const [plan,          setPlan]          = useState<PdiPlan | null>(null)
  const [personName,    setPersonName]    = useState('')
  const [objectives,    setObjectives]    = useState<Objective[]>([])
  const [competencies,  setCompetencies]  = useState<CompetencyRow[]>([])
  const [suggestions,   setSuggestions]   = useState<Suggestions | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [savingHeader,  setSavingHeader]  = useState(false)

  // Draft do cabeçalho
  const [titleDraft, setTitleDraft]   = useState('')
  const [statusDraft, setStatusDraft] = useState<PdiStatus>('rascunho')
  const [startDraft,  setStartDraft]  = useState('')
  const [endDraft,    setEndDraft]    = useState('')

  // Novo objetivo
  const [newDesc,   setNewDesc]   = useState('')
  const [newComp,   setNewComp]   = useState('')
  const [newPrio,   setNewPrio]   = useState<Priority>('media')
  const [newDue,    setNewDue]    = useState('')
  const [newExpected, setNewExpected] = useState('')
  const [savingObj, setSavingObj] = useState(false)

  const loadObjectives = useCallback(async () => {
    if (!pdiId) return
    const { data } = await supabase
      .from('pdi_objectives')
      .select('id, competency_id, description, expected_result, priority, due_date, success_indicator, status, progress_pct, order_index')
      .eq('pdi_id', pdiId)
      .order('order_index', { ascending: true })
    setObjectives((data ?? []) as Objective[])
  }, [pdiId])

  useEffect(() => {
    if (!pdiId) return
    async function load() {
      const { data: planData, error } = await supabase
        .from('pdi_plans')
        .select('id, person_id, cycle_id, source_type, source_id, title, period_start, period_end, status, notes')
        .eq('id', pdiId)
        .single()

      if (error || !planData) {
        setLoading(false)
        return
      }
      const p = planData as PdiPlan
      setPlan(p)
      setTitleDraft(p.title)
      setStatusDraft(p.status)
      setStartDraft(p.period_start ?? '')
      setEndDraft(p.period_end ?? '')

      const { data: person } = await supabase
        .from('people').select('name').eq('id', p.person_id).single()
      setPersonName(person?.name ?? 'Colaborador')

      const { data: compData } = await supabase
        .from('competencies').select('id, name').order('name')
      // Remove duplicatas de nome (competências repetidas entre templates)
      const seen = new Set<string>()
      const dedup = (compData ?? []).filter((c) => {
        if (seen.has(c.name)) return false
        seen.add(c.name)
        return true
      })
      setCompetencies(dedup as CompetencyRow[])

      // Sugestões — só quando o PDI tem origem em avaliação (cycle_id + source_id)
      if (p.cycle_id && p.source_type === 'assessment' && p.source_id) {
        const { data: sugData } = await supabase.rpc('get_pdi_suggestions', {
          p_cycle_id: p.cycle_id,
          p_cp_id:    p.source_id,
        })
        if (sugData) setSuggestions(sugData as Suggestions)
      }

      await loadObjectives()
      setLoading(false)
    }
    load()
  }, [pdiId, loadObjectives])

  async function handleSaveHeader() {
    if (!pdiId) return
    setSavingHeader(true)
    const { error } = await supabase
      .from('pdi_plans')
      .update({
        title:        titleDraft.trim() || 'Plano de Desenvolvimento Individual',
        status:       statusDraft,
        period_start: startDraft || null,
        period_end:   endDraft || null,
      })
      .eq('id', pdiId)
    if (error) alert(`Erro ao salvar: ${error.message}`)
    else setPlan((prev) => prev ? { ...prev, title: titleDraft, status: statusDraft, period_start: startDraft || null, period_end: endDraft || null } : prev)
    setSavingHeader(false)
  }

  async function handleAddObjective(prefill?: { competency_id?: string; description?: string }) {
    if (!pdiId) return
    const description = (prefill?.description ?? newDesc).trim()
    if (!description) return
    setSavingObj(true)
    const { error } = await supabase.from('pdi_objectives').insert({
      pdi_id:          pdiId,
      competency_id:   prefill?.competency_id ?? (newComp || null),
      description,
      expected_result: newExpected.trim() || null,
      priority:        newPrio,
      due_date:        newDue || null,
      order_index:     objectives.length,
    })
    if (error) {
      alert(`Erro ao adicionar objetivo: ${error.message}`)
    } else {
      setNewDesc(''); setNewComp(''); setNewPrio('media'); setNewDue(''); setNewExpected('')
      await loadObjectives()
    }
    setSavingObj(false)
  }

  async function handleUpdateObjective(objId: string, patch: Partial<Objective>) {
    const { error } = await supabase.from('pdi_objectives').update(patch).eq('id', objId)
    if (error) { alert(`Erro: ${error.message}`); return }
    setObjectives((prev) => prev.map((o) => (o.id === objId ? { ...o, ...patch } : o)))
  }

  async function handleRemoveObjective(objId: string) {
    if (!confirm('Remover este objetivo?')) return
    const { error } = await supabase.from('pdi_objectives').delete().eq('id', objId)
    if (error) { alert(`Erro: ${error.message}`); return }
    setObjectives((prev) => prev.filter((o) => o.id !== objId))
  }

  function useSuggestion(competencyId: string, description: string) {
    setNewComp(competencyId)
    setNewDesc(description)
    document.getElementById('novo-objetivo-desc')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto"><p className="text-gray-400 text-sm animate-pulse">Carregando...</p></div>
  }
  if (!plan) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm text-gray-500">PDI não encontrado.</p>
        </div>
      </div>
    )
  }

  // Mostra o painel sempre que houver dado de avaliação de origem — mesmo
  // quando nenhuma competência representa uma oportunidade real, o sistema
  // deve dizer isso explicitamente em vez de simplesmente omitir a seção.
  const hasSuggestions = suggestions !== null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to={`/people/${plan.person_id}/pdi`} className="text-sm text-gray-400 hover:text-gray-600">
          ← PDIs de {personName}
        </Link>
      </div>

      {/* ── Cabeçalho editável ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <input
          type="text"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          className="w-full text-lg font-semibold text-gray-900 border-0 border-b border-transparent focus:border-gray-300 focus:outline-none px-0 py-1 mb-3"
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as PdiStatus)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {(Object.keys(PDI_STATUS_LABEL) as PdiStatus[]).map((s) => (
              <option key={s} value={s}>{PDI_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <input type="date" value={startDraft} onChange={(e) => setStartDraft(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            <span>até</span>
            <input type="date" value={endDraft} onChange={(e) => setEndDraft(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <button
            onClick={handleSaveHeader}
            disabled={savingHeader}
            className="text-sm px-4 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors ml-auto"
          >
            {savingHeader ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Sugestões iniciais para revisão ── */}
      {hasSuggestions && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-indigo-900 mb-1">💡 Sugestões iniciais para revisão</h2>
          <p className="text-xs text-indigo-500 mb-4">
            Pré-selecionadas a partir dos resultados da avaliação. Nenhum objetivo é criado automaticamente —
            clique em "usar" para preencher o formulário abaixo e revise antes de salvar.
          </p>

          <div className="mb-3">
            <p className="text-xs font-medium text-indigo-700 mb-1.5">Competências abaixo da média do ciclo</p>
            {suggestions!.low_competencies.length === 0 ? (
              <p className="text-xs text-indigo-400 italic">
                Nenhuma competência identificada como oportunidade real — os resultados estão
                em linha com ou acima da média do ciclo.
              </p>
            ) : (
              <div className="space-y-1.5">
                {suggestions!.low_competencies.map((c) => (
                  <button
                    key={c.competency_id}
                    onClick={() => useSuggestion(c.competency_id, `Desenvolver a competência "${c.name}" — percepção externa (${c.score_avg.toFixed(2)}) está ${c.gap.toFixed(2)} pontos abaixo da média do ciclo (${c.cycle_avg.toFixed(2)}).`)}
                    className="w-full text-left text-xs bg-white border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <span className="font-medium">+ {c.name}</span>
                    <span className="text-indigo-400 ml-2">
                      Percepção externa: {c.score_avg.toFixed(2)} · Média do ciclo: {c.cycle_avg.toFixed(2)} · Gap: {c.gap.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {suggestions!.blind_spots.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-indigo-700 mb-1.5">Pontos cegos (autopercepção acima da percepção externa)</p>
              <div className="flex flex-wrap gap-2">
                {suggestions!.blind_spots.map((b) => (
                  <button
                    key={b.competency_id}
                    onClick={() => useSuggestion(b.competency_id, `Buscar feedback contínuo sobre "${b.name}" — autoavaliação (${b.self_score.toFixed(2)}) está ${b.gap.toFixed(2)} pontos acima da percepção dos avaliadores.`)}
                    className="text-xs bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                  >
                    + {b.name} (gap {b.gap.toFixed(2)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {suggestions!.nine_box && (
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-1.5">Nine Box</p>
              <button
                onClick={() => useSuggestion('', `Plano de desenvolvimento alinhado à posição no Nine Box (Potencial: ${suggestions!.nine_box!.pot_value?.toFixed(2) ?? '—'} · Desempenho: ${suggestions!.nine_box!.perf_value?.toFixed(2) ?? '—'}).`)}
                className="text-xs bg-white border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
              >
                + usar posição do Nine Box
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Objetivos ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Objetivos de desenvolvimento</h2>

        <div className="space-y-4 mb-5">
          {objectives.length === 0 && (
            <p className="text-sm text-gray-400">Nenhum objetivo ainda. Adicione o primeiro abaixo.</p>
          )}
          {objectives.map((o) => {
            const comp = competencies.find((c) => c.id === o.competency_id)
            return (
              <div key={o.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{o.description}</p>
                    {comp && <p className="text-xs text-gray-400 mt-0.5">Competência: {comp.name}</p>}
                    {o.expected_result && <p className="text-xs text-gray-400 mt-0.5">Resultado esperado: {o.expected_result}</p>}
                  </div>
                  <button
                    onClick={() => handleRemoveObjective(o.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[o.priority]}`}>
                    {PRIORITY_LABEL[o.priority]}
                  </span>
                  <select
                    value={o.status}
                    onChange={(e) => handleUpdateObjective(o.id, { status: e.target.value as ObjStatus })}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                  >
                    {(Object.keys(OBJ_STATUS_LABEL) as ObjStatus[]).map((s) => (
                      <option key={s} value={s}>{OBJ_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  {o.due_date && (
                    <span className="text-xs text-gray-400">
                      Prazo: {new Date(o.due_date).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <input
                      type="range" min={0} max={100} step={10}
                      value={o.progress_pct}
                      onChange={(e) => handleUpdateObjective(o.id, { progress_pct: parseInt(e.target.value, 10) })}
                      className="w-24"
                    />
                    <span className="text-xs text-gray-400 w-9">{o.progress_pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Novo objetivo */}
        <div className="border-t border-gray-100 pt-4 space-y-2.5">
          <textarea
            id="novo-objetivo-desc"
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Descreva o objetivo de desenvolvimento..."
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
          <input
            type="text"
            value={newExpected}
            onChange={(e) => setNewExpected(e.target.value)}
            placeholder="Resultado esperado (opcional)"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newComp}
              onChange={(e) => setNewComp(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="">Sem competência vinculada</option>
              {competencies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={newPrio}
              onChange={(e) => setNewPrio(e.target.value as Priority)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white"
            >
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5"
            />
            <button
              onClick={() => handleAddObjective()}
              disabled={savingObj || !newDesc.trim()}
              className="text-sm px-4 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors ml-auto"
            >
              {savingObj ? 'Adicionando...' : '+ Adicionar objetivo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  parseParticipantFile,
  downloadParticipantTemplate,
  type ParsedPerson,
} from '@/lib/importParticipants'
import {
  parseAssignmentFile,
  downloadAssignmentTemplate,
  type ParsedAssignment,
} from '@/lib/importAssignments'
import { CycleWeightsPanel } from './CycleWeightsPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CycleInfo {
  id: string
  name: string
  status: string
  report_release_at: string | null
  template_id: string
  tenant_id: string
}

interface PersonRow {
  id: string
  name: string
  email: string
  job_title: string | null
  department: string | null
}

interface Participant {
  id: string          // cycle_participant_id
  person_id: string
  person: PersonRow
  assignments: Assignment[]
}

interface Assignment {
  id: string
  evaluator_cycle_participant_id: string
  evaluator_name: string
  relationship_code: string
  status: string
}

interface SummaryParticipant {
  cycle_participant_id: string
  person_name: string
  has_profile: boolean
  overall_score: number | null
  self_score: number | null
  manager_score: number | null
  peer_score: number | null
  blind_spot_count: number
}

interface CycleSummary {
  cycle_name: string
  status: string
  report_release_at: string | null
  total_assignments: number
  completed_assignments: number
  participants: SummaryParticipant[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho', active: 'Ativo', closed: 'Fechado', archived: 'Arquivado',
}

const REL_LABEL: Record<string, string> = {
  self: 'Autoavaliação', manager: 'Gestor', peer: 'Par',
  subordinate: 'Subordinado', client: 'Cliente', mentor: 'Mentor',
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-500',
  invited:   'bg-blue-100 text-blue-600',
  completed: 'bg-green-100 text-green-700',
  expired:   'bg-red-100 text-red-500',
  cancelled: 'bg-gray-100 text-gray-400',
}

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', invited: 'Convidado', completed: 'Concluído',
  expired: 'Expirado', cancelled: 'Cancelado',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CycleDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [cycle, setCycle] = useState<CycleInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [summary, setSummary] = useState<CycleSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // actions
  const [activating, setActivating] = useState(false)
  const [closing, setClosing] = useState(false)
  const [releasing, setReleasing] = useState(false)

  // expanded participant row
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // add participant modal
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [availablePeople, setAvailablePeople] = useState<PersonRow[]>([])
  const [addingPerson, setAddingPerson] = useState<string | null>(null)

  // add assignment modal
  const [assignTarget, setAssignTarget] = useState<Participant | null>(null)
  const [assignRelationship, setAssignRelationship] = useState('peer')
  const [assignEvaluatorCpId, setAssignEvaluatorCpId] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // tenant
  const [tenantId, setTenantId] = useState<string | null>(null)
  // Map: relationship_code (or '__default') → questionnaire_id
  const [questionnaireMap, setQuestionnaireMap] = useState<Map<string, string>>(new Map())

  // magic link modal
  const [linkModal, setLinkModal] = useState<{ token: string; assignmentId: string } | null>(null)
  const [generatingLink, setGeneratingLink] = useState<string | null>(null) // assignmentId
  const [linkCopied, setLinkCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // import participants via spreadsheet
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<ParsedPerson[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  // import assignment matrix via spreadsheet
  const [showMatrixModal,   setShowMatrixModal]   = useState(false)
  const [matrixRows,        setMatrixRows]        = useState<ParsedAssignment[]>([])
  const [matrixErrors,      setMatrixErrors]      = useState<string[]>([])
  const [importingMatrix,   setImportingMatrix]   = useState(false)

  // mass reminders
  const [showReminderModal,  setShowReminderModal]  = useState(false)
  const [reminderTotal,      setReminderTotal]      = useState(0)
  const [reminderDone,       setReminderDone]       = useState(0)
  const [reminderFailed,     setReminderFailed]     = useState(0)
  const [reminderRunning,    setReminderRunning]    = useState(false)
  const [reminderLog,        setReminderLog]        = useState<string[]>([])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!id) return
    setLoading(true)

    const [cycleRes, cpRes] = await Promise.all([
      supabase.from('cycles').select('id, name, status, report_release_at, template_id, tenant_id').eq('id', id).single(),
      supabase.from('cycle_participants').select('id, person_id').eq('cycle_id', id).order('id'),
    ])

    if (cycleRes.error) { setError(cycleRes.error.message); setLoading(false); return }
    const cycleData = cycleRes.data as CycleInfo
    setCycle(cycleData)
    setTenantId(cycleData.tenant_id)

    // Fetch ALL questionnaires for this template (keyed by relationship_code)
    // A null relationship_code means it's the generic/default questionnaire.
    const { data: questData } = await supabase
      .from('questionnaires')
      .select('id, relationship_code')
      .eq('template_id', cycleData.template_id)
    const qMap = new Map<string, string>()
    for (const q of (questData ?? []) as Array<{ id: string; relationship_code: string | null }>) {
      const key = q.relationship_code ?? '__default'
      qMap.set(key, q.id)
    }
    setQuestionnaireMap(qMap)

    // Build participants list (no embedded join — avoids PostgREST inner-join filtering)
    const cpRows = (cpRes.data ?? []) as Array<{ id: string; person_id: string }>

    // Fetch people separately using the collected person_ids
    const personIds = cpRows.map((cp) => cp.person_id)
    const peopleMap = new Map<string, PersonRow>()
    if (personIds.length > 0) {
      const { data: peopleData } = await supabase
        .from('people')
        .select('id, name, email, job_title, department')
        .in('id', personIds)
      for (const p of (peopleData as PersonRow[]) ?? []) {
        peopleMap.set(p.id, p)
      }
    }

    // Build a map: cp_id → participant name (for evaluator name lookup)
    const cpMap = new Map<string, string>()
    for (const cp of cpRows) {
      cpMap.set(cp.id, peopleMap.get(cp.person_id)?.name ?? '?')
    }

    // Re-fetch assignments with both evaluated + evaluator columns
    const { data: fullAssigns } = await supabase
      .from('assignments_admin')
      .select('id, evaluated_cycle_participant_id, evaluator_cycle_participant_id, relationship_code, status')
      .eq('cycle_id', id)

    const fullAssignRows = (fullAssigns ?? []) as Array<{
      id: string
      evaluated_cycle_participant_id: string
      evaluator_cycle_participant_id: string
      relationship_code: string
      status: string
    }>

    // For each participant, find assignments WHERE they are the evaluated person
    const finalParticipants: Participant[] = cpRows.map((cp) => {
      const person = peopleMap.get(cp.person_id) ?? {
        id: cp.person_id, name: '?', email: '', job_title: null, department: null,
      }
      const myAssignments: Assignment[] = fullAssignRows
        .filter((a) => a.evaluated_cycle_participant_id === cp.id)
        .map((a) => ({
          id: a.id,
          evaluator_cycle_participant_id: a.evaluator_cycle_participant_id,
          evaluator_name: cpMap.get(a.evaluator_cycle_participant_id) ?? '?',
          relationship_code: a.relationship_code,
          status: a.status,
        }))
      return {
        id: cp.id,
        person_id: cp.person_id,
        person,
        assignments: myAssignments,
      }
    })

    setParticipants(finalParticipants)

    // Also load summary for closed cycles
    if (cycleRes.data?.status === 'closed' || cycleRes.data?.status === 'active') {
      const { data: summaryData } = await supabase.rpc('get_cycle_summary', { p_cycle_id: id })
      if (summaryData) setSummary(summaryData as CycleSummary)
    }

    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns the best questionnaire_id for a given relationship_code.
   *  Priority: specific relationship match → generic (__default) → null */
  function getQuestionnaireId(relationshipCode: string): string | undefined {
    return questionnaireMap.get(relationshipCode) ?? questionnaireMap.get('__default')
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleActivate() {
    if (!id || !confirm('Ativar o ciclo? Avaliadores poderão receber convites a partir de agora.')) return
    setActivating(true)
    const { error: err } = await supabase.rpc('activate_cycle', { p_cycle_id: id })
    if (err) {
      // Parse validation messages into user-friendly Portuguese
      const msg = err.message
      const friendly = msg.includes('no_participants')
        ? 'Adicione pelo menos um participante antes de ativar o ciclo.'
        : msg.includes('no_assignments')
        ? 'Crie pelo menos um vínculo de avaliador antes de ativar o ciclo.'
        : msg.includes('missing_questionnaire')
        ? 'Todos os avaliadores precisam ter um questionário associado. Verifique os templates e questionnaires.'
        : msg.includes('cycle_already_active')
        ? 'O ciclo já está ativo.'
        : msg
      alert(friendly)
      setActivating(false)
      return
    }
    await loadAll()
    setActivating(false)
  }

  async function handleClose() {
    if (!id || !confirm('Fechar o ciclo? Esta ação calcula os scores e não pode ser desfeita.')) return
    setClosing(true)
    const { error: err } = await supabase.rpc('close_cycle', { p_cycle_id: id })
    if (err) { alert(err.message); setClosing(false); return }
    await loadAll()
    setClosing(false)
  }

  async function handleRelease() {
    if (!id || !confirm('Liberar relatórios para os participantes?')) return
    setReleasing(true)
    const { error: err } = await supabase.rpc('release_reports', { p_cycle_id: id })
    if (err) { alert(err.message); setReleasing(false); return }
    await loadAll()
    setReleasing(false)
  }

  // ── Add participant ───────────────────────────────────────────────────────

  async function openAddParticipant() {
    const alreadyIds = participants.map((p) => p.person_id)
    const { data } = await supabase
      .from('people')
      .select('id, name, email, job_title, department')
      .order('name')
    const available = ((data as PersonRow[]) ?? []).filter((p) => !alreadyIds.includes(p.id))
    setAvailablePeople(available)
    setShowAddParticipant(true)
  }

  async function addParticipant(person: PersonRow) {
    if (!id) { alert('ID do ciclo não encontrado.'); return }
    if (!tenantId) { alert('Tenant não carregado. Recarregue a página.'); return }
    setAddingPerson(person.id)
    const { error: err } = await supabase.from('cycle_participants').insert({
      tenant_id: tenantId,
      cycle_id: id,
      person_id: person.id,
    })
    setAddingPerson(null)
    if (err) {
      alert(err.code === '23505' ? 'Pessoa já está no ciclo.' : err.message)
      return
    }
    setShowAddParticipant(false)
    await loadAll()
  }

  // ── Add assignment ────────────────────────────────────────────────────────

  function openAssignModal(participant: Participant) {
    setAssignTarget(participant)
    setAssignRelationship('peer')
    setAssignEvaluatorCpId(participants.find((p) => p.id !== participant.id)?.id ?? '')
    setAssignError(null)
  }

  async function addSelfAssignment(participant: Participant) {
    if (!id || !tenantId) { alert('Dados do ciclo não carregados. Recarregue a página.'); return }
    const qId = getQuestionnaireId('self')
    const { error: err } = await supabase.from('assignments').insert({
      tenant_id: tenantId,
      cycle_id: id,
      evaluated_cycle_participant_id: participant.id,
      evaluator_cycle_participant_id: participant.id,
      relationship_code: 'self',
      ...(qId ? { questionnaire_id: qId } : {}),
    })
    if (err) {
      alert(err.code === '23505' ? 'Autoavaliação já existe.' : err.message)
      return
    }
    await loadAll()
  }

  // ── Generate magic link ───────────────────────────────────────────────────

  async function handleGenerateLink(assignmentId: string) {
    setGeneratingLink(assignmentId)
    const { data, error: err } = await supabase.rpc('generate_magic_link', {
      p_assignment_id: assignmentId,
      p_expires_days: 30,
    })
    setGeneratingLink(null)
    if (err) { alert(err.message); return }
    const token = (data as { token: string }).token
    setLinkModal({ token, assignmentId })
    setLinkCopied(false)
    setEmailSent(false)
    // Reload so status badge reflects 'invited'
    await loadAll()
  }

  async function handleSendEmail() {
    if (!linkModal) return
    setSendingEmail(true)

    const { data, error: invokeErr } = await supabase.functions.invoke('send-invite', {
      body: {
        assignment_id: linkModal.assignmentId,
        token:         linkModal.token,
        base_url:      window.location.origin,
      },
    })

    setSendingEmail(false)

    // The function always returns HTTP 200 with { ok, error? } in the body.
    // invokeErr only fires on network failure or genuine 401/403.
    if (invokeErr) {
      alert(`Erro ao enviar e-mail: ${invokeErr.message}`)
      return
    }

    const result = data as { ok: boolean; error?: string; to?: string }
    if (!result?.ok) {
      alert(`Erro ao enviar e-mail: ${result?.error ?? 'Erro desconhecido'}`)
      return
    }

    setEmailSent(true)
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/respond/${token}`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleRevokeAssignment(assignmentId: string) {
    if (!confirm('Cancelar esta avaliação? O link atual será invalidado e não poderá ser revertido.')) return
    const { error: err } = await supabase.rpc('revoke_assignment', { p_assignment_id: assignmentId })
    if (err) { alert(err.message); return }
    await loadAll()
  }

  async function handleSaveAssignment() {
    if (!assignTarget || !id || !tenantId) return
    if (!assignEvaluatorCpId) { setAssignError('Selecione o avaliador.'); return }
    setSavingAssignment(true)
    setAssignError(null)

    if (!tenantId) { alert('Tenant não carregado. Recarregue a página.'); setSavingAssignment(false); return }
    const qId = getQuestionnaireId(assignRelationship)
    const { error: err } = await supabase.from('assignments').insert({
      tenant_id: tenantId,
      cycle_id: id,
      evaluated_cycle_participant_id: assignTarget.id,
      evaluator_cycle_participant_id: assignEvaluatorCpId,
      relationship_code: assignRelationship,
      ...(qId ? { questionnaire_id: qId } : {}),
    })

    if (err) {
      setAssignError(err.code === '23505' ? 'Este avaliador já está atribuído nesta relação.' : err.message)
      setSavingAssignment(false)
      return
    }
    setAssignTarget(null)
    setSavingAssignment(false)
    await loadAll()
  }

  // ── Mass reminders ────────────────────────────────────────────────────────

  async function handleSendReminders() {
    if (!id) return

    // Collect all pending / invited assignments across all participants
    const pending = participants.flatMap((p) =>
      p.assignments.filter(
        (a) => a.status === 'pending' || a.status === 'invited'
      ).map((a) => ({ assignmentId: a.id, status: a.status }))
    )

    if (pending.length === 0) {
      alert('Nenhuma avaliação pendente encontrada.')
      return
    }

    setReminderTotal(pending.length)
    setReminderDone(0)
    setReminderFailed(0)
    setReminderLog([])
    setReminderRunning(true)
    setShowReminderModal(true)

    let done = 0
    let failed = 0
    const log: string[] = []

    for (const { assignmentId, status } of pending) {
      try {
        // Step 1 — get or generate token
        let token: string

        if (status === 'pending') {
          const { data: genData, error: genErr } = await supabase.rpc('generate_magic_link', {
            p_assignment_id: assignmentId,
            p_expires_days:  30,
          })
          if (genErr || !genData) {
            failed++
            log.push(`Erro ao gerar link (${assignmentId}): ${genErr?.message ?? 'sem dados'}`)
            setReminderFailed(failed)
            setReminderLog([...log])
            continue
          }
          token = (genData as { token: string }).token
        } else {
          // status = 'invited' — regenerate to ensure fresh token
          const { data: genData, error: genErr } = await supabase.rpc('generate_magic_link', {
            p_assignment_id: assignmentId,
            p_expires_days:  30,
          })
          if (genErr || !genData) {
            failed++
            log.push(`Erro ao regenerar link (${assignmentId}): ${genErr?.message ?? 'sem dados'}`)
            setReminderFailed(failed)
            setReminderLog([...log])
            continue
          }
          token = (genData as { token: string }).token
        }

        // Step 2 — send email
        const { data: sendData, error: invokeErr } = await supabase.functions.invoke('send-invite', {
          body: {
            assignment_id: assignmentId,
            token,
            base_url: window.location.origin,
          },
        })

        if (invokeErr) {
          failed++
          log.push(`Erro de rede (${assignmentId}): ${invokeErr.message}`)
        } else {
          const result = sendData as { ok: boolean; error?: string; to?: string }
          if (result?.ok) {
            done++
            log.push(`✓ Enviado para ${result.to ?? assignmentId}`)
          } else {
            failed++
            log.push(`✗ Falhou (${assignmentId}): ${result?.error ?? 'erro desconhecido'}`)
          }
        }
      } catch (e) {
        failed++
        log.push(`Exceção (${assignmentId}): ${String(e)}`)
      }

      setReminderDone(done)
      setReminderFailed(failed)
      setReminderLog([...log])
    }

    setReminderRunning(false)
    await loadAll()
  }

  // ── Import assignment matrix ──────────────────────────────────────────────

  async function handleMatrixFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseAssignmentFile(file)
    setMatrixRows(result.rows)
    setMatrixErrors(result.errors)
    e.target.value = ''
  }

  async function confirmMatrixImport() {
    if (!id || !tenantId || matrixRows.length === 0) return
    setImportingMatrix(true)

    // Build email → cycle_participant_id map from current participants
    const emailToCpId = new Map<string, string>()
    for (const p of participants) {
      emailToCpId.set(p.person.email, p.id)
    }

    let added = 0
    let skipped = 0
    const failures: string[] = []

    for (const row of matrixRows) {
      const evaluatedCpId = emailToCpId.get(row.evaluated_email)
      const evaluatorCpId = emailToCpId.get(row.evaluator_email)

      if (!evaluatedCpId) {
        failures.push(`Avaliado "${row.evaluated_email}" não encontrado como participante do ciclo.`)
        continue
      }
      if (!evaluatorCpId) {
        failures.push(`Avaliador "${row.evaluator_email}" não encontrado como participante do ciclo.`)
        continue
      }

      const qId = getQuestionnaireId(row.relationship_code)
      const { error: err } = await supabase.from('assignments').insert({
        tenant_id: tenantId,
        cycle_id: id,
        evaluated_cycle_participant_id: evaluatedCpId,
        evaluator_cycle_participant_id: evaluatorCpId,
        relationship_code: row.relationship_code,
        ...(qId ? { questionnaire_id: qId } : {}),
      })

      if (err) {
        if (err.code === '23505') {
          skipped++
        } else {
          failures.push(`${row.evaluator_email} → ${row.evaluated_email}: ${err.message}`)
        }
      } else {
        added++
      }
    }

    setImportingMatrix(false)
    setShowMatrixModal(false)
    setMatrixRows([])
    setMatrixErrors([])

    const msg = [
      added   > 0 ? `${added} vínculo(s) criado(s).` : null,
      skipped > 0 ? `${skipped} já existia(m) — ignorado(s).` : null,
      ...failures,
    ].filter(Boolean).join('\n')

    if (msg) alert(msg)
    await loadAll()
  }

  // ── Import participants ───────────────────────────────────────────────────

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const result = await parseParticipantFile(file)
    setImportRows(result.rows)
    setImportErrors(result.errors)
    // Reset the input so the same file can be re-selected after fixing
    e.target.value = ''
  }

  async function confirmImport() {
    if (!id || !tenantId || importRows.length === 0) return
    setImporting(true)

    const alreadyIds = participants.map((p) => p.person_id)
    let skipped = 0
    let added = 0
    const failures: string[] = []

    for (const row of importRows) {
      // Upsert person (by email within tenant)
      const { data: personData, error: personErr } = await supabase
        .from('people')
        .upsert(
          {
            tenant_id:  tenantId,
            name:       row.name,
            email:      row.email,
            job_title:  row.job_title || null,
            department: row.department || null,
          },
          { onConflict: 'tenant_id,email', ignoreDuplicates: false }
        )
        .select('id')
        .single()

      if (personErr || !personData) {
        failures.push(`${row.name} (${row.email}): ${personErr?.message ?? 'erro ao salvar pessoa'}`)
        continue
      }

      const personId = personData.id as string

      // Skip if already in cycle
      if (alreadyIds.includes(personId)) {
        skipped++
        continue
      }

      const { error: cpErr } = await supabase.from('cycle_participants').insert({
        tenant_id: tenantId,
        cycle_id:  id,
        person_id: personId,
      })

      if (cpErr && cpErr.code !== '23505') {
        failures.push(`${row.name}: ${cpErr.message}`)
      } else {
        added++
      }
    }

    setImporting(false)
    setShowImportModal(false)
    setImportRows([])
    setImportErrors([])

    const msg = [
      added > 0 ? `${added} participante(s) adicionado(s).` : null,
      skipped > 0 ? `${skipped} já estava(m) no ciclo.` : null,
      ...failures,
    ].filter(Boolean).join('\n')

    if (msg) alert(msg)
    await loadAll()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-gray-400 text-sm">Carregando...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>
  if (!cycle)  return null

  const isManageable = cycle.status === 'draft' || cycle.status === 'active'
  const completionPct = summary && summary.total_assignments > 0
    ? Math.round((summary.completed_assignments / summary.total_assignments) * 100)
    : 0

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">← Ciclos</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{cycle.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{STATUS_LABEL[cycle.status] ?? cycle.status}</p>
          </div>
          <div className="flex gap-2">
            {cycle.status === 'draft' && (
              <button
                onClick={handleActivate}
                disabled={activating}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {activating ? 'Ativando...' : 'Ativar ciclo'}
              </button>
            )}
            {cycle.status === 'active' && (
              <>
                <button
                  onClick={() => {
                    const count = participants.flatMap((p) =>
                      p.assignments.filter((a) => a.status === 'pending' || a.status === 'invited')
                    ).length
                    if (count === 0) { alert('Nenhuma avaliação pendente para enviar lembretes.'); return }
                    if (!confirm(`Enviar lembrete para ${count} avaliador(es) com avaliações pendentes?`)) return
                    handleSendReminders()
                  }}
                  className="text-sm px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  ✉ Lembretes
                </button>
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {closing ? 'Fechando...' : 'Fechar ciclo'}
                </button>
              </>
            )}
            {cycle.status === 'closed' && !cycle.report_release_at && (
              <button
                onClick={handleRelease}
                disabled={releasing}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {releasing ? 'Liberando...' : 'Liberar relatórios'}
              </button>
            )}
            {cycle.status === 'closed' && (
              <Link
                to={`/cycles/${cycle.id}/report`}
                className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
              >
                Ver relatório
              </Link>
            )}
            {cycle.report_release_at && (
              <Link
                to={`/cycles/${cycle.id}/my-report`}
                className="text-sm px-4 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
              >
                Meu relatório
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress (only when there are assignments) ── */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Progresso das respostas</span>
            <span className="font-medium text-gray-900">
              {summary.completed_assignments} / {summary.total_assignments} ({completionPct}%)
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          {cycle.report_release_at && (
            <p className="text-xs text-green-600 mt-2">
              ✓ Relatórios liberados em {new Date(cycle.report_release_at).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>
      )}

      {/* ── Pesos de avaliação ── */}
      {summary && cycle && cycle.status !== 'draft' && id && (
        <CycleWeightsPanel cycleId={id} cycleStatus={cycle.status} />
      )}

      {/* ── Participants ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-900">
            Participantes ({participants.length})
          </h2>
          {isManageable && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowMatrixModal(true); setMatrixRows([]); setMatrixErrors([]) }}
                className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
              >
                ↑ Importar matriz
              </button>
              <button
                onClick={() => { setShowImportModal(true); setImportRows([]); setImportErrors([]) }}
                className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
              >
                ↑ Importar pessoas
              </button>
              <button
                onClick={openAddParticipant}
                className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
              >
                + Adicionar participante
              </button>
            </div>
          )}
        </div>

        {participants.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            Nenhum participante adicionado.{' '}
            {isManageable && 'Use o botão acima para adicionar.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {participants.map((p) => {
              const expanded = expandedId === p.id
              const summaryRow = summary?.participants?.find(
                (s) => s.cycle_participant_id === p.id
              )
              return (
                <div key={p.id}>
                  {/* Row */}
                  <div
                    className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">{p.person.name}</span>
                      {p.person.job_title && (
                        <span className="text-xs text-gray-400">{p.person.job_title}</span>
                      )}
                      {p.assignments.length > 0 && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {p.assignments.length} avaliador{p.assignments.length !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Score badges for closed cycles */}
                      {summaryRow?.overall_score != null && (
                        <span className="text-sm font-semibold text-gray-900">
                          {summaryRow.overall_score.toFixed(2)}
                        </span>
                      )}
                      <span className="text-gray-300 text-xs">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded: assignments management */}
                  {expanded && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Avaliadores de {p.person.name}
                        </p>
                        {isManageable && (
                          <div className="flex gap-2">
                            {!p.assignments.some((a) => a.relationship_code === 'self') && (
                              <button
                                onClick={() => addSelfAssignment(p)}
                                className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white transition-colors text-gray-600"
                              >
                                + Autoavaliação
                              </button>
                            )}
                            <button
                              onClick={() => openAssignModal(p)}
                              className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                              + Avaliador
                            </button>
                          </div>
                        )}
                      </div>

                      {p.assignments.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">Nenhum avaliador atribuído.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {p.assignments.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-700">
                                  {a.evaluator_name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  · {REL_LABEL[a.relationship_code] ?? a.relationship_code}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {(a.status === 'pending' || a.status === 'invited') && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleGenerateLink(a.id) }}
                                    disabled={generatingLink === a.id}
                                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors"
                                    title="Gerar link de avaliação"
                                  >
                                    {generatingLink === a.id
                                      ? '…'
                                      : a.status === 'invited'
                                        ? '🔗 Regenerar'
                                        : '🔗 Gerar link'}
                                  </button>
                                )}
                                {isManageable && a.status !== 'cancelled' && a.status !== 'completed' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRevokeAssignment(a.id)
                                    }}
                                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                                    title="Cancelar avaliação"
                                  >
                                    ✕
                                  </button>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Scores detail for closed cycles */}
                      {summaryRow && summaryRow.has_profile && (
                        <div className="mt-4 pt-3 border-t border-gray-200 grid grid-cols-4 gap-3">
                          {[
                            { label: 'Overall', value: summaryRow.overall_score },
                            { label: 'Self', value: summaryRow.self_score },
                            { label: 'Gestor', value: summaryRow.manager_score },
                            { label: 'Pares', value: summaryRow.peer_score },
                          ].map(({ label, value }) => (
                            <div key={label} className="text-center bg-white rounded-lg p-2 border border-gray-200">
                              <p className="text-xs text-gray-400">{label}</p>
                              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                                {value != null ? value.toFixed(2) : '—'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal: Magic link ── */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Link de avaliação gerado</h3>
              <button onClick={() => setLinkModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Compartilhe este link com o avaliador. O link expira em <strong>30 dias</strong> e
                só pode ser utilizado uma vez.
              </p>

              {/* Link copy row */}
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${window.location.origin}/respond/${linkModal.token}`}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-mono"
                />
                <button
                  onClick={() => copyLink(linkModal.token)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    linkCopied
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
                >
                  {linkCopied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>

              {/* Send by email */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-2">
                  Ou envie diretamente por e-mail para o endereço cadastrado do avaliador:
                </p>
                {emailSent ? (
                  <p className="text-xs text-green-600 font-medium">✓ E-mail enviado com sucesso.</p>
                ) : (
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                    className="text-sm px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors text-gray-700"
                  >
                    {sendingEmail ? 'Enviando...' : '✉ Enviar por e-mail'}
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400">
                O status do avaliador mudou para <strong>Convidado</strong>. Regenere o link se
                precisar invalidar o anterior.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add participant ── */}
      {showAddParticipant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Adicionar participante</h3>
              <button onClick={() => setShowAddParticipant(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {availablePeople.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-400 text-center">
                  Todas as pessoas já estão no ciclo, ou não há pessoas cadastradas.{' '}
                  <Link to="/people" className="text-gray-600 underline">Cadastrar pessoas</Link>
                </p>
              ) : (
                availablePeople.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => addParticipant(person)}
                    disabled={addingPerson === person.id}
                    className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-gray-900">{person.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {person.email}{person.job_title ? ` · ${person.job_title}` : ''}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Import participants ── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Importar participantes via planilha</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Instructions */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>A planilha deve ter colunas: <strong>nome</strong>, <strong>email</strong>, cargo (opcional), departamento (opcional).</p>
                <p>Formatos aceitos: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong></p>
                <button
                  onClick={downloadParticipantTemplate}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Baixar modelo de planilha
                </button>
              </div>

              {/* File input */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Selecionar arquivo</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  className="w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-sm file:text-gray-600 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
                />
              </div>

              {/* Parse errors */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 space-y-1">
                  {importErrors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {/* Preview */}
              {importRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    {importRows.length} pessoa(s) encontrada(s) — prévia:
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Nome</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Email</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Cargo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-900">{row.name}</td>
                            <td className="px-3 py-1.5 text-gray-500">{row.email}</td>
                            <td className="px-3 py-1.5 text-gray-400">{row.job_title || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importing || importRows.length === 0}
                  className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {importing ? 'Importando...' : `Importar ${importRows.length > 0 ? `(${importRows.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Mass reminders progress ── */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">
                {reminderRunning ? 'Enviando lembretes...' : 'Lembretes enviados'}
              </h3>
              {!reminderRunning && (
                <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>{reminderDone + reminderFailed} / {reminderTotal}</span>
                  <span className="text-green-600">{reminderDone} ✓</span>
                  {reminderFailed > 0 && <span className="text-red-500">{reminderFailed} ✗</span>}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 rounded-full transition-all duration-300"
                    style={{ width: reminderTotal > 0 ? `${((reminderDone + reminderFailed) / reminderTotal) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Log */}
              <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-3 bg-gray-50">
                {reminderRunning && reminderLog.length === 0 && (
                  <p className="text-xs text-gray-400 animate-pulse">Iniciando...</p>
                )}
                {reminderLog.map((line, i) => (
                  <p key={i} className={`text-xs font-mono ${
                    line.startsWith('✓') ? 'text-green-700' : line.startsWith('✗') ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {line}
                  </p>
                ))}
              </div>

              {!reminderRunning && (
                <div className="flex justify-between items-center pt-1">
                  <p className="text-sm text-gray-600">
                    {reminderFailed === 0
                      ? `✓ ${reminderDone} lembrete(s) enviado(s) com sucesso.`
                      : `${reminderDone} enviado(s), ${reminderFailed} falha(s).`}
                  </p>
                  <button
                    onClick={() => setShowReminderModal(false)}
                    className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Import assignment matrix ── */}
      {showMatrixModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Importar matriz de avaliação</h3>
              <button onClick={() => setShowMatrixModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <p>A planilha define quem avalia quem. Colunas obrigatórias:</p>
                <p><strong>email_avaliado</strong>, <strong>email_avaliador</strong>, <strong>relacao</strong></p>
                <p>Relações válidas: <strong>self, gestor, par, subordinado, cliente</strong></p>
                <p className="text-gray-400">Colunas opcionais: nome_avaliado, nome_avaliador</p>
                <p className="mt-1">
                  <strong>Atenção:</strong> os e-mails devem pertencer a participantes já adicionados ao ciclo.
                </p>
                <button
                  onClick={downloadAssignmentTemplate}
                  className="text-blue-600 hover:text-blue-800 underline mt-1"
                >
                  Baixar modelo de planilha
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Selecionar arquivo</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleMatrixFile}
                  className="w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-sm file:text-gray-600 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
                />
              </div>

              {matrixErrors.length > 0 && (
                <div className="bg-red-50 rounded-lg p-3 space-y-1">
                  {matrixErrors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {matrixRows.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    {matrixRows.length} vínculo(s) encontrado(s) — prévia:
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Avaliado</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Avaliador</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Relação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {matrixRows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-900">{row.evaluated_email}</td>
                            <td className="px-3 py-1.5 text-gray-500">{row.evaluator_email}</td>
                            <td className="px-3 py-1.5 text-gray-400">{row.relationship_code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setShowMatrixModal(false)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmMatrixImport}
                  disabled={importingMatrix || matrixRows.length === 0}
                  className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {importingMatrix ? 'Importando...' : `Importar ${matrixRows.length > 0 ? `(${matrixRows.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add assignment ── */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">
                Adicionar avaliador para {assignTarget.person.name}
              </h3>
              <button onClick={() => setAssignTarget(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Avaliador</label>
                <select
                  value={assignEvaluatorCpId}
                  onChange={(e) => setAssignEvaluatorCpId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Selecione...</option>
                  {participants
                    .filter((p) => p.id !== assignTarget.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.person.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Relação</label>
                <select
                  value={assignRelationship}
                  onChange={(e) => setAssignRelationship(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {Object.entries(REL_LABEL)
                    .filter(([code]) => code !== 'self')
                    .map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                </select>
              </div>
              {assignError && <p className="text-sm text-red-500">{assignError}</p>}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => setAssignTarget(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={savingAssignment}
                  className="bg-gray-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {savingAssignment ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * DpaDashboardPage — Dashboard de um projeto DPA
 *
 * Rota: /dpa/:id
 *
 * Mostra:
 *  - Taxa de resposta geral e por unidade
 *  - Resultados por pergunta (barras para escala_5, lista para texto_livre)
 *  - Tabela de participantes (com links para copiar/reenviar)
 *  - Ações: ativar/encerrar projeto, exportar PDF e Excel
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/modules/auth/TenantContext'
import { exportDpaPdf } from '@/lib/exportDpaPdf'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pergunta {
  id:          string
  texto:       string
  tipo:        'escala_5' | 'texto_livre' | 'multipla_escolha'
  obrigatoria: boolean
  opcoes?:     string[]
}

interface DpaConfig {
  label_unidade: string
  perguntas:     Pergunta[]
}

interface DpaProject {
  id:        string
  nome:      string
  descricao: string | null
  status:    'rascunho' | 'ativo' | 'encerrado'
  config:    DpaConfig
}

interface Resposta {
  id:            string
  unidade:       string | null
  respondido_em: string | null
  respostas:     Record<string, string | number>
}

interface UnidadeStat {
  unidade:     string
  total:       number
  respondidos: number
}

interface DashboardData {
  total_participantes: number
  total_respondidos:   number
  taxa_resposta:       number
  label_unidade:       string
  por_unidade:         UnidadeStat[]
  respostas:           Resposta[]
}

interface Participante {
  id:            string
  nome:          string | null
  email:         string
  unidade:       string | null
  status:        'pendente' | 'respondido'
  token:         string
  respondido_em: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  rascunho:  'bg-gray-100 text-gray-600',
  ativo:     'bg-green-100 text-green-700',
  encerrado: 'bg-gray-100 text-gray-500',
}
const STATUS_LABELS: Record<string, string> = {
  rascunho:  'Rascunho',
  ativo:     'Ativo',
  encerrado: 'Encerrado',
}

function scoreColor(avg: number): string {
  if (avg >= 4)  return 'bg-green-500'
  if (avg >= 3)  return 'bg-yellow-400'
  return 'bg-red-400'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DpaDashboardPage() {
  const { id }       = useParams<{ id: string }>()
  const { branding } = useTenant()

  const [project,      setProject]      = useState<DpaProject | null>(null)
  const [dashboard,    setDashboard]    = useState<DashboardData | null>(null)
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [tab,          setTab]          = useState<'resultados' | 'participantes'>('resultados')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [updating,     setUpdating]     = useState(false)
  const [copied,       setCopied]       = useState<string | null>(null)
  const [sendingEmail,   setSendingEmail]   = useState<string | null>(null)  // participant id being sent
  const [sendingBulk,    setSendingBulk]    = useState(false)
  const [emailFeedback,  setEmailFeedback]  = useState<string | null>(null)

  // ── New participant form ──────────────────────────────────────────────────
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [addNome,       setAddNome]       = useState('')
  const [addEmail,      setAddEmail]      = useState('')
  const [addUnidade,    setAddUnidade]    = useState('')
  const [addSaving,     setAddSaving]     = useState(false)
  const [addError,      setAddError]      = useState('')

  async function load() {
    if (!id) return

    const [projRes, partRes] = await Promise.all([
      supabase
        .from('dpa_projetos')
        .select('id, nome, descricao, status, config')
        .eq('id', id)
        .single(),
      supabase
        .from('dpa_participantes')
        .select('id, nome, email, unidade, status, token, respondido_em')
        .eq('projeto_id', id)
        .order('created_at', { ascending: true }),
    ])

    if (projRes.error || !projRes.data) {
      setError(projRes.error?.message || 'Projeto não encontrado')
      setLoading(false)
      return
    }

    setProject(projRes.data as DpaProject)
    setParticipantes((partRes.data ?? []) as Participante[])

    if ((projRes.data as DpaProject).status !== 'rascunho') {
      const { data: dashData, error: dashError } = await supabase.rpc('get_dpa_dashboard', {
        p_projeto_id: id,
      })
      if (!dashError && dashData) {
        setDashboard(dashData as DashboardData)
      }
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // ── Status change ──────────────────────────────────────────────────────────

  async function changeStatus(newStatus: 'ativo' | 'encerrado') {
    if (!id) return
    setUpdating(true)
    await supabase.from('dpa_projetos').update({ status: newStatus }).eq('id', id)
    await load()
    setUpdating(false)
  }

  // ── Copy link ──────────────────────────────────────────────────────────────

  function copyLink(token: string) {
    const url = `${window.location.origin}/diagnostico/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  // ── Send email ─────────────────────────────────────────────────────────────

  async function sendEmail(participantId: string) {
    setSendingEmail(participantId)
    setEmailFeedback(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('send-dpa-invite', {
      body: {
        participant_id: participantId,
        base_url: window.location.origin,
      },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    })
    setSendingEmail(null)
    if (res.error || !(res.data as { ok: boolean })?.ok) {
      setEmailFeedback(`Erro: ${(res.data as { error?: string })?.error ?? res.error?.message}`)
    } else {
      setEmailFeedback('E-mail enviado com sucesso!')
      await load()
    }
    setTimeout(() => setEmailFeedback(null), 4000)
  }

  async function sendEmailBulk() {
    const pending = participantes.filter((p) => p.status === 'pendente')
    if (pending.length === 0) return
    setSendingBulk(true)
    setEmailFeedback(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('send-dpa-invite', {
      body: {
        participant_ids: pending.map((p) => p.id),
        base_url: window.location.origin,
      },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    })
    setSendingBulk(false)
    const data = res.data as { ok: boolean; sent?: number; skipped?: number; error?: string }
    if (res.error || !data?.ok) {
      setEmailFeedback(`Erro: ${data?.error ?? res.error?.message}`)
    } else {
      setEmailFeedback(`✓ ${data.sent} e-mail${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''}${data.skipped ? ` · ${data.skipped} ignorado${data.skipped !== 1 ? 's' : ''}` : ''}`)
      await load()
    }
    setTimeout(() => setEmailFeedback(null), 5000)
  }

  // ── Add participant ────────────────────────────────────────────────────────

  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault()
    if (!addEmail.includes('@')) { setAddError('E-mail inválido'); return }
    setAddSaving(true)
    setAddError('')

    const { error: insertErr } = await supabase.from('dpa_participantes').insert({
      projeto_id: id,
      nome:       addNome || null,
      email:      addEmail,
      unidade:    addUnidade || null,
    })

    if (insertErr) {
      setAddError(insertErr.message)
      setAddSaving(false)
      return
    }

    setAddNome('')
    setAddEmail('')
    setAddUnidade('')
    setShowAddForm(false)
    setAddSaving(false)
    await load()
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  function exportExcel() {
    if (!project || !dashboard) return
    const perguntas = project.config.perguntas

    const headers = [
      dashboard.label_unidade,
      'Respondido em',
      ...perguntas.map((p, i) => `P${i + 1}: ${p.texto.slice(0, 50)}`),
    ]

    const rows = dashboard.respostas.map((r) => [
      r.unidade ?? '',
      r.respondido_em ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '',
      ...perguntas.map((p) => r.respostas[p.id] ?? ''),
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, ...perguntas.map(() => ({ wch: 30 }))]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Respostas')

    // Stats sheet
    const statsHeaders = [dashboard.label_unidade, 'Total', 'Respondidos', 'Taxa']
    const statsRows = dashboard.por_unidade.map((u) => [
      u.unidade,
      u.total,
      u.respondidos,
      u.total > 0 ? `${Math.round((u.respondidos / u.total) * 100)}%` : '—',
    ])
    const ws2 = XLSX.utils.aoa_to_sheet([statsHeaders, ...statsRows])
    XLSX.utils.book_append_sheet(wb, ws2, 'Por unidade')

    const safe = project.nome.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
    XLSX.writeFile(wb, `DPA_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Compute question stats ─────────────────────────────────────────────────

  type ScaleStats = { kind: 'scale'; avg: number; dist: Record<number, number>; total: number }
  type TextStats  = { kind: 'text';  texts: string[]; total: number }

  function questionStats(pId: string, tipo: string): ScaleStats | TextStats | null {
    if (!dashboard) return null
    const values = dashboard.respostas
      .map((r) => r.respostas[pId])
      .filter((v) => v !== undefined && v !== null && v !== '')

    if (tipo === 'escala_5') {
      const nums = values.map(Number).filter((v) => !isNaN(v))
      if (nums.length === 0) return null
      const avg  = nums.reduce((s, v) => s + v, 0) / nums.length
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const v of nums) dist[v] = (dist[v] || 0) + 1
      return { kind: 'scale', avg, dist, total: nums.length }
    }

    return { kind: 'text', texts: values as string[], total: values.length }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <p className="text-gray-400 text-sm">Carregando...</p>
  if (error)   return <p className="text-red-500 text-sm">{error}</p>
  if (!project) return null

  const { config } = project

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/dpa" className="text-sm text-gray-400 hover:text-gray-600">
          ← Diagnósticos
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-gray-900">{project.nome}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.status]}`}>
                {STATUS_LABELS[project.status]}
              </span>
            </div>
            {project.descricao && (
              <p className="text-sm text-gray-500 mt-0.5">{project.descricao}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status actions */}
            {project.status === 'rascunho' && (
              <button
                onClick={() => changeStatus('ativo')}
                disabled={updating || participantes.length === 0}
                title={participantes.length === 0 ? 'Adicione participantes antes de ativar' : ''}
                className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {updating ? 'Ativando...' : '▶ Ativar'}
              </button>
            )}
            {project.status === 'ativo' && (
              <button
                onClick={() => changeStatus('encerrado')}
                disabled={updating}
                className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {updating ? '...' : '⏹ Encerrar'}
              </button>
            )}

            {dashboard && (
              <>
                <button
                  onClick={exportExcel}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  ↓ Excel
                </button>
                <button
                  onClick={async () => {
                    setExportingPdf(true)
                    await exportDpaPdf(project, dashboard, {
                      companyName:  branding.name,
                      logoUrl:      branding.logoUrl,
                      primaryColor: branding.primaryColor,
                      footerText:   branding.pdfFooterText,
                      hideMaptiva:  branding.hideMaptiva,
                    })
                    setExportingPdf(false)
                  }}
                  disabled={exportingPdf}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {exportingPdf ? 'Gerando...' : '↓ PDF'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI bar ── */}
      {dashboard ? (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">Taxa de resposta</p>
            <p className="text-3xl font-bold text-gray-900">{dashboard.taxa_resposta}%</p>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${dashboard.taxa_resposta}%` }}
              />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">Responderam</p>
            <p className="text-3xl font-bold text-gray-900">{dashboard.total_respondidos}</p>
            <p className="text-xs text-gray-400">de {dashboard.total_participantes} participantes</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-400 mb-1">Pendentes</p>
            <p className="text-3xl font-bold text-gray-900">
              {dashboard.total_participantes - dashboard.total_respondidos}
            </p>
            <p className="text-xs text-gray-400">aguardando resposta</p>
          </div>
        </div>
      ) : project.status === 'rascunho' ? (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-4 mb-6 text-sm text-amber-800">
          ⚠️ O projeto está em rascunho. Adicione participantes e ative para começar a coletar respostas.
        </div>
      ) : null}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['resultados', 'participantes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'resultados' ? 'Resultados' : `Participantes (${participantes.length})`}
          </button>
        ))}
      </div>

      {/* ── Tab: Resultados ── */}
      {tab === 'resultados' && (
        <div className="space-y-5">
          {!dashboard ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-400 text-sm">Nenhum dado disponível ainda.</p>
            </div>
          ) : (
            <>
              {/* Per-unit breakdown */}
              {dashboard.por_unidade.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Participação por {config.label_unidade}
                  </h3>
                  <div className="space-y-3">
                    {dashboard.por_unidade.map((u) => {
                      const pct = u.total > 0 ? Math.round((u.respondidos / u.total) * 100) : 0
                      return (
                        <div key={u.unidade} className="flex items-center gap-3">
                          <span className="text-xs text-gray-700 w-32 truncate shrink-0" title={u.unidade}>
                            {u.unidade}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-24 text-right shrink-0">
                            {u.respondidos}/{u.total} ({pct}%)
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Per-question results */}
              {config.perguntas.map((p, idx) => {
                const stats = questionStats(p.id, p.tipo)
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.texto}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.tipo === 'escala_5' ? 'Escala 1–5' : p.tipo === 'texto_livre' ? 'Texto livre' : 'Múltipla escolha'}
                          {' · '}{stats?.total ?? 0} resposta{(stats?.total ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Scale stats */}
                    {p.tipo === 'escala_5' && stats?.kind === 'scale' && (() => {
                      const ss = stats as ScaleStats
                      return (
                        <div className="ml-9">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl font-bold text-gray-900">
                              {ss.avg.toFixed(2)}
                            </span>
                            <span className="text-sm text-gray-400">média</span>
                          </div>
                          <div className="space-y-1.5">
                            {[5, 4, 3, 2, 1].map((val) => {
                              const count  = ss.dist[val] || 0
                              const pct    = ss.total > 0 ? (count / ss.total) * 100 : 0
                              return (
                                <div key={val} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 w-4 text-right">{val}</span>
                                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                                    <div
                                      className={`h-full ${scoreColor(val)} transition-all`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-400 w-16 text-right">
                                    {count} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Multiple choice stats */}
                    {p.tipo === 'multipla_escolha' && stats?.kind === 'text' && (() => {
                      const ts = stats as TextStats
                      return (
                        <div className="ml-9 space-y-1.5">
                          {(p.opcoes ?? []).map((opcao) => {
                            const count = ts.texts.filter((t) => t === opcao).length
                            const pct   = ts.total > 0 ? (count / ts.total) * 100 : 0
                            return (
                              <div key={opcao} className="flex items-center gap-2">
                                <span className="text-xs text-gray-700 w-32 truncate shrink-0" title={opcao}>{opcao}</span>
                                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400 w-16 text-right">
                                  {count} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* Text answers */}
                    {p.tipo === 'texto_livre' && stats?.kind === 'text' && (() => {
                      const ts = stats as TextStats
                      return (
                        <div className="ml-9 space-y-2">
                          {ts.texts.length === 0 ? (
                            <p className="text-xs text-gray-400">Nenhuma resposta ainda.</p>
                          ) : (
                            ts.texts.slice(0, 20).map((text, i) => (
                              <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700">
                                {text}
                              </div>
                            ))
                          )}
                          {ts.texts.length > 20 && (
                            <p className="text-xs text-gray-400">
                              + {ts.texts.length - 20} mais respostas — exporte o Excel para ver todas.
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Participantes ── */}
      {tab === 'participantes' && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-sm text-gray-500">
              {participantes.filter((p) => p.status === 'respondido').length} responderam de {participantes.length}
            </p>
            <div className="flex items-center gap-2">
              {project.status === 'ativo' && participantes.some((p) => p.status === 'pendente') && (
                <button
                  onClick={sendEmailBulk}
                  disabled={sendingBulk}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {sendingBulk ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando...
                    </>
                  ) : (
                    <>✉ Enviar para pendentes ({participantes.filter((p) => p.status === 'pendente').length})</>
                  )}
                </button>
              )}
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                + Adicionar participante
              </button>
            </div>
          </div>

          {/* Email feedback toast */}
          {emailFeedback && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-xs font-medium ${
              emailFeedback.startsWith('Erro')
                ? 'bg-red-50 border border-red-100 text-red-700'
                : 'bg-green-50 border border-green-100 text-green-700'
            }`}>
              {emailFeedback}
            </div>
          )}

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={handleAddParticipant} className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nome</label>
                  <input
                    type="text"
                    value={addNome}
                    onChange={(e) => setAddNome(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Nome (opcional)"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                    className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{config.label_unidade}</label>
                  <input
                    type="text"
                    value={addUnidade}
                    onChange={(e) => setAddUnidade(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder={config.label_unidade}
                  />
                </div>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {addSaving ? '...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5"
                >
                  Cancelar
                </button>
              </div>
              {addError && <p className="text-xs text-red-500 mt-2">{addError}</p>}
            </form>
          )}


          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Nome / E-mail</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{config.label_unidade}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {participantes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Nenhum participante adicionado ainda.
                    </td>
                  </tr>
                ) : participantes.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      {p.nome && <p className="font-medium text-gray-800">{p.nome}</p>}
                      <p className={p.nome ? 'text-gray-400' : 'text-gray-800'}>{p.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.unidade ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.status === 'respondido' ? (
                        <span className="inline-flex items-center gap-1 text-green-700 font-medium text-xs">
                          ✓ Respondido
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Pendente</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => copyLink(p.token)}
                          className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                        >
                          {copied === p.token ? '✓ Link copiado' : 'Copiar link'}
                        </button>
                        {project.status === 'ativo' && p.status === 'pendente' && (
                          <button
                            onClick={() => sendEmail(p.id)}
                            disabled={sendingEmail === p.id}
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 transition-colors flex items-center gap-1"
                          >
                            {sendingEmail === p.id ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Enviando...
                              </>
                            ) : 'Enviar e-mail'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * MyReportPage — Relatório individual do participante logado
 *
 * Rota: /cycles/:id/my-report
 *
 * Usa o RPC `get_my_report(cycle_id)` que:
 *   - É automaticamente escopado ao usuário logado (via auth.uid → people)
 *   - Requer relatório liberado (report_release_at set) para não-admin
 *   - Retorna profile + snapshots visíveis (n-minimum aplicado no banco)
 *
 * Também carrega `comments_published` para exibir comentários qualitativos.
 * A view já aplica as regras de anonimato e n-minimum.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyReportData {
  cycle: {
    id:     string
    name:   string
    status: string
  }
  profile: {
    overall_score:         number | null
    self_score:            number | null
    manager_score:         number | null
    peer_score:            number | null
    subordinate_score:     number | null
    blind_spot_count:      number
    hidden_strength_count: number
    generated_at:          string | null
  } | null
  snapshots: SnapshotRow[]
}

interface SnapshotRow {
  relationship_code: string
  competency_id:     string | null
  dimension_code:    string | null
  score_avg:         number | null
  response_count:    number
}

interface CompetencyRow {
  id:             string
  name:           string
  dimension_code: string | null
}

interface CommentRow {
  id:                            string
  cycle_id:                      string
  evaluated_cycle_participant_id: string
  relationship_group:            string
  body:                          string
}

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ value, label }: { value: number | null; label: string }) {
  const color = value == null
    ? 'bg-gray-50 text-gray-300'
    : value >= 4 ? 'bg-green-50 text-green-700'
    : value >= 3 ? 'bg-yellow-50 text-yellow-700'
    : 'bg-red-50 text-red-600'

  return (
    <div className={`rounded-xl p-4 text-center ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  )
}

// ─── Relationship labels ──────────────────────────────────────────────────────

const REL_LABEL: Record<string, string> = {
  self:        'Autoavaliação',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subordinados',
  client:      'Clientes',
}

const REL_SHORT: Record<string, string> = {
  self:        'Self',
  manager:     'Gestor',
  peer:        'Pares',
  subordinate: 'Subord.',
  client:      'Cliente',
}

// ─── Competency breakdown ─────────────────────────────────────────────────────

function CompetencyBreakdown({
  snapshots,
  competencies,
}: {
  snapshots:    SnapshotRow[]
  competencies: CompetencyRow[]
}) {
  const withComp = snapshots.filter((s) => s.competency_id && s.score_avg != null)
  if (withComp.length === 0) return null

  const compMap = new Map(competencies.map((c) => [c.id, c]))

  // Group by competency_id
  const byComp = new Map<string, SnapshotRow[]>()
  for (const s of withComp) {
    if (!s.competency_id) continue
    if (!byComp.has(s.competency_id)) byComp.set(s.competency_id, [])
    byComp.get(s.competency_id)!.push(s)
  }

  const relationships = [...new Set(withComp.map((s) => s.relationship_code))].sort()

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Por competência
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-gray-500 font-medium pb-3 pr-6 min-w-[180px]">
                Competência
              </th>
              {relationships.map((r) => (
                <th key={r} className="text-center text-gray-500 font-medium pb-3 px-4 min-w-[80px]">
                  {REL_SHORT[r] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...byComp.entries()].map(([compId, snaps]) => {
              const comp = compMap.get(compId)
              return (
                <tr key={compId}>
                  <td className="py-3 pr-6 text-gray-700 font-medium">
                    {comp?.name ?? '—'}
                  </td>
                  {relationships.map((r) => {
                    const snap = snaps.find((s) => s.relationship_code === r)
                    return (
                      <td key={r} className="py-3 px-4 text-center">
                        {snap?.score_avg != null ? (
                          <span className={`font-semibold ${
                            snap.score_avg >= 4 ? 'text-green-600'
                            : snap.score_avg >= 3 ? 'text-yellow-600'
                            : 'text-red-500'
                          }`}>
                            {snap.score_avg.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Comments section ─────────────────────────────────────────────────────────

function CommentsSection({ comments }: { comments: CommentRow[] }) {
  // Deduplicate (view may produce duplicates when multiple competency snapshots exist)
  const unique = [...new Map(comments.map((c) => [c.id, c])).values()]
  if (unique.length === 0) return null

  // Group by relationship_group
  const byRel = new Map<string, string[]>()
  for (const c of unique) {
    if (!byRel.has(c.relationship_group)) byRel.set(c.relationship_group, [])
    byRel.get(c.relationship_group)!.push(c.body)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Comentários qualitativos
      </h2>
      <div className="space-y-5">
        {[...byRel.entries()].map(([rel, bodies]) => (
          <div key={rel}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {REL_LABEL[rel] ?? rel}
            </p>
            <div className="space-y-2">
              {bodies.map((body, i) => (
                <p
                  key={i}
                  className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 leading-relaxed border-l-2 border-gray-200"
                >
                  "{body}"
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Os comentários são apresentados de forma anônima e agregada, respeitando o número mínimo de avaliadores por grupo.
      </p>
    </div>
  )
}

// ─── Insights panel ───────────────────────────────────────────────────────────

function InsightsPanel({ profile }: { profile: NonNullable<MyReportData['profile']> }) {
  if (profile.blind_spot_count === 0 && profile.hidden_strength_count === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Insights
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {profile.blind_spot_count > 0 && (
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-600">{profile.blind_spot_count}</p>
            <p className="text-sm font-medium text-amber-700 mt-1">
              Ponto{profile.blind_spot_count !== 1 ? 's' : ''} cego{profile.blind_spot_count !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-600/70 mt-1 leading-relaxed">
              Competências onde outros te avaliam abaixo da sua autoavaliação
            </p>
          </div>
        )}
        {profile.hidden_strength_count > 0 && (
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-blue-600">{profile.hidden_strength_count}</p>
            <p className="text-sm font-medium text-blue-700 mt-1">
              Força{profile.hidden_strength_count !== 1 ? 's' : ''} oculta{profile.hidden_strength_count !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-blue-600/70 mt-1 leading-relaxed">
              Competências onde outros te avaliam acima da sua autoavaliação
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Snapshot by relationship ─────────────────────────────────────────────────

function SnapshotsByRelationship({ snapshots }: { snapshots: SnapshotRow[] }) {
  // Snapshots without competency_id are the overall-per-relationship scores
  const overallSnaps = snapshots.filter((s) => !s.competency_id)
  if (overallSnaps.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Scores por perspectiva
      </h2>
      <div className="space-y-3">
        {overallSnaps.map((s) => (
          <div key={s.relationship_code} className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-32 shrink-0">
              {REL_LABEL[s.relationship_code] ?? s.relationship_code}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  s.score_avg == null ? 'bg-gray-200'
                  : s.score_avg >= 4 ? 'bg-green-500'
                  : s.score_avg >= 3 ? 'bg-yellow-400'
                  : 'bg-red-400'
                }`}
                style={{ width: s.score_avg != null ? `${(s.score_avg / 5) * 100}%` : '0%' }}
              />
            </div>
            <span className={`text-sm font-semibold w-10 text-right ${
              s.score_avg == null ? 'text-gray-300'
              : s.score_avg >= 4 ? 'text-green-600'
              : s.score_avg >= 3 ? 'text-yellow-600'
              : 'text-red-500'
            }`}>
              {s.score_avg != null ? s.score_avg.toFixed(2) : '—'}
            </span>
            <span className="text-xs text-gray-400 w-24 text-right">
              {s.response_count} resposta{s.response_count !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function MyReportPage() {
  const { id } = useParams<{ id: string }>()

  const [report,       setReport]       = useState<MyReportData | null>(null)
  const [competencies, setCompetencies] = useState<CompetencyRow[]>([])
  const [comments,     setComments]     = useState<CommentRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [errorCode,    setErrorCode]    = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      // Get the personal report (scoped to logged-in user via RPC)
      const { data, error } = await supabase.rpc('get_my_report', { p_cycle_id: id })

      if (error) {
        // Map database errcodes to user-friendly messages
        setErrorCode(error.message.includes('report_not_released')
          ? 'not_released'
          : error.message.includes('participant_not_found')
          ? 'not_participant'
          : error.message.includes('cycle_not_found')
          ? 'not_found'
          : 'generic'
        )
        setLoading(false)
        return
      }

      const reportData = data as MyReportData
      setReport(reportData)

      // Load competency names if we have snapshots with competency_ids
      const compIds = [
        ...new Set(
          (reportData.snapshots ?? [])
            .map((s) => s.competency_id)
            .filter(Boolean) as string[]
        ),
      ]
      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from('competencies')
          .select('id, name, dimension_code')
          .in('id', compIds)
        setCompetencies((compData ?? []) as CompetencyRow[])
      }

      // Load comments (view is already filtered to this participant + n-minimum applied)
      const { data: commData } = await supabase
        .from('comments_published')
        .select('id, cycle_id, evaluated_cycle_participant_id, relationship_group, body')
        .eq('cycle_id', id)
      setComments((commData ?? []) as CommentRow[])

      setLoading(false)
    }
    load()
  }, [id])

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-400 text-sm animate-pulse">Carregando seu relatório...</p>
      </div>
    )
  }

  if (errorCode) {
    const messages: Record<string, { title: string; body: string; icon: string }> = {
      not_released: {
        icon: '🔒',
        title: 'Relatório ainda não liberado',
        body: 'O administrador do ciclo ainda não liberou os resultados para os participantes.',
      },
      not_participant: {
        icon: '👤',
        title: 'Você não é participante deste ciclo',
        body: 'Sua conta não está vinculada como participante neste ciclo de avaliação. Entre em contato com o administrador.',
      },
      not_found: {
        icon: '🔍',
        title: 'Ciclo não encontrado',
        body: 'O ciclo de avaliação solicitado não existe ou você não tem acesso.',
      },
      generic: {
        icon: '⚠️',
        title: 'Erro ao carregar relatório',
        body: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      },
    }
    const msg = messages[errorCode] ?? messages.generic

    return (
      <div className="max-w-3xl mx-auto">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
          ← Voltar
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-4xl mb-4">{msg.icon}</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{msg.title}</h2>
          <p className="text-sm text-gray-500">{msg.body}</p>
        </div>
      </div>
    )
  }

  if (!report) return null

  const profile  = report.profile
  const hasScore = profile?.overall_score != null
  const hasCompetencies = competencies.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/cycles" className="text-sm text-gray-400 hover:text-gray-600">
          ← Meus ciclos
        </Link>
        <div className="mt-2">
          <h1 className="text-xl font-semibold text-gray-900">{report.cycle.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">Meu relatório individual</p>
        </div>
      </div>

      {/* ── Not yet scored ── */}
      {!profile && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-3xl mb-4">📊</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Relatório ainda não gerado
          </h2>
          <p className="text-sm text-gray-500">
            Os scores serão calculados quando o ciclo for encerrado e as pontuações consolidadas.
          </p>
        </div>
      )}

      {profile && (
        <div className="space-y-5">
          {/* ── Overall scores grid ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Scores consolidados
            </h2>
            <div className="grid grid-cols-5 gap-3">
              <ScoreBadge value={profile.overall_score}     label="Overall" />
              <ScoreBadge value={profile.self_score}        label="Autoaval." />
              <ScoreBadge value={profile.manager_score}     label="Gestor" />
              <ScoreBadge value={profile.peer_score}        label="Pares" />
              <ScoreBadge value={profile.subordinate_score} label="Subordin." />
            </div>

            {profile.generated_at && (
              <p className="text-xs text-gray-400 mt-4 text-right">
                Calculado em {new Date(profile.generated_at).toLocaleString('pt-BR')}
              </p>
            )}

            {!hasScore && (
              <p className="text-xs text-gray-400 mt-4 text-center">
                Perfil criado mas sem scores calculados. Verifique se as questões têm competências vinculadas.
              </p>
            )}
          </div>

          {/* ── Insights (blind spots / hidden strengths) ── */}
          <InsightsPanel profile={profile} />

          {/* ── Scores by relationship (bar chart style) ── */}
          <SnapshotsByRelationship snapshots={report.snapshots} />

          {/* ── Competency breakdown table ── */}
          {hasCompetencies && (
            <CompetencyBreakdown
              snapshots={report.snapshots}
              competencies={competencies}
            />
          )}

          {/* ── Qualitative comments ── */}
          {comments.length > 0 && <CommentsSection comments={comments} />}

          {/* ── Confidentiality notice ── */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Privacidade e anonimato:</strong> Os resultados são apresentados de forma
              agregada. Scores de grupos com menos de {3} avaliadores não são exibidos individualmente
              para preservar a confidencialidade dos avaliadores.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

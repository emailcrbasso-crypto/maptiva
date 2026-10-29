/**
 * DpaEmailComposer — modal para escrever e disparar e-mails (convite, lembrete,
 * último dia) para os participantes pendentes de um projeto DPA.
 *
 * O texto é enviado como `email_override` à Edge Function `send-dpa-invite`,
 * que mantém a mesma casca visual do projeto. Modelos próprios ficam salvos em
 * `config.email_modelos` do projeto.
 */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface EmailModelo {
  id:      string
  nome:    string
  subject: string
  body:    string
}

interface Props {
  projectId:     string
  config:        Record<string, unknown>
  pendentes:     Array<{ id: string; nome: string | null; email: string }>
  onClose:       () => void
  onConfigSaved: (config: Record<string, unknown>) => void
  onSent:        () => void
}

// Lotes pequenos por chamada: a Edge Function espaça os envios e tem tempo
// limite, então o front divide a lista e mostra o progresso.
const CHUNK = 25

const PRESETS: EmailModelo[] = [
  {
    id: 'preset-convite',
    nome: 'Convite',
    subject: 'Diagnóstico | Convite para participar',
    body: `Olá, {{NOME}}.

Você foi convidado(a) a responder um diagnóstico rápido. Leva poucos minutos.

Responder agora:
{{LINK}}

Se não esperava este e-mail, pode ignorá-lo.`,
  },
  {
    id: 'preset-lembrete',
    nome: 'Lembrete',
    subject: 'Lembrete | Seu diagnóstico ainda está aberto',
    body: `Olá, {{NOME}}.

Passando para lembrar que o diagnóstico ainda está aberto e a sua resposta faz diferença. Leva poucos minutos.

Responder agora:
{{LINK}}

Se você já respondeu, pode ignorar esta mensagem. Obrigado!`,
  },
  {
    id: 'preset-ultimo-dia',
    nome: 'Último dia',
    subject: 'Último dia | Diagnóstico',
    body: `Olá, {{NOME}}.

Hoje é o último dia para responder ao diagnóstico. São poucos minutos, e a sua resposta ajuda a equipe a chegar ao encontro com um retrato real do grupo.

Responder agora:
{{LINK}}

Se você já respondeu, pode ignorar esta mensagem. Obrigado!`,
  },
]

export function DpaEmailComposer({ projectId, config, pendentes, onClose, onConfigSaved, onSent }: Props) {
  const salvos = (config.email_modelos as EmailModelo[] | undefined) ?? []
  const modelos = [...PRESETS, ...salvos]

  const [modeloId, setModeloId] = useState(PRESETS[1].id)
  const [subject,  setSubject]  = useState(PRESETS[1].subject)
  const [body,     setBody]     = useState(PRESETS[1].body)
  const [nomeNovo, setNomeNovo] = useState('')
  const [sending,  setSending]  = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirm,  setConfirm]  = useState(false)
  const [testeEmail, setTesteEmail] = useState('')
  const [testando,   setTestando]   = useState(false)

  const semLink = !body.includes('{{LINK}}')
  const exemplo = pendentes[0]

  function escolher(id: string) {
    const m = modelos.find((x) => x.id === id)
    if (!m) return
    setModeloId(id)
    setSubject(m.subject)
    setBody(m.body)
    setConfirm(false)
  }

  async function salvarModelo() {
    const nome = nomeNovo.trim()
    if (!nome) { setFeedback('Erro: dê um nome ao modelo.'); return }
    const novo: EmailModelo = { id: crypto.randomUUID(), nome, subject, body }
    const nova = { ...config, email_modelos: [...salvos, novo] }
    const { error } = await supabase.from('dpa_projetos').update({ config: nova }).eq('id', projectId)
    if (error) { setFeedback(`Erro ao salvar modelo: ${error.message}`); return }
    onConfigSaved(nova)
    setModeloId(novo.id)
    setNomeNovo('')
    setFeedback('Modelo salvo.')
  }

  async function removerModelo() {
    const nova = { ...config, email_modelos: salvos.filter((m) => m.id !== modeloId) }
    const { error } = await supabase.from('dpa_projetos').update({ config: nova }).eq('id', projectId)
    if (error) { setFeedback(`Erro: ${error.message}`); return }
    onConfigSaved(nova)
    escolher(PRESETS[1].id)
  }

  // Teste: usa o link de um pendente só como exemplo, mas entrega no e-mail
  // informado e não marca ninguém como enviado. Não responda por esse link.
  async function enviarTeste() {
    if (!exemplo || !testeEmail.includes('@') || semLink) return
    setTestando(true)
    setFeedback(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('send-dpa-invite', {
      body: {
        participant_ids: [exemplo.id],
        base_url: window.location.origin,
        email_override: { subject, body_template: body },
        test_to: testeEmail.trim(),
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    })
    setTestando(false)
    const data = res.data as { ok: boolean; sent?: number; test?: boolean; error?: string } | null
    // data.test só vem na versão nova da função; sem ele o e-mail pode ter ido
    // ao participante de verdade, então não anunciamos sucesso.
    setFeedback(data?.ok && data.sent && data.test !== true
      ? 'Erro: a função send-dpa-invite no Supabase está desatualizada — o e-mail pode ter sido enviado ao participante de exemplo. Publique a função de novo.'
      : res.error || !data?.ok || !data.sent
      ? `Erro no teste: ${data?.error ?? res.error?.message ?? 'não enviado'}`
      : `✓ Teste enviado para ${testeEmail.trim()}. Não responda por esse link, ele é de ${exemplo.nome?.trim() || exemplo.email}.`)
  }

  async function enviar() {
    if (!subject.trim() || semLink) return
    setSending(true)
    setFeedback(null)
    let sent = 0
    let skipped = 0
    const ids = pendentes.map((p) => p.id)
    setProgress({ done: 0, total: ids.length })

    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('send-dpa-invite', {
        body: {
          participant_ids: ids.slice(i, i + CHUNK),
          base_url: window.location.origin,
          email_override: { subject, body_template: body },
        },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
      const data = res.data as { ok: boolean; sent?: number; skipped?: number; error?: string } | null
      if (res.error || !data?.ok) {
        setFeedback(`Erro após ${sent} enviados: ${data?.error ?? res.error?.message}. Você pode tentar de novo — quem já respondeu é ignorado.`)
        setSending(false)
        onSent()
        return
      }
      sent += data.sent ?? 0
      skipped += data.skipped ?? 0
      setProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length })
    }

    setSending(false)
    setConfirm(false)
    setFeedback(`✓ ${sent} e-mail${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''}${skipped ? ` · ${skipped} ignorado${skipped !== 1 ? 's' : ''}` : ''}`)
    onSent()
  }

  const previewNome = exemplo?.nome?.trim() || 'participante'
  const preview = body.replace(/\{\{NOME\}\}/g, previewNome).replace(/\{\{LINK\}\}/g, 'https://…/diagnostico/seu-link')
  const ehSalvo = salvos.some((m) => m.id === modeloId)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !sending && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Enviar e-mail aos pendentes</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendentes.length} participante{pendentes.length !== 1 ? 's' : ''} ainda sem resposta. Quem já respondeu não recebe.
            </p>
          </div>
          <button onClick={onClose} disabled={sending} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600">
              Modelo
              <select
                value={modeloId}
                onChange={(e) => escolher(e.target.value)}
                disabled={sending}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              >
                <optgroup label="Prontos">
                  {PRESETS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </optgroup>
                {salvos.length > 0 && (
                  <optgroup label="Salvos neste projeto">
                    {salvos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </optgroup>
                )}
              </select>
            </label>

            <label className="block text-xs font-medium text-gray-600">
              Assunto
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sending}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
              />
            </label>

            <label className="block text-xs font-medium text-gray-600">
              Mensagem
              <textarea
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={sending}
                className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-sans"
              />
            </label>
            <p className="text-[11px] text-gray-400">
              Use <code>{'{{NOME}}'}</code> e <code>{'{{LINK}}'}</code> (link individual de cada pessoa). Linha em branco separa parágrafos.
            </p>
            {semLink && (
              <p className="text-xs text-red-600">A mensagem precisa conter {'{{LINK}}'}, senão ninguém consegue responder.</p>
            )}

            <div className="flex gap-2 pt-1">
              <input
                type="email"
                value={testeEmail}
                onChange={(e) => setTesteEmail(e.target.value)}
                placeholder="Seu e-mail para receber um teste"
                className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5"
              />
              <button
                onClick={enviarTeste}
                disabled={sending || testando || semLink || !testeEmail.includes('@') || !exemplo}
                className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {testando ? 'Enviando…' : 'Enviar teste'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Nome para salvar como modelo"
                className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-1.5"
              />
              <button onClick={salvarModelo} disabled={sending} className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                Salvar modelo
              </button>
              {ehSalvo && (
                <button onClick={removerModelo} disabled={sending} className="text-xs text-red-600 px-2 hover:underline">Excluir</button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">Pré-visualização{exemplo ? ` (para ${previewNome})` : ''}</p>
            <div className="border border-gray-200 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <p className="text-xs text-gray-400 mb-0.5">Assunto</p>
              <p className="font-medium mb-3">{subject || '—'}</p>
              <div className="bg-white rounded-lg p-4 whitespace-pre-line leading-relaxed break-words">{preview}</div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              O e-mail sai com o remetente, o cabeçalho e o rodapé já configurados do projeto.
            </p>
          </div>
        </div>

        {progress && sending && (
          <div className="mt-4">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Enviando… {progress.done} de {progress.total}. Não feche esta janela.</p>
          </div>
        )}

        {feedback && (
          <div className={`mt-4 px-4 py-3 rounded-xl text-xs font-medium ${
            feedback.startsWith('Erro') ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-green-50 border border-green-100 text-green-700'
          }`}>{feedback}</div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={sending} className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">Fechar</button>
          {!confirm ? (
            <button
              onClick={() => setConfirm(true)}
              disabled={sending || semLink || !subject.trim() || pendentes.length === 0}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              ✉ Enviar para {pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}
            </button>
          ) : (
            <button
              onClick={enviar}
              disabled={sending}
              className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {sending ? 'Enviando…' : `Confirmar envio para ${pendentes.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

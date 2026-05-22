/**
 * send-dpa-invite Edge Function
 *
 * Envia o link do formulário DPA por e-mail para um ou mais participantes.
 * Segue o mesmo padrão da send-invite (autenticação, Resend, branding do tenant).
 *
 * POST body:
 *   {
 *     participant_id?:  string    // UUID — envio individual
 *     participant_ids?: string[]  // UUIDs — envio em lote
 *     base_url:         string    // ex: "https://app.maptiva.com.br"
 *   }
 *
 * Ao menos um de participant_id ou participant_ids é obrigatório.
 *
 * Response (sempre HTTP 200 para erros operacionais):
 *   { ok: true,  sent: number, skipped: number }
 *   { ok: false, error: "mensagem" }
 *
 * Required secrets:
 *   RESEND_API_KEY   — Resend API key
 *   EMAIL_FROM       — Remetente padrão, ex: "Maptiva <noreply@maptiva.com.br>"
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ─── Email template ───────────────────────────────────────────────────────────

interface TenantEmailBranding {
  companyName:      string
  logoUrl:          string | null
  primaryColor:     string
  headerHtml:       string | null
  footerHtml:       string | null
  hideMaptiva:      boolean
  emailFromName:    string | null
  emailFromAddress: string | null
}

const DEFAULT_BRANDING: TenantEmailBranding = {
  companyName:      'Maptiva',
  logoUrl:          null,
  primaryColor:     '#111827',
  headerHtml:       null,
  footerHtml:       null,
  hideMaptiva:      false,
  emailFromName:    null,
  emailFromAddress: null,
}

function buildEmail(params: {
  participantName: string | null
  projetoNome:     string
  labelUnidade:    string
  unidade:         string | null
  link:            string
  branding:        TenantEmailBranding
  defaultFrom:     string
}): { subject: string; html: string; from: string } {
  const { participantName, projetoNome, labelUnidade, unidade, link, branding, defaultFrom } = params

  const subject = `Convite para diagnóstico: ${projetoNome}`

  const saudacao = participantName ? `Olá, ${participantName}` : 'Olá'

  const unidadeInfo = unidade
    ? `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px;">
         <strong>${labelUnidade}:</strong> ${unidade}
       </p>`
    : ''

  const headerContent = branding.headerHtml
    ?? (branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${branding.companyName}" height="40" style="height:40px;width:auto;max-height:40px;max-width:220px;display:block;" />`
      : `<span style="color:#fff;font-size:18px;font-weight:600;">${branding.companyName}</span>`)

  const poweredBy = branding.hideMaptiva
    ? ''
    : `<br>Plataforma fornecida por <a href="https://maptiva.com.br" style="color:#9ca3af;">Maptiva</a>`

  const footerContent = branding.footerHtml
    ?? `Este link é de uso único.<br>
        Suas respostas são completamente anônimas e apresentadas de forma agregada.<br>
        Se não esperava este e-mail, pode ignorá-lo com segurança.${poweredBy}`

  const from = (branding.emailFromAddress && branding.emailFromName)
    ? `${branding.emailFromName} <${branding.emailFromAddress}>`
    : defaultFrom

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f9fafb; margin: 0; padding: 40px 16px; color: #111827; }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb;
            max-width: 520px; margin: 0 auto; overflow: hidden; }
    .header { background: ${branding.primaryColor}; padding: 24px 32px; }
    .body { padding: 32px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
    p { font-size: 14px; line-height: 1.6; color: #374151; margin: 0 0 16px; }
    .notice { background: #f0fdf4; border-radius: 8px; padding: 12px 16px;
              font-size: 13px; color: #166534; margin-bottom: 24px; }
    .btn { display: inline-block; background: ${branding.primaryColor}; color: #fff !important;
           text-decoration: none; padding: 14px 28px; border-radius: 8px;
           font-size: 14px; font-weight: 600; }
    .link-fallback { font-size: 12px; color: #9ca3af; margin-top: 20px; word-break: break-all; }
    .footer { padding: 20px 32px; border-top: 1px solid #f3f4f6;
              font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">${headerContent}</div>
    <div class="body">
      <h1>${saudacao}</h1>
      <p>
        Você foi convidado(a) para participar do diagnóstico
        <strong>${projetoNome}</strong>.
      </p>
      ${unidadeInfo}
      <div class="notice">
        🔒 Suas respostas são <strong>completamente anônimas</strong>.
        Os resultados são apresentados de forma agregada — sua identidade nunca é revelada individualmente.
      </div>
      <p>Clique no botão abaixo para responder:</p>
      <a href="${link}" class="btn">Responder diagnóstico</a>
      <p class="link-fallback">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        ${link}
      </p>
    </div>
    <div class="footer">${footerContent}</div>
  </div>
</body>
</html>`

  return { subject, html, from }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM     = Deno.env.get('EMAIL_FROM') ?? 'Maptiva <noreply@maptiva.com.br>'
  const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!

  if (!RESEND_API_KEY) {
    return json({ ok: false, error: 'RESEND_API_KEY secret not configured' })
  }

  // ── 1. Autenticar chamador ────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Unauthorized — missing token' }, 401)
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) {
    return json({ ok: false, error: 'Unauthorized — invalid or expired token' }, 401)
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let body: { participant_id?: string; participant_ids?: string[]; base_url?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' })
  }

  const { participant_id, participant_ids, base_url } = body

  if (!base_url) {
    return json({ ok: false, error: 'Missing required field: base_url' })
  }

  const ids: string[] = participant_ids
    ?? (participant_id ? [participant_id] : [])

  if (ids.length === 0) {
    return json({ ok: false, error: 'Provide participant_id or participant_ids' })
  }

  // ── 3. Resolver auth.uid → public.users.id ───────────────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: publicUser, error: pubErr } = await adminClient
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (pubErr || !publicUser) {
    return json({ ok: false, error: `User profile not found: ${pubErr?.message ?? 'no row'}` })
  }

  const publicUserId = publicUser.id

  // ── 4. Carregar participantes e projetos ──────────────────────────────────────
  const { data: participants, error: partErr } = await adminClient
    .from('dpa_participantes')
    .select('id, nome, email, unidade, status, token, email_enviado_em, projeto_id, tenant_id')
    .in('id', ids)

  if (partErr || !participants || participants.length === 0) {
    return json({ ok: false, error: `Participants not found: ${partErr?.message ?? 'no rows'}` })
  }

  // Verify all participants belong to the same tenant as the caller
  const tenantId = (participants[0] as Record<string, string>).tenant_id

  const { data: membership } = await adminClient
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', publicUserId)
    .in('role', ['admin', 'owner'])
    .maybeSingle()

  if (!membership) {
    return json({ ok: false, error: 'Forbidden — admin or owner role required' }, 403)
  }

  // ── 5. Carregar projeto ───────────────────────────────────────────────────────
  const projetoId = (participants[0] as Record<string, string>).projeto_id

  const { data: projeto } = await adminClient
    .from('dpa_projetos')
    .select('id, nome, status, config')
    .eq('id', projetoId)
    .single()

  if (!projeto) {
    return json({ ok: false, error: 'Project not found' })
  }

  const projetoData = projeto as {
    id: string
    nome: string
    status: string
    config: { label_unidade: string; perguntas: unknown[] }
  }

  if (projetoData.status !== 'ativo') {
    return json({ ok: false, error: 'Cannot send invites — project is not active' })
  }

  // ── 6. Carregar branding do tenant ────────────────────────────────────────────
  let branding: TenantEmailBranding = { ...DEFAULT_BRANDING }
  try {
    const { data: tenantData } = await adminClient
      .from('tenants')
      .select('name, display_name, logo_url, primary_color, email_from_name, email_from_address, email_header_html, email_footer_html, hide_maptiva_brand')
      .eq('id', tenantId)
      .single()

    if (tenantData) {
      const t = tenantData as Record<string, unknown>
      branding = {
        companyName:      String(t.display_name || t.name || 'Maptiva'),
        logoUrl:          (t.logo_url as string) ?? null,
        primaryColor:     (t.primary_color as string) || '#111827',
        headerHtml:       (t.email_header_html as string) ?? null,
        footerHtml:       (t.email_footer_html as string) ?? null,
        hideMaptiva:      Boolean(t.hide_maptiva_brand),
        emailFromName:    (t.email_from_name as string) ?? null,
        emailFromAddress: (t.email_from_address as string) ?? null,
      }
    }
  } catch {
    // Silently use defaults
  }

  // ── 7. Enviar e-mails ─────────────────────────────────────────────────────────
  let sent    = 0
  let skipped = 0

  const labelUnidade = projetoData.config?.label_unidade ?? 'Departamento'

  for (const part of participants as Array<Record<string, string>>) {
    // Skip already answered participants
    if (part.status === 'respondido') {
      skipped++
      continue
    }

    const link = `${base_url}/diagnostico/${part.token}`
    const { subject, html, from } = buildEmail({
      participantName: part.nome ?? null,
      projetoNome:     projetoData.nome,
      labelUnidade,
      unidade:         part.unidade ?? null,
      link,
      branding,
      defaultFrom:     EMAIL_FROM,
    })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: [part.email], subject, html }),
    })

    if (emailRes.ok) {
      sent++
      // Update email_enviado_em timestamp
      await adminClient
        .from('dpa_participantes')
        .update({ email_enviado_em: new Date().toISOString() })
        .eq('id', part.id)
    } else {
      skipped++
      console.error(`Failed to send to ${part.email}: ${emailRes.status}`)
    }
  }

  return json({ ok: true, sent, skipped })
})

/**
 * send-invite Edge Function
 *
 * Sends a magic link invitation email to an evaluator.
 *
 * POST body:
 *   {
 *     assignment_id: string   // UUID of the assignment
 *     token:         string   // Raw token (returned by generate_magic_link RPC)
 *     base_url:      string   // e.g. "https://app.maptiva.com.br"
 *   }
 *
 * Response (always HTTP 200 for operational results so the Supabase client
 * can surface the real error message):
 *   { ok: true,  email_id, to }
 *   { ok: false, error: "human-readable message" }
 *
 * Only HTTP 401 / 403 use non-2xx (genuine auth failures before processing).
 *
 * Required secrets:
 *   RESEND_API_KEY   — Resend API key
 *   EMAIL_FROM       — Default sender, e.g. "Maptiva <noreply@maptiva.com.br>"
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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
  evaluatorName: string
  evaluatedName: string
  cycleName:     string
  relationship:  string
  magicLink:     string
  branding:      TenantEmailBranding
  defaultFrom:   string
}): { subject: string; html: string; from: string } {
  const { evaluatorName, evaluatedName, cycleName, relationship, magicLink, branding, defaultFrom } = params

  const relLabel: Record<string, string> = {
    self:        'autoavaliação',
    manager:     'avaliação como gestor',
    peer:        'avaliação como par',
    subordinate: 'avaliação como subordinado',
    client:      'avaliação como cliente',
  }
  const relText = relLabel[relationship] ?? 'avaliação'

  const subject = `Convite para participar: ${cycleName}`

  const headerContent = branding.headerHtml
    ?? (branding.logoUrl
      ? `<img src="${branding.logoUrl}" alt="${branding.companyName}" style="height:32px;display:block;" />`
      : `<span style="color:#fff;font-size:18px;font-weight:600;">${branding.companyName}</span>`)

  const poweredBy = branding.hideMaptiva
    ? ''
    : `<br>Plataforma fornecida por <a href="https://maptiva.com.br" style="color:#9ca3af;">Maptiva</a>`

  const footerContent = branding.footerHtml
    ?? `Este link é de uso único e expira em 30 dias.<br>
        Se não esperava este e-mail, pode ignorá-lo com segurança.${poweredBy}`

  // From: tenant's own address if configured, else env default
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
    .notice { background: #eff6ff; border-radius: 8px; padding: 12px 16px;
              font-size: 13px; color: #1d4ed8; margin-bottom: 24px; }
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
      <h1>Olá, ${evaluatorName}</h1>
      <p>
        Você foi convidado(a) para participar de uma <strong>${relText}</strong>
        de <strong>${evaluatedName}</strong> no ciclo <strong>${cycleName}</strong>.
      </p>
      <div class="notice">
        Suas respostas são confidenciais e apresentadas de forma agregada.
        Sua identidade não será revelada individualmente.
      </div>
      <p>Clique no botão abaixo para responder o questionário:</p>
      <a href="${magicLink}" class="btn">Responder avaliação</a>
      <p class="link-fallback">
        Se o botão não funcionar, copie e cole este link no navegador:<br>
        ${magicLink}
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

  // ── 1. Authenticate caller ───────────────────────────────────────────────────
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

  // ── 2. Parse body ────────────────────────────────────────────────────────────
  let body: { assignment_id?: string; token?: string; base_url?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' })
  }

  const { assignment_id, token, base_url } = body
  if (!assignment_id || !token || !base_url) {
    return json({ ok: false, error: 'Missing required fields: assignment_id, token, base_url' })
  }

  // ── 3. Resolve auth.uid → public.users.id ───────────────────────────────────
  // auth.getUser() returns auth.users UUID, but tenant_memberships.user_id
  // references public.users.id — they are DIFFERENT UUIDs.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: publicUser, error: pubErr } = await adminClient
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (pubErr || !publicUser) {
    return json({ ok: false, error: `User profile not found (auth_user_id: ${user.id}) — ${pubErr?.message ?? 'no row'}` })
  }

  const publicUserId = publicUser.id

  // ── 4. Load assignment ───────────────────────────────────────────────────────
  const { data: assn, error: assnErr } = await adminClient
    .from('assignments')
    .select('id, tenant_id, relationship_code, evaluator_cycle_participant_id, evaluated_cycle_participant_id, cycle_id, status')
    .eq('id', assignment_id)
    .single()

  if (assnErr || !assn) {
    return json({ ok: false, error: `Assignment not found: ${assnErr?.message ?? 'no row'}` })
  }

  // ── 5. Verify admin/owner membership ─────────────────────────────────────────
  const { data: membership, error: memErr } = await adminClient
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', assn.tenant_id)
    .eq('user_id', publicUserId)
    .in('role', ['admin', 'owner'])
    .maybeSingle()

  if (memErr) {
    return json({ ok: false, error: `Membership check failed: ${memErr.message}` })
  }
  if (!membership) {
    return json({ ok: false, error: 'Forbidden — admin or owner role required for this tenant' }, 403)
  }

  // ── 6. Guard completed assignments ──────────────────────────────────────────
  if (assn.status === 'completed') {
    return json({ ok: false, error: 'Assignment already completed — email not sent' })
  }

  // ── 7. Load evaluator, evaluated, cycle ─────────────────────────────────────
  // Split queries to avoid PostgREST embedded-join (!inner) issues with FK hints.

  // Step 7a: get person_ids and cycle name in parallel
  const [evalCPRes, evaledCPRes, cycleRes] = await Promise.all([
    adminClient
      .from('cycle_participants')
      .select('person_id')
      .eq('id', assn.evaluator_cycle_participant_id)
      .single(),
    adminClient
      .from('cycle_participants')
      .select('person_id')
      .eq('id', assn.evaluated_cycle_participant_id)
      .single(),
    adminClient
      .from('cycles')
      .select('name')
      .eq('id', assn.cycle_id)
      .single(),
  ])

  if (!evalCPRes.data?.person_id) {
    return json({ ok: false, error: `Evaluator cycle_participant not found (id: ${assn.evaluator_cycle_participant_id}) — ${evalCPRes.error?.message ?? 'no row'}` })
  }

  // Step 7b: get people records by person_id
  const [evaluatorRes, evaluatedRes] = await Promise.all([
    adminClient
      .from('people')
      .select('name, email')
      .eq('id', evalCPRes.data.person_id)
      .single(),
    evaledCPRes.data?.person_id
      ? adminClient
          .from('people')
          .select('name')
          .eq('id', evaledCPRes.data.person_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (!evaluatorRes.data?.email) {
    return json({ ok: false, error: `Evaluator email not found (person_id: ${evalCPRes.data.person_id}) — ${evaluatorRes.error?.message ?? 'no email on record'}` })
  }

  const evaluatorName = evaluatorRes.data.name || 'Avaliador'
  const evaluatorEmail = evaluatorRes.data.email
  const evaluatedName  = evaluatedRes.data?.name || 'Colega'
  const cycleName      = (cycleRes.data as { name: string } | null)?.name || 'Ciclo de Avaliação'

  // ── 8. Load tenant branding (best-effort — fallback to defaults if columns missing) ──
  let branding: TenantEmailBranding = { ...DEFAULT_BRANDING }
  try {
    // First try with branding columns (available after migration 0030)
    const { data: tenantFull, error: tenantFullErr } = await adminClient
      .from('tenants')
      .select('name, display_name, logo_url, primary_color, email_from_name, email_from_address, email_header_html, email_footer_html, hide_maptiva_brand')
      .eq('id', assn.tenant_id)
      .single()

    if (!tenantFullErr && tenantFull) {
      const t = tenantFull as Record<string, unknown>
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
    } else {
      // Branding columns don't exist yet (migration 0030 not run) — fetch just name
      const { data: tenantBasic } = await adminClient
        .from('tenants')
        .select('name')
        .eq('id', assn.tenant_id)
        .single()
      if (tenantBasic) {
        branding.companyName = (tenantBasic as { name: string }).name || 'Maptiva'
      }
    }
  } catch {
    // Silently fall back to default branding — don't block email sending
  }

  // ── 9. Build and send email ──────────────────────────────────────────────────
  const magicLink = `${base_url}/respond/${token}`
  const { subject, html, from } = buildEmail({
    evaluatorName,
    evaluatedName,
    cycleName,
    relationship:  assn.relationship_code,
    magicLink,
    branding,
    defaultFrom:   EMAIL_FROM,
  })

  const emailRes = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from, to: [evaluatorEmail], subject, html }),
  })

  if (!emailRes.ok) {
    const errBody = await emailRes.json().catch(() => ({}))
    return json({ ok: false, error: `Resend error (${emailRes.status}): ${JSON.stringify(errBody)}` })
  }

  const emailData = await emailRes.json()

  // ── 10. Record invite timestamp ──────────────────────────────────────────────
  await adminClient
    .from('assignments')
    .update({ invited_at: new Date().toISOString() })
    .eq('id', assignment_id)

  return json({ ok: true, email_id: emailData.id, to: evaluatorEmail })
})

/**
 * provision-tenant Edge Function
 *
 * Creates a new tenant and sends an invite to the owner.
 * Called exclusively from the super-admin panel — the caller must have
 * is_super_admin = true in public.users.
 *
 * POST body:
 *   {
 *     tenantName:  string   // display name, e.g. "Acme Consultoria"
 *     slug:        string   // URL-safe slug, e.g. "acme-consultoria"
 *     planCode?:   string   // "starter" | "pro" | "enterprise" (default: "starter")
 *     ownerName:   string   // owner's full name
 *     ownerEmail:  string   // owner's e-mail — receives the invite link
 *   }
 *
 * Response (always HTTP 200 for operational results):
 *   { ok: true,  tenantId, userId }
 *   { ok: false, error: "human-readable message" }
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL  (optional, defaults to https://maptiva.vercel.app)
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
  const APP_URL       = Deno.env.get('APP_URL') ?? 'https://maptiva.vercel.app'

  // ── 1. Authenticate caller ──────────────────────────────────────────────────
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

  // ── 2. Verify super-admin flag ──────────────────────────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: callerRow } = await adminClient
    .from('users')
    .select('id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!callerRow?.is_super_admin) {
    return json({ ok: false, error: 'Forbidden — super admin only' }, 403)
  }

  // ── 3. Parse & validate body ────────────────────────────────────────────────
  let body: { tenantName?: string; slug?: string; planCode?: string; ownerName?: string; ownerEmail?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' })
  }

  const { tenantName, slug, planCode = 'starter', ownerName, ownerEmail } = body

  if (!tenantName?.trim())  return json({ ok: false, error: 'tenantName é obrigatório' })
  if (!slug?.trim())        return json({ ok: false, error: 'slug é obrigatório' })
  if (!ownerName?.trim())   return json({ ok: false, error: 'ownerName é obrigatório' })
  if (!ownerEmail?.trim())  return json({ ok: false, error: 'ownerEmail é obrigatório' })

  const cleanSlug  = slug.trim().toLowerCase()
  const cleanEmail = ownerEmail.trim().toLowerCase()

  // Slug format validation
  if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
    return json({ ok: false, error: 'Slug inválido — use apenas letras minúsculas, números e hífens' })
  }

  // ── 4. Check slug uniqueness ────────────────────────────────────────────────
  const { data: existing } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', cleanSlug)
    .maybeSingle()

  if (existing) {
    return json({ ok: false, error: `O slug "${cleanSlug}" já está em uso por outro cliente` })
  }

  // ── 5. Create tenant ────────────────────────────────────────────────────────
  const { data: tenant, error: tenantErr } = await adminClient
    .from('tenants')
    .insert({
      name:      tenantName.trim(),
      slug:      cleanSlug,
      plan_code: planCode,
      status:    'active',
    })
    .select('id')
    .single()

  if (tenantErr || !tenant) {
    return json({ ok: false, error: `Erro ao criar tenant: ${tenantErr?.message}` })
  }

  const tenantId = tenant.id

  // ── 6. Invite owner via Supabase Auth Admin API ─────────────────────────────
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    cleanEmail,
    {
      redirectTo: `${APP_URL}/login`,
      data: {
        tenant_id:    tenantId,
        tenant_name:  tenantName.trim(),
        role:         'owner',
        invited_name: ownerName.trim(),
      },
    }
  )

  // "Already registered" is acceptable — we just add the membership
  if (inviteErr && !inviteErr.message.includes('already registered') && !inviteErr.message.includes('already been registered')) {
    // Roll back tenant on invite failure
    await adminClient.from('tenants').delete().eq('id', tenantId)
    return json({ ok: false, error: `Falha ao enviar convite: ${inviteErr.message}` })
  }

  // ── 7. Ensure public.users row ──────────────────────────────────────────────
  const authUserId = inviteData?.user?.id
  let publicUserId: string | null = null

  if (authUserId) {
    const { data: existingPub } = await adminClient
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (existingPub) {
      publicUserId = existingPub.id
    } else {
      const { data: newPub, error: newPubErr } = await adminClient
        .from('users')
        .insert({
          auth_user_id: authUserId,
          email:        cleanEmail,
          name:         ownerName.trim(),
        })
        .select('id')
        .single()

      if (newPubErr) {
        return json({ ok: false, error: `Erro ao criar perfil do usuário: ${newPubErr.message}` })
      }
      publicUserId = newPub.id
    }
  } else {
    // User already had an auth account — look up by email
    const { data: byEmail } = await adminClient
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle()
    publicUserId = byEmail?.id ?? null
  }

  if (!publicUserId) {
    return json({ ok: false, error: 'Não foi possível resolver o perfil do usuário após o convite' })
  }

  // ── 8. Create owner membership ──────────────────────────────────────────────
  const { error: memErr } = await adminClient
    .from('tenant_memberships')
    .upsert(
      {
        tenant_id: tenantId,
        user_id:   publicUserId,
        role:      'owner',
        status:    'active',
      },
      { onConflict: 'tenant_id,user_id', ignoreDuplicates: false }
    )

  if (memErr) {
    return json({ ok: false, error: `Erro ao criar membership: ${memErr.message}` })
  }

  return json({ ok: true, tenantId, userId: publicUserId, email: cleanEmail })
})

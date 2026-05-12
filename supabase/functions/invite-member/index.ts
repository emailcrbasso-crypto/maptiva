/**
 * invite-member Edge Function
 *
 * Sends an invitation email to a new dashboard user (admin/manager/etc.).
 * Uses Supabase Auth Admin API so the user receives an invite link and sets
 * their own password — no public signup required.
 *
 * POST body:
 *   {
 *     email: string       // new member email
 *     role:  string       // 'admin' | 'manager' | 'participant'
 *     name?: string       // optional display name
 *   }
 *
 * Response (always HTTP 200 for operational results):
 *   { ok: true,  user_id }
 *   { ok: false, error: "human-readable message" }
 *
 * Auth: caller must have an active session and be admin/owner of the tenant.
 *
 * Required secrets:
 *   SUPABASE_URL              — project URL
 *   SUPABASE_ANON_KEY         — public anon key
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (for admin API)
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

const ALLOWED_ROLES = ['admin', 'manager', 'participant']

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!

  // ── 1. Authenticate caller ────────────────────────────────────────────────────
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
  let body: { email?: string; role?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' })
  }

  const { email, role, name } = body

  if (!email || !role) {
    return json({ ok: false, error: 'Missing required fields: email, role' })
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return json({ ok: false, error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` })
  }

  // ── 3. Resolve caller to public.users.id ─────────────────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: callerPublic, error: callerErr } = await adminClient
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (callerErr || !callerPublic) {
    return json({ ok: false, error: 'Caller profile not found' })
  }

  // ── 4. Verify caller is admin/owner of a tenant ───────────────────────────────
  const { data: membership, error: memErr } = await adminClient
    .from('tenant_memberships')
    .select('tenant_id, role')
    .eq('user_id', callerPublic.id)
    .in('role', ['admin', 'owner'])
    .eq('status', 'active')
    .maybeSingle()

  if (memErr) {
    return json({ ok: false, error: `Membership check failed: ${memErr.message}` })
  }
  if (!membership) {
    return json({ ok: false, error: 'Forbidden — admin or owner role required' }, 403)
  }

  const tenantId = membership.tenant_id

  // ── 5. Check if this email already has a membership in this tenant ────────────
  // First check if a public.users row with this email already exists
  const { data: existingUser } = await adminClient
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  if (existingUser) {
    const { data: existingMem } = await adminClient
      .from('tenant_memberships')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('user_id', existingUser.id)
      .maybeSingle()

    if (existingMem?.status === 'active') {
      return json({ ok: false, error: 'Este e-mail já é membro ativo deste tenant.' })
    }
  }

  // ── 6. Load tenant for invite redirect URL ────────────────────────────────────
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single()

  const appUrl = Deno.env.get('APP_URL') ?? 'https://maptiva.vercel.app'

  // ── 7. Invite user via Supabase Auth Admin API ────────────────────────────────
  // This sends the official Supabase invite email with a magic link.
  // The user clicks it, sets a password, and lands in the app.
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${appUrl}/login`,
      data: {
        tenant_id:   tenantId,
        tenant_name: tenant?.name ?? '',
        role,
        invited_name: name ?? '',
      },
    }
  )

  if (inviteErr) {
    // "User already registered" → they have an auth account, just add membership
    if (!inviteErr.message.includes('already registered') && !inviteErr.message.includes('already been registered')) {
      return json({ ok: false, error: `Invite failed: ${inviteErr.message}` })
    }
  }

  // ── 8. Ensure public.users row exists ─────────────────────────────────────────
  // inviteData?.user has the auth user; upsert into public.users
  const authUserId = inviteData?.user?.id

  let publicUserId: string | null = null

  if (authUserId) {
    // Try to find existing public.users row
    const { data: existingPub } = await adminClient
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (existingPub) {
      publicUserId = existingPub.id
    } else {
      // Create public.users row (trigger may not have fired yet for invited users)
      const { data: newPub, error: newPubErr } = await adminClient
        .from('users')
        .insert({
          auth_user_id: authUserId,
          email:        email.toLowerCase(),
          name:         name ?? email.split('@')[0],
        })
        .select('id')
        .single()

      if (newPubErr) {
        return json({ ok: false, error: `Failed to create user profile: ${newPubErr.message}` })
      }
      publicUserId = newPub.id
    }
  } else {
    // User was already registered — find by email
    const { data: byEmail } = await adminClient
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()
    publicUserId = byEmail?.id ?? null
  }

  if (!publicUserId) {
    return json({ ok: false, error: 'Could not resolve user profile after invite' })
  }

  // ── 9. Upsert tenant_memberships ──────────────────────────────────────────────
  const { error: memInsertErr } = await adminClient
    .from('tenant_memberships')
    .upsert(
      {
        tenant_id: tenantId,
        user_id:   publicUserId,
        role,
        status:    'active',
      },
      { onConflict: 'tenant_id,user_id', ignoreDuplicates: false }
    )

  if (memInsertErr) {
    return json({ ok: false, error: `Membership insert failed: ${memInsertErr.message}` })
  }

  return json({ ok: true, user_id: publicUserId, email })
})

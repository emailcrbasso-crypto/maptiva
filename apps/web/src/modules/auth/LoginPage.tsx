import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useTenant } from './TenantContext'

// ─── Minimal branding type for pre-login display ─────────────────────────────

interface PreLoginBranding {
  name:         string
  logoUrl:      string | null
  primaryColor: string
  tagline:      string | null
  hideMaptiva:  boolean
}

const DEFAULT_PRE_LOGIN: PreLoginBranding = {
  name:         'Maptiva',
  logoUrl:      null,
  primaryColor: '#111827',
  tagline:      'Plataforma de avaliação 360°',
  hideMaptiva:  false,
}

export function LoginPage() {
  const { branding: sessionBranding } = useTenant()
  const navigate = useNavigate()

  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [mode,      setMode]      = useState<'signin' | 'reset' | 'new_password'>('signin')
  const [resetSent, setResetSent] = useState(false)

  const [preBranding, setPreBranding] = useState<PreLoginBranding>(DEFAULT_PRE_LOGIN)

  // ── Detect PASSWORD_RECOVERY or invite SIGNED_IN from Supabase links ─────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked password reset link
        setMode('new_password')
        setError(null)
        return
      }

      if (event === 'SIGNED_IN' && session) {
        // Check if this is an invite link (hash contains type=invite)
        const hash = window.location.hash
        if (hash.includes('type=invite')) {
          // User accepted invite, now must set password
          setMode('new_password')
          setError(null)
          // Clear hash from URL
          window.history.replaceState(null, '', window.location.pathname)
          return
        }
        // Normal sign-in → go to dashboard
        navigate('/dashboard')
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  // ── Branding ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sessionBranding.id) {
      setPreBranding({
        name:         sessionBranding.name,
        logoUrl:      sessionBranding.logoUrl,
        primaryColor: sessionBranding.primaryColor,
        tagline:      sessionBranding.tagline,
        hideMaptiva:  sessionBranding.hideMaptiva,
      })
      return
    }

    async function loadByDomain() {
      const domain = window.location.hostname
      if (domain === 'localhost' || domain.includes('maptiva')) return
      const { data } = await supabase.rpc('get_tenant_by_domain', { p_domain: domain })
      if (!data) return
      const raw = data as Record<string, unknown>
      setPreBranding({
        name:         (raw.name as string) || 'Maptiva',
        logoUrl:      (raw.logo_url as string) ?? null,
        primaryColor: (raw.primary_color as string) || '#111827',
        tagline:      (raw.tagline as string) ?? null,
        hideMaptiva:  false,
      })
    }
    loadByDomain()
  }, [sessionBranding])

  // ── Submit handler ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Set new password after recovery link
    if (mode === 'new_password') {
      if (password !== password2) {
        setError('As senhas não conferem.')
        setLoading(false)
        return
      }
      if (password.length < 6) {
        setError('A senha precisa ter ao menos 6 caracteres.')
        setLoading(false)
        return
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
      } else {
        // Password updated — sign out so user logs in fresh
        await supabase.auth.signOut()
        setMode('signin')
        setPassword('')
        setPassword2('')
        setError(null)
        // Small banner instead of alert
        setResetSent(true)
      }
      setLoading(false)
      return
    }

    // Send reset email
    if (mode === 'reset') {
      const redirectTo = `${window.location.origin}/login`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) setError(error.message)
      else setResetSent(true)
      setLoading(false)
      return
    }

    // Sign in
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) setError(error.message)
    else navigate('/dashboard')
    setLoading(false)
  }

  const brand = preBranding

  // ── New password form (arrived via recovery link) ─────────────────────────────
  if (mode === 'new_password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-6 text-center">
            {brand.logoUrl
              ? <img src={brand.logoUrl} alt={brand.name} className="h-10 w-auto object-contain mx-auto mb-3" />
              : <h1 className="text-2xl font-semibold text-gray-900">{brand.name}</h1>
            }
            <p className="text-sm text-gray-500 mt-1">
              {window.location.hash.includes('type=invite')
                ? 'Bem-vindo! Crie sua senha de acesso.'
                : 'Defina sua nova senha'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
              <input
                type="password"
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Repita a senha"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Normal login / reset form ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="h-10 w-auto object-contain mx-auto mb-3" />
          ) : (
            <h1 className="text-2xl font-semibold text-gray-900">{brand.name}</h1>
          )}
          {brand.tagline && <p className="text-sm text-gray-400 mt-1">{brand.tagline}</p>}
          {!brand.tagline && !brand.hideMaptiva && brand.name !== 'Maptiva' && (
            <p className="text-xs text-gray-300 mt-1">Powered by Maptiva</p>
          )}
          {!brand.tagline && brand.name === 'Maptiva' && (
            <p className="text-sm text-gray-400 mt-1">Plataforma de avaliação 360°</p>
          )}
        </div>

        {/* Senha redefinida com sucesso */}
        {resetSent && mode === 'signin' && (
          <div className="mb-4 bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-700">
            {mode === 'signin'
              ? 'Senha redefinida! Faça login com a nova senha.'
              : 'E-mail enviado! Verifique sua caixa de entrada.'}
          </div>
        )}

        {/* E-mail de reset enviado */}
        {resetSent && mode === 'reset' ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-700 font-medium">E-mail enviado!</p>
            <p className="text-xs text-gray-400">
              Verifique sua caixa de entrada e clique no link para redefinir a senha.
            </p>
            <button
              type="button"
              onClick={() => { setMode('signin'); setResetSent(false); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-800 underline"
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="seu@email.com"
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Senha</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => { setMode('reset'); setError(null); setResetSent(false) }}
                        className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              )}

              {mode === 'reset' && (
                <p className="text-xs text-gray-400">
                  Informe o e-mail da sua conta. Enviaremos um link para redefinir a senha.
                </p>
              )}

              {error && (
                <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {loading
                  ? 'Aguarde...'
                  : mode === 'signin' ? 'Entrar'
                  : 'Enviar link de recuperação'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-400 mt-6">
              {mode === 'reset' ? (
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null) }}
                  className="text-gray-700 font-medium hover:underline"
                >
                  ← Voltar ao login
                </button>
              ) : (
                <span className="text-xs text-gray-300">
                  Acesso restrito — solicite ao administrador da sua organização.
                </span>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

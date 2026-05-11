import { useState, useEffect } from 'react'
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

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [mode,     setMode]     = useState<'signin' | 'signup'>('signin')

  // Pre-login branding: try to load by domain or slug param
  const [preBranding, setPreBranding] = useState<PreLoginBranding>(DEFAULT_PRE_LOGIN)

  useEffect(() => {
    // If already logged in (branding context is loaded), use it
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

    // Try loading branding by current domain (multi-domain white label)
    async function loadByDomain() {
      const domain = window.location.hostname
      // Don't bother for localhost or standard Maptiva domains
      if (domain === 'localhost' || domain.includes('maptiva')) return

      const { data } = await supabase.rpc('get_tenant_by_domain', { p_domain: domain })
      if (!data) return

      const raw = data as Record<string, unknown>
      setPreBranding({
        name:         (raw.name as string) || 'Maptiva',
        logoUrl:      (raw.logo_url as string) ?? null,
        primaryColor: (raw.primary_color as string) || '#111827',
        tagline:      (raw.tagline as string) ?? null,
        hideMaptiva:  false, // conservative default for pre-login
      })
    }

    loadByDomain()
  }, [sessionBranding])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (error) setError(error.message)
    setLoading(false)
  }

  const brand = preBranding

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8 text-center">
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="h-10 w-auto object-contain mx-auto mb-3"
            />
          ) : (
            <h1 className="text-2xl font-semibold text-gray-900">{brand.name}</h1>
          )}
          {brand.tagline && (
            <p className="text-sm text-gray-400 mt-1">{brand.tagline}</p>
          )}
          {!brand.tagline && !brand.hideMaptiva && brand.name !== 'Maptiva' && (
            <p className="text-xs text-gray-300 mt-1">Powered by Maptiva</p>
          )}
          {!brand.tagline && brand.name === 'Maptiva' && (
            <p className="text-sm text-gray-400 mt-1">Plataforma de avaliação 360°</p>
          )}
        </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Aguarde...' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          {mode === 'signin' ? 'Sem conta?' : 'Já tem conta?'}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
            className="text-gray-700 font-medium hover:underline"
          >
            {mode === 'signin' ? 'Cadastre-se' : 'Entre'}
          </button>
        </p>
      </div>
    </div>
  )
}

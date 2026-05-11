/**
 * TenantContext
 *
 * Loads and exposes tenant branding/config after the user logs in.
 * Drives dynamic name, logo, colors, and "hide Maptiva brand" across all screens.
 *
 * Usage:
 *   const { branding } = useTenant()
 *   branding.name        → company display name
 *   branding.logoUrl     → logo URL or null
 *   branding.primaryColor→ CSS hex color
 *   branding.hideMaptiva → whether to hide "Powered by Maptiva"
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantBranding {
  id:             string | null
  name:           string        // display_name ?? name
  slug:           string | null
  logoUrl:        string | null
  faviconUrl:     string | null
  primaryColor:   string        // hex, e.g. "#111827"
  secondaryColor: string
  hideMaptiva:    boolean
  tagline:        string | null
  pdfFooterText:  string
  locale:         string
  customDomain:   string | null
}

interface TenantContextValue {
  branding: TenantBranding
  loading:  boolean
  reload:   () => Promise<void>
}

const DEFAULT_BRANDING: TenantBranding = {
  id:             null,
  name:           'Maptiva',
  slug:           null,
  logoUrl:        null,
  faviconUrl:     null,
  primaryColor:   '#111827',
  secondaryColor: '#6b7280',
  hideMaptiva:    false,
  tagline:        null,
  pdfFooterText:  'Relatório Confidencial',
  locale:         'pt-BR',
  customDomain:   null,
}

const TenantContext = createContext<TenantContextValue>({
  branding: DEFAULT_BRANDING,
  loading:  true,
  reload:   async () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TenantProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!session) {
      setBranding(DEFAULT_BRANDING)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase.rpc('get_tenant_branding')

    if (error || !data) {
      // Silently fall back to defaults — don't break the app
      console.warn('TenantContext: could not load branding', error?.message)
      setLoading(false)
      return
    }

    const raw = data as Record<string, unknown>

    setBranding({
      id:             (raw.id as string) ?? null,
      name:           (raw.name as string) || 'Maptiva',
      slug:           (raw.slug as string) ?? null,
      logoUrl:        (raw.logo_url as string) ?? null,
      faviconUrl:     (raw.favicon_url as string) ?? null,
      primaryColor:   (raw.primary_color as string) || '#111827',
      secondaryColor: (raw.secondary_color as string) || '#6b7280',
      hideMaptiva:    Boolean(raw.hide_maptiva_brand),
      tagline:        (raw.tagline as string) ?? null,
      pdfFooterText:  (raw.pdf_footer_text as string) || 'Relatório Confidencial',
      locale:         (raw.locale as string) || 'pt-BR',
      customDomain:   (raw.custom_domain as string) ?? null,
    })

    setLoading(false)
  }, [session])

  useEffect(() => {
    reload()
  }, [reload])

  // Apply CSS custom properties and favicon when branding changes
  useEffect(() => {
    if (loading) return

    // CSS variables on :root — Tailwind arbitrary values can read these
    document.documentElement.style.setProperty('--color-brand-primary',   branding.primaryColor)
    document.documentElement.style.setProperty('--color-brand-secondary', branding.secondaryColor)

    // Page title
    document.title = branding.name

    // Favicon
    if (branding.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = branding.faviconUrl
    }
  }, [branding, loading])

  return (
    <TenantContext.Provider value={{ branding, loading, reload }}>
      {children}
    </TenantContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTenant(): TenantContextValue {
  return useContext(TenantContext)
}

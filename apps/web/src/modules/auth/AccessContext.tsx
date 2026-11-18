/**
 * AccessContext — "acesso de cliente". Diz se o usuário logado tem acesso
 * restrito no espaço atual (só Dashboard e pesquisas, sem administração).
 *
 * É uma restrição de INTERFACE: o papel no banco não muda (ver migration 0113).
 * A equipe da plataforma (super admin, inclusive em modo suporte) nunca é restrita.
 * Se a consulta falhar, o acesso fica liberado: o objetivo é organizar a tela,
 * não bloquear dados.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { useSuperAdminMode } from './SuperAdminContext'
import { useTenant } from './TenantContext'

interface AccessValue {
  restrito: boolean
  /** true até sabermos se o acesso é restrito (evita mostrar o menu completo por um instante). */
  loading:  boolean
}

const AccessContext = createContext<AccessValue>({ restrito: false, loading: false })

export function AccessProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const { viewingTenant } = useSuperAdminMode()
  const { branding, loading: tenantLoading } = useTenant()
  const [valor, setValor] = useState<AccessValue>({ restrito: false, loading: true })

  const livre = !session || Boolean(viewingTenant) || Boolean(profile?.isSuperAdmin)
  const pronto = livre || (Boolean(profile) && !tenantLoading && Boolean(branding.id))

  useEffect(() => {
    if (livre) { setValor({ restrito: false, loading: false }); return }
    if (!pronto) { setValor((v) => (v.loading ? v : { ...v, loading: true })); return }

    let ativo = true
    supabase.rpc('get_my_access', { p_tenant_id: branding.id }).then(({ data, error }) => {
      if (!ativo) return
      const restrito = !error && Boolean((data as { restrito?: boolean } | null)?.restrito)
      setValor({ restrito, loading: false })
    })
    return () => { ativo = false }
  }, [livre, pronto, branding.id])

  return <AccessContext.Provider value={valor}>{children}</AccessContext.Provider>
}

export function useAccess(): AccessValue {
  return useContext(AccessContext)
}

/** Rotas liberadas para o acesso restrito: painel, pesquisas (sem criar) e o próprio perfil. */
export function rotaPermitidaRestrito(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname === '/settings/profile' ||
    pathname === '/dpa' ||
    /^\/dpa\/(?!new$)[^/]+$/.test(pathname)
  )
}

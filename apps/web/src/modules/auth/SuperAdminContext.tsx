/**
 * SuperAdminContext
 *
 * Gerencia o estado do "modo suporte" do super admin.
 * Persiste em sessionStorage (limpa ao fechar o browser/aba).
 *
 * Quando viewingTenant está definido:
 *   - TenantContext carrega o branding do tenant sendo visitado
 *   - Componentes que precisam de tenant_id usam viewingTenant.id
 *   - Layout exibe o banner de "Modo suporte"
 */

import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'maptiva_sa_viewing_tenant'

export interface SAViewingTenant {
  id:   string
  name: string
}

interface SuperAdminContextValue {
  viewingTenant: SAViewingTenant | null
  enterTenant:   (id: string, name: string) => void
  exitTenant:    () => void
}

const SuperAdminContext = createContext<SuperAdminContextValue>({
  viewingTenant: null,
  enterTenant:   () => {},
  exitTenant:    () => {},
})

function readFromStorage(): SAViewingTenant | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SAViewingTenant) : null
  } catch {
    return null
  }
}

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [viewingTenant, setViewingTenant] = useState<SAViewingTenant | null>(readFromStorage)

  function enterTenant(id: string, name: string) {
    const tenant: SAViewingTenant = { id, name }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tenant))
    setViewingTenant(tenant)
  }

  function exitTenant() {
    sessionStorage.removeItem(STORAGE_KEY)
    setViewingTenant(null)
  }

  return (
    <SuperAdminContext.Provider value={{ viewingTenant, enterTenant, exitTenant }}>
      {children}
    </SuperAdminContext.Provider>
  )
}

export function useSuperAdminMode(): SuperAdminContextValue {
  return useContext(SuperAdminContext)
}

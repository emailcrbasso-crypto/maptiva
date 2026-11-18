/**
 * DashboardEntry — rota /dashboard: o acesso de cliente vê o cartão da pesquisa;
 * os demais usuários veem o painel de ciclos de sempre.
 */

import { useAccess } from '@/modules/auth/AccessContext'
import { DashboardPage } from './DashboardPage'
import { ClienteDashboard } from './ClienteDashboard'

export function DashboardEntry() {
  const { restrito } = useAccess()
  return restrito ? <ClienteDashboard /> : <DashboardPage />
}

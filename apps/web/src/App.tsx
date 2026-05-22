import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/modules/auth/AuthContext'
import { SuperAdminProvider } from '@/modules/auth/SuperAdminContext'
import { TenantProvider } from '@/modules/auth/TenantContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/modules/auth/LoginPage'
import { DashboardPage } from '@/modules/dashboard/DashboardPage'
import { CyclesPage } from '@/modules/cycles/CyclesPage'
import { CycleDetailPage } from '@/modules/cycles/CycleDetailPage'
import { NewCyclePage } from '@/modules/cycles/NewCyclePage'
import { ReportPage } from '@/modules/cycles/ReportPage'
import { MyReportPage } from '@/modules/cycles/MyReportPage'
import { TeamReportPage } from '@/modules/cycles/TeamReportPage'
import { HeatmapPage } from '@/modules/cycles/HeatmapPage'
import { MembersPage } from '@/modules/members/MembersPage'
import { PeoplePage } from '@/modules/people/PeoplePage'
import { RespondPage } from '@/modules/respond/RespondPage'
import { TemplatesPage } from '@/modules/templates/TemplatesPage'
import { NewTemplatePage } from '@/modules/templates/NewTemplatePage'
import { TemplateDetailPage } from '@/modules/templates/TemplateDetailPage'
import { BrandingPage } from '@/modules/settings/BrandingPage'
import { ProfilePage } from '@/modules/settings/ProfilePage'
import { SuperAdminPage } from '@/modules/superadmin/SuperAdminPage'
import { DpaFormPage } from '@/modules/dpa/DpaFormPage'
import { DpaObrigadoPage, DpaJaRespondidoPage, DpaAcessoNegadoPage } from '@/modules/dpa/DpaStatusPages'
import { DpaProjectsPage } from '@/modules/dpa/DpaProjectsPage'
import { DpaNewProjectPage } from '@/modules/dpa/DpaNewProjectPage'
import { DpaDashboardPage } from '@/modules/dpa/DpaDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SuperAdminProvider>
        <TenantProvider>
        <Routes>
          {/* Rotas públicas: avaliadores e participantes DPA chegam via magic link */}
          <Route path="/respond/:token"          element={<RespondPage />} />
          <Route path="/diagnostico/:token"      element={<DpaFormPage />} />
          <Route path="/diagnostico/obrigado"    element={<DpaObrigadoPage />} />
          <Route path="/diagnostico/ja-respondido" element={<DpaJaRespondidoPage />} />
          <Route path="/diagnostico/acesso-negado" element={<DpaAcessoNegadoPage />} />

          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/cycles" element={<CyclesPage />} />
            <Route path="/cycles/new" element={<NewCyclePage />} />
            <Route path="/cycles/:id" element={<CycleDetailPage />} />
            <Route path="/cycles/:id/report" element={<ReportPage />} />
            <Route path="/cycles/:id/my-report" element={<MyReportPage />} />
            <Route path="/cycles/:id/team-report" element={<TeamReportPage />} />
            <Route path="/cycles/:id/heatmap" element={<HeatmapPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/templates/new" element={<NewTemplatePage />} />
            <Route path="/templates/:id" element={<TemplateDetailPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/settings/branding" element={<BrandingPage />} />
            <Route path="/settings/profile" element={<ProfilePage />} />
            <Route path="/superadmin" element={<SuperAdminPage />} />
            <Route path="/dpa"       element={<DpaProjectsPage />} />
            <Route path="/dpa/new"   element={<DpaNewProjectPage />} />
            <Route path="/dpa/:id"   element={<DpaDashboardPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </TenantProvider>
        </SuperAdminProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

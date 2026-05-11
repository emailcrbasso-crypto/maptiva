import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/modules/auth/AuthContext'
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
import { MembersPage } from '@/modules/members/MembersPage'
import { PeoplePage } from '@/modules/people/PeoplePage'
import { RespondPage } from '@/modules/respond/RespondPage'
import { TemplatesPage } from '@/modules/templates/TemplatesPage'
import { NewTemplatePage } from '@/modules/templates/NewTemplatePage'
import { TemplateDetailPage } from '@/modules/templates/TemplateDetailPage'
import { BrandingPage } from '@/modules/settings/BrandingPage'
import { ProfilePage } from '@/modules/settings/ProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
        <Routes>
          {/* Rota pública: avaliadores chegam via magic link sem login */}
          <Route path="/respond/:token" element={<RespondPage />} />

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
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/templates/new" element={<NewTemplatePage />} />
            <Route path="/templates/:id" element={<TemplateDetailPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/settings/branding" element={<BrandingPage />} />
            <Route path="/settings/profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

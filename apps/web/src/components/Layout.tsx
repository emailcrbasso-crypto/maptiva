import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/modules/auth/AuthContext'
import { useTenant } from '@/modules/auth/TenantContext'

const navItems = [
  { to: '/dashboard',        label: 'Dashboard' },
  { to: '/cycles',           label: 'Ciclos' },
  { to: '/templates',        label: 'Templates' },
  { to: '/people',           label: 'Pessoas' },
  { to: '/members',          label: 'Membros' },
  { to: '/settings/branding', label: 'Identidade' },
]

export function Layout() {
  const { user, signOut } = useAuth()
  const { branding }      = useTenant()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-6 shrink-0">

        {/* Logo or company name */}
        <div className="mr-4 flex items-center gap-2 shrink-0">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="h-7 w-auto object-contain"
            />
          ) : (
            <span className="font-semibold text-gray-900">{branding.name}</span>
          )}
        </div>

        <nav className="flex gap-1 flex-1">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm text-gray-500">
          {!branding.hideMaptiva && (
            <span className="text-xs text-gray-300 hidden md:inline">
              Powered by Maptiva
            </span>
          )}
          <span>{user?.email}</span>
          <button
            onClick={signOut}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}

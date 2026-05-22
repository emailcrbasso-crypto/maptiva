import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/AuthContext'
import { useTenant } from '@/modules/auth/TenantContext'
import { useSuperAdminMode } from '@/modules/auth/SuperAdminContext'
import { supabase } from '@/lib/supabase'

const navItems = [
  { to: '/dashboard',          label: 'Dashboard' },
  { to: '/cycles',             label: 'Ciclos' },
  { to: '/templates',          label: 'Templates' },
  { to: '/people',             label: 'Pessoas' },
  { to: '/members',            label: 'Membros' },
  { to: '/settings/branding',  label: 'Identidade' },
  { to: '/dpa',                label: 'InSight' },
]

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

export function Layout() {
  const { profile, signOut }         = useAuth()
  const { branding }                 = useTenant()
  const { viewingTenant, exitTenant } = useSuperAdminMode()
  const navigate                     = useNavigate()

  const [menuOpen,     setMenuOpen]     = useState(false)
  const [exitingMode,  setExitingMode]  = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  async function handleExitSupportMode() {
    setExitingMode(true)
    if (viewingTenant) {
      await supabase.rpc('exit_tenant', { p_tenant_id: viewingTenant.id })
    }
    exitTenant()
    setExitingMode(false)
    navigate('/superadmin')
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayName = profile?.name || profile?.email || '—'
  const avatarText  = initials(displayName)

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Support mode banner ── */}
      {viewingTenant && (
        <div className="bg-violet-600 text-white text-xs flex items-center justify-between px-6 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>
              Modo suporte — você está gerenciando:{' '}
              <strong className="font-semibold">{viewingTenant.name}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleExitSupportMode}
            disabled={exitingMode}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors px-3 py-1 rounded-md font-medium disabled:opacity-50"
          >
            {exitingMode ? 'Saindo...' : '← Sair do modo suporte'}
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-6 shrink-0">

        {/* Logo / company name */}
        <div className="mr-4 flex items-center shrink-0">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.name} className="h-7 w-auto object-contain" />
          ) : (
            <span className="font-semibold text-gray-900">{branding.name}</span>
          )}
        </div>

        {/* Nav */}
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

          {/* Super-admin link — only visible to platform operators */}
          {profile?.isSuperAdmin && (
            <NavLink
              to="/superadmin"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-violet-100 text-violet-900'
                    : 'text-violet-400 hover:text-violet-700 hover:bg-violet-50'
                }`
              }
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Admin
            </NavLink>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {!branding.hideMaptiva && (
            <span className="text-xs text-gray-300 hidden md:inline">Powered by Maptiva</span>
          )}

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* Avatar */}
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={displayName}
                  className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {avatarText}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 max-w-[160px] truncate">
                {displayName}
              </span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
                  {profile?.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={displayName}
                      className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-gray-200"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                      {avatarText}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/settings/profile') }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Meu perfil
                </button>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/settings/branding') }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Identidade visual
                </button>
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={() => { setMenuOpen(false); signOut() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/AuthContext'
import { useTenant } from '@/modules/auth/TenantContext'

const navItems = [
  { to: '/dashboard',          label: 'Dashboard' },
  { to: '/cycles',             label: 'Ciclos' },
  { to: '/templates',          label: 'Templates' },
  { to: '/people',             label: 'Pessoas' },
  { to: '/members',            label: 'Membros' },
  { to: '/settings/branding',  label: 'Identidade' },
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
  const { profile, signOut } = useAuth()
  const { branding }         = useTenant()
  const navigate             = useNavigate()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
              <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {avatarText}
              </div>
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
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
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

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface UserProfile {
  /** public.users.id — needed to query people.user_id */
  id:            string
  name:          string
  email:         string
  avatarUrl:     string | null
  isSuperAdmin:  boolean
}

interface AuthContextValue {
  session:       Session | null
  user:          User | null
  profile:       UserProfile | null
  loading:       boolean
  signOut:       () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(authUser: User | null) {
    if (!authUser) { setProfile(null); return }

    const { data } = await supabase
      .from('users')
      .select('id, name, email, avatar_url, is_super_admin')
      .eq('auth_user_id', authUser.id)
      .single()

    if (data) {
      const row = data as { id: string; name: string; email: string; avatar_url: string | null; is_super_admin: boolean }
      setProfile({
        id:           row.id,
        name:         row.name  || authUser.email || '',
        email:        row.email || authUser.email || '',
        avatarUrl:    row.avatar_url ?? null,
        isSuperAdmin: row.is_super_admin ?? false,
      })
    } else {
      setProfile({
        id:           '',
        name:         authUser.email || '',
        email:        authUser.email || '',
        avatarUrl:    null,
        isSuperAdmin: false,
      })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      fetchProfile(data.session?.user ?? null).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      fetchProfile(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function reloadProfile() {
    await fetchProfile(session?.user ?? null)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut, reloadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

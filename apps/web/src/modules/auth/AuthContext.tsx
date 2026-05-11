import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session:    Session | null
  user:       User | null
  profile:    { name: string; email: string } | null
  loading:    boolean
  signOut:    () => Promise<void>
  reloadProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(authUser: User | null) {
    if (!authUser) { setProfile(null); return }
    const { data } = await supabase
      .from('users')
      .select('name, email')
      .eq('auth_user_id', authUser.id)
      .single()
    if (data) {
      setProfile({
        name:  (data as { name: string; email: string }).name  || authUser.email || '',
        email: (data as { name: string; email: string }).email || authUser.email || '',
      })
    } else {
      setProfile({ name: authUser.email || '', email: authUser.email || '' })
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

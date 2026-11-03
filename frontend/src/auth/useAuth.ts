import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AUTH_MODE, DEV_USER_KEY, supabase } from './config'

export interface AuthUser {
  id: string // the id the API sees: dev user id, or the Supabase user UUID (token `sub`)
  label: string // what the sidebar shows
}

const fromSession = (s: Session | null): AuthUser | null => (s ? { id: s.user.id, label: s.user.email ?? s.user.id } : null)

function devUser(): AuthUser | null {
  const id = sessionStorage.getItem(DEV_USER_KEY)
  return id ? { id, label: id } : null
}

/** The signed-in user (undefined while Supabase restores a session), plus sign-in / sign-out. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null | undefined>(() => (AUTH_MODE === 'dev' ? devUser() : supabase ? undefined : null))

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUser(fromSession(data.session)))
    // also fires on token refresh and on sign-out from another tab
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(fromSession(session)))
    return () => data.subscription.unsubscribe()
  }, [])

  const signInDev = useCallback((id: string) => {
    sessionStorage.setItem(DEV_USER_KEY, id)
    setUser({ id, label: id })
  }, [])

  /** Returns an error message, or null on success. */
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Sign-in is not configured for this build.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])

  const signOut = useCallback(() => {
    sessionStorage.removeItem(DEV_USER_KEY)
    setUser(null)
    void supabase?.auth.signOut()
  }, [])

  return { user, signInDev, signInWithPassword, signOut }
}

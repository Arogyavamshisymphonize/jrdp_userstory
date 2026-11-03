import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * How users sign in, fixed at build time:
 * - "dev": type any user id; the API trusts an X-User-Id header (backend AUTH_MODE=dev). Local only.
 * - "supabase": email + password with Supabase Auth; the API verifies the access token (backend AUTH_MODE=oidc).
 */
/** sessionStorage key holding the dev-mode user id. */
export const DEV_USER_KEY = 'relay.devUser'

export const AUTH_MODE: 'dev' | 'supabase' = import.meta.env.VITE_AUTH_MODE === 'supabase' ? 'supabase' : 'dev'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY // public "anon"/publishable key: safe in the browser (RLS is on)

/** The Supabase client, or null in dev mode or when the build is missing its Supabase settings. */
export const supabase: SupabaseClient | null = AUTH_MODE === 'supabase' && url && key ? createClient(url, key) : null

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "dev" (default) or "supabase". See src/auth/config.ts. */
  readonly VITE_AUTH_MODE?: 'dev' | 'supabase'
  readonly VITE_SUPABASE_URL?: string
  /** The project's public anon / publishable key, never the service-role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

import { createContext, useContext } from 'react'
import type { ApiError } from '../api/client'
import type { ExecutionResult, SystemPrompt } from '../api/types'
import type { AuthUser } from '../auth/useAuth'

/** One run from this browser session (the API has no "my runs" list, so recent runs live here). */
export interface RunRecord {
  at: Date
  provider: string
  model: string
  promptLabel: string
  result: ExecutionResult | null
  error: ApiError | null
}

export interface Session {
  user: AuthUser
  me: SystemPrompt
  reloadMe: () => void
  runs: RunRecord[]
  addRun: (run: RunRecord) => void
  signOut: () => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <SessionContext>')
  return session
}

export function promptLabel(me: Pick<SystemPrompt, 'base_version' | 'patch_version'>) {
  return `Base v${me.base_version}` + (me.patch_version ? ` + patch v${me.patch_version}` : ' · no patch')
}

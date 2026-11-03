import { useCallback, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { getCredential, setCredential } from './api/client'
import type { SystemPrompt } from './api/types'
import { ErrorAlert } from './components/Alert'
import { Layout } from './components/Layout'
import { SessionContext, type RunRecord, type Session } from './context/session'
import { useApi } from './hooks/useApi'
import { AdminBasePage } from './pages/AdminBasePage'
import { AuditPage } from './pages/AuditPage'
import { KeysPage } from './pages/KeysPage'
import { PromptPage } from './pages/PromptPage'
import { RunPage } from './pages/RunPage'
import { SignInPage } from './pages/SignInPage'
import { VersionsPage } from './pages/VersionsPage'

export default function App() {
  const [user, setUser] = useState(getCredential)
  const signIn = (value: string) => {
    setCredential(value)
    setUser(value)
  }
  const signOut = useCallback(() => {
    setCredential(null)
    setUser(null)
  }, [])
  if (!user) return <SignInPage onSignIn={signIn} />
  return <SignedIn key={user} user={user} onSignOut={signOut} />
}

function SignedIn({ user, onSignOut }: { user: string; onSignOut: () => void }) {
  // The caller's effective prompt also says whether they are an admin, which shapes the navigation.
  const me = useApi<SystemPrompt>('/users/me/system-prompt')
  const [runs, setRuns] = useState<RunRecord[]>([])
  const addRun = useCallback((run: RunRecord) => setRuns((r) => [run, ...r].slice(0, 20)), [])

  const session = useMemo<Session | null>(
    () => me.data && { user, me: me.data, reloadMe: me.reload, runs, addRun, signOut: onSignOut },
    [user, me.data, me.reload, runs, addRun, onSignOut],
  )

  if (me.error)
    return (
      <div className="center">
        <div className="stack" style={{ maxWidth: 480, width: '100%' }}>
          <ErrorAlert error={me.error} />
          <button type="button" className="btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  if (!session) return <div className="center small">Loading…</div>

  return (
    <SessionContext value={session}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/run" element={<RunPage />} />
            <Route path="/prompt" element={<PromptPage />} />
            <Route path="/versions" element={<VersionsPage />} />
            <Route path="/keys" element={<KeysPage />} />
            {session.me.is_admin && <Route path="/admin/base-prompt" element={<AdminBasePage />} />}
            {session.me.is_admin && <Route path="/admin/audit" element={<AuditPage />} />}
            <Route path="*" element={<Navigate to="/run" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionContext>
  )
}
